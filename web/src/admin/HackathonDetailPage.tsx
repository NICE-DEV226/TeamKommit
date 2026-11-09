import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import {
  AdminHackathon, Pipeline, HACK_STATUS_BADGE,
  panel, panelTitle, labelDark,
} from './shared';
import { toast, confirmDialog } from './overlays';
import HackathonTeams from './HackathonTeams';

export default function HackathonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [pipeBusy, setPipeBusy] = useState(false);

  const { data: hData, isLoading, isError } = useQuery({
    queryKey: ['admin', 'hackathon', id],
    queryFn: () => get<{ hackathons: AdminHackathon[] }>('/admin/hackathons'),
    select: (d) => d.hackathons.find((h) => h._id === id),
  });
  const { data: pipesData } = useQuery({
    queryKey: ['admin', 'pipelines'],
    queryFn: () => get<{ pipelines: Pipeline[] }>('/admin/pipelines'),
  });
  const h = hData;
  usePageTitle(h ? `${h.name} · Organizer` : 'Event · Organizer');

  if (isLoading) return <div className="space-y-4" aria-busy="true"><div className={`${panel} h-40 animate-pulse`} /><div className={`${panel} h-64 animate-pulse`} /></div>;
  if (isError || !h) return (
    <div className={panel}>
      <p className="p-8 text-center text-sm font-extrabold text-bubble-400">Event not found.</p>
      <p className="pb-6 text-center"><Link to="/admin/hackathons" className="text-xs font-extrabold text-sunny-400 hover:underline">← All hackathons</Link></p>
    </div>
  );

  const organizer = typeof h.organizerId === 'object' ? h.organizerId : null;
  const pipeline = typeof h.pipelineId === 'object' ? h.pipelineId : null;
  const pipelines = pipesData?.pipelines ?? [];

  async function setPipeline(pipelineId: string | null) {
    setPipeBusy(true);
    try {
      await patch(`/admin/hackathons/${h!._id}`, { pipelineId });
      toast(pipelineId ? 'Validation pipeline updated' : 'Switched to default checks');
      qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] });
      qc.invalidateQueries({ queryKey: ['admin', 'hackathon', id] });
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Update failed', 'err'); }
    finally { setPipeBusy(false); }
  }

  async function setStatus(status: string) {
    if (await confirmDialog({ title: `Set "${h!.name}" to ${status.replace(/_/g, ' ')}?`, body: 'Teams and submissions windows follow this status.', danger: status === 'ARCHIVED' })) {
      try {
        await patch(`/admin/hackathons/${h!._id}`, { status });
        toast('Event status updated');
        qc.invalidateQueries({ queryKey: ['admin', 'hackathons'] });
        qc.invalidateQueries({ queryKey: ['admin', 'hackathon', id] });
      } catch (e) { toast(e instanceof ApiError ? e.message : 'Update failed', 'err'); }
    }
  }

  return (
    <div className="space-y-5">
      <Link to="/admin/hackathons" className="text-xs font-extrabold text-cream/50 hover:text-cream">← All hackathons</Link>

      <header className={`${panel} p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight text-cream">{h.name}</h1>
              <span className={HACK_STATUS_BADGE[h.status] ?? 'badge-neutral'}>{h.status.replace(/_/g, ' ')}</span>
            </div>
            <p className="mt-1.5 text-xs font-semibold text-cream/50">
              by {organizer?.displayName ?? '—'} · {h.slug}
            </p>
            <p className="mt-1 font-mono text-xs text-cream/45">
              {h.teams} teams · {h.participants} participants · {h.submissions} submissions · size {h.minTeamSize}–{h.maxTeamSize}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-cream/40">
              formation {new Date(h.formationOpensAt).toLocaleDateString()} → {new Date(h.formationClosesAt).toLocaleDateString()}
              {h.submissionDeadline && ` · deadline ${new Date(h.submissionDeadline).toLocaleString()}`}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelDark}>Status
              <select value={h.status} onChange={(e) => setStatus(e.target.value)}
                className="mt-1 rounded-lg border border-cream/25 bg-ink px-2 py-1.5 text-xs font-extrabold text-cream/80 focus:border-sunny-400 focus:outline-none">
                {['DRAFT', 'REGISTRATION_OPEN', 'FORMATION_OPEN', 'CLOSED', 'ARCHIVED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label className={labelDark}>Validation pipeline
              <select value={pipeline?._id ?? ''} disabled={pipeBusy} onChange={(e) => setPipeline(e.target.value || null)}
                className="mt-1 max-w-44 rounded-lg border border-cream/25 bg-ink px-2 py-1.5 text-xs font-extrabold text-cream/80 focus:border-sunny-400 focus:outline-none disabled:opacity-50">
                <option value="">Default checks</option>
                {pipelines.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      </header>

      <section className={panel} aria-label="Teams">
        <div className="border-b border-cream/10 p-5 pb-3"><h2 className={panelTitle}>Teams</h2></div>
        <HackathonTeams hackathonId={h._id} />
      </section>
    </div>
  );
}
