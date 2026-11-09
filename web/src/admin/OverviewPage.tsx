import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import {
  Stats, Overview, STATUS_ORDER, STATUS_COLOR, STATUS_BADGE,
  panel, panelTitle, useNow, DeadlineCard, LateEmpty,
} from './shared';

export default function OverviewPage() {
  usePageTitle('Overview · Organizer');
  const now = useNow();
  const statsQ = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => get<Stats>('/submissions/admin/stats'), enabled: isLoggedIn(), refetchInterval: 5000 });
  const overviewQ = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => get<Overview>('/submissions/admin/overview'), enabled: isLoggedIn(), refetchInterval: 5000 });
  const data = statsQ.data;
  const overview = overviewQ.data;

  if (statsQ.isLoading || overviewQ.isLoading || !data || !overview) {
    return <div className="space-y-5" aria-busy="true">
      <div className="h-36 animate-pulse rounded-3xl border-2 border-cream/15 bg-white/[0.04]" />
      <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl border-2 border-cream/15 bg-white/[0.04]" />)}</div>
    </div>;
  }

  const orderedStatuses = [...STATUS_ORDER, ...Object.keys(data.byStatus).filter((s) => !STATUS_ORDER.includes(s))];
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-sunny-400">// CONTROL ROOM</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Submission health</h1>
          <p className="mt-1.5 text-sm font-semibold text-cream/50">Live across the whole platform — refreshes every 5s.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-full border border-mint-400/50 bg-mint-400/10 px-3 py-1 text-xs font-extrabold text-mint-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-mint-400" /> LIVE
          </span>
          <a href="/api/submissions/admin/export.csv" className="btn-sunny btn-sm" download>Export CSV</a>
        </div>
      </header>

      <section aria-label="Submission deadlines">
        <h2 className={panelTitle}>Submission deadlines</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overview.hackathons.map((h) => (
            <DeadlineCard key={h._id} name={h.name} deadline={h.submissionDeadline} opensAt={h.submissionOpensAt} now={now} />
          ))}
          {overview.hackathons.length === 0 && <p className="text-sm font-semibold text-cream/40">No hackathons yet.</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-live="polite" aria-label="Key metrics">
        {[
          ['Total submissions', data.total, 'text-sunny-400'],
          ['Late attempts', data.lateAttempts, data.lateAttempts > 0 ? 'text-bubble-400' : 'text-cream'],
          ['Failed checks', data.failedChecks, data.failedChecks > 0 ? 'text-bubble-400' : 'text-cream'],
          ['Accepted', data.byStatus.ACCEPTED ?? 0, 'text-mint-400'],
        ].map(([label, val, color]) => (
          <div key={label as string} className={`${panel} p-5`}>
            <p className={`font-mono text-3xl font-extrabold tabular-nums ${color}`}>{val}</p>
            <p className="mt-1 text-xs font-bold text-cream/50">{label}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className={`${panel} p-6 lg:col-span-2`} aria-label="Submissions by status">
          <h2 className={panelTitle}>Pipeline</h2>
          <div className="mt-4 flex h-4 w-full overflow-hidden rounded-full border border-cream/20">
            {orderedStatuses.filter((s) => (data.byStatus[s] ?? 0) > 0).map((s) => (
              <div key={s} className={`${STATUS_COLOR[s] ?? 'bg-cream/40'} transition-all duration-500`}
                style={{ width: `${((data.byStatus[s] ?? 0) / Math.max(1, data.total)) * 100}%` }} title={`${s}: ${data.byStatus[s]}`} />
            ))}
          </div>
          <ul className="mt-5 space-y-2.5">
            {orderedStatuses.map((status) => {
              const count = data.byStatus[status] ?? 0;
              if (count === 0 && !STATUS_ORDER.includes(status)) return null;
              return (
                <li key={status} className="flex items-center gap-3 text-sm font-bold">
                  <span className={`h-3 w-3 shrink-0 rounded-sm ${STATUS_COLOR[status] ?? 'bg-cream/40'}`} />
                  <span className="w-24 font-mono text-xs text-cream/55">{status.replace(/_/g, ' ')}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-cream/10">
                    <div className={`h-full rounded-full ${STATUS_COLOR[status] ?? 'bg-cream/40'}`} style={{ width: `${Math.min(100, (count / Math.max(1, data.total)) * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono text-xs text-cream/70">{count}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={`${panel} p-6 lg:col-span-3`} aria-label="Late submission attempts">
          <h2 className={panelTitle}>Late attempts</h2>
          <p className="mb-4 mt-1 text-xs font-semibold text-cream/45">Submissions rejected after the deadline — audit trail.</p>
          {overview.lateAttempts.length === 0 ? <LateEmpty /> : (
            <ul className="max-h-72 space-y-2 overflow-auto pr-1">
              {overview.lateAttempts.map((e, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-xl border border-cream/15 bg-white/[0.03] px-3 py-2.5 text-xs font-semibold">
                  <span className="font-mono text-cream/45">{new Date(e.occurredAt).toLocaleString()}</span>
                  <span className="font-extrabold text-cream">{e.actor}</span>
                  <span className="text-cream/55">· {e.team}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={panel} aria-label="Recent submissions">
        <div className="border-b border-cream/10 p-6 pb-4"><h2 className={panelTitle}>Recent submissions</h2></div>
        {overview.recent.length === 0 ? (
          <p className="p-6 text-sm font-semibold text-cream/40">Nothing submitted yet — the crush is coming.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-cream/10 text-[11px] font-extrabold uppercase tracking-wider text-cream/40">
                  <th className="px-6 py-3">Team</th><th className="px-4 py-3">Title</th><th className="px-4 py-3">Ver</th>
                  <th className="px-4 py-3">Status</th><th className="px-6 py-3 text-right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {overview.recent.map((s) => (
                  <tr key={s._id} className="border-b border-cream/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-6 py-3 font-bold text-cream">{s.team}</td>
                    <td className="max-w-56 truncate px-4 py-3 font-semibold text-cream/70" title={s.title}>{s.title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-cream/50">v{s.version}</td>
                    <td className="px-4 py-3"><span className={STATUS_BADGE[s.status] ?? 'badge-neutral'}>{s.status.replace(/_/g, ' ')}</span></td>
                    <td className="px-6 py-3 text-right font-mono text-xs text-cream/45">{new Date(s.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
