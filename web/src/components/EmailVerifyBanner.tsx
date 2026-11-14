import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { post } from '../lib/api';
import { useProfileCompleteness } from './ProfileNudge';

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
      setTimeout(() => qc.invalidateQueries({ queryKey: ['me'] }), 1500);
    } catch {
      setState('error');
    }
  }

  return (
    <div className="sticky top-[68px] z-30 mb-5">
      <div className="nav-pill mx-auto flex max-w-4xl items-center gap-3 px-4 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-sky-400 text-[11px] font-black text-white" aria-hidden="true">@</span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
          {state === 'sent'
            ? 'Verification email sent — check your inbox.'
            : state === 'error'
              ? 'Could not send — try again.'
              : 'Confirm your email to secure your account.'}
        </p>
        {state !== 'sent' && (
          <button onClick={resend} disabled={state === 'sending'}
            className="shrink-0 rounded-full border-2 border-ink bg-sky-400 px-3.5 py-1 text-[11px] font-extrabold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">
            {state === 'sending' ? 'Sending…' : 'Resend'}
          </button>
        )}
      </div>
    </div>
  );
}
