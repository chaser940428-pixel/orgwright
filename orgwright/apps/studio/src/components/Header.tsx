import React, { useEffect, useRef, useState } from 'react';
import { Award, BookOpen, Check, ChevronDown, HelpCircle, Keyboard, RefreshCw, Search, Settings, Sparkles, UserCheck } from 'lucide-react';
import type { OrgUser } from '../types/results';
import { useRun } from '../run/RunContext';
import { useTheme, ThemePref } from '../theme';

export type OrgEnvironment = 'none' | 'loading' | 'developer' | 'sandbox' | 'production' | 'unknown';

export const ENV_BADGE: Record<OrgEnvironment, string> = {
  none: 'bg-env-none/10 text-env-none border-env-none/40',
  loading: 'bg-env-none/10 text-env-none border-border',
  developer: 'bg-env-dev/10 text-env-dev border-env-dev/40',
  sandbox: 'bg-env-sandbox/10 text-env-sandbox border-env-sandbox/50',
  production: 'bg-env-prod text-white border-env-prod',
  unknown: 'bg-env-none/10 text-env-none border-env-none/40'
};

/** Environment chip: colour plus a word, never colour alone. */
export function EnvBadge({ env, label }: { env: OrgEnvironment; label: string }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-px text-xs font-semibold ${ENV_BADGE[env]}`}>
      {env === 'production' ? 'PRODUCTION' : label}
    </span>
  );
}

interface HeaderProps {
  projectName: string;
  selectedOrg: string;
  orgConnected: boolean;
  orgEnv: OrgEnvironment;
  orgEnvLabel: string;
  isConnectingOrg: boolean;
  onOpenConnector: () => void;
  onRefreshOrg: () => void;
  orgUsers: OrgUser[];
  selectedPersona: OrgUser;
  onSelectPersona: (u: OrgUser) => void;
  isLoadingUsers: boolean;
  onSyncUsers: () => void;
  uiMode: 'tester' | 'developer';
  setUiMode: (m: 'tester' | 'developer') => void;
  onOpenQaHub: () => void;
  onOpenWizard: () => void;
  onOpenPhrasebook: () => void;
  onOpenShortcuts: () => void;
  isDirty: boolean;
}

/** Small menu button with click-outside and Esc handling. */
function MenuButton({ label, icon, children }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
      >
        {icon}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-white p-1.5 text-sm shadow-xl">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const menuItem = 'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100 cursor-pointer';

/** Global context only: brand, org + environment, "Run as" persona, Help and Settings menus. */
export function Header(props: HeaderProps) {
  const run = useRun();
  const theme = useTheme();
  const [showPersona, setShowPersona] = useState(false);
  const [personaQuery, setPersonaQuery] = useState('');
  const [profileFilter, setProfileFilter] = useState('All');
  const personaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPersona) return;
    const onDown = (e: MouseEvent) => {
      if (personaRef.current && !personaRef.current.contains(e.target as Node)) setShowPersona(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPersona(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showPersona]);

  const isTesterMode = props.uiMode === 'tester';
  const { selectedPersona, orgUsers } = props;
  const filteredUsers = orgUsers.filter((u) => {
    const q = personaQuery.toLowerCase();
    const matchQuery = u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q) || u.profileName.toLowerCase().includes(q);
    const matchProf = profileFilter === 'All' || u.profileName === profileFilter;
    return matchQuery && matchProf;
  });

  return (
    <header className="sticky top-0 z-50 border-b border-border/90 bg-white shadow-2xs">
      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-3 px-5 py-2.5">
        {/* Brand + project */}
        <div className="flex min-w-0 items-center space-x-3">
          <img
            src="/logo-icon.png"
            alt=""
            className="h-8 w-8 rounded-lg border border-border bg-white object-contain shadow-xs"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="text-base font-bold tracking-tight text-slate-900">
            Orgwright <span className="font-semibold text-primary">Studio</span>
          </span>
          <div className="hidden h-4 w-px bg-slate-200 sm:block" />
          <div className="hidden items-center space-x-2 text-xs text-slate-600 sm:flex">
            <span>Project:</span>
            <span className="max-w-[200px] truncate font-semibold text-slate-800" title={props.projectName}>
              {props.projectName}
            </span>
            {props.isDirty && (
              <span className="flex items-center gap-1 text-amber-800" title="This test has unsaved changes">
                <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                unsaved
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Org + environment */}
          <div className="flex items-center divide-x divide-slate-200 rounded-lg border border-border bg-slate-50/80 shadow-2xs">
            <button
              type="button"
              onClick={props.onOpenConnector}
              className="flex cursor-pointer items-center space-x-2 rounded-l-lg px-2.5 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100"
              title="Manage Salesforce org connections"
            >
              {props.selectedOrg ? (
                <>
                  <span className={`h-2 w-2 rounded-full ${props.orgConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
                  <span className="font-semibold text-slate-900">{props.selectedOrg}</span>
                  <span className="sr-only">{props.orgConnected ? 'connected' : 'not connected'}</span>
                  <EnvBadge env={props.orgEnv} label={props.orgEnvLabel} />
                </>
              ) : props.orgEnv === 'loading' ? (
                <span className="text-slate-600">Checking org…</span>
              ) : (
                <span className="text-slate-700">
                  No org connected · <span className="font-semibold text-primary-hover">Connect</span>
                </span>
              )}
              <ChevronDown className="ml-0.5 h-3 w-3 text-slate-400" aria-hidden="true" />
            </button>
            {props.selectedOrg && (
              <button
                type="button"
                onClick={props.onRefreshOrg}
                disabled={props.isConnectingOrg}
                className="cursor-pointer rounded-r-lg p-1.5 text-muted transition hover:bg-slate-100 hover:text-slate-800"
                title="Refresh org metadata"
                aria-label="Refresh org metadata"
              >
                <RefreshCw className={`h-3 w-3 ${props.isConnectingOrg ? 'animate-spin text-primary' : ''}`} />
              </button>
            )}
          </div>

          {/* Run as: persona */}
          <div className="relative" ref={personaRef}>
            <button
              type="button"
              onClick={() => setShowPersona((p) => !p)}
              disabled={run.isRunning}
              aria-haspopup="listbox"
              aria-expanded={showPersona}
              className="flex cursor-pointer items-center space-x-2 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 shadow-2xs transition hover:bg-slate-50 disabled:opacity-60"
              title="Choose which Salesforce user runs the test"
            >
              <UserCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span className="text-slate-600">Run as:</span>
              <span className="max-w-[130px] truncate font-semibold text-slate-900">{selectedPersona?.name || 'Current user'}</span>
              <span className="max-w-[160px] truncate text-slate-600">({selectedPersona?.profileName || 'System Administrator'})</span>
              <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden="true" />
            </button>

            {showPersona && (
              <div className="absolute right-0 z-50 mt-2 w-96 rounded-lg border border-border bg-white p-3.5 shadow-xl">
                <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-900">Run as</span>
                  <span className="text-xs text-slate-600">{orgUsers.length} users</span>
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <input
                    type="text"
                    aria-label="Search users"
                    placeholder="Search by name, username, or profile..."
                    value={personaQuery}
                    onChange={(e) => setPersonaQuery(e.target.value)}
                    className="w-full rounded-lg border border-border bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-primary focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="mb-2 flex items-center space-x-1 overflow-x-auto pb-2 text-xs">
                  {['All', ...Array.from(new Set(orgUsers.map((u) => u.profileName))).filter(Boolean).slice(0, 5)].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProfileFilter(p)}
                      aria-pressed={profileFilter === p}
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 transition ${
                        profileFilter === p ? 'bg-primary font-medium text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <ul role="listbox" aria-label="Users" className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {filteredUsers.map((user) => {
                    const isSelected = selectedPersona?.id === user.id;
                    return (
                      <li key={user.id} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          onClick={() => {
                            props.onSelectPersona(user);
                            setShowPersona(false);
                          }}
                          className={`flex w-full cursor-pointer items-center justify-between rounded-lg p-2 text-left transition ${
                            isSelected ? 'border border-blue-200 bg-primary-soft text-blue-900' : 'border border-transparent text-slate-800 hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex min-w-0 items-center space-x-2">
                            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-primary-hover" aria-hidden="true">
                              {user.name.charAt(0)}
                            </span>
                            <span className="min-w-0">
                              <span className="flex items-center space-x-1.5">
                                <span className="truncate text-xs font-semibold text-slate-900">{user.name}</span>
                                {user.isDefault && (
                                  <span className="rounded border border-emerald-200 bg-emerald-100 px-1 text-xs font-semibold text-emerald-800">Default</span>
                                )}
                              </span>
                              <span className="flex items-center space-x-2 text-xs text-slate-600">
                                <span className="font-mono text-primary-hover">{user.profileName}</span>
                                <span aria-hidden="true">•</span>
                                <span className="max-w-[140px] truncate">{user.username}</span>
                              </span>
                            </span>
                          </span>
                          {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                  <span className="text-slate-600">Org: {props.selectedOrg || 'none'}</span>
                  <button
                    type="button"
                    onClick={props.onSyncUsers}
                    disabled={props.isLoadingUsers || !props.selectedOrg}
                    className="flex items-center space-x-1 font-medium text-primary-hover transition hover:text-blue-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${props.isLoadingUsers ? 'animate-spin' : ''}`} aria-hidden="true" />
                    <span>Sync org users</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Help */}
          <MenuButton label="Help" icon={<HelpCircle className="h-4 w-4" />}>
            {(close) => (
              <>
                <button type="button" role="menuitem" className={menuItem} onClick={() => { close(); props.onOpenWizard(); }}>
                  <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Getting started
                </button>
                <button type="button" role="menuitem" className={menuItem} onClick={() => { close(); props.onOpenPhrasebook(); }}>
                  <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" /> Phrasebook (step cheat sheet)
                </button>
                <button type="button" role="menuitem" className={menuItem} onClick={() => { close(); props.onOpenShortcuts(); }}>
                  <Keyboard className="h-4 w-4 text-primary" aria-hidden="true" /> Keyboard shortcuts
                </button>
              </>
            )}
          </MenuButton>

          {/* Settings */}
          <MenuButton label="Settings" icon={<Settings className="h-4 w-4" />}>
            {(close) => (
              <>
                <div className="px-2.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-600">Mode</div>
                <div className="flex gap-1 px-1.5 pb-2" role="group" aria-label="Studio mode">
                  <button
                    type="button"
                    aria-pressed={isTesterMode}
                    onClick={() => props.setUiMode('tester')}
                    className={`flex-1 rounded-md border px-2 py-1 text-sm cursor-pointer ${isTesterMode ? 'border-blue-300 bg-primary-soft font-semibold text-blue-800' : 'border-border text-slate-700 hover:bg-slate-50'}`}
                    title="Simple view for writing and running tests"
                  >
                    Tester
                  </button>
                  <button
                    type="button"
                    aria-pressed={!isTesterMode}
                    onClick={() => props.setUiMode('developer')}
                    className={`flex-1 rounded-md border px-2 py-1 text-sm cursor-pointer ${!isTesterMode ? 'border-indigo-300 bg-indigo-50 font-semibold text-indigo-800' : 'border-border text-slate-700 hover:bg-slate-50'}`}
                    title="Show plan, generated code and console"
                  >
                    Developer
                  </button>
                </div>
                <div className="px-2.5 pb-1 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-600">Theme</div>
                <div className="flex gap-1 px-1.5 pb-2" role="group" aria-label="Theme">
                  {(['light', 'dark', 'system'] as ThemePref[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={theme.pref === t}
                      onClick={() => theme.setPref(t)}
                      className={`flex-1 rounded-md border px-2 py-1 text-sm capitalize cursor-pointer ${theme.pref === t ? 'border-primary/40 bg-primary-soft font-semibold text-primary' : 'border-border text-slate-700 hover:bg-slate-50'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="my-1 border-t border-slate-100" />
                <button type="button" role="menuitem" className={menuItem} onClick={() => { close(); props.onOpenQaHub(); }}>
                  <Award className="h-4 w-4 text-success" aria-hidden="true" /> QA Skills Hub
                </button>
              </>
            )}
          </MenuButton>
        </div>
      </div>
    </header>
  );
}
