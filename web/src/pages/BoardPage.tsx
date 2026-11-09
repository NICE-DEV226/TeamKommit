import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, isLoggedIn, ApiError } from '../lib/api';
import { Star4, Gamepad } from '../components/doodles';
import { ErrorCard, usePageTitle } from '../components/feedback';

interface Team {
  _id: string; name: string; description: string; memberCount: number; maxSize: number;
  placesLeft: number; leaderName: string; skillsSought: string[]; skillsHeld: string[];
  recruitmentStatus: string; updatedAt: string;
}

const CARD_TINTS = [
  'bg-cream', 'bg-sky-400/30', 'bg-mint-400/30', 'bg-bubble-400/25', 'bg-grape-500/15', 'bg-sunny-400/40',
];

function SeatBar({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="seat-bar" role="img" aria-label={`${filled} of ${total} seats filled`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`seat ${i < filled ? 'seat-filled' : 'seat-open'}`} />
      ))}
    </div>
  );
}

export default function BoardPage() {
  const [skillInput, setSkillInput] = useState('');
  const [skill, setSkill] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const qc = useQueryClient();
  usePageTitle('Team board');

  // Debounce the skill filter — one query per pause, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSkill(skillInput.trim()), 300);
    return () => clearTimeout(t);
  }, [skillInput]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['board', skill],
    queryFn: () => get<{ teams: Team[] }>(`/board${skill ? `?skill=${encodeURIComponent(skill)}` : ''}`),
  });

  async function joinWithCode(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null); setJoinBusy(true);
    try {
      await post('/teams/join-code', { code: joinCode.trim() });
      setNotice({ ok: true, text: 'You joined the team.' });
      setJoinCode('');
      qc.invalidateQueries();
    } catch (err) {
      setNotice({ ok: false, text: err instanceof ApiError ? err.message : 'Invalid code' });
    } finally { setJoinBusy(false); }
  }

  const teams = data?.teams ?? [];
  const openSeats = teams.reduce((n, t) => n + t.placesLeft, 0);
  const loggedIn = isLoggedIn();

  return (
    <div>
      <div id="board">
        {loggedIn ? (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight">
                <span className="badge-grape">PS1</span>
                Team board
                <span className="badge-live">Live</span>
              </h1>
              <p className="mt-1.5 text-sm font-semibold text-ink/60">
                {isLoading ? 'Loading…' : `${teams.length} teams hiring · ${openSeats} seats open — updates stream in live.`}
              </p>
            </div>
            <button onClick={() => setShowCreate(!showCreate)} className="btn-grape">
              {showCreate ? 'Close' : '+ Create team'}
            </button>
          </div>
        ) : (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
              <span className="badge-grape">PS1</span>
              Open teams
            </h1>
            <p className="text-sm font-semibold text-ink/60">
              {isLoading ? 'Loading…' : `${teams.length} teams · ${openSeats} seats open`}
            </p>
          </div>
        )}

        {loggedIn && (
          <form onSubmit={joinWithCode} className="sticker-flat mb-6 flex flex-wrap items-center gap-3 p-4">
            <label htmlFor="invite-code" className="text-sm font-bold">Have an invite code?</label>
            <input id="invite-code" value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Paste the code from your invite" aria-label="Invite code"
              className="input input-mono w-52 uppercase" />
            <button className="btn-sunny btn-sm" disabled={joinBusy || !joinCode.trim()}>
              {joinBusy ? 'Joining…' : 'Join team'}
            </button>
            {notice && (
              <p role="status" className={`text-sm font-bold ${notice.ok ? 'text-mint-500' : 'text-bubble-500'}`}>
                {notice.text}
              </p>
            )}
          </form>
        )}

        {showCreate && loggedIn && (
          <CreateTeamForm onDone={() => { setShowCreate(false); qc.invalidateQueries(); }} />
        )}

        <div className="mb-5 flex items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <input
              value={skillInput} onChange={(e) => setSkillInput(e.target.value)}
              placeholder="Filter by skill — try “backend”"
              aria-label="Filter teams by skill"
              className="input pl-10 pr-9"
            />
            <svg className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
            {skillInput && (
              <button type="button" onClick={() => setSkillInput('')} aria-label="Clear skill filter"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-1.5 text-sm font-extrabold text-ink/50 hover:text-ink">×</button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="sticker-sm h-40 skeleton" />
            ))}
          </div>
        )}

        {isError && <ErrorCard message="Couldn't load the board — check your connection." onRetry={() => refetch()} />}

        <ul className="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
          {teams.map((t, i) => (
            <li key={t._id} className={i % 5 === 0 ? 'lg:mt-6' : ''}>
              <Link to={`/teams/${t._id}`}
                className={`sticker group card-in flex h-full flex-col p-5 transition-all duration-150 hover:-translate-y-1 hover:rotate-[-0.5deg] hover:shadow-[8px_10px_0_var(--color-ink)] ${CARD_TINTS[i % CARD_TINTS.length]}`}
                style={{ animationDelay: `${Math.min(i, 9) * 45}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="line-clamp-2 text-lg font-extrabold leading-snug">{t.name}</h2>
                  {t.placesLeft === 0
                    ? <span className="badge-neutral shrink-0">Full</span>
                    : <span className="badge-ok shrink-0">{t.placesLeft} left</span>}
                </div>
                <p className="mt-2 text-sm font-medium text-ink/60 line-clamp-2 leading-relaxed">{t.description || 'No description yet.'}</p>
                <div className="mt-4">
                  <SeatBar filled={t.memberCount} total={t.maxSize} />
                  <p className="mt-2 font-mono text-xs font-medium text-ink/50">
                    {t.memberCount}/{t.maxSize} · led by {t.leaderName}
                  </p>
                </div>
                {t.skillsSought.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.skillsSought.slice(0, 4).map((s, j) => (
                      <span key={s} className={`chip ${['chip-grape', 'chip-sky', 'chip-mint', 'chip-sunny'][j % 4]}`}>{s}</span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
        {!isLoading && !isError && teams.length === 0 && (
          <div className="sticker mt-8 p-12 text-center">
            <Gamepad className="mx-auto h-12 w-12 text-grape-500" />
            <Star4 className="mx-auto -mt-2 h-8 w-8 text-sunny-500 wiggle" />
            <p className="mt-4 font-bold text-ink/60">No open teams match — be the first to start one.</p>
            {loggedIn && <button onClick={() => setShowCreate(true)} className="btn-grape mt-5">Create a team</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTeamForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [maxSize, setMaxSize] = useState(4);
  const [skills, setSkills] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: hacks } = useQuery({
    queryKey: ['hackathons'],
    queryFn: () => get<{ hackathons: { _id: string; name: string; status: string }[] }>('/hackathons'),
  });
  const open = hacks?.hackathons.find((h) => h.status === 'FORMATION_OPEN');
  const effectiveHack = open?._id || '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await post('/teams', {
        hackathonId: effectiveHack,
        name,
        maxSize,
        skillsSought: skills.split(',').map((s) => s.trim()).filter(Boolean),
      }, { 'Idempotency-Key': crypto.randomUUID() });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create team');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="sticker mb-6 p-6 sm:p-8">
      <h2 className="mb-5 flex items-center gap-2 text-xl font-extrabold">
        <Star4 className="h-5 w-5 text-sunny-500" /> New team
      </h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="label">Team name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Null Pointers" className="input" />
        </label>
        <label className="block">
          <span className="label">Max size</span>
          <input required type="number" min={2} max={8} value={maxSize}
            onChange={(e) => setMaxSize(Number(e.target.value))} className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Skills you're looking for</span>
          <input value={skills} onChange={(e) => setSkills(e.target.value)}
            placeholder="backend, design, devops" className="input" />
          <span className="mt-1.5 block text-xs font-semibold text-ink/50">Comma-separated — shown on the board so the right people find you.</span>
        </label>
      </div>
      {error && <p role="alert" className="mt-4 text-sm font-bold text-bubble-500">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <button disabled={busy || !effectiveHack} className="btn-mint">
          {busy ? 'Creating…' : 'Create team'}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}
