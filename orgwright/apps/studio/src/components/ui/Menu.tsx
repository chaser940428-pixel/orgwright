import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface MenuItem {
  label: React.ReactNode;
  onSelect: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  hint?: string;
}

/** Toolbar dropdown ("Add tests ▾"): click-outside and Esc close it, arrow keys move between items. */
export function MenuDropdown({
  label,
  icon,
  items,
  primary,
  align = 'left',
  disabled
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  items: Array<MenuItem | 'divider'>;
  primary?: boolean;
  align?: 'left' | 'right';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.setTimeout(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const els = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') || []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={
          primary
            ? 'h-8 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover disabled:opacity-40 cursor-pointer'
            : 'h-8 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 text-[13px] text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer'
        }
      >
        {icon}
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onMenuKey}
          className={`absolute z-overlay mt-1 min-w-[220px] rounded-lg border border-border bg-white p-1 text-[13px] shadow-lg ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((it, i) =>
            it === 'divider' ? (
              <div key={`d${i}`} className="my-1 border-t border-slate-100" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                title={it.hint}
                onClick={() => {
                  setOpen(false);
                  it.onSelect();
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-slate-800 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {it.icon}
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
