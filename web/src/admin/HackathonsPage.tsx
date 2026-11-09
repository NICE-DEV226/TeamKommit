import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import {
  AdminHackathon, Pipeline, HACK_STATUS_BADGE,
  panel, panelTitle, inputDark, labelDark,
} from './shared';
import { toast } from './overlays';

export default function HackathonsPage() {
  usePageTitle('Hackathons · Organizer');
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'hackathons'],
    queryFn: () => get<{ hackathons: AdminHackathon[] }>('/admin/hackathons'),
  });
  const { data: pipesData } = useQuery({
    queryKey: ['admin', 'pipelines'],
    queryFn: () => get<{ pipelines: Pipeline[] }>('/admin/pipelines'),
  });
  const pipelines = pipesData?.pipelines ?? [];
  const q = filter.trim().toLowerCase();
  const hackathons = (data?.hackathons ?? []).filter((h) =>
    !q || h.name.toLowerCase().includes(q) ||
    (typeof h.organizerId === 'object' && (h.organizerId?.displayName ?? '').toLowerCase().includes(q)));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-sky-400">// EVENTS</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Hackathons</h1>
          <p className="mt-1.5 text-sm font-semibold text-cream/50">Create events, attach pipelines, drill into teams.</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-sunny btn-sm">
          {showCreate ? 'Close' : '+ New event'}
        </button>
      </header>

      {showCreate && <CreateHackathonForm pipelines={pipelines} onDone={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] }); toast('Event created'); }} />}

      {hackathons.length > 3 && (
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter events or organizers…"
          className="w-72 rounded-xl border-2 border-cream/25 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-cream placeholder:text-cream/30 focus:border-sunny-400 focus:outline-none" />
      )}

      {isLoading && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className={`${panel} h-24 animate-pulse`} />)}</div>}
      {isError && <p role="alert" className="text-sm font-extrabold text-bubble-400">Could not load hackathons — retry by reloading.</p>}

      <ul className="space-y-3">
        {hackathons.map((h) => {
          const organizer = typeof h.organizerId === 'object' ? h.organizerId : null;
          const pipeline = typeof h.pipelineId === 'object' ? h.pipelineId : null;
          return (
            <li key={h._id}>
              <Link to={`/admin/hackathons/${h._id}`} className={`${panel} block p-5 transition-colors hover:border-sunny-400/50`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-cream">{h.name}</span>
                      <span className={HACK_STATUS_BADGE[h.status] ?? 'badge-neutral'}>{h.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-cream/50">
                      {h.teams} teams · {h.participants} participants · {h.submissions} submissions · teams {h.minTeamSize}–{h.maxTeamSize}
                    </p>
                    <p className="mt-0.5 text-[11px] font-semibold text-cream/45">
                      by {organizer?.displayName ?? '—'} · pipeline: {pipeline?.name ?? 'default'} →
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-extrabold text-cream/35 group-hover:text-sunny-400">Open →</span>
                </div>
              </Link>
            </li>
          );
        })}
        {!isLoading && !isError && hackathons.length === 0 && (
          <li className={`${panel} p-10 text-center text-sm font-semibold text-cream/40`}>
            {q ? 'No event matches the filter.' : 'No events yet — create the first one.'}
          </li>
        )}
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
