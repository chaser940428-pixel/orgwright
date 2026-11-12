import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export interface PaletteTest {
  id: string;
  testName: string;
  tags?: string[];
}

/**
 * Ctrl+K "Open test" palette. Type to filter by id, name or tag; ↑↓ to move, Enter to open, Esc to close.
 * Opening goes through onPick, which the caller routes through the unsaved-changes guard.
 */
export function CommandPalette({
  open,
  onClose,
  tests,
  currentId,
  onPick
}: {
  open: boolean;
  onClose: () => void;
  tests: PaletteTest[];
  currentId?: string;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const previous = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previous.current = document.activeElement as HTMLElement | null;
    setQ('');
    setActive(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      if (previous.current && document.contains(previous.current)) previous.current.focus();
    };
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tests.slice(0, 50);
    const words = query.split(/\s+/);
    return tests
      .map((t) => {
        const hay = `${t.id} ${t.testName} ${(t.tags || []).join(' ')}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = (t.id.toLowerCase().startsWith(query) ? 0 : 1) + (t.testName.toLowerCase().startsWith(query) ? 0 : 1);
        return { t, score };
      })
      .filter((x): x is { t: PaletteTest; score: number } => Boolean(x))
      .sort((a, b) => a.score - b.score)
      .slice(0, 50)
      .map((x) => x.t);
  }, [q, tests]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const choose = (id?: string) => {
    if (!id) return;
    onClose();
    onPick(id);
  };

  const listId = 'palette-results';
  return (
    <div className="fixed inset-0 z-modal flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Open a test" className="w-full max-w-xl rounded-lg border border-border bg-white shadow-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="h-4 w-4 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(results[active]?.id);
              } else if (e.key === 'Tab') {
                e.preventDefault();
              }
            }}
            placeholder="Open test by name, id or tag…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
            className="h-11 flex-1 bg-transparent text-sm text-slate-900 outline-none"
          />
          <kbd className="rounded border border-border px-1.5 text-xs text-muted">Esc</kbd>
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No test matches “{q}”.</li>}
          {results.map((t, i) => (
            <li
              key={t.id}
              id={`palette-${t.id}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(t.id);
              }}
              className={`flex items-center gap-3 px-3 py-1.5 text-sm cursor-pointer ${i === active ? 'bg-primary-soft' : ''}`}
            >
              <span className="w-24 flex-shrink-0 truncate font-mono text-xs text-muted">{t.id}</span>
              <span className="flex-1 truncate text-slate-900">{t.testName || t.id}</span>
              {t.id === currentId && <span className="text-xs text-muted">open now</span>}
              {(t.tags || []).slice(0, 2).map((tag) => (
                <span key={tag} className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">
                  {tag}
                </span>
              ))}
            </li>
          ))}
        </ul>
        <div className="border-t border-border px-3 py-1.5 text-xs text-muted">↑↓ to move · Enter to open · {tests.length} tests</div>
      </div>
    </div>
  );
}
