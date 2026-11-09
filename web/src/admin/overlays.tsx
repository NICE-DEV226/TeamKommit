import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// ---------------------------------------------------------------------------
// Minimal overlay system for the admin console: toasts + promise-based
// confirm dialogs. Module-level store → any admin component can call
// toast()/confirmDialog() without prop drilling.
// ---------------------------------------------------------------------------

type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string };
type ConfirmReq = { id: number; title: string; body?: string; danger?: boolean; resolve: (v: boolean) => void };

let toasts: Toast[] = [];
let confirms: ConfirmReq[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const id = ++seq;
  toasts = [...toasts, { id, kind, text }];
  emit();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 4000);
}

export function confirmDialog(opts: { title: string; body?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const id = ++seq;
    confirms = [...confirms, { id, ...opts, resolve }];
    emit();
  });
}

function useStore<T>(pick: () => T): T {
  return useSyncExternalStore(subscribe, pick);
}

const KIND_STYLE: Record<Toast['kind'], string> = {
  ok: 'border-mint-400/60 text-mint-400',
  err: 'border-bubble-400/60 text-bubble-400',
  info: 'border-sky-400/60 text-sky-300',
};

export function Overlays() {
  const toastList = useStore(() => toasts);
  const confirmList = useStore(() => confirms);
  const [closing, setClosing] = useState<number | null>(null);

  function answer(c: ConfirmReq, v: boolean) {
    setClosing(c.id);
    setTimeout(() => {
      confirms = confirms.filter((x) => x.id !== c.id);
      emit();
      c.resolve(v);
      setClosing(null);
    }, 120);
  }

  return createPortal(
    <>
      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
        {toastList.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-xl border-2 bg-ink px-4 py-3 text-sm font-extrabold shadow-xl ${KIND_STYLE[t.kind]}`}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmList[0] && (() => {
        const c = confirmList[0];
        return (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={`confirm-${c.id}`}>
            <div className={`w-full max-w-sm rounded-2xl border-2 p-6 shadow-2xl transition-all ${closing === c.id ? 'scale-95 opacity-0' : 'scale-100 opacity-100'} ${c.danger ? 'border-bubble-400 bg-ink' : 'border-sunny-400 bg-ink'}`}>
              <h2 id={`confirm-${c.id}`} className="text-lg font-extrabold text-cream">{c.title}</h2>
              {c.body && <p className="mt-2 text-sm font-semibold text-cream/60">{c.body}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => answer(c, false)} className="rounded-lg border border-cream/25 px-4 py-2 text-xs font-extrabold text-cream/70 hover:bg-white/5">Cancel</button>
                <button onClick={() => answer(c, true)} autoFocus
                  className={`rounded-lg px-4 py-2 text-xs font-extrabold ${c.danger ? 'bg-bubble-400 text-ink hover:bg-bubble-300' : 'bg-sunny-400 text-ink hover:bg-sunny-300'}`}>
                  {c.danger ? 'Confirm' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>,
    document.body,
  );
}
