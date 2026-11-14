import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post, setTokens, ApiError } from '../lib/api';
import { Star4, Sparkle, Squiggle, CommitMark, CodeBrackets } from '../components/doodles';
import { usePageTitle } from '../components/feedback';

function PasswordInput({ value, onChange, autoComplete, minLength }: {
  value: string; onChange: (v: string) => void; autoComplete: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative block">
      <input required type={show ? 'text' : 'password'} minLength={minLength} value={value}
        onChange={(e) => onChange(e.target.value)} className="input pr-16!" autoComplete={autoComplete} />
      <button type="button" onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-extrabold text-ink/60 hover:bg-ink/5 hover:text-ink">
        {show ? 'Hide' : 'Show'}
      </button>
    </span>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  usePageTitle(mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'register' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'forgot') {
        await post('/auth/forgot-password', { email });
        setNotice('If that email has an account, a reset link is on its way.');
        return;
      }
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
    <div className="relative mx-auto mt-8 w-full max-w-sm">
      <Sparkle className="absolute -left-8 -top-4 h-6 w-6 text-grape-500 floaty" />
      <Star4 className="absolute -right-6 top-10 h-7 w-7 text-sunny-500 rotate-12 floaty" />
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <span className="sticker-sm flex h-14 w-14 items-center justify-center rounded-2xl bg-grape-500 p-2 rotate-[-3deg]">
          <CommitMark className="h-full w-full" />
        </span>
        <h1 className="text-4xl font-extrabold tracking-tight">
          {mode === 'login' ? 'Welcome back' : mode === 'register' ? 'Join the crew' : 'Reset password'}
        </h1>
        <p className="mt-2 text-sm font-semibold text-ink/60">
          {mode === 'login' ? 'Sign in to your crew.'
            : mode === 'register' ? 'Find your team before the deadline does.'
            : 'We\u2019ll email you a reset link.'}
        </p>
      </div>

      <div className="sticker relative p-6 sm:p-8">
        <Squiggle className="absolute -top-3 left-1/2 h-4 w-24 -translate-x-1/2 text-grape-500/40" />
        <CodeBrackets className="absolute -right-4 -top-4 h-14 w-14 rotate-12 text-ink/15" />
        <div className="mb-6 grid grid-cols-2 rounded-full border-2 border-ink bg-cream p-1">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m}
              onClick={() => { setMode(m); setError(''); setNotice(''); setConfirm(''); }}
              className={`rounded-full px-3 py-1.5 text-sm font-extrabold transition-all ${
                mode === m ? 'bg-ink text-cream shadow-[2px_2px_0_var(--color-ink)]' : 'text-ink/50 hover:text-ink'
              }`}>
              {m === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <label className="block">
              <span className="label">Display name</span>
              <input required value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
          </label>
          {mode !== 'forgot' && (
            <label className="block">
              <span className="label">Password</span>
              <PasswordInput value={password} onChange={setPassword}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} />
            </label>
          )}
          {mode === 'register' && (
            <label className="block">
              <span className="label">Confirm password</span>
              <PasswordInput value={confirm} onChange={setConfirm}
                autoComplete="new-password" minLength={8} />
            </label>
          )}
          {error && <p role="alert" className="text-sm font-extrabold text-bubble-500">{error}</p>}
          {notice && <p role="status" className="text-sm font-extrabold text-mint-600">{notice}</p>}
          <button type="submit" disabled={busy} className="btn-grape w-full py-3">
            {busy ? (mode === 'login' ? 'Signing in…' : mode === 'register' ? 'Creating account…' : 'Sending…')
              : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
          </button>
        </form>

        {mode === 'login' && (
          <button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }}
            className="mt-4 w-full text-center text-xs font-extrabold text-ink/50 hover:text-ink">
            Forgot your password?
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" onClick={() => { setMode('login'); setError(''); setNotice(''); }}
            className="mt-4 w-full text-center text-xs font-extrabold text-ink/50 hover:text-ink">
            ← Back to sign in
          </button>
        )}
      </div>

      <p className="mt-5 text-center text-xs font-semibold text-ink/60">
        One account per person — your profile feeds the matching engine.
      </p>
    </div>
  );
}
