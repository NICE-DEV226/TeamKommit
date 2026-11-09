import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { get, patch, isLoggedIn, setTokens, ApiError } from '../lib/api';
import { Star4 } from '../components/doodles';
import { usePageTitle } from '../components/feedback';

// Mirrors server CANONICAL_SKILLS (server/src/domain/taxonomy.ts) — one id per discipline.
const SKILLS = ['frontend', 'backend', 'fullstack', 'mobile', 'ai-ml', 'data', 'database', 'devops', 'cloud', 'design', 'product', 'security', 'qa', 'blockchain', 'iot', 'gamedev', 'xr', 'research', 'tech-comm', 'finance'];
const CHIP_COLORS = ['chip-grape', 'chip-sky', 'chip-mint', 'chip-sunny', 'chip-bubble'];
const DAYS = ['Every day', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface AvailWindow { dayOfWeek?: number; startMin: number; endMin: number }

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
// Mirrors server/src/domain/time.ts: end <= start is an overnight wrap;
// equal start/end therefore means a full 24h window — never silently 0h.
function windowMinutes(w: AvailWindow) {
  return w.endMin > w.startMin ? w.endMin - w.startMin : w.endMin + 1440 - w.startMin;
}

// IANA zones for the timezone picker — full list when the runtime supports
// it, curated fallback otherwise. Free text stays possible via the datalist.
const TIMEZONES: string[] = (() => {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (supported?.length) return supported;
  } catch { /* older runtime */ }
  return ['UTC', 'Europe/Paris', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'America/Toronto', 'America/Mexico_City',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Singapore', 'Asia/Dubai', 'Asia/Kolkata', 'Australia/Sydney',
    'Africa/Casablanca', 'Africa/Lagos', 'Pacific/Auckland'];
})();

interface Crew {
  role: string;
  team?: { _id: string; name: string; slug: string; memberCount: number; maxSize: number; lifecycleStatus: string };
  hackathon?: { name: string; slug: string; status: string; submissionDeadline?: string };
}

interface Me {
  user: {
    _id: string; displayName: string; bio: string; timezone: string;
    skills: { skill: string; level: number; canLead?: boolean }[];
    preferredRoles: string[]; availability?: AvailWindow[];
    lookingForTeam: boolean; discoverable: boolean; isOrganizer?: boolean;
    profileCompleteness?: number;
  };
}

export default function ProfilePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  usePageTitle('Profile');
  const { data } = useQuery({
    queryKey: ['me'],
    queryFn: () => get<Me>('/auth/me'),
    enabled: isLoggedIn(),
  });
  const { data: crews } = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => get<{ memberships: Crew[] }>('/me/teams'),
    enabled: isLoggedIn(),
  });
  const u = data?.user;
  const [form, setForm] = useState({ displayName: '', bio: '', timezone: 'UTC', lookingForTeam: false, discoverable: true });
  const [skills, setSkills] = useState<Record<string, number>>({});
  const [lead, setLead] = useState<Record<string, boolean>>({});
  const [wantSkills, setWantSkills] = useState<string[]>([]);
  const [avail, setAvail] = useState<AvailWindow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (u) {
      setForm({ displayName: u.displayName, bio: u.bio, timezone: u.timezone, lookingForTeam: u.lookingForTeam, discoverable: u.discoverable });
      setSkills(Object.fromEntries(u.skills.map((s) => [s.skill, s.level])));
      setLead(Object.fromEntries(u.skills.filter((s) => s.canLead).map((s) => [s.skill, true])));
      setWantSkills(u.preferredRoles ?? []);
      setAvail((u.availability ?? []).map((w) => ({ ...w })));
    }
  }, [u]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await patch('/auth/me', {
        ...form,
        skills: Object.entries(skills).map(([skill, level]) => ({ skill, level, canLead: !!lead[skill] })),
        preferredRoles: wantSkills,
        availability: avail,
      });
      setSaved(true);
      qc.invalidateQueries();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save — check your connection and retry.');
    } finally {
      setSaving(false);
    }
  }

  function toggleSkill(s: string) {
    setSkills((prev) => {
      const next = { ...prev };
      if (s in next) delete next[s]; else next[s] = 0.6;
      return next;
    });
  }

  function toggleWant(s: string) {
    setWantSkills((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < 10 ? [...prev, s] : prev));
  }

  function signOut() {
    setTokens(null, null);
    qc.clear();
    navigate('/');
  }

  if (!u) {
    return <div className="max-w-2xl space-y-5" aria-busy="true"><div className="sticker h-64 skeleton" /><div className="sticker h-80 skeleton" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
          <span className="badge-grape">PS1</span>
          Your profile
          {u.isOrganizer && <span className="badge-sunny">Organizer</span>}
          <Star4 className="h-6 w-6 text-mint-500" />
        </h1>
        <p className="mt-1.5 text-sm font-semibold text-ink/60">Skills and availability power teammate suggestions.</p>
        {typeof u.profileCompleteness === 'number' && (
          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 max-w-xs overflow-hidden rounded-full border border-ink/20 bg-ink/5" role="progressbar" aria-valuenow={u.profileCompleteness} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <div className={`h-full rounded-full ${u.profileCompleteness >= 60 ? 'bg-mint-500' : u.profileCompleteness >= 30 ? 'bg-sunny-500' : 'bg-tang-500'}`} style={{ width: `${u.profileCompleteness}%` }} />
            </div>
            <span className="font-mono text-xs font-extrabold text-ink/60">{u.profileCompleteness}% complete</span>
          </div>
        )}
      </div>
      <form onSubmit={save} className="sticker space-y-6 p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="label">Display name</span>
            <input required maxLength={80} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className="input" />
          </label>
          <label className="block">
            <span className="label">Timezone</span>
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="input" placeholder="Europe/Paris" list="tz-zones" />
            <datalist id="tz-zones">
              {TIMEZONES.map((tz) => <option key={tz} value={tz} />)}
            </datalist>
            <span className="mt-1 block text-[11px] font-semibold text-ink/55">IANA zone — powers the circadian overlap weighting.</span>
          </label>
        </div>
        <label className="block">
          <span className="label">Bio</span>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} maxLength={500} className="input" placeholder="What do you build? What are you into?" />
        </label>

        <fieldset>
          <legend className="text-sm font-bold text-ink mb-1.5">Skills</legend>
          <p className="mb-3 text-xs font-semibold text-ink/60">Select the skills you bring, then set your level.</p>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((s, i) => {
              const active = s in skills;
              return (
                <button key={s} type="button" onClick={() => toggleSkill(s)}
                  aria-pressed={active}
                  className={`chip transition-all duration-150 ${active ? CHIP_COLORS[i % CHIP_COLORS.length] + ' ring-2 ring-ink ring-offset-2 ring-offset-cream' : 'chip-neutral opacity-50 hover:opacity-100'}`}>
                  {s}
                </button>
              );
            })}
          </div>
          {Object.keys(skills).length > 0 && (
            <div className="mt-4 space-y-3 rounded-2xl border-2 border-dashed border-ink/30 p-4">
              {Object.entries(skills).map(([s, lvl]) => (
                <div key={s} className="flex items-center gap-3 text-sm font-semibold">
                  <span className="w-24">{s}</span>
                  <input type="range" min={0} max={1} step={0.1} value={lvl}
                    onChange={(e) => setSkills((p) => ({ ...p, [s]: Number(e.target.value) }))}
                    className="flex-1 accent-ink" aria-label={`${s} level`} />
                  <span className="w-8 text-right font-mono text-xs text-ink/50">{lvl}</span>
                  <label className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-ink/60">
                    <input type="checkbox" checked={!!lead[s]} onChange={(e) => setLead((p) => ({ ...p, [s]: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-ink" />
                    can lead
                  </label>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold text-ink">Weekly availability</legend>
          <p className="mb-3 text-xs font-semibold text-ink/55">
            Recurring windows in your timezone — the matcher computes exact shared hours on a circular week.
            End earlier than start = overnight (e.g. 22:00→02:00); identical times = available 24/7.
          </p>
          <div className="space-y-2.5">
            {avail.map((w, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select value={w.dayOfWeek ?? ''} aria-label={`Window ${i + 1} day`}
                  onChange={(e) => setAvail((p) => p.map((x, j) => j === i ? { ...x, dayOfWeek: e.target.value === '' ? undefined : Number(e.target.value) } : x))}
                  className="input w-auto! py-1.5! text-xs">
                  {DAYS.map((d, di) => <option key={d} value={di === 0 ? '' : di - 1}>{d}</option>)}
                </select>
                <input type="time" value={toHHMM(w.startMin)} aria-label={`Window ${i + 1} start`}
                  onChange={(e) => setAvail((p) => p.map((x, j) => j === i ? { ...x, startMin: toMin(e.target.value) } : x))}
                  className="input w-auto! py-1.5! font-mono text-xs" />
                <span className="text-xs font-bold text-ink/50">→</span>
                <input type="time" value={toHHMM(w.endMin)} aria-label={`Window ${i + 1} end`}
                  onChange={(e) => setAvail((p) => p.map((x, j) => j === i ? { ...x, endMin: toMin(e.target.value) } : x))}
                  className="input w-auto! py-1.5! font-mono text-xs" />
                <button type="button" onClick={() => setAvail((p) => p.filter((_, j) => j !== i))}
                  className="btn-ghost btn-sm px-2!" aria-label={`Remove window ${i + 1}`}>×</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setAvail((p) => [...p, { dayOfWeek: undefined, startMin: 18 * 60, endMin: 23 * 60 }])}
            className="btn-secondary btn-sm mt-3">+ Add window</button>
          {avail.length > 0 && (
            <p className="mt-3 font-mono text-[11px] font-bold text-ink/50" role="status">
              {avail.length} window{avail.length > 1 ? 's' : ''} ·{' '}
              {Math.round(avail.reduce((n, w) => n + windowMinutes(w), 0) / 60 * 10) / 10}h/week declared
              {' '}— the matcher intersects these on a 10,080-minute circular week.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-sm font-bold text-ink">Skills you want to work on</legend>
          <p className="mb-3 text-xs font-semibold text-ink/60">
            The engine matches these against what each team is looking for — pick up to 10 canonical skills.
          </p>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((s, i) => {
              const active = wantSkills.includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleWant(s)}
                  aria-pressed={active}
                  className={`chip transition-all duration-150 ${active ? CHIP_COLORS[i % CHIP_COLORS.length] + ' ring-2 ring-ink ring-offset-2 ring-offset-cream' : 'chip-neutral opacity-50 hover:opacity-100'}`}>
                  {s}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-3 border-t-2 border-dashed border-ink/15 pt-5 text-sm sm:flex-row sm:gap-8">
          <label className="flex items-center gap-2.5 font-bold">
            <input type="checkbox" checked={form.lookingForTeam} onChange={(e) => setForm({ ...form, lookingForTeam: e.target.checked })} className="h-4 w-4 accent-ink" />
            Looking for a team
          </label>
          <label className="flex items-center gap-2.5 font-bold">
            <input type="checkbox" checked={form.discoverable} onChange={(e) => setForm({ ...form, discoverable: e.target.checked })} className="h-4 w-4 accent-ink" />
            Visible in people discovery
          </label>
          <Link to="/board" className="font-bold text-grape-600 underline decoration-2 underline-offset-4 hover:text-grape-700">
            Looking for a team? Browse the board →
          </Link>
        </div>

        {error && <p className="rounded-xl border-2 border-ink bg-bubble-200 px-4 py-2.5 text-sm font-bold text-ink" role="alert">{error}</p>}

        <div className="flex items-center gap-4 border-t-2 border-dashed border-ink/15 pt-5">
          <button className="btn-mint px-7" disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save profile'}
          </button>
          {saved && <span className="text-sm font-extrabold text-mint-500" role="status">Profile updated.</span>}
          <button type="button" onClick={signOut} className="btn-ghost ml-auto text-bubble-500 hover:text-bubble-600">
            Sign out
          </button>
        </div>
      </form>

      {crews && crews.memberships.length > 0 && (
        <section className="sticker-sm mt-8 p-6" aria-labelledby="crews-heading">
          <h2 id="crews-heading" className="flex items-center gap-2 text-lg font-extrabold">
            Your crews
            <span className="badge-grape">PS1</span>
          </h2>
          <p className="mt-1 text-xs font-semibold text-ink/50">
            Hackathons you're currently teamed up in — one active team per event.
          </p>
          <ul className="mt-4 space-y-3">
            {crews.memberships.map((m) => m.team && (
              <li key={m.team._id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border-2 border-ink/15 bg-cream px-4 py-3">
                <Link to={`/teams/${m.team._id}`} className="font-extrabold text-grape-600 hover:text-grape-700 hover:underline">
                  {m.team.name}
                </Link>
                <span className={m.role === 'LEADER' ? 'badge-grape' : 'badge-ok'}>{m.role === 'LEADER' ? 'Leader' : 'Member'}</span>
                <span className="font-mono text-xs font-semibold text-ink/50">
                  {m.team.memberCount}/{m.team.maxSize}
                </span>
                {m.hackathon && (
                  <span className="ml-auto text-xs font-bold text-ink/55">
                    {m.hackathon.name}
                    {m.hackathon.submissionDeadline && (
                      <span className="ml-2 font-mono text-ink/55">
                        submit by {new Date(m.hackathon.submissionDeadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {crews && crews.memberships.length === 0 && u?.lookingForTeam && (
        <div className="sticker-sm mt-8 flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm font-bold text-ink/60">You're marked as looking for a team — no crew yet.</p>
          <Link to="/board" className="btn-grape btn-sm px-4">Find a team →</Link>
        </div>
      )}
    </div>
  );
}
