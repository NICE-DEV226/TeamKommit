import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, patch, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import {
  AdminHackathon, AdminTeam, AdminMember, Pipeline, HACK_STATUS_BADGE,
  panel, panelTitle, inputDark, labelDark,
} from './shared';

export default function HackathonsPage() {
  usePageTitle('Hackathons · Organizer');
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'hackathons'],
    queryFn: () => get<{ hackathons: AdminHackathon[] }>('/admin/hackathons'),
  });
  const { data: pipesData } = useQuery({
    queryKey: ['admin', 'pipelines'],
    queryFn: () => get<{ pipelines: Pipeline[] }>('/admin/pipelines'),
  });
  const pipelines = pipesData?.pipelines ?? [];
  const hackathons = data?.hackathons ?? [];

  async function setStatus(h: AdminHackathon, status: string) {
    await patch(`/admin/hackathons/${h._id}`, { status });
    qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] });
    qc.invalidateQueries({ queryKey: ['admin', 'overview'] });
  }

  async function setPipeline(h: AdminHackathon, pipelineId: string | null) {
    await patch(`/admin/hackathons/${h._id}`, { pipelineId });
    qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-sunny-400">// EVENTS</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Hackathons</h1>
          <p className="mt-1.5 text-sm font-semibold text-cream/50">Create events, control windows, intervene on teams.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-sunny btn-sm">
          {showCreate ? 'Close' : '+ New event'}
        </button>
      </header>

      {showCreate && <CreateHackathonForm pipelines={pipelines} onDone={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] }); }} />}

      {isLoading && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className={`${panel} h-24 animate-pulse`} />)}</div>}
      {isError && <p role="alert" className="text-sm font-extrabold text-bubble-400">Could not load hackathons — retry by reloading.</p>}

      <ul className="space-y-3">
        {hackathons.map((h) => (
          <li key={h._id} className={panel}>
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-5">
              <button onClick={() => setOpenId(openId === h._id ? null : h._id)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-cream">{h.name}</span>
                  <span className={HACK_STATUS_BADGE[h.status] ?? 'badge-neutral'}>{h.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="mt-1 font-mono text-xs text-cream/45">
                  {h.teams} teams · {h.participants} participants · {h.submissions} submissions · teams {h.minTeamSize}–{h.maxTeamSize}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-cream/40">
                  by {typeof h.organizerId === 'object' ? h.organizerId?.displayName ?? '—' : '—'}
                  {' · pipeline: '}
                  {typeof h.pipelineId === 'object' && h.pipelineId?.name ? h.pipelineId.name : 'default'}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={typeof h.pipelineId === 'object' ? h.pipelineId?._id ?? '' : ''}
                  onChange={(e) => setPipeline(h, e.target.value || null)}
                  className="max-w-36 rounded-lg border border-cream/25 bg-ink px-2 py-1.5 text-xs font-extrabold text-cream/80 focus:border-sunny-400 focus:outline-none"
                  aria-label={`Validation pipeline for ${h.name}`}
                  title="Submission validation pipeline"
                >
                  <option value="">Default checks</option>
                  {pipelines.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select>
                <select
                  value={h.status}
                  onChange={(e) => { if (e.target.value !== h.status && window.confirm(`Set "${h.name}" to ${e.target.value.replace(/_/g, ' ')}?`)) setStatus(h, e.target.value); }}
                  className="rounded-lg border border-cream/25 bg-ink px-2 py-1.5 text-xs font-extrabold text-cream/80 focus:border-sunny-400 focus:outline-none"
                  aria-label={`Status for ${h.name}`}
                >
                  {['DRAFT', 'REGISTRATION_OPEN', 'FORMATION_OPEN', 'CLOSED', 'ARCHIVED'].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                  ))}
                </select>
                <button onClick={() => setOpenId(openId === h._id ? null : h._id)} className="text-xs font-bold text-cream/40" aria-expanded={openId === h._id}>
                  {openId === h._id ? '▲ teams' : '▼ teams'}
                </button>
              </div>
            </div>
            {openId === h._id && <HackathonTeams hackathonId={h._id} />}
          </li>
        ))}
        {!isLoading && !isError && hackathons.length === 0 && (
          <li className={`${panel} p-10 text-center text-sm font-semibold text-cream/40`}>No events yet — create the first one.</li>
        )}
      </ul>
    </div>
  );
}

function HackathonTeams({ hackathonId }: { hackathonId: string }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [memberList, setMemberList] = useState<AdminMember[]>([]);
  const [memberErr, setMemberErr] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'hackTeams', hackathonId],
    queryFn: () => get<{ teams: AdminTeam[] }>(`/admin/hackathons/${hackathonId}/teams`),
  });

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg('');
    try { await fn(); setMsg(ok); qc.invalidateQueries({ queryKey: ['admin', 'hackTeams', hackathonId] }); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Action failed'); }
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

  if (isLoading) return <div className="border-t border-cream/10 p-5 text-sm font-semibold text-cream/40">Loading teams…</div>;
  const teams = data?.teams ?? [];
  return (
    <div className="border-t border-cream/10 p-5">
      {msg && <p role="status" className="mb-3 text-xs font-extrabold text-mint-400">{msg}</p>}
      {teams.length === 0 && <p className="text-sm font-semibold text-cream/40">No teams in this event yet.</p>}
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
                <p className="text-xs font-semibold text-cream/45">
                  {t.members}/{t.maxSize} members · led by {t.leaderName} · {t.pendingRequests} pending{t.skillsSought.length ? ` · ${t.skillsSought.slice(0, 3).join(', ')}` : ''}
                </p>
              </div>
              {t.lifecycleStatus === 'ACTIVE' && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => openAssign(t._id)} className="rounded-lg border border-cream/25 px-3 py-1.5 text-xs font-extrabold text-cream/80 hover:bg-white/5" aria-expanded={assignFor === t._id}>
                    {assignFor === t._id ? 'Close' : 'Assign leader'}
                  </button>
                  <button onClick={() => { if (window.confirm(`Disband "${t.name}"? All members are removed.`)) act(() => post(`/admin/teams/${t._id}/disband`), 'Team disbanded'); }}
                    className="rounded-lg border border-bubble-400/50 px-3 py-1.5 text-xs font-extrabold text-bubble-400 hover:bg-bubble-400/10">
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

function CreateHackathonForm({ pipelines, onDone }: { pipelines: Pipeline[]; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '', minTeamSize: 2, maxTeamSize: 5,
    formationOpensAt: '', formationClosesAt: '',
    submissionOpensAt: '', submissionDeadline: '',
    status: 'FORMATION_OPEN', leaderSuccessionPolicy: 'OPT_IN_THEN_DISBAN',
    pipelineId: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await post('/admin/hackathons', {
        name: form.name,
        minTeamSize: form.minTeamSize, maxTeamSize: form.maxTeamSize,
        formationOpensAt: new Date(form.formationOpensAt).toISOString(),
        formationClosesAt: new Date(form.formationClosesAt).toISOString(),
        submissionOpensAt: form.submissionOpensAt ? new Date(form.submissionOpensAt).toISOString() : undefined,
        submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline).toISOString() : undefined,
        status: form.status, leaderSuccessionPolicy: form.leaderSuccessionPolicy,
        pipelineId: form.pipelineId || undefined,
      });
      onDone();
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Failed to create event'); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className={`${panel} space-y-4 p-6`}>
      <h2 className="text-lg font-extrabold text-cream">New hackathon</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className={labelDark}>Name</span>
          <input required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputDark} placeholder="Hack4Hack 2027" /></label>
        <label className="block"><span className={labelDark}>Min team size</span>
          <input required type="number" min={1} max={20} value={form.minTeamSize} onChange={(e) => set('minTeamSize', Number(e.target.value))} className={inputDark} /></label>
        <label className="block"><span className={labelDark}>Max team size</span>
          <input required type="number" min={1} max={20} value={form.maxTeamSize} onChange={(e) => set('maxTeamSize', Number(e.target.value))} className={inputDark} /></label>
        <label className="block"><span className={labelDark}>Formation opens</span>
          <input required type="datetime-local" value={form.formationOpensAt} onChange={(e) => set('formationOpensAt', e.target.value)} className={inputDark} /></label>
        <label className="block"><span className={labelDark}>Formation closes</span>
          <input required type="datetime-local" value={form.formationClosesAt} onChange={(e) => set('formationClosesAt', e.target.value)} className={inputDark} /></label>
        <label className="block"><span className={labelDark}>Submissions open (optional)</span>
          <input type="datetime-local" value={form.submissionOpensAt} onChange={(e) => set('submissionOpensAt', e.target.value)} className={inputDark} /></label>
        <label className="block"><span className={labelDark}>Submission deadline (optional)</span>
          <input type="datetime-local" value={form.submissionDeadline} onChange={(e) => set('submissionDeadline', e.target.value)} className={inputDark} /></label>
        <label className="block"><span className={labelDark}>Initial status</span>
          <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputDark}>
            {['DRAFT', 'REGISTRATION_OPEN', 'FORMATION_OPEN', 'CLOSED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select></label>
        <label className="block"><span className={labelDark}>Leader succession</span>
          <select value={form.leaderSuccessionPolicy} onChange={(e) => set('leaderSuccessionPolicy', e.target.value)} className={inputDark}>
            <option value="OPT_IN_THEN_DISBAN">Opt-in, then close</option>
            <option value="ORGANIZER_FALLBACK">Organizer fallback</option>
          </select></label>
        <label className="block"><span className={labelDark}>Validation pipeline</span>
          <select value={form.pipelineId} onChange={(e) => set('pipelineId', e.target.value)} className={inputDark}>
            <option value="">Default checks</option>
            {pipelines.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.stepCount ?? p.steps.length} steps)</option>)}
          </select></label>
      </div>
      {error && <p role="alert" className="text-sm font-extrabold text-bubble-400">{error}</p>}
      <div className="flex gap-3 border-t border-cream/10 pt-4">
        <button disabled={busy} className="btn-sunny btn-sm">{busy ? 'Creating…' : 'Create event'}</button>
        <button type="button" onClick={onDone} className="rounded-lg border border-cream/25 px-4 py-1.5 text-xs font-extrabold text-cream/60 hover:bg-white/5">Cancel</button>
      </div>
    </form>
  );
}
