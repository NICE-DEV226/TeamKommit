import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Star4 } from './doodles';

/** Sets document.title per route — restores the base title on unmount. */
export function usePageTitle(title: string) {
  useEffect(() => {
    const base = 'TeamKommit';
    document.title = title ? `${title} · ${base}` : base;
    return () => { document.title = base; };
  }, [title]);
}

/** Standard error surface: explains the failure and offers a retry. */
export function ErrorCard({ message, onRetry, retryLabel = 'Try again' }: {
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="sticker p-10 text-center" role="alert">
      <Star4 className="mx-auto h-10 w-10 text-bubble-400 wiggle" />
      <p className="mt-4 font-extrabold text-ink">Something went wrong</p>
      {message && <p className="mt-1 text-sm font-semibold text-ink/60">{message}</p>}
      <div className="mt-5 flex items-center justify-center gap-3">
        {onRetry && <button onClick={onRetry} className="btn-secondary btn-sm">{retryLabel}</button>}
        <Link to="/board" className="btn-ghost btn-sm">Back to board</Link>
      </div>
    </div>
  );
}
