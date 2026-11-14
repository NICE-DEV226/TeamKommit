import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../lib/api';
import { useProfileCompleteness } from './ProfileNudge';
import { Gamepad } from './doodles';

export default function EmailVerifyBanner() {
  const { data } = useProfileCompleteness();
  const qc = useQueryClient();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const verified = data?.user?.emailVerified !== false;
  if (verified) return null;

  async function resend() {
    setState('sending');
    try {
      await post('/auth/resend-verification');
      setState('sent');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['me'] }), 1000);
    } catch {
      setState('error');
    }
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border-2 border-sky-400/60 bg-sky-400/10 px-5 py-4">
      <Gamepad className="h-10 w-10 shrink-0 -rotate-6 text-sky-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-cream">Confirm your email address</p>
        <p className="mt-0.5 text-xs font-semibold text-cream/60">
          {state === 'sent'
            ? 'Verification email sent — check your inbox (and spam).'
            : state === 'error'
              ? 'Could not send — try again in a moment.'
              : 'We sent you a confirmation link — verify to secure your account.'}
        </p>
      </div>
      {state !== 'sent' && (
        <button onClick={resend} disabled={state === 'sending'}
          className="btn-sm shrink-0 rounded-xl border-2 border-ink bg-sky-400 px-4 py-2 text-xs font-extrabold text-ink hover:bg-sky-500 disabled:opacity-50">
          {state === 'sending' ? 'Sending…' : 'Resend email'}
        </button>
      )}
    </div>
  );
}
