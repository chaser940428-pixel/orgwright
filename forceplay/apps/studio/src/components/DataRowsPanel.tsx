import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { ChevronDown, Table2, Trash2, Upload } from 'lucide-react';

interface DataRowsPanelProps {
  rows: Array<Record<string, string>>;
  onChange: (rows: Array<Record<string, string>>) => void;
}

/** Parses pasted CSV/TSV (first line = column names). */
export function parseDelimited(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const split = (line: string) => {
    if (delim === '\t') return line.split('\t');
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"' && quoted) {
        cur += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const headers = split(lines[0]).map((h) => h.trim()).filter(Boolean);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

/** Data-driven runs: each row runs the test once; columns are used in steps as {{Column}}. */
export function DataRowsPanel({ rows, onChange }: DataRowsPanelProps) {
  const [open, setOpen] = useState(rows.length > 0);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const columns = rows.length ? Object.keys(rows[0]) : [];

  const importFile = async (file: File) => {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '', raw: false });
      const clean = json.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim(), String(v ?? '')])));
      if (!clean.length) throw new Error('The first sheet has no data rows.');
      onChange(clean);
      setOpen(true);
    } catch (e: any) {
      setError(e.message || 'Could not read the file');
    }
  };

  return (
    <div className="rounded-md border border-slate-200">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-[13px] cursor-pointer">
        <span className="flex items-center gap-2 font-medium text-slate-800">
          <Table2 className="h-4 w-4 text-slate-500" />
          Data rows
          <span className="font-normal text-slate-500">
            {rows.length ? `${rows.length} row${rows.length === 1 ? '' : 's'} — the test runs once per row` : 'optional — run the same steps with different data'}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-200 px-3 py-2 text-[13px]">
          {rows.length > 0 ? (
            <>
              <p className="text-xs text-slate-600">
                Use columns in steps:{' '}
                {columns.map((c) => (
                  <code key={c} className="mr-1 rounded bg-slate-100 px-1 text-xs">{`{{${c}}}`}</code>
                ))}
              </p>
              <div className="max-h-48 overflow-auto rounded border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">#</th>
                      {columns.map((c) => (
                        <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-2 py-1 text-slate-400">{i + 1}</td>
                        {columns.map((c) => (
                          <td key={c} className="px-2 py-1">{r[c]}</td>
                        ))}
                        <td className="px-1 text-right">
                          <button type="button" onClick={() => onChange(rows.filter((_, k) => k !== i))} className="p-1 text-slate-400 hover:text-rose-700 cursor-pointer" aria-label={`Remove row ${i + 1}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => onChange([])} className="text-xs text-rose-700 hover:underline cursor-pointer">
                Remove all rows
              </button>
            </>
          ) : (
            <>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={4}
                placeholder={'Paste from Excel or CSV — first line is the column names:\nPatient,Status\nJane Roe,Scheduled\nJohn Doe,Checked In'}
                className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseDelimited(paste);
                    if (!parsed.length) setError('Paste a header line and at least one data line.');
                    else {
                      setError(null);
                      onChange(parsed);
                      setPaste('');
                    }
                  }}
                  className="h-8 rounded-md bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer"
                >
                  Use pasted rows
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="h-8 inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 text-xs hover:bg-slate-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Upload .xlsx / .csv
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              </div>
            </>
          )}
          {error && <p className="text-xs text-rose-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
