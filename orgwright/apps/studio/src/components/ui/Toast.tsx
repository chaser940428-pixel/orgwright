import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Optional action button, e.g. Undo or Retry */
  action?: { label: string; onClick: () => void };
  /** Auto-dismiss after this many ms (default 5000, errors 8000). 0 keeps it until dismissed. */
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastContext = createContext<(opts: ToastOptions) => void>(() => {});

/** Shows a toast. Use for save errors, undo-able edits and short confirmations. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { ...opts, id }]);
      const ms = opts.durationMs ?? (opts.tone === 'error' ? 8000 : 5000);
      if (ms > 0) window.setTimeout(() => dismiss(id), ms);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" role="status">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm shadow-lg ${
              t.tone === 'error' ? 'border-rose-300' : t.tone === 'success' ? 'border-emerald-300' : 'border-border'
            }`}
          >
            {t.tone === 'error' ? (
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" aria-hidden="true" />
            ) : t.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
            )}
            <span className="flex-1 text-slate-800">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="flex-shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-primary-hover hover:bg-primary-soft cursor-pointer"
              >
                {t.action.label}
              </button>
            )}
            <button type="button" onClick={() => dismiss(t.id)} className="flex-shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-800 cursor-pointer" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
