/**
 * Weekly-availability mathematics.
 *
 * A recurring weekly schedule is a set of intervals on a CIRCLE of
 * WEEK_MINUTES = 10 080 minutes (7 × 24 × 60). Working on the circle —
 * rather than on naive per-day strings — is what makes overnight windows
 * (22:00 → 02:00) and week-boundary wraps (Saturday → Sunday) correct
 * instead of special cases.
 *
 * Stored windows are UTC-based minutes-from-midnight (see User schema).
 * Each user's IANA `timezone` is used only to weight overlaps by circadian
 * plausibility: shared time at 03:00 local is worth less than at 15:00.
 */

export const WEEK_MINUTES = 7 * 24 * 60;
const DAY_MINUTES = 24 * 60;

export interface WeekInterval {
  /** minutes into the week, 0 <= start < end <= WEEK_MINUTES */
  start: number;
  end: number;
}

export interface AvailWindow {
  dayOfWeek?: number; // 0=Sun..6=Sat; undefined = every day
  startMin: number;
  endMin: number;
}

/** Sort + merge overlapping or touching intervals. Input need not be sorted. */
export function mergeIntervals(intervals: WeekInterval[]): WeekInterval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: Math.max(0, i.start), end: Math.min(WEEK_MINUTES, i.end) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: WeekInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

/**
 * Expand declared windows into absolute week intervals.
 * - dayOfWeek omitted → repeats all 7 days
 * - endMin <= startMin → overnight window, split at midnight
 * - Saturday-night windows wrap into Sunday correctly via % WEEK_MINUTES
 */
export function windowsToWeekIntervals(windows: AvailWindow[]): WeekInterval[] {
  const raw: WeekInterval[] = [];
  for (const w of windows) {
    const days = w.dayOfWeek === undefined ? [0, 1, 2, 3, 4, 5, 6] : [w.dayOfWeek];
    for (const d of days) {
      const base = d * DAY_MINUTES;
      if (w.endMin > w.startMin) {
        raw.push({ start: base + w.startMin, end: base + w.endMin });
      } else {
        // Overnight: [start, 24:00) today + [0, end) tomorrow.
        raw.push({ start: base + w.startMin, end: base + DAY_MINUTES });
        const nextBase = (base + DAY_MINUTES) % WEEK_MINUTES;
        raw.push({ start: nextBase, end: nextBase + w.endMin });
      }
    }
  }
  return mergeIntervals(raw);
}

/** Exact intersection of two merged schedules → shared intervals. */
export function intersectIntervals(a: WeekInterval[], b: WeekInterval[]): WeekInterval[] {
  const out: WeekInterval[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i]!.start, b[j]!.start);
    const e = Math.min(a[i]!.end, b[j]!.end);
    if (s < e) out.push({ start: s, end: e });
    if (a[i]!.end < b[j]!.end) i++;
    else j++;
  }
  return out;
}

export function totalMinutes(intervals: WeekInterval[]): number {
  return intervals.reduce((n, i) => n + (i.end - i.start), 0);
}

/** UTC offset of an IANA timezone at a given instant, in minutes (e.g. Paris summer = +120). */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
    const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((wallAsUtc - at.getTime()) / 60000);
  } catch {
    return 0; // unknown zone → treat as UTC rather than crash matching
  }
}

/** Local minute-of-day for a UTC week-minute, given a tz offset. */
export function localMinuteOfDay(utcWeekMinute: number, offsetMinutes: number): number {
  return (((utcWeekMinute % DAY_MINUTES) + offsetMinutes) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
}

/**
 * Circadian plausibility weight for a local minute-of-day.
 * Peak collaboration hours (09:00–21:00 local) → 1.0;
 * deep night (00:00–06:00) → 0.3; linear ramps between.
 */
export function circadianWeight(localMinute: number): number {
  const h = localMinute / 60;
  if (h < 6) return 0.3;
  if (h < 9) return 0.3 + (h - 6) * (0.7 / 3);
  if (h <= 21) return 1;
  if (h < 24) return 1 - (h - 21) * (0.7 / 3);
  return 0.3;
}

export interface ScheduleOverlap {
  /** raw shared minutes between the two schedules */
  sharedMinutes: number;
  /** shared minutes reweighted by circadian plausibility for BOTH parties (min of the two weights) */
  weightedMinutes: number;
}

/**
 * Overlap between two schedules, optionally circadian-weighted.
 * For each shared interval we take its midpoint's UTC time-of-day, convert
 * to each party's local time via their tz offset, and weight by the worse
 * of the two circadian scores (bottleneck: overlap helps only if decent for both).
 */
export function scheduleOverlap(
  a: WeekInterval[],
  b: WeekInterval[],
  opts: { aOffset?: number; bOffset?: number } = {},
): ScheduleOverlap {
  const shared = intersectIntervals(a, b);
  const raw = totalMinutes(shared);
  // offset 0 (UTC) is a real offset — only skip weighting when not provided
  if (opts.aOffset === undefined && opts.bOffset === undefined) {
    return { sharedMinutes: raw, weightedMinutes: raw };
  }

  let weighted = 0;
  for (const iv of shared) {
    const mid = (iv.start + iv.end) / 2;
    const w = Math.min(
      circadianWeight(localMinuteOfDay(mid, opts.aOffset ?? 0)),
      circadianWeight(localMinuteOfDay(mid, opts.bOffset ?? 0)),
    );
    weighted += (iv.end - iv.start) * w;
  }
  return { sharedMinutes: raw, weightedMinutes: weighted };
}
