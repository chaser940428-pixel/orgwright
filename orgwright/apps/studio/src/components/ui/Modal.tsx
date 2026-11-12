import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class for the panel */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Element to focus first (defaults to the first focusable element) */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Close when the backdrop is clicked (default true) */
  closeOnBackdrop?: boolean;
  /** Remove the body padding (for full-bleed layouts) */
  flush?: boolean;
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl'
};

/** Shared dialog: role=dialog + aria-modal, Esc to close, focus trapped inside and restored on close. */
export function Modal({ open, onClose, title, children, footer, size = 'md', initialFocusRef, closeOnBackdrop = true, flush = false }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusFirst = () => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
        return;
      }
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
      (first || panel)?.focus();
    };
    // Wait a tick so the content is mounted
    const t = window.setTimeout(focusFirst, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKeyDown, true);
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full ${SIZE[size]} max-h-[90vh] flex flex-col rounded-lg bg-white shadow-xl outline-none`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted hover:bg-slate-100 hover:text-slate-900 cursor-pointer" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={`overflow-y-auto text-sm text-slate-700 ${flush ? 'flex-1 min-h-0 flex flex-col' : 'px-5 py-4'}`}>{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

/** Button styles: one solid primary, outline secondary, ghost. */
export const btn = {
  primary:
    'inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 cursor-pointer',
  danger:
    'inline-flex items-center justify-center gap-1.5 h-9 rounded-md bg-danger px-4 text-sm font-medium text-white hover:bg-danger-hover disabled:opacity-50 cursor-pointer',
  secondary:
    'inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50 cursor-pointer',
  ghost: 'inline-flex items-center justify-center gap-1.5 h-9 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer'
};
