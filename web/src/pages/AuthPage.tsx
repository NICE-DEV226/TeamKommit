import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post, setTokens, ApiError } from '../lib/api';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await post<{ accessToken: string; refreshToken: string }>(`/auth/${mode}`, {
        email, password, ...(mode === 'register' ? { displayName: name } : {}),
      });
      setTokens(res.accessToken, res.refreshToken);
      nav('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-1">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
      <p className="text-zinc-400 text-sm mb-6">Join the hackathon and find your team.</p>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'register' && (
          <label className="block text-sm">
            <span className="text-zinc-400">Display name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-zinc-400">Email</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Password</span>
          <input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-red-400 text-sm">{error}</p>}
        <button disabled={busy}
          className="w-full bg-emerald-500 text-black font-semibold py-2 rounded-md hover:bg-emerald-400 disabled:opacity-50">
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        className="mt-4 text-sm text-emerald-400 hover:underline w-full text-center">
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
