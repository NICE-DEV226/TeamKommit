import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import { CommitMark } from '../components/doodles';

const NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/hackathons', label: 'Hackathons' },
  { to: '/admin/pipelines', label: 'Pipelines' },
  { to: '/admin/organizers', label: 'Organizers' },
];

function linkCls({ isActive }: { isActive: boolean }) {
  return `block rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${
    isActive ? 'bg-sunny-400 text-ink' : 'text-cream/60 hover:bg-white/5 hover:text-cream'
  }`;
}

export default function AdminLayout() {
  usePageTitle('Organizer console');
  const meQ = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ user: { isOrganizer?: boolean; displayName?: string; email?: string } }>('/auth/me'),
    enabled: isLoggedIn(),
    staleTime: 60_000,
    retry: false,
  });

  if (meQ.isLoading) {
    return <div className="min-h-screen bg-ink" aria-busy="true"><div className="mx-auto max-w-6xl p-8"><div className="h-96 animate-pulse rounded-3xl bg-white/5" /></div></div>;
  }
  if (!meQ.data?.user?.isOrganizer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-4 text-cream">
        <div className="max-w-md rounded-3xl border-2 border-bubble-400/60 bg-white/[0.04] p-8 text-center">
          <p className="font-mono text-xs font-bold tracking-[0.2em] text-bubble-400">// ACCESS DENIED</p>
          <h1 className="mt-3 text-2xl font-extrabold">Organizer access required</h1>
          <p className="mt-2 text-sm font-semibold text-cream/60">
            {meQ.error instanceof ApiError ? meQ.error.message : 'This console is restricted to hackathon organizers.'}
          </p>
          <Link to="/board" className="btn-sunny btn-sm mt-6 inline-block">Back to the app</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-cream">
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6 sm:px-6">
        {/* Sidebar — desktop */}
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-6 space-y-1">
            <Link to="/" className="mb-4 flex items-center gap-2 px-2 text-sm font-extrabold text-cream/70 hover:text-cream">
              <CommitMark className="h-6 w-6" />
              <span>TeamKommit</span>
              <span className="ml-auto rounded-full bg-sunny-400 px-2 py-0.5 text-[10px] font-extrabold text-ink">ADMIN</span>
            </Link>
            <nav aria-label="Admin sections" className="space-y-1">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>{n.label}</NavLink>
              ))}
            </nav>
            <div className="mt-6 space-y-2 border-t border-cream/10 px-2 pt-4 text-xs font-semibold text-cream/45">
              <p className="truncate">{meQ.data.user.displayName}</p>
              <p className="truncate font-mono text-[11px]">{meQ.data.user.email}</p>
              <Link to="/board" className="block pt-1 text-cream/50 underline-offset-2 hover:text-cream hover:underline">← Back to app</Link>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Top bar — mobile */}
          <div className="mb-6 md:hidden">
            <div className="flex items-center justify-between">
              <Link to="/" className="flex items-center gap-2 text-sm font-extrabold text-cream/80">
                <CommitMark className="h-6 w-6" /> Admin
              </Link>
              <Link to="/board" className="text-xs font-bold text-cream/50">← App</Link>
            </div>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Admin sections">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end}
                  className={({ isActive }) => `shrink-0 rounded-full border-2 px-4 py-1.5 text-xs font-extrabold ${
                    isActive ? 'border-sunny-400 bg-sunny-400 text-ink' : 'border-cream/25 text-cream/60'
                  }`}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
