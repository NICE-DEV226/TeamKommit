import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLiveEvents } from './lib/events';
import { isLoggedIn } from './lib/api';
import BoardPage from './pages/BoardPage';
import LandingPage from './pages/LandingPage';
import TeamPage from './pages/TeamPage';
import PeoplePage from './pages/PeoplePage';
import ProfilePage from './pages/ProfilePage';
import SubmissionsPage from './pages/SubmissionsPage';
import AdminLayout from './admin/AdminLayout';
import AdminOverviewPage from './admin/OverviewPage';
import AdminHackathonsPage from './admin/HackathonsPage';
import AdminHackathonDetailPage from './admin/HackathonDetailPage';
import AdminPipelinesPage from './admin/PipelinesPage';
import AdminOrganizersPage from './admin/OrganizersPage';
import AuthPage from './pages/AuthPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import EmailVerifyBanner from './components/EmailVerifyBanner';
import NotFoundPage from './pages/NotFoundPage';
import { Sparkle, Squiggle, CommitMark } from './components/doodles';

function Shell({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const location = useLocation();
  const [live, setLive] = useState(true);
  // Live updates: any committed domain event refreshes every cached query —
  // events are rare (team mutations, submission status), so a blanket
  // invalidation keeps ALL pages consistent without per-page wiring.
  useLiveEvents(() => {
    qc.invalidateQueries();
  }, {}, setLive, isLoggedIn());
  // The organizer console is a separate app surface: no participant chrome.
  if (location.pathname.startsWith('/admin')) {
    return <div className="min-h-screen bg-ink">{children}</div>;
  }
  return (
    <div className="dotgrid min-h-screen flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="sticky top-3 z-40 px-3 sm:px-4">
        <nav className="nav-pill no-scrollbar mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto px-3 py-2" aria-label="Main">
          <NavLink to="/" className="mr-2 flex shrink-0 items-center gap-2 text-[15px] font-extrabold tracking-tight">
            <CommitMark className="h-7 w-7" />
            TeamKommit
          </NavLink>
          <NavLink to="/board" className={({ isActive }) => `nav-link shrink-0 ${isActive ? 'nav-link-active' : ''}`}>Board</NavLink>
          <NavLink to="/people" className={({ isActive }) => `nav-link shrink-0 ${isActive ? 'nav-link-active' : ''}`}>People</NavLink>
          <NavLink to="/submissions" className={({ isActive }) => `nav-link shrink-0 ${isActive ? 'nav-link-active' : ''}`}>Submissions</NavLink>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className={live ? 'badge-live hidden md:inline-flex' : 'badge-offline hidden md:inline-flex'}
              title={live ? 'Live updates connected' : 'Reconnecting…'}>
              {live ? 'Live' : 'Offline'}
            </span>
            {/* mobile: compact live dot since the badge is hidden below md */}
            <span className={`h-2.5 w-2.5 rounded-full border border-ink md:hidden ${live ? 'bg-mint-400' : 'bg-bubble-400'}`}
              role="status" aria-label={live ? 'Live updates connected' : 'Offline — reconnecting'} />
            {isLoggedIn()
              ? <NavLink to="/profile" className="nav-link">Profile</NavLink>
              : <NavLink to="/auth" className="nav-pill px-4! py-1.5! shadow-[3px_3px_0_var(--color-ink)]!">Sign in</NavLink>}
          </div>
        </nav>
      </header>
      <main id="main" className="flex-1 w-full max-w-6xl mx-auto scroll-mt-24 px-4 py-8 sm:py-10">
        <div key={location.pathname} className="page-enter">
          {isLoggedIn() && !location.pathname.startsWith('/admin') && <EmailVerifyBanner />}
          {children}
        </div>
      </main>
      <footer className="border-t-2 border-ink bg-ink text-cream">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <CommitMark className="h-6 w-6" />
              TeamKommit · Hack4Hack 2026
            </p>
            <p className="text-xs text-cream/60">Race-proof teams. Deadline-proof submissions.</p>
          </div>
          <Squiggle className="mt-4 h-4 w-40 text-sunny-400" />
        </div>
      </footer>
      <Sparkle className="pointer-events-none fixed -right-4 top-24 h-8 w-8 text-sunny-400/60 floaty" />
      <Sparkle className="pointer-events-none fixed -left-4 bottom-32 h-6 w-6 text-grape-500/50 floaty" />
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/teams/:id" element={<TeamPage />} />
        <Route path="/people" element={<PeoplePage />} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/submissions" element={<RequireAuth><SubmissionsPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="hackathons" element={<AdminHackathonsPage />} />
          <Route path="hackathons/:id" element={<AdminHackathonDetailPage />} />
          <Route path="pipelines" element={<AdminPipelinesPage />} />
          <Route path="organizers" element={<AdminOrganizersPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Shell>
  );
}
