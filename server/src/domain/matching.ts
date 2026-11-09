import type { Types } from 'mongoose';
import { Team } from '../models/Team.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import {
  windowsToWeekIntervals,
  scheduleOverlap,
  totalMinutes,
  tzOffsetMinutes,
  type WeekInterval,
} from './time.js';
import { canonicalSkill, canonicalSkills } from './taxonomy.js';

/**
 * Teammate suggestion scoring — mathematically grounded, fully decomposed.
 *
 * Model (corrected F-03 formulation):
 *   V_T(c|T,B) ∈ [0,1]  — candidate's marginal contribution to the team
 *   V_P(T|c) ∈ [0,1]    — how well the team fits the candidate's prefs
 *   M(c,T)   = √(V_T · V_P)
 *
 * V_T components:
 *   - skillGain:    EXACT marginal gain of a monotone submodular coverage
 *                   function f(S) = Σ_s w_s · min(1, cov_s / NEED).
 *                   Submodular ⇒ diminishing returns; greedy team-building
 *                   has the classical (1 − 1/e) approximation guarantee.
 *   - novelty:      skills the team lacks entirely (weighted by level)
 *   - availability: quorum ρ over the 10 080-minute weekly circle —
 *                   fraction of members sharing ≥30 raw minutes with the
 *                   candidate, blended with circadian-weighted overlap
 *                   (shared 03:00-local time counts less than 15:00).
 *
 * Hard eligibility is filtered BEFORE scoring — a great match that is
 * ineligible never appears. No ML, no embeddings: every point is
 * reproducible and explained with numbers.
 */

interface SkillDecl { skill: string; level: number; canLead?: boolean }
interface AvailDecl { dayOfWeek?: number; startMin: number; endMin: number }
interface UserLite {
  _id: Types.ObjectId;
  displayName?: string;
  skills: SkillDecl[];
  preferredRoles: string[];
  availability: AvailDecl[];
  timezone: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Normalize a user to canonical skill IDs. Aliases collapse ('react' +
 * 'frontend' → one 'frontend' entry, keeping max level / canLead OR) so
 * coverage math never double-counts the same discipline. Read-side
 * normalization also repairs legacy/seed rows that predate taxonomy v1.
 */
function canonUser(u: UserLite): UserLite {
  const merged = new Map<string, SkillDecl>();
  for (const s of u.skills) {
    const c = canonicalSkill(s.skill);
    if (!c) continue;
    const prev = merged.get(c);
    if (!prev || s.level > prev.level) {
      merged.set(c, { skill: c, level: s.level, canLead: (prev?.canLead ?? false) || (s.canLead ?? false) });
    } else if (s.canLead) {
      prev.canLead = true;
    }
  }
  return {
    ...u,
    skills: [...merged.values()],
    preferredRoles: canonicalSkills(u.preferredRoles ?? []),
  };
}

/** Two competent declarations saturate a skill slot — deeper stacks add resilience, not coverage. */
const SKILL_NEED = 2.0;
/** A member "shares time" with the candidate at ≥ this many raw minutes/week. */
const QUORUM_MINUTES = 30;
const RHO = 0.5; // quorum threshold — spec's availability quorum ρ

/* ---------------- skill coverage (submodular) ---------------- */

function skillWeights(team: { skillsSought?: string[] }, memberDocs: UserLite[]): Map<string, number> {
  const held = new Set(memberDocs.flatMap((m) => m.skills.map((s) => s.skill)));
  const sought = team.skillsSought?.length ? team.skillsSought : [...held];
  const weights = new Map<string, number>();
  for (const s of sought) weights.set(s, 1.5); // explicitly sought skills count more
  for (const s of held) if (!weights.has(s)) weights.set(s, 1.0);
  if (weights.size === 0) weights.set('fullstack', 1);
  return weights;
}

/** f(S) = weighted fraction of skill needs covered by level-sum S. Monotone submodular in S. */
function coverageValue(levels: Map<string, number>, weights: Map<string, number>): number {
  let sum = 0;
  let wsum = 0;
  for (const [skill, w] of weights) {
    wsum += w;
    sum += w * Math.min(1, (levels.get(skill) ?? 0) / SKILL_NEED);
  }
  return wsum === 0 ? 0 : sum / wsum;
}

function levelsOf(users: UserLite[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of users) for (const s of u.skills) m.set(s.skill, (m.get(s.skill) ?? 0) + s.level);
  return m;
}

/* ---------------- availability (circular week + circadian) ---------------- */

interface Schedules {
  intervals: WeekInterval[];
  minutes: number;
  offset: number; // tz offset in minutes (approx at "now" — DST drift documented)
}

function scheduleOf(u: UserLite): Schedules {
  const intervals = windowsToWeekIntervals(u.availability);
  return { intervals, minutes: totalMinutes(intervals), offset: tzOffsetMinutes(u.timezone) };
}

interface AvailabilityResult {
  score: number;          // [0,1]
  quorum: number;         // fraction of members sharing ≥QUORUM_MINUTES
  sharedMinutes: number;  // total raw shared minutes across members
  weightedMinutes: number;// circadian-weighted shared minutes
  hasData: boolean;
}

function availabilityOf(memberDocs: UserLite[], candidate: UserLite): AvailabilityResult {
  const cand = scheduleOf(candidate);
  if (cand.minutes === 0 || memberDocs.length === 0) {
    return { score: 0.5, quorum: 0.5, sharedMinutes: 0, weightedMinutes: 0, hasData: false };
  }
  const memberSchedules = memberDocs.map(scheduleOf);
  const hasAnyData = memberSchedules.some((s) => s.minutes > 0);
  if (!hasAnyData) {
    return { score: 0.5, quorum: 0.5, sharedMinutes: 0, weightedMinutes: 0, hasData: false };
  }

  let compatible = 0;
  let shared = 0;
  let weighted = 0;
  for (const m of memberSchedules) {
    if (m.minutes === 0) continue; // member declared nothing → can't count for or against
    const ov = scheduleOverlap(cand.intervals, m.intervals, { aOffset: cand.offset, bOffset: m.offset });
    shared += ov.sharedMinutes;
    weighted += ov.weightedMinutes;
    if (ov.sharedMinutes >= QUORUM_MINUTES) compatible++;
  }
  const denom = Math.max(1, memberSchedules.filter((s) => s.minutes > 0).length);
  const quorum = compatible / denom;
  // quality: fraction of (candidate minutes × declaring members) that overlap,
  // discounted by circadian weight — ∈ [0,1]
  const quality = clamp01(weighted / Math.max(1, cand.minutes * denom));
  const score = clamp01(RHO * quorum + (1 - RHO) * quality);
  return { score, quorum, sharedMinutes: shared, weightedMinutes: weighted, hasData: true };
}

/* ---------------- candidate-side fit (V_P) ---------------- */

function participantFit(team: { skillsSought?: string[] }, teamLevels: Map<string, number>, memberDocs: UserLite[], c: UserLite): { score: number; roleFit: number; skillFit: number; fillsLead: boolean } {
  const strong = c.skills.filter((s) => s.level >= 0.5);
  const wantedTotal = strong.reduce((n, s) => n + s.level, 0);
  const wantedCovered = strong.reduce((n, s) => n + (s.level * ((teamLevels.get(s.skill) ?? 0) > 0 || team.skillsSought?.includes(s.skill) ? 1 : 0)), 0);
  const skillFit = wantedTotal === 0 ? 0.6 : wantedCovered / wantedTotal;

  // Role fit: preferred roles overlapping team needs; leadership gap bonus.
  const teamHasLead = memberDocs.some((m) => m.skills.some((s) => s.canLead));
  const candidateCanLead = c.skills.some((s) => s.canLead);
  const fillsLead = !teamHasLead && candidateCanLead;
  const needs = new Set([...(team.skillsSought ?? []), ...teamLevels.keys()]);
  const roleHits = c.preferredRoles.filter((r) => needs.has(r)).length;
  const roleBase = c.preferredRoles.length === 0 ? 0.6 : roleHits / c.preferredRoles.length;
  const roleFit = fillsLead ? 1 : clamp01(0.5 * roleBase + 0.5 * (roleHits > 0 ? 1 : 0.4));

  return { score: clamp01(0.6 * skillFit + 0.4 * roleFit), roleFit, skillFit, fillsLead };
}

/* ---------------- public API ---------------- */

export interface SuggestionComponents {
  skillGain: number;
  novelty: number;
  availability: number;
  skillFit: number;
  roleFit: number;
}

export interface Suggestion {
  userId: Types.ObjectId;
  displayName: string;
  mutualScore: number;      // M(c,T)
  teamContribution: number; // V_T
  participantFit: number;   // V_P
  components: SuggestionComponents;
  reasons: string[];        // human-readable explanation with numbers (must-have)
  skills: { skill: string; level: number }[];
}

const fmtHours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};

/** Rank unassigned, discoverable participants for a team. */
export async function suggestTeammates(teamId: Types.ObjectId, hackathonId: Types.ObjectId, limit = 10): Promise<Suggestion[]> {
  const team = await Team.findById(teamId).lean();
  if (!team) return [];

  const members = await Membership.find({ teamId, status: 'ACTIVE' }).select('participantId').lean();
  const memberIds = members.map((m) => m.participantId);

  // Eligible pool: not on any team in this hackathon, discoverable.
  const busy = await Membership.distinct('participantId', {
    hackathonId, status: 'ACTIVE', participantId: { $nin: memberIds },
  });
  const candidates = await User.find({
    _id: { $nin: [...memberIds, ...busy] },
    discoverable: true,
    lookingForTeam: true,
  }).limit(500).lean() as unknown as UserLite[];

  const memberDocs = (await User.find({ _id: { $in: memberIds } }).lean() as unknown as UserLite[]).map(canonUser);
  const canonCandidates = candidates.map(canonUser);
  const teamNorm = { ...(team as object), skillsSought: canonicalSkills(team.skillsSought ?? []) } as { skillsSought?: string[] };
  const teamLevels = levelsOf(memberDocs);
  const weights = skillWeights(teamNorm, memberDocs);
  const baseCoverage = coverageValue(teamLevels, weights);

  const suggestions: Suggestion[] = canonCandidates.map((c) => {
    // V_T — marginal contribution.
    const candLevels = levelsOf([c]);
    const merged = new Map(teamLevels);
    for (const [s, l] of candLevels) merged.set(s, (merged.get(s) ?? 0) + l);
    const skillGain = clamp01(coverageValue(merged, weights) - baseCoverage);

    const novelSkills = c.skills.filter((s) => !teamLevels.has(s.skill) && s.level > 0.3).map((s) => s.skill);
    const novelty = clamp01(novelSkills.reduce((n, s) => n + (c.skills.find((x) => x.skill === s)?.level ?? 0), 0) / 1.5);

    const avail = availabilityOf(memberDocs, c);

    const vT = clamp01(0.5 * skillGain + 0.3 * novelty + 0.2 * avail.score);
    const fit = participantFit(teamNorm, teamLevels, memberDocs, c);
    const vP = fit.score;

    const mutual = Math.sqrt(vT * vP);

    // ---- explanations, with the actual numbers ----
    const reasons: string[] = [];
    if (skillGain > 0.01) {
      const topGain = [...weights.keys()]
        .map((s) => ({ s, before: Math.min(1, (teamLevels.get(s) ?? 0) / SKILL_NEED), after: Math.min(1, (merged.get(s) ?? 0) / SKILL_NEED) }))
        .filter((x) => x.after > x.before)
        .sort((a, b) => (b.after - b.before) - (a.after - a.before))[0];
      reasons.push(`+${skillGain.toFixed(2)} skill coverage${topGain ? ` (${topGain.s}: ${Math.round(topGain.before * 100)}%→${Math.round(topGain.after * 100)}%)` : ''}`);
    }
    if (novelSkills.length) reasons.push(`Brings missing skills: ${novelSkills.join(', ')}`);
    if (avail.hasData && avail.sharedMinutes > 0) {
      const k = Math.round(avail.quorum * memberDocs.length);
      reasons.push(`Shares ~${fmtHours(avail.sharedMinutes)} with ${k}/${memberDocs.length} teammates`);
      if (avail.weightedMinutes / Math.max(1, avail.sharedMinutes) > 0.8) reasons.push('Overlap lands in sane hours for everyone');
    }
    if (fit.fillsLead) reasons.push('Fills the leadership gap (team has no canLead member)');
    if (c.preferredRoles.length) {
      const hits = c.preferredRoles.filter((r) => weights.has(r) || teamLevels.has(r));
      if (hits.length) reasons.push(`Matches team needs: ${hits.join(', ')}`);
    }
    if (reasons.length === 0) reasons.push('General availability — no strong signal either way');

    return {
      userId: c._id,
      displayName: c.displayName ?? 'Participant',
      mutualScore: Math.round(mutual * 1000) / 1000,
      teamContribution: Math.round(vT * 1000) / 1000,
      participantFit: Math.round(vP * 1000) / 1000,
      components: {
        skillGain: Math.round(skillGain * 1000) / 1000,
        novelty: Math.round(novelty * 1000) / 1000,
        availability: Math.round(avail.score * 1000) / 1000,
        skillFit: Math.round(fit.skillFit * 1000) / 1000,
        roleFit: Math.round(fit.roleFit * 1000) / 1000,
      },
      reasons,
      skills: c.skills.map((s) => ({ skill: s.skill, level: s.level })),
    };
  });

  // Deterministic ordering: score desc, then stable id tiebreak — same input,
  // same ranking, every time (no flaky ordering in tests or UI).
  return suggestions
    .sort((a, b) => b.mutualScore - a.mutualScore || a.userId.toString().localeCompare(b.userId.toString()))
    .slice(0, limit);
}
