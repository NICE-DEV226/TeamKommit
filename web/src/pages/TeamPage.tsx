import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, isLoggedIn, ApiError } from '../lib/api';

interface Member {
  membershipId: string; role: string; openToLead: boolean; joinedAt: string;
  user: { displayName: string; bio?: string; skills?: { skill: string; level: number }[] };
}
interface TeamDetail {
  team: {
    _id: string; name: string; description: string; memberCount: number; maxSize: number;
    placesLeft: number; leaderId: string; leaderName?: string; skillsSought: string[];
    recruitmentStatus: string; formationMessage?: string;
  };
  members: Member[];
}
interface Suggestion {
  userId: string; displayName: string; mutualScore: number;
  teamContribution: number; participantFit: number; reasons: string[];
  skills: { skill: string; level: number }[];
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: () => get<TeamDetail>(`/teams/${id}`),
    enabled: !!id,
  });
  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: { _id: string; isOrganizer?: boolean } }>('/auth/me'),
    enabled: isLoggedIn(),
    retry: false,
    staleTime: 60_000,
  });
  const { data: requests } = useQuery({
    queryKey: ['requests', id],
    queryFn: () => get<{ requests: { _id: string; message: string; user?: { displayName: string } }[] }>(`/teams/${id}/requests`),
    enabled: !!id && isLoggedIn(),
    retry: false,
  });
  const { data: suggestions } = useQuery({
    queryKey: ['suggestions', id],
    queryFn: () => get<{ suggestions: Suggestion[] }>(`/teams/${id}/suggestions`),
    enabled: !!id && isLoggedIn(),
    retry: false,
  });

  if (isLoading || !data) return <p className="text-zinc-500">Loading…</p>;
  const { team, members } = data;
  const me = meData?.user;
  const isLeader = !!me && team.leaderId === me._id;

  async function act(fn: () => Promise<unknown>, ok: string) {
    setActionMsg('');
    try { await fn(); setActionMsg(ok); qc.invalidateQueries({ queryKey: ['team', id] }); qc.invalidateQueries({ queryKey: ['board'] }); }
    catch (err) { setActionMsg(err instanceof ApiError ? err.message : 'Action failed'); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{team.name}</h1>
              <p className="text-sm text-zinc-400">Led by {team.leaderName ?? '—'} · {team.memberCount}/{team.maxSize} members · {team.recruitmentStatus}</p>
            </div>
            <span className={`text-sm px-3 py-1 rounded-full ${team.placesLeft > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-700 text-zinc-300'}`}>
              {team.placesLeft > 0 ? `${team.placesLeft} spots left` : 'Full'}
            </span>
          </div>
          {team.description && <p className="mt-3 text-zinc-300">{team.description}</p>}
          {team.formationMessage && <p className="mt-2 text-sm italic text-zinc-400">“{team.formationMessage}”</p>}
          <div className="mt-3 flex flex-wrap gap-1">
            {team.skillsSought.map((s) => <span key={s} className="text-xs bg-zinc-800 px-2 py-0.5 rounded">seeking: {s}</span>)}
          </div>
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="font-semibold mb-3">Members</h2>
          <ul className="space-y-2">
            {members.map((m) => (
              <li key={m.membershipId} className="flex items-center gap-3 text-sm">
                <span className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold">
                  {m.user.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <span className="font-medium">{m.user.displayName}</span>
                  {m.role === 'LEADER' && <span className="ml-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">leader</span>}
                  {m.openToLead && m.role !== 'LEADER' && <span className="ml-2 text-xs text-zinc-500">open to lead</span>}
                  <p className="text-xs text-zinc-500">{m.user.skills?.map((s) => s.skill).join(', ')}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {isLeader && (requests?.requests.length ?? 0) > 0 && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5" aria-label="Join requests">
            <h2 className="font-semibold mb-3">Join requests ({requests!.requests.length})</h2>
            <ul className="space-y-3">
              {requests!.requests.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 text-sm border-b border-zinc-800 pb-3 last:border-0">
                  <div>
                    <span className="font-medium">{r.user?.displayName ?? 'Unknown'}</span>
                    {r.message && <p className="text-zinc-400 text-xs">{r.message}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => act(() => post(`/requests/${r._id}/accept`), 'Accepted')}
                      className="text-xs bg-emerald-500 text-black font-semibold px-3 py-1 rounded">Accept</button>
                    <button onClick={() => act(() => post(`/requests/${r._id}/decline`), 'Declined')}
                      className="text-xs border border-zinc-600 px-3 py-1 rounded hover:bg-zinc-800">Decline</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {suggestions && suggestions.suggestions.length > 0 && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5" aria-label="Teammate suggestions">
            <h2 className="font-semibold mb-1">Suggested teammates</h2>
            <p className="text-xs text-zinc-500 mb-3">Ranked by complementary skills & availability — score decomposed for transparency.</p>
            <ul className="space-y-3">
              {suggestions.suggestions.map((s) => (
                <li key={s.userId} className="border-b border-zinc-800 pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{s.displayName}</span>
                    <span className="text-xs font-mono text-emerald-400">{Math.round(s.mutualScore * 100)}%</span>
                  </div>
                  <div className="flex gap-3 text-xs text-zinc-500 mt-1">
                    <span>team fit {Math.round(s.teamContribution * 100)}%</span>
                    <span>your fit {Math.round(s.participantFit * 100)}%</span>
                  </div>
                  {s.reasons.length > 0 && <p className="text-xs text-zinc-400 mt-1">{s.reasons.join(' · ')}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-4">
        {me && (
          <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Actions</h2>
            <div className="space-y-2">
              <button onClick={() => act(() => post(`/teams/${id}/join-request`, { message }), 'Request sent — the leader will review it')}
                className="w-full text-sm bg-emerald-500 text-black font-semibold py-2 rounded hover:bg-emerald-400">
                Request to join
              </button>
              <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to leader (optional)"
                className="w-full bg-zinc-950 border border-zinc-700 rounded px-3 py-2 text-sm" aria-label="Message to team leader" />
              <button onClick={() => act(() => post(`/teams/${id}/leave`), 'You left the team')}
                className="w-full text-sm border border-red-500/50 text-red-400 py-2 rounded hover:bg-red-500/10">
                Leave team
              </button>
              {isLeader && (
                <button onClick={() => act(async () => {
                  const r = await post<{ code: string }>(`/teams/${id}/invite-code`);
                  setInviteCode(r.code);
                }, 'Code generated')}
                  className="w-full text-sm border border-zinc-600 py-2 rounded hover:bg-zinc-800">
                  Generate invite code
                </button>
              )}
              {inviteCode && (
                <p className="text-xs font-mono bg-zinc-950 border border-zinc-800 rounded p-2 break-all select-all" aria-label="Invite code">
                  {inviteCode}
                </p>
              )}
              <button onClick={() => act(() => post(`/teams/${id}/remove`, { membershipId: members.find((m) => m.role !== 'LEADER')?.membershipId }), 'Member removed')}
                className="w-full text-xs text-zinc-500 hover:text-red-400">
                Remove first non-leader
              </button>
            </div>
            {actionMsg && <p role="status" className="mt-3 text-sm text-emerald-400">{actionMsg}</p>}
          </section>
        )}
        <section className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <button onClick={() => setShowAudit(!showAudit)} className="text-sm text-zinc-400 hover:text-white" aria-expanded={showAudit}>
            {showAudit ? '▾' : '▸'} Audit log
          </button>
          {showAudit && <AuditLog teamId={id!} />}
        </section>
      </aside>
    </div>
  );
}

function AuditLog({ teamId }: { teamId: string }) {
  const { data } = useQuery({
    queryKey: ['audit', teamId],
    queryFn: () => get<{ events: { _id: string; eventType: string; occurredAt: string; actorId?: string }[] }>(`/teams/${teamId}/audit`),
    retry: false,
  });
  if (!data) return <p className="text-xs text-zinc-500 mt-2">Loading…</p>;
  return (
    <ul className="mt-2 space-y-1 text-xs text-zinc-400 max-h-64 overflow-auto">
      {data.events.map((e) => (
        <li key={e._id}><span className="text-zinc-500">{new Date(e.occurredAt).toLocaleTimeString()}</span> {e.eventType}</li>
      ))}
    </ul>
  );
}
