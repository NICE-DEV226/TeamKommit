/** Hand-drawn style SVG doodles — thick ink strokes, flat fills. */

export function Star4({ className = '', color = 'currentColor' }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9L4.9 19.1" />
    </svg>
  );
}

export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2c.6 5.5 4.5 9.4 10 10-5.5.6-9.4 4.5-10 10-.6-5.5-4.5-9.4-10-10 5.5-.6 9.4-4.5 10-10z" />
    </svg>
  );
}

export function Plus({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M12 4v16M4 12h16" />
    </svg>
  );
}

export function Squiggle({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 20" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M2 12c10-10 20 10 30 0s20 10 30 0 20 10 30 0 18 6 26-2" />
    </svg>
  );
}

export function ArrowCurve({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 64C30 10 55 10 62 34" />
      <path d="M54 26l8 10-12 4" />
    </svg>
  );
}

export function CursorTag({ name, className = '' }: { name: string; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#191927" stroke="#fff8ec" strokeWidth="1.5">
        <path d="M5 3l14 8-6 1.5L10 19z" />
      </svg>
      <span className="rounded-full border-2 border-ink bg-grape-500 px-2 py-0.5 text-[10px] font-extrabold text-white">
        {name}
      </span>
    </div>
  );
}

export function Cloud({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 70" className={className} fill="currentColor" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M25 55a15 15 0 0 1-3-29 22 22 0 0 1 42-6 17 17 0 0 1 11 35z" fill="#fffdf6" />
      <circle cx="42" cy="42" r="3.5" fill="#191927" stroke="none" />
      <circle cx="60" cy="42" r="3.5" fill="#191927" stroke="none" />
      <path d="M44 52q8 6 16 0" fill="none" stroke="#191927" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Brand mark — three teammate nodes converging into a single commit node (git-graph style). */
export function CommitMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      {/* converging branches */}
      <path d="M14.5 15.5 20.5 21M33.5 15.5 27.5 21M24 34.5V31.8" stroke="#191927" strokeWidth="3" strokeLinecap="round" />
      {/* teammate nodes */}
      <circle cx="11.5" cy="12.5" r="4.5" fill="#fffdf6" stroke="#191927" strokeWidth="3" />
      <circle cx="36.5" cy="12.5" r="4.5" fill="#fffdf6" stroke="#191927" strokeWidth="3" />
      <circle cx="24" cy="40" r="4.5" fill="#fffdf6" stroke="#191927" strokeWidth="3" />
      {/* the commit node */}
      <circle cx="24" cy="24" r="6" fill="#7c3aed" stroke="#191927" strokeWidth="3" />
      <circle cx="24" cy="24" r="2" fill="#fffdf6" />
    </svg>
  );
}

export function HandPointer({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 60V26a4 4 0 0 1 8 0v14m0-20V14a4 4 0 0 1 8 0v22m0-18V20a4 4 0 0 1 8 0v24c0 14-8 22-18 22s-16-6-20-18l-4-10a3 3 0 0 1 5-3l5 5" fill="#ffd43b" />
    </svg>
  );
}

/** Trophy — the prize at the end of the deadline crush. */
export function Trophy({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 8h24v14a12 12 0 0 1-24 0V8z" fill="#ffd43b" />
      <path d="M20 12H10a10 10 0 0 0 10 12M44 12h10a10 10 0 0 1-10 12" fill="none" />
      <path d="M32 34v6m-8 12h16m-14-12h12l2 12H18l2-12z" fill="#fffdf6" />
      <path d="M28 14l1.5 3 3 .5-2 2 .5 3-3-1.5-3 1.5.5-3-2-2 3-.5z" fill="#191927" stroke="none" />
    </svg>
  );
}

/** Rocket — launch before the deadline hits. */
export function Rocket({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M32 4c10 6 14 18 14 30l-6 8H24l-6-8c0-12 4-24 14-30z" fill="#fffdf6" />
      <circle cx="32" cy="20" r="5" fill="#7dd3fc" />
      <path d="M24 38l-8 10 10-2m24-8 8 10-10-2" fill="#ff8fa3" />
      <path d="M28 48c0 6 8 8 4 12-2-4 4-6 4-12m4 0c0 6 8 8 4 12-2-4 4-6 4-12" fill="#ffd43b" />
    </svg>
  );
}

/** Code brackets — the craft itself. */
export function CodeBrackets({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 14L10 32l14 18M40 14l14 18-14 18" />
      <path d="M36 12l-8 40" strokeWidth="4" />
    </svg>
  );
}

/** Deadline clock — the crush nobody escapes. */
export function DeadlineClock({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="32" cy="36" r="20" fill="#fffdf6" />
      <path d="M32 22v14l10 6" />
      <path d="M32 6V2m0 60v-4M6 36H2m60 0h-4" strokeWidth="4" />
      <path d="M50 8l4-4m-8 2 2-4" stroke="#ff8fa3" strokeWidth="4" />
    </svg>
  );
}

/** Confetti burst — shipped and accepted. */
export function Confetti({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <rect x="10" y="8" width="6" height="10" rx="1" fill="#7c3aed" transform="rotate(-20 13 13)" />
      <rect x="46" y="10" width="6" height="10" rx="1" fill="#ffd43b" transform="rotate(24 49 15)" />
      <rect x="4" y="30" width="6" height="10" rx="1" fill="#34d399" transform="rotate(12 7 35)" />
      <rect x="52" y="34" width="6" height="10" rx="1" fill="#ff8fa3" transform="rotate(-18 55 39)" />
      <path d="M28 52l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fffdf6" />
      <circle cx="20" cy="48" r="2.5" fill="#7dd3fc" />
      <circle cx="44" cy="50" r="2.5" fill="#7c3aed" />
    </svg>
  );
}

/** Joystick — play, build, ship. */
export function Gamepad({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" stroke="#191927" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 24c0-8 9-14 20-14s20 6 20 14v16c0 8-9 14-20 14S12 48 12 40V24z" fill="#7c3aed" />
      <path d="M22 30v8m-4-4h8" stroke="#fffdf6" strokeWidth="3.5" />
      <circle cx="44" cy="32" r="2.5" fill="#fffdf6" stroke="none" />
      <circle cx="50" cy="38" r="2.5" fill="#fffdf6" stroke="none" />
      <circle cx="38" cy="38" r="2.5" fill="#ffd43b" stroke="none" />
    </svg>
  );
}
