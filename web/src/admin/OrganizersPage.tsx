import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import { Organizer, panel, panelTitle, inputDark, labelDark } from './shared';

export default function OrganizersPage() {
  usePageTitle('Organizers · Organizer');
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'organizers'],
    queryFn: () => get<{ organizers: Organizer[] }>('/admin/organizers'),
  });
  const organizers = data?.organizers ?? [];

  async function act(fn: () => Promise<unknown>, ok: string) {
    setMsg(''); setError('');
    try { await fn(); setMsg(ok); qc.invalidateQueries({ queryKey: ['admin', 'organizers'] }); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Action failed'); }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-xs font-bold tracking-[0.2em] text-sunny-400">// ACCESS</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Organizers</h1>
        <p className="mt-1.5 text-sm font-semibold text-cream/50">Who can open this console. Grant by account email.</p>
      </header>

      <form onSubmit={(e) => {
        e.preventDefault();
        const target = email.trim();
        act(() => post('/admin/organizers', { email: target, isOrganizer: true }), `${target} is now an organizer`);
        setEmail('');
      }} className={`${panel} flex flex-wrap items-end gap-3 p-5`}>
        <label className="min-w-56 flex-1"><span className={labelDark}>User email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputDark} placeholder="teammate@crew.dev" /></label>
        <button className="btn-sunny btn-sm">Grant organizer</button>
      </form>
      {msg && <p role="status" className="text-sm font-extrabold text-mint-400">{msg}</p>}
      {error && <p role="alert" className="text-sm font-extrabold text-bubble-400">{error}</p>}

      {isLoading && <div className={`${panel} h-32 animate-pulse`} />}
      {isError && <p role="alert" className="text-sm font-extrabold text-bubble-400">Could not load organizers.</p>}
      <ul className="space-y-2">
        {organizers.map((o) => (
          <li key={o.email} className={`${panel} flex flex-wrap items-center gap-3 px-5 py-3.5`}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-cream">{o.displayName}</p>
              <p className="truncate font-mono text-xs text-cream/45">{o.email}</p>
            </div>
            <span className="badge-sunny">Organizer</span>
            <button onClick={() => { if (window.confirm(`Revoke organizer access for ${o.email}?`)) act(() => post('/admin/organizers', { email: o.email, isOrganizer: false }), `${o.email} revoked`); }}
              className="rounded-lg border border-bubble-400/50 px-3 py-1.5 text-xs font-extrabold text-bubble-400 hover:bg-bubble-400/10">
              Revoke
            </button>
          </li>
        ))}
      </ul>
      {!isLoading && !isError && organizers.length === 0 && (
        <p className={`${panel} p-8 text-center text-sm font-semibold text-cream/40`}>No organizers — grant access above.</p>
      )}
    </div>
  );
}
