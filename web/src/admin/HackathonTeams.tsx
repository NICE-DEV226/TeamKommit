import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, ApiError } from '../lib/api';
import { AdminTeam, AdminMember, panel } from './shared';
import { toast, confirmDialog } from './overlays';

/** Teams of one hackathon with organizer interventions (assign leader / disband). */
export default function HackathonTeams({ hackathonId }: { hackathonId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState('');
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [memberList, setMemberList] = useState<AdminMember[]>([]);
  const [memberErr, setMemberErr] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'hackTeams', hackathonId],
    queryFn: () => get<{ teams: AdminTeam[] }>(`/admin/hackathons/${hackathonId}/teams`),
  });

  async function act(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); toast(ok); qc.invalidateQueries({ queryKey: ['admin', 'hackTeams', hackathonId] }); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Action failed', 'err'); }
  }

  async function openAssign(teamId: string) {
    if (assignFor === teamId) { setAssignFor(null); return; }
    setMemberErr(''); setMemberList([]);
    try {
      const res = await get<{ members: AdminMember[] }>(`/admin/teams/${teamId}/members`);
      setMemberList(res.members);
      setAssignFor(teamId);
    } catch (e) {
      setMemberErr(e instanceof ApiError ? e.message : 'Could not load members');
    }
  }

  const q = filter.trim().toLowerCase();
  const teams = (data?.teams ?? []).filter((t) =>
    !q || t.name.toLowerCase().includes(q) || t.leaderName.toLowerCase().includes(q));

  if (isLoading) return <div className="border-t border-cream/10 p-5 text-sm font-semibold text-cream/40">Loading teams…</div>;
  if (isError) return <div className="border-t border-cream/10 p-5 text-sm font-extrabold text-bubble-400">Could not load teams.</div>;

  return (
    <div className="border-t border-cream/10 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-extrabold uppercase tracking-wider text-cream/45">{teams.length} team{teams.length === 1 ? '' : 's'}</p>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter teams or leaders…"
          className="w-56 rounded-lg border border-cream/25 bg-ink px-3 py-1.5 text-xs font-semibold text-cream placeholder:text-cream/30 focus:border-sunny-400 focus:outline-none" />
      </div>
      {teams.length === 0 && <p className="text-sm font-semibold text-cream/40">{q ? 'No team matches.' : 'No teams in this event yet.'}</p>}
      <ul className="space-y-2">
        {teams.map((t) => (
          <li key={t._id} className="rounded-xl border border-cream/10 bg-white/[0.03] px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-cream">
                  {t.name}
                  {t.leaderless && <span className="ml-2 rounded-full border border-bubble-400/60 bg-bubble-400/15 px-2 py-0.5 text-[10px] font-extrabold text-bubble-400">LEADERLESS</span>}
                  {t.lifecycleStatus === 'DISBANDED' && <span className="ml-2 text-[10px] font-extrabold text-cream/40">DISBANDED</span>}
                </p>
                <p className="text-xs font-semibold text-cream/55">
                  {t.members}/{t.maxSize} members · led by {t.leaderName} · {t.pendingRequests} pending{t.skillsSought.length ? ` · ${t.skillsSought.slice(0, 3).join(', ')}` : ''}
                </p>
              </div>
              {t.lifecycleStatus === 'ACTIVE' && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => openAssign(t._id)} className="rounded-lg border border-cream/25 px-3 py-1.5 text-xs font-extrabold text-cream/80 hover:bg-white/5" aria-expanded={assignFor === t._id}>
                    {assignFor === t._id ? 'Close' : 'Assign leader'}
                  </button>
                  <button onClick={async () => {
                    if (await confirmDialog({ title: `Disband "${t.name}"?`, body: 'All active memberships are removed. This cannot be undone.', danger: true })) {
                      act(() => post(`/admin/teams/${t._id}/disband`), 'Team disbanded');
                    }
                  }} className="rounded-lg border border-bubble-400/50 px-3 py-1.5 text-xs font-extrabold text-bubble-400 hover:bg-bubble-400/10">
                    Disband
                  </button>
                </div>
              )}
            </div>
            {assignFor === t._id && (
              <div className="mt-3 border-t border-cream/10 pt-3">
                {memberErr && <p role="alert" className="text-xs font-extrabold text-bubble-400">{memberErr}</p>}
                {!memberErr && memberList.length === 0 && <p className="text-xs text-cream/40">No active members.</p>}
                {!memberErr && memberList.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {memberList.map((m) => (
                      <li key={m.membershipId}>
                        <button onClick={() => act(() => post(`/admin/teams/${t._id}/assign-leader`, { membershipId: m.membershipId }), `${m.user?.displayName ?? 'Member'} is now leader`)}
                          className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${m.role === 'LEADER' ? 'border-sunny-400 bg-sunny-400/20 text-sunny-400' : 'border-cream/25 text-cream/80 hover:border-sunny-400/60'}`}>
                          {m.user?.displayName ?? 'Member'}{m.role === 'LEADER' ? ' ★' : ''}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
