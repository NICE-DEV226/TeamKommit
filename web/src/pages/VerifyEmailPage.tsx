import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { post, ApiError } from '../lib/api';
import { CommitMark } from '../components/doodles';
import { usePageTitle } from '../components/feedback';

export default function VerifyEmailPage() {
  usePageTitle('Verify email');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setState('error'); setMessage('Missing verification token.'); return; }
    let cancelled = false;
    post('/auth/verify-email', { token })
      .then(() => { if (!cancelled) setState('ok'); })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setMessage(err instanceof ApiError ? err.message : 'Verification failed');
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="relative mx-auto mt-16 w-full max-w-sm text-center">
      <span className="sticker-sm mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-grape-500 p-2">
        <CommitMark className="h-full w-full" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
        {state === 'loading' ? 'Verifying…' : state === 'ok' ? 'Email confirmed' : 'Verification failed'}
      </h1>
      <p className="mt-3 text-sm font-semibold text-ink/60">
        {state === 'ok'
          ? 'Your email is verified — your account is fully secured.'
          : state === 'loading'
            ? 'One moment…'
            : message}
      </p>
      <div className="mt-8">
        <Link to={state === 'ok' ? '/board' : '/auth'} className="btn-grape inline-block px-6 py-3">
          {state === 'ok' ? 'Open the Board' : 'Back to sign in'}
        </Link>
      </div>
    </div>
  );
}
