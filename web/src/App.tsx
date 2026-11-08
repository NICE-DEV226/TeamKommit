import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLiveEvents } from './lib/events';
import { isLoggedIn } from './lib/api';
import BoardPage from './pages/BoardPage';
import TeamPage from './pages/TeamPage';
import ProfilePage from './pages/ProfilePage';
import SubmissionsPage from './pages/SubmissionsPage';
import AdminPage from './pages/AdminPage';
import AuthPage from './pages/AuthPage';

function Shell({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  // Live updates: any committed domain event invalidates the board/team queries.
  useLiveEvents(() => {
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: ['team'] });
    qc.invalidateQueries({ queryKey: ['submissions'] });
    qc.invalidateQueries({ queryKey: ['admin'] });
  });
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur sticky top-0 z-40">
        <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6" aria-label="Main">
          <NavLink to="/" className="font-bold text-emerald-400 text-lg tracking-tight">TeamKommit</NavLink>
          <NavLink to="/" end className={({ isActive }) => `text-sm ${isActive ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Board</NavLink>
          <NavLink to="/submissions" className={({ isActive }) => `text-sm ${isActive ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Submissions</NavLink>
          <NavLink to="/admin" className={({ isActive }) => `text-sm ${isActive ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>Admin</NavLink>
          <div className="ml-auto">
            {isLoggedIn()
              ? <NavLink to="/profile" className="text-sm text-zinc-300 hover:text-white">Profile</NavLink>
              : <NavLink to="/auth" className="text-sm bg-emerald-500 text-black font-semibold px-3 py-1.5 rounded-md hover:bg-emerald-400">Sign in</NavLink>}
          </div>
        </nav>
      </header>
      <main id="main" className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">{children}</main>
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">
        TeamKommit — Hack4Hack 2026 · live updates via SSE
      </footer>
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
        <Route path="/" element={<BoardPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/teams/:id" element={<TeamPage />} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/submissions" element={<RequireAuth><SubmissionsPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
