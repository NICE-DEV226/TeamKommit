import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn } from '../lib/api';

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  lateAttempts: number;
  failedChecks: number;
}

export default function AdminPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => get<Stats>('/submissions/admin/stats'),
    enabled: isLoggedIn(),
    refetchInterval: 5000,
  });

  if (isLoading) return <p className="text-zinc-500">Loading…</p>;
  if (error || !data) return <p className="text-red-400">Organizer access required or stats unavailable.</p>;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Organizer dashboard</h1>
        <a href="/api/submissions/admin/export.csv" className="text-sm border border-zinc-600 px-3 py-1.5 rounded hover:bg-zinc-800">
          Export CSV
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8" aria-live="polite">
        {[
          ['Total submissions', data.total],
          ['Late attempts', data.lateAttempts],
          ['Failed checks', data.failedChecks],
          ['Accepted', data.byStatus.ACCEPTED ?? 0],
        ].map(([label, val]) => (
          <div key={label as string} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <p className="text-3xl font-bold text-emerald-400">{val}</p>
            <p className="text-xs text-zinc-500 mt-1">{label}</p>
          </div>
        ))}
      </div>
      <h2 className="font-semibold mb-3">By status</h2>
      <ul className="space-y-2">
        {Object.entries(data.byStatus).map(([status, count]) => (
          <li key={status} className="flex items-center gap-3 text-sm">
            <span className="w-28 text-zinc-400">{status}</span>
            <div className="flex-1 bg-zinc-900 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${Math.min(100, (count / Math.max(1, data.total)) * 100)}%` }} />
            </div>
            <span className="w-12 text-right font-mono">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
