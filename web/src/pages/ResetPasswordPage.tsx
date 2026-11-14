import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post, ApiError } from '../lib/api';
import { CommitMark } from '../components/doodles';
import { usePageTitle } from '../components/feedback';

export default function ResetPasswordPage() {
  usePageTitle('Reset password');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<'form' | 'done' | 'error'>('form');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setMessage('Passwords do not match'); setState('error'); return; }
    setBusy(true); setMessage('');
    try {
      await post('/auth/reset-password', { token, password });
      setState('done');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Reset failed');
      setState('error');
    } finally { setBusy(false); }
  }

  return (
    <div className="relative mx-auto mt-16 w-full max-w-sm">
      <span className="sticker-sm mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-grape-500 p-2">
        <CommitMark className="h-full w-full" />
      </span>
      <h1 className="mt-6 text-center text-3xl font-extrabold tracking-tight">
        {state === 'done' ? 'Password updated' : 'Choose a new password'}
      </h1>

      {state === 'done' ? (
        <div className="mt-8 text-center">
          <p className="text-sm font-semibold text-ink/60">Your password was changed and all sessions were signed out.</p>
          <Link to="/auth" className="btn-grape mt-6 inline-block px-6 py-3">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="sticker relative mt-8 space-y-4 p-6">
          <label className="block">
            <span className="label">New password</span>
            <input required type="password" minLength={8} value={password}
              onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="new-password" />
          </label>
          <label className="block">
            <span className="label">Confirm password</span>
            <input required type="password" minLength={8} value={confirm}
              onChange={(e) => setConfirm(e.target.value)} className="input" autoComplete="new-password" />
          </label>
          {message && <p role="alert" className="text-sm font-extrabold text-bubble-500">{message}</p>}
          <button type="submit" disabled={busy || !token} className="btn-grape w-full py-3">
            {busy ? 'Updating…' : 'Update password'}
          </button>
          {!token && <p className="text-center text-xs font-semibold text-bubble-500">Missing reset token — request a new link.</p>}
        </form>
      )}
    </div>
  );
}
