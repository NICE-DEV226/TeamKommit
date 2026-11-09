import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, isLoggedIn, ApiError } from '../lib/api';
import { Star4, Sparkle } from '../components/doodles';
import { ErrorCard, usePageTitle } from '../components/feedback';
import ProfileNudge from '../components/ProfileNudge';

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
  components?: {
    skillGain: number; novelty: number; availability: number;
    skillFit: number; roleFit: number;
  };
  skills: { skill: string; level: number }[];
}

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-bold text-ink/60">
      <span className="w-20 shrink-0">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full border border-ink/30 bg-ink/10">
        <div className={`h-full rounded-full border-r border-ink ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-ink">{Math.round(value * 100)}%</span>
    </div>
  );
}

/** Stacked bar: composition of a score — each segment is one weighted term,
    normalized to fill (the absolute values are shown by ScoreBar above).
    Deterministic engine — no LLM anywhere in this pipeline. */
function FormulaBar({ terms }: { terms: { label: string; value: number; weight: number; color: string }[] }) {
  const sum = terms.reduce((n, t) => n + t.value * t.weight, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-ink/40">
        {terms.map((t) => (
          <div key={t.label} className={t.color} style={{ width: `${((t.value * t.weight) / sum) * 100}%` }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] font-bold text-ink/50">
        {terms.map((t) => (
          <span key={t.label}>{t.label} {t.value.toFixed(2)}×{t.weight}</span>
        ))}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [showAudit, setShowAudit] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
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
  const { data: myTeams } = useQuery({
    queryKey: ['myTeams'],
    queryFn: () => get<{ memberships: { role?: string; openToLead?: boolean; team?: { _id: string } }[] }>('/me/teams'),
    enabled: isLoggedIn(),
    retry: false,
    staleTime: 30_000,
  });

  // Role flags resolved from already-fetched queries — gate the privileged
  // endpoints so non-authorized viewers never fire a guaranteed 403.
  const viewerIsLeader = !!meData?.user && data?.team?.leaderId === meData.user._id;
  const viewerIsMember = viewerIsLeader ||
    (myTeams !== undefined && myTeams.memberships.some((m) => m.team?._id === id));

  const { data: requests } = useQuery({
    queryKey: ['requests', id],
    queryFn: () => get<{ requests: { _id: string; message: string; user?: { displayName: string } }[] }>(`/teams/${id}/requests`),
    enabled: !!id && isLoggedIn() && viewerIsLeader,
    retry: false,
  });
  const { data: suggestions } = useQuery({
    queryKey: ['suggestions', id],
    queryFn: () => get<{ suggestions: Suggestion[] }>(`/teams/${id}/suggestions`),
    enabled: !!id && isLoggedIn() && viewerIsMember,
    retry: false,
  });
  usePageTitle(data?.team?.name ?? 'Team');

  if (isLoading) {
    return <div className="space-y-5" aria-busy="true"><div className="sticker h-44 skeleton" /><div className="sticker h-72 skeleton" /></div>;
  }
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <Link to="/board" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-grape-500 hover:underline">← Back to board</Link>
        <ErrorCard message="This team may have been disbanded or the link is wrong." onRetry={() => refetch()} />
      </div>
    );
  }
  const { team, members } = data;
  const me = meData?.user;
  const isLeader = !!me && team.leaderId === me._id;
  const myMembership = myTeams?.memberships.find((m) => m.team?._id === id);
  const isMember = !!myMembership || isLeader;
  const membershipResolved = myTeams !== undefined;

  async function act(fn: () => Promise<unknown>, ok: string) {
    setActionMsg(null);
    try {
      await fn();
      setActionMsg({ ok: true, text: ok });
      qc.invalidateQueries();
    } catch (err) {
      setActionMsg({ ok: false, text: err instanceof ApiError ? err.message : 'Action failed' });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Link to="/board" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-grape-500 hover:underline">← Back to board</Link>
        <ProfileNudge />
        <section className="sticker relative overflow-hidden p-6 sm:p-8">
          <Sparkle className="absolute right-6 top-6 h-5 w-5 text-sunny-500 floaty" />
          <Star4 className="absolute bottom-6 right-14 h-6 w-6 text-grape-500/60 rotate-12" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="badge-grape">PS1</span>
                <h1 className="text-3xl font-extrabold tracking-tight">{team.name}</h1>
                {team.placesLeft > 0
                  ? <span className="badge-ok">{team.placesLeft} {team.placesLeft === 1 ? 'seat' : 'seats'} open</span>
                  : <span className="badge-neutral">Full</span>}
              </div>
              <p className="mt-2 text-sm font-semibold text-ink/60">
                Led by {team.leaderName ?? '—'} · {team.memberCount}/{team.maxSize} members · {team.recruitmentStatus.toLowerCase()}
              </p>
            </div>
          </div>
          {team.description && <p className="mt-4 text-sm font-medium leading-relaxed text-ink/75">{team.description}</p>}
          {team.formationMessage && (
            <p className="mt-4 border-l-4 border-grape-500 pl-3 text-sm font-semibold italic text-ink/60">“{team.formationMessage}”</p>
          )}
          {team.skillsSought.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {team.skillsSought.map((s, i) => (
                <span key={s} className={`chip ${['chip-grape', 'chip-sky', 'chip-mint', 'chip-sunny', 'chip-bubble'][i % 5]}`}>seeking {s}</span>
              ))}
            </div>
          )}
          <div className="mt-5 border-t-2 border-dashed border-ink/15 pt-4">
            <Link to="/submissions" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-grape-500 hover:underline">
              Team formed? Ship it — submit your project <span aria-hidden>→</span>
            </Link>
          </div>
        </section>

        <section className="sticker-sm p-6">
          <h2 className="mb-4 text-lg font-extrabold">Members <span className="font-bold text-ink/55">({members.length})</span></h2>
          <ul className="divide-y-2 divide-dashed divide-ink/15">
            {members.map((m) => (
              <li key={m.membershipId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="avatar">{initials(m.user.displayName)}</span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold">{m.user.displayName}</span>
                    {m.role === 'LEADER' && <span className="chip-grape px-2! py-0! text-[10px]!">Leader</span>}
                    {m.openToLead && m.role !== 'LEADER' && <span className="text-xs font-semibold text-ink/55">open to lead</span>}
                  </div>
                  {m.user.skills && m.user.skills.length > 0 && (
                    <p className="truncate text-xs font-semibold text-ink/60">{m.user.skills.map((s) => s.skill).join(' · ')}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {isLeader && (requests?.requests.length ?? 0) > 0 && (
          <section className="sticker p-6" aria-label="Join requests">
            <h2 className="mb-4 text-lg font-extrabold">Join requests <span className="font-bold text-ink/55">({requests!.requests.length})</span></h2>
            <ul className="divide-y-2 divide-dashed divide-ink/15">
              {requests!.requests.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <span className="text-sm font-bold">{r.user?.displayName ?? 'Unknown'}</span>
                    {r.message && <p className="truncate text-xs font-semibold text-ink/50">{r.message}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => act(() => post(`/requests/${r._id}/accept`), 'Request accepted')}
                      className="btn-mint btn-sm">Accept</button>
                    <button onClick={() => act(() => post(`/requests/${r._id}/decline`), 'Request declined')}
                      className="btn-secondary btn-sm">Decline</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {suggestions && suggestions.suggestions.length > 0 && (
          <section className="sticker p-6" aria-label="Teammate suggestions">
            <h2 className="text-lg font-extrabold">Suggested teammates</h2>
            <p className="mt-1 text-xs font-semibold text-ink/50">
              Ranked by a deterministic engine — submodular skill coverage, circular-week availability, role fit.
              No LLM: every point decomposes into auditable math.
            </p>
            <ul className="mt-4 divide-y-2 divide-dashed divide-ink/15">
              {suggestions.suggestions.map((s, i) => (
                <li key={s.userId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`avatar ${['bg-grape-500 text-white', 'bg-sky-400 text-white', 'bg-mint-400', 'bg-bubble-400 text-white', 'bg-tang-400'][i % 5]}`}>
                        {initials(s.displayName)}
                      </span>
                      <span className="text-sm font-bold">{s.displayName}</span>
                    </div>
                    <span className="font-mono text-sm font-extrabold">{Math.round(s.mutualScore * 100)}%</span>
                  </div>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    <ScoreBar label="Team fit" value={s.teamContribution} color="bg-grape-500" />
                    <ScoreBar label="Your fit" value={s.participantFit} color="bg-sky-400" />
                  </div>
                  {s.components && (
                    <div className="mt-3 space-y-2 rounded-xl border-2 border-dashed border-ink/20 bg-ink/[0.03] p-3">
                      <FormulaBar
                        terms={[
                          { label: 'Δskill', value: s.components.skillGain, weight: 0.5, color: 'bg-grape-500' },
                          { label: 'novelty', value: s.components.novelty, weight: 0.3, color: 'bg-sunny-400' },
                          { label: 'avail', value: s.components.availability, weight: 0.2, color: 'bg-mint-400' },
                        ]}
                      />
                      <FormulaBar
                        terms={[
                          { label: 'skillFit', value: s.components.skillFit, weight: 0.6, color: 'bg-sky-400' },
                          { label: 'roleFit', value: s.components.roleFit, weight: 0.4, color: 'bg-tang-400' },
                        ]}
                      />
                      <p className="font-mono text-[10px] font-bold text-ink/55">
                        V_T = 0.5·Δskill + 0.3·novelty + 0.2·avail &nbsp;·&nbsp; V_P = 0.6·fit + 0.4·role &nbsp;·&nbsp; score = √(V_T·V_P)
                      </p>
                    </div>
                  )}
                  {s.reasons.length > 0 && (
                    <p className="mt-2 text-xs font-semibold text-ink/50">{s.reasons.join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="space-y-5">
        {me && (
          <section className="sticker-sm p-5">
            <h2 className="mb-4 text-sm font-extrabold uppercase tracking-wide">Actions</h2>
            <div className="space-y-3">
              {!membershipResolved && <p className="text-xs font-bold text-ink/55">Checking your membership…</p>}
              {membershipResolved && !isMember && (
                <>
                  <button onClick={() => act(() => post(`/teams/${id}/join-request`, { message }), 'Request sent — the leader will review it')}
                    className="btn-grape w-full">
                    Request to join
                  </button>
                  <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message to leader (optional)"
                    className="input" aria-label="Message to team leader" />
                </>
              )}
              {membershipResolved && isMember && !isLeader && (
                <label className="flex items-center gap-2.5 text-sm font-bold">
                  <input type="checkbox" checked={!!myMembership?.openToLead}
                    onChange={(e) => act(() => post(`/teams/${id}/lead-opt-in`, { open: e.target.checked }),
                      e.target.checked ? 'You’re next in line if the leader leaves' : 'Opted out of leadership')}
                    className="h-4 w-4 accent-ink" />
                  Open to lead succession
                </label>
              )}
              {membershipResolved && isMember && (
                <button onClick={() => act(() => post(`/teams/${id}/leave`), 'You left the team')}
                  className="btn-danger w-full">
                  {isLeader ? 'Leave team (triggers succession)' : 'Leave team'}
                </button>
              )}
              {isLeader && (
                <button onClick={() => act(async () => {
                  const r = await post<{ code: string }>(`/teams/${id}/invite-code`);
                  setInviteCode(r.code);
                }, 'Invite code generated — share it before it expires')}
                  className="btn-sunny w-full">
                  Generate invite code
                </button>
              )}
              {inviteCode && (
                <div className="flex items-center gap-2">
                  <p className="input input-mono flex-1 select-all text-center font-bold" aria-label="Invite code">
                    {inviteCode}
                  </p>
                  <button type="button" className="btn-secondary btn-sm shrink-0"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(inviteCode); setActionMsg({ ok: true, text: 'Code copied' }); }
                      catch { setActionMsg({ ok: false, text: 'Copy failed — select the code manually' }); }
                    }}>
                    Copy
                  </button>
                </div>
              )}
              {isLeader && members.filter((m) => m.role !== 'LEADER').map((m) => (
                <button key={m.membershipId}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.user.displayName} from the team? This cannot be undone.`)) {
                      act(() => post(`/teams/${id}/remove`, { membershipId: m.membershipId }), `${m.user.displayName} removed`);
                    }
                  }}
                  className="btn-ghost w-full text-xs text-ink/50">
                  Remove {m.user.displayName}
                </button>
              ))}
            </div>
            {actionMsg && (
              <p role="status" className={`mt-3 text-sm font-bold ${actionMsg.ok ? 'text-mint-500' : 'text-bubble-500'}`}>
                {actionMsg.text}
              </p>
            )}
          </section>
        )}
        <section className="sticker-sm p-5">
          <button onClick={() => setShowAudit(!showAudit)} className="flex w-full items-center justify-between text-sm font-extrabold" aria-expanded={showAudit}>
            Audit log
            <span className={`transition-transform ${showAudit ? 'rotate-180' : ''}`}>▾</span>
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
  if (!data) return <p className="mt-3 text-xs font-semibold text-ink/50">Loading…</p>;
  return (
    <ul className="mt-3 max-h-64 space-y-2 overflow-auto border-t-2 border-dashed border-ink/15 pt-3 text-xs font-semibold text-ink/60">
      {data.events.length === 0 && <li className="text-ink/50">No activity yet — events appear here as the team mutates.</li>}
      {data.events.map((e) => (
        <li key={e._id} className="flex gap-2">
          <span className="shrink-0 font-mono text-ink/55">{new Date(e.occurredAt).toLocaleTimeString()}</span>
          <span>{e.eventType}</span>
        </li>
      ))}
    </ul>
  );
}
