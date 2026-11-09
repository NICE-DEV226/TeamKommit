import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, isLoggedIn, ApiError } from '../lib/api';
import { usePageTitle } from '../components/feedback';
import { CommitMark } from '../components/doodles';
import { Overlays } from './overlays';

const NAV = [
  { to: '/admin', label: 'Overview', end: true, accent: 'sunny' },
  { to: '/admin/hackathons', label: 'Hackathons', accent: 'sky' },
  { to: '/admin/pipelines', label: 'Pipelines', accent: 'grape' },
  { to: '/admin/organizers', label: 'Organizers', accent: 'mint' },
] as const;

const ACCENT_DOT: Record<string, string> = {
  sunny: 'bg-sunny-400', sky: 'bg-sky-400', grape: 'bg-grape-400', mint: 'bg-mint-400',
};
const ACCENT_TEXT: Record<string, string> = {
  sunny: 'text-sunny-400', sky: 'text-sky-400', grape: 'text-grape-400', mint: 'text-mint-400',
};
const ACCENT_BORDER: Record<string, string> = {
  sunny: 'border-sunny-400', sky: 'border-sky-400', grape: 'border-grape-400', mint: 'border-mint-400',
};

function linkCls({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${
    isActive ? 'bg-white/10 text-cream' : 'text-cream/60 hover:bg-white/5 hover:text-cream'
  }`;
}

function Dot({ accent, active }: { accent: string; active: boolean }) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${active ? ACCENT_DOT[accent] : 'bg-cream/25'}`} />;
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
    <div className="admin-scope min-h-screen bg-ink text-cream">
      <Overlays />
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
                <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
                  {({ isActive }) => (<><Dot accent={n.accent} active={isActive} />
                    <span className={isActive ? ACCENT_TEXT[n.accent] : ''}>{n.label}</span></>)}
                </NavLink>
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
                  className={({ isActive }) => `flex shrink-0 items-center gap-1.5 rounded-full border-2 px-4 py-1.5 text-xs font-extrabold ${
                    isActive ? `${ACCENT_BORDER[n.accent]} bg-white/10 text-cream` : 'border-cream/25 text-cream/60'
                  }`}>
                  <Dot accent={n.accent} active={false} />{n.label}
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
