import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, isLoggedIn, ApiError } from '../lib/api';

interface Team {
  _id: string; name: string; description: string; memberCount: number; maxSize: number;
  placesLeft: number; leaderName: string; skillsSought: string[]; skillsHeld: string[];
  recruitmentStatus: string; updatedAt: string;
}

export default function BoardPage() {
  const [skill, setSkill] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [notice, setNotice] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['board', skill],
    queryFn: () => get<{ teams: Team[] }>(`/board${skill ? `?skill=${encodeURIComponent(skill)}` : ''}`),
  });

  async function joinWithCode(e: React.FormEvent) {
    e.preventDefault();
    setNotice('');
    try {
      await post('/teams/join-code', { code: joinCode.trim() });
      setNotice('Joined!');
      setJoinCode('');
      qc.invalidateQueries({ queryKey: ['board'] });
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Invalid code');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Team board</h1>
        <input
          value={skill} onChange={(e) => setSkill(e.target.value)}
          placeholder="Filter by skill…"
          aria-label="Filter teams by skill"
          className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-sm w-48"
        />
        <div className="ml-auto flex gap-2">
          {isLoggedIn() && (
            <button onClick={() => setShowCreate(!showCreate)}
              className="text-sm bg-emerald-500 text-black font-semibold px-3 py-1.5 rounded-md hover:bg-emerald-400">
              Create team
            </button>
          )}
        </div>
      </div>

      {isLoggedIn() && (
        <form onSubmit={joinWithCode} className="mb-6 flex gap-2 items-center">
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Have an invite code?" aria-label="Invite code"
            className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-sm w-64 font-mono" />
          <button className="text-sm border border-zinc-600 px-3 py-1.5 rounded-md hover:bg-zinc-800">Join</button>
          {notice && <span className="text-sm text-emerald-400" role="status">{notice}</span>}
        </form>
      )}

      {showCreate && isLoggedIn() && <CreateTeamForm onDone={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['board'] }); }} />}

      {isLoading && <p className="text-zinc-500">Loading…</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-live="polite">
        {data?.teams.map((t) => (
          <li key={t._id}>
            <Link to={`/teams/${t._id}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-emerald-500/50 transition-colors h-full">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{t.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.placesLeft === 0 ? 'bg-zinc-700 text-zinc-300' : 'bg-emerald-500/15 text-emerald-400'}`}>
                  {t.placesLeft === 0 ? 'Full' : `${t.placesLeft} spots left`}
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-1 line-clamp-2">{t.description || 'No description'}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {t.skillsSought.slice(0, 4).map((s) => (
                  <span key={s} className="text-xs bg-zinc-800 px-2 py-0.5 rounded">{s}</span>
                ))}
              </div>
              <p className="text-xs text-zinc-500 mt-3">{t.memberCount}/{t.maxSize} · led by {t.leaderName}</p>
            </Link>
          </li>
        ))}
      </ul>
      {data && data.teams.length === 0 && <p className="text-zinc-500 mt-8">No open teams yet — create one!</p>}
    </div>
  );
}

function CreateTeamForm({ onDone }: { onDone: () => void }) {
  const [hackathonId, setHackathonId] = useState('');
  const [name, setName] = useState('');
  const [maxSize, setMaxSize] = useState(4);
  const [skills, setSkills] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Auto-pick the first open hackathon
  const { data: hacks } = useQuery({
    queryKey: ['hackathons'],
    queryFn: () => get<{ hackathons: { _id: string; name: string; status: string }[] }>('/hackathons'),
  });
  const open = hacks?.hackathons.find((h) => h.status === 'FORMATION_OPEN');
  const effectiveHack = hackathonId || open?._id || '';

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
    <form onSubmit={submit} className="mb-6 bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Team name
        <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2" />
      </label>
      <label className="text-sm">Max size
        <input required type="number" min={2} max={8} value={maxSize} onChange={(e) => setMaxSize(Number(e.target.value))} className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2" />
      </label>
      <label className="text-sm sm:col-span-2">Skills sought (comma separated)
        <input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="backend, design, devops" className="mt-1 w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-red-400 text-sm sm:col-span-2">{error}</p>}
      <button disabled={busy || !effectiveHack} className="sm:col-span-2 bg-emerald-500 text-black font-semibold py-2 rounded disabled:opacity-50">
        {busy ? 'Creating…' : 'Create team'}
      </button>
    </form>
  );
}
