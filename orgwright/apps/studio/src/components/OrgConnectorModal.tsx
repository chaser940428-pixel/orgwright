import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Plus,
  Trash2,
  Shield,
  Key,
  Globe,
  Terminal,
  X,
  Search,
  Check,
  Zap,
  Server,
  Layers,
  HelpCircle,
  Copy,
  Link
} from 'lucide-react';
import { Modal } from './ui/Modal';

export interface ConnectedOrg {
  alias: string;
  username: string;
  instanceUrl: string;
  loginUrl?: string;
  orgId?: string;
  name?: string;
  isSandbox: boolean;
  isDevHub: boolean;
  isScratch: boolean;
  isDefault: boolean;
  orgEdition: string;
  status: string;
  lastUsed?: string;
}

export interface OrgAuthJob {
  id: string;
  alias: string;
  instanceUrl: string;
  status: 'pending' | 'in_progress' | 'authorized' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  output: string[];
  error?: string;
  resultOrg?: Partial<ConnectedOrg>;
}

interface OrgConnectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentOrgAlias: string;
  onSelectOrg: (alias: string) => void;
}

export const OrgConnectorModal: React.FC<OrgConnectorModalProps> = ({
  isOpen,
  onClose,
  currentOrgAlias,
  onSelectOrg
}) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'authorize'>('directory');
  const [authMethod, setAuthMethod] = useState<'web' | 'token' | 'sfdx-url'>('web');

  // Org Directory state
  const [orgs, setOrgs] = useState<ConnectedOrg[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sandboxes' | 'production'>('all');
  const [testLatency, setTestLatency] = useState<Record<string, { latencyMs?: number; testing?: boolean; error?: string }>>({});
  const [copiedAlias, setCopiedAlias] = useState<string | null>(null);
  const [confirmLogoutAlias, setConfirmLogoutAlias] = useState<string | null>(null);

  // Authorize Form State
  const [envPreset, setEnvPreset] = useState<'sandbox' | 'prod' | 'custom'>('sandbox');
  const [newAlias, setNewAlias] = useState('');
  const [instanceUrl, setInstanceUrl] = useState('https://test.salesforce.com');
  const [browserChoice, setBrowserChoice] = useState('default');
  const [setAsActive, setSetAsActive] = useState(true);

  // Token Auth Form State
  const [accessToken, setAccessToken] = useState('');

  // SFDX URL Form State
  const [sfdxUrl, setSfdxUrl] = useState('');

  // Active Authorization Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<OrgAuthJob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);

  // Fetch Orgs list from server
  const fetchOrgs = async () => {
    setIsLoadingOrgs(true);
    try {
      const res = await fetch('/api/org/list');
      const data = await res.json();
      if (data.orgs) {
        setOrgs(data.orgs);
      }
    } catch {
      // fallback
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchOrgs();
      setAuthError(null);
      setAuthSuccessMessage(null);
    }
  }, [isOpen]);

  // Handle Environment Preset Change
  const handlePresetChange = (preset: 'sandbox' | 'prod' | 'custom') => {
    setEnvPreset(preset);
    if (preset === 'sandbox') {
      setInstanceUrl('https://test.salesforce.com');
    } else if (preset === 'prod') {
      setInstanceUrl('https://login.salesforce.com');
    } else {
      setInstanceUrl('');
    }
  };

  // Poll in-flight Web Auth Job
  useEffect(() => {
    if (!activeJobId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/org/login/status/${activeJobId}`);
        const data = await res.json();
        if (data.job) {
          setActiveJob(data.job);
          if (data.job.status === 'authorized') {
            clearInterval(interval);
            setAuthSuccessMessage(`Org "${data.job.alias}" successfully authorized!`);
            fetchOrgs();
            if (setAsActive) {
              onSelectOrg(data.job.alias);
            }
          } else if (data.job.status === 'failed') {
            clearInterval(interval);
            setAuthError(data.job.error || 'Salesforce authorization was closed or cancelled.');
          }
        }
      } catch {
        // network issue
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJobId, setAsActive, onSelectOrg]);

  // Launch Web Server Flow
  const handleLaunchWebAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlias.trim()) {
      setAuthError('Please provide an alias for the org.');
      return;
    }
    if (!instanceUrl.trim()) {
      setAuthError('Please provide a valid Salesforce instance URL.');
      return;
    }

    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/org/login/web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: newAlias.trim(),
          instanceUrl: instanceUrl.trim(),
          browser: browserChoice !== 'default' ? browserChoice : undefined,
          setDefault: setAsActive
        })
      });
      const data = await res.json();
      if (data.success && data.jobId) {
        setActiveJobId(data.jobId);
        setActiveJob({
          id: data.jobId,
          alias: newAlias.trim(),
          instanceUrl: instanceUrl.trim(),
          status: 'in_progress',
          startedAt: new Date().toISOString(),
          output: [
            `[${new Date().toLocaleTimeString()}] Local OAuth Web Server listener initiated on port 1717...`,
            `[${new Date().toLocaleTimeString()}] Browser opened for user authorization on: ${instanceUrl.trim()}`,
            `[${new Date().toLocaleTimeString()}] Please complete login and approve Salesforce CLI in your browser.`
          ]
        });
      } else {
        setAuthError(data.error || 'Failed to initiate Salesforce Web Login.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error launching web login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch Access Token Authorization
  const handleTokenAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlias.trim() || !instanceUrl.trim() || !accessToken.trim()) {
      setAuthError('Please fill in alias, instance URL, and access token.');
      return;
    }

    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/org/login/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: newAlias.trim(),
          instanceUrl: instanceUrl.trim(),
          accessToken: accessToken.trim(),
          setDefault: setAsActive
        })
      });
      const data = await res.json();
      if (data.success) {
        setAuthSuccessMessage(`Org "${newAlias.trim()}" successfully authorized with token!`);
        fetchOrgs();
        if (setAsActive) {
          onSelectOrg(newAlias.trim());
        }
        setAccessToken('');
        setNewAlias('');
      } else {
        setAuthError(data.error || 'Token authorization failed.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error during token authorization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Launch SFDX URL Authorization
  const handleSfdxUrlAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlias.trim() || !sfdxUrl.trim()) {
      setAuthError('Please provide alias and SFDX Auth URL.');
      return;
    }

    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/org/login/sfdx-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: newAlias.trim(),
          sfdxUrl: sfdxUrl.trim(),
          setDefault: setAsActive
        })
      });
      const data = await res.json();
      if (data.success) {
        setAuthSuccessMessage(`Org "${newAlias.trim()}" successfully authorized via SFDX URL!`);
        fetchOrgs();
        if (setAsActive) {
          onSelectOrg(newAlias.trim());
        }
        setSfdxUrl('');
        setNewAlias('');
      } else {
        setAuthError(data.error || 'SFDX URL authorization failed.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Network error during SFDX URL authorization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cancel Web Auth Job
  const handleCancelAuth = async () => {
    if (!activeJobId) return;
    try {
      await fetch(`/api/org/login/cancel/${activeJobId}`, { method: 'POST' });
    } catch {}
    setActiveJobId(null);
    setActiveJob(null);
  };

  // Test Latency / Connection for a specific org
  const handleTestConnection = async (alias: string) => {
    setTestLatency((prev) => ({ ...prev, [alias]: { testing: true } }));
    try {
      const res = await fetch('/api/org/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias })
      });
      const data = await res.json();
      if (data.success) {
        setTestLatency((prev) => ({
          ...prev,
          [alias]: { latencyMs: data.latencyMs, testing: false }
        }));
      } else {
        setTestLatency((prev) => ({
          ...prev,
          [alias]: { error: data.error || 'Failed', testing: false }
        }));
      }
    } catch (err: any) {
      setTestLatency((prev) => ({
        ...prev,
        [alias]: { error: err.message, testing: false }
      }));
    }
  };

  // Open Org in browser
  const handleOpenOrg = async (alias: string) => {
    try {
      const res = await fetch('/api/org/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, urlOnly: true })
      });
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        // Fallback open direct
        fetch('/api/org/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias, urlOnly: false })
        });
      }
    } catch {}
  };

  // Logout Org
  const handleLogoutOrg = async (alias: string) => {
    try {
      const res = await fetch('/api/org/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias })
      });
      const data = await res.json();
      if (data.success) {
        fetchOrgs();
        setConfirmLogoutAlias(null);
      }
    } catch {}
  };

  // Copy to clipboard
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAlias(id);
    setTimeout(() => setCopiedAlias(null), 1800);
  };

  if (!isOpen) return null;

  // Filter orgs
  const filteredOrgs = orgs.filter((org) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      org.alias.toLowerCase().includes(q) ||
      org.username.toLowerCase().includes(q) ||
      (org.orgId && org.orgId.toLowerCase().includes(q)) ||
      (org.instanceUrl && org.instanceUrl.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (filterType === 'sandboxes') return org.isSandbox;
    if (filterType === 'production') return !org.isSandbox;
    return true;
  });

  return (
    <Modal open onClose={onClose} size="xl" flush title={<span className="flex items-center gap-2"><Cloud className="h-5 w-5 text-primary" aria-hidden="true" />Salesforce orgs <span className="text-xs font-medium text-muted">{orgs.length} connected</span><button type="button" onClick={fetchOrgs} disabled={isLoadingOrgs} aria-label="Refresh org list" title="Refresh org list" className="p-1 rounded text-muted hover:bg-slate-100 cursor-pointer"><RefreshCw className={`h-4 w-4 ${isLoadingOrgs ? 'motion-safe:animate-spin text-primary' : ''}`} /></button></span>}>
        {/* Tab Switcher: Directory vs Authorize New */}
        <div className="px-6 pt-3 bg-white border-b border-border flex items-center space-x-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab('directory');
              setAuthError(null);
            }}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition cursor-pointer ${
              activeTab === 'directory'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-slate-800'
            }`}
          >
            <Server className="h-4 w-4" />
            <span>Connected Orgs ({orgs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('authorize');
              setAuthError(null);
            }}
            className={`pb-3 text-xs font-semibold flex items-center space-x-2 border-b-2 transition cursor-pointer ${
              activeTab === 'authorize'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted hover:text-slate-800'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>+ Authorize New Org</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {/* TAB 1: CONNECTED ORGS DIRECTORY */}
          {activeTab === 'directory' && (
            <div className="space-y-4">
              {/* Filter & Search Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-border shadow-2xs">
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search alias, username, org ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex items-center space-x-1 text-xs">
                    {(['all', 'sandboxes', 'production'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setFilterType(t)}
                        className={`px-2.5 py-1 rounded-lg capitalize transition cursor-pointer ${
                          filterType === t
                            ? 'bg-primary text-white font-medium shadow-2xs'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-border'
                        }`}
                      >
                        {t === 'all' ? 'All' : t === 'sandboxes' ? 'Sandboxes' : 'Prod & Dev'}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('authorize')}
                  className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-xs cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Authorize New Org</span>
                </button>
              </div>

              {/* Orgs List */}
              {filteredOrgs.length === 0 ? (
                <div className="p-12 text-center bg-white border border-border rounded-2xl space-y-3">
                  <Cloud className="h-10 w-10 mx-auto text-slate-300 stroke-1" />
                  <p className="text-sm font-semibold text-slate-700">No matching Salesforce orgs found</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    No connected org matches your search filter, or you haven't authorized an org yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('authorize')}
                    className="mt-2 px-3.5 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    Authorize Your First Org
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredOrgs.map((org) => {
                    const isActive = org.alias === currentOrgAlias;
                    const latencyInfo = testLatency[org.alias];

                    return (
                      <div
                        key={org.alias}
                        className={`bg-white rounded-lg border p-4 transition shadow-xs ${
                          isActive
                            ? 'border-primary ring-2 ring-primary/10'
                            : 'border-border hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Left: Org Metadata */}
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="font-bold text-sm text-slate-900 font-mono">
                                {org.alias}
                              </span>

                              {isActive && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-success-soft text-success border border-emerald-200 flex items-center space-x-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>ACTIVE FOR TESTING</span>
                                </span>
                              )}

                              {org.isSandbox ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                                  Sandbox
                                </span>
                              ) : org.isDevHub ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-soft text-primary-hover border border-blue-200">
                                  Dev Hub
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-success-soft text-success border border-emerald-200">
                                  Production
                                </span>
                              )}

                              {org.isDefault && (
                                <span className="px-1.5 py-0.2 rounded text-xs font-semibold bg-warning-soft text-warning border border-amber-200">
                                  CLI Default
                                </span>
                              )}

                              <span className="text-xs text-slate-400">
                                {org.orgEdition}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-slate-400">User:</span>
                                <span className="font-mono text-slate-800 select-all font-medium">
                                  {org.username}
                                </span>
                              </div>

                              {org.orgId && (
                                <div className="flex items-center space-x-1.5">
                                  <span className="text-slate-400">Org ID:</span>
                                  <span className="font-mono text-muted text-xs">
                                    {org.orgId}
                                  </span>
                                </div>
                              )}

                              <div className="flex items-center space-x-1 text-muted truncate max-w-sm">
                                <Link className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                <span className="truncate text-xs font-mono">{org.instanceUrl}</span>
                              </div>
                            </div>

                            {/* Connection Latency Test Result */}
                            {latencyInfo && (
                              <div className="pt-1">
                                {latencyInfo.testing ? (
                                  <span className="text-xs text-primary flex items-center space-x-1">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    <span>Pinging Salesforce Org API...</span>
                                  </span>
                                ) : latencyInfo.latencyMs !== undefined ? (
                                  <span className="text-xs text-success font-medium flex items-center space-x-1">
                                    <CheckCircle2 className="h-3 w-3 text-success" />
                                    <span>
                                      Live API Connection Verified ({latencyInfo.latencyMs}ms roundtrip)
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-danger flex items-center space-x-1">
                                    <AlertCircle className="h-3 w-3" />
                                    <span>{latencyInfo.error || 'Connection failed'}</span>
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            {!isActive ? (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectOrg(org.alias);
                                  onClose();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition shadow-xs cursor-pointer"
                              >
                                Select Org
                              </button>
                            ) : (
                              <span className="px-3 py-1.5 rounded-lg bg-slate-100 text-muted text-xs font-medium border border-border">
                                Current Org
                              </span>
                            )}

                            <button aria-label="Open Org in Browser"
                              type="button"
                              onClick={() => handleOpenOrg(org.alias)}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-border text-slate-600 transition shadow-2xs cursor-pointer"
                              title="Open Org in Browser"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </button>

                            <button aria-label="Test API Connectivity"
                              type="button"
                              onClick={() => handleTestConnection(org.alias)}
                              disabled={latencyInfo?.testing}
                              className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-border text-slate-600 transition shadow-2xs cursor-pointer"
                              title="Test API Connectivity"
                            >
                              <Zap className="h-4 w-4 text-amber-500" />
                            </button>

                            {confirmLogoutAlias === org.alias ? (
                              <div className="flex items-center space-x-1 bg-danger-soft border border-rose-200 p-1 rounded-lg">
                                <span className="text-xs text-danger font-semibold px-1">Revoke?</span>
                                <button
                                  type="button"
                                  onClick={() => handleLogoutOrg(org.alias)}
                                  className="px-2 py-0.5 rounded bg-danger hover:bg-danger-hover text-white text-xs font-bold cursor-pointer"
                                >
                                  Yes
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmLogoutAlias(null)}
                                  className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-xs cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button aria-label="Revoke & Logout Org"
                                type="button"
                                onClick={() => setConfirmLogoutAlias(org.alias)}
                                className="p-1.5 rounded-lg bg-slate-50 hover:bg-danger-soft hover:border-rose-200 text-slate-400 hover:text-danger border border-border transition shadow-2xs cursor-pointer"
                                title="Revoke & Logout Org"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AUTHORIZE NEW SALESFORCE ORG */}
          {activeTab === 'authorize' && (
            <div className="space-y-5 max-w-2xl mx-auto">
              {/* Method Switcher */}
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-lg border border-border text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('web');
                    setAuthError(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                    authMethod === 'web'
                      ? 'bg-white text-primary-hover shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>Web Login (OAuth)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('token');
                    setAuthError(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                    authMethod === 'token'
                      ? 'bg-white text-primary-hover shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Key className="h-3.5 w-3.5" />
                  <span>Access Token</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMethod('sfdx-url');
                    setAuthError(null);
                  }}
                  className={`py-2 px-3 rounded-lg font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer ${
                    authMethod === 'sfdx-url'
                      ? 'bg-white text-primary-hover shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>SFDX Auth URL</span>
                </button>
              </div>

              {/* Status & Error Alerts */}
              {authError && (
                <div className="p-3.5 rounded-lg bg-danger-soft border border-rose-200 flex items-start space-x-2.5 text-xs text-rose-800 animate-in fade-in">
                  <AlertCircle className="h-4 w-4 text-danger flex-shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold block">Authorization Failed</strong>
                    <span className="font-mono text-xs leading-relaxed">{authError}</span>
                  </div>
                </div>
              )}

              {authSuccessMessage && (
                <div className="p-3.5 rounded-lg bg-success-soft border border-emerald-200 flex items-center justify-between text-xs text-emerald-800 animate-in fade-in">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="font-semibold">{authSuccessMessage}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('directory')}
                    className="px-3 py-1 rounded-lg bg-success hover:bg-emerald-700 text-white font-semibold text-xs shadow-2xs cursor-pointer"
                  >
                    View in Orgs List
                  </button>
                </div>
              )}

              {/* In-Flight Active Web Login Job Display */}
              {activeJob && activeJob.status === 'in_progress' ? (
                <div className="bg-white border-2 border-blue-400 rounded-2xl p-6 shadow-md space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-9 w-9 rounded-lg bg-primary-soft border border-blue-200 flex items-center justify-center text-primary">
                        <RefreshCw className="h-5 w-5 animate-spin" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">
                          Authorizing Org "{activeJob.alias}" in Browser...
                        </h4>
                        <p className="text-xs text-muted">
                          Target Login: <span className="font-mono">{activeJob.instanceUrl}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCancelAuth}
                      className="px-3 py-1 rounded-lg bg-danger-soft hover:bg-rose-100 border border-rose-200 text-danger text-xs font-semibold transition cursor-pointer"
                    >
                      Cancel Flow
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center space-x-2 text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span>Local OAuth listener active on port 1717</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span>Salesforce login page opened in browser window</span>
                    </div>
                    <div className="flex items-center space-x-2 text-primary-hover font-semibold animate-pulse">
                      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                      <span>Waiting for you to log in & click "Allow" in your browser...</span>
                    </div>
                  </div>

                  {/* Terminal log output */}
                  <div className="p-3 bg-slate-950 text-slate-300 rounded-lg font-mono text-xs max-h-36 overflow-y-auto space-y-1">
                    {activeJob.output.map((line, idx) => (
                      <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                        {line}
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-slate-400 italic text-center">
                    Once you complete login in the opened browser window, Orgwright will automatically detect the authorization and connect your org!
                  </p>
                </div>
              ) : (
                <>
                  {/* METHOD 1: WEB LOGIN */}
                  {authMethod === 'web' && (
                    <form onSubmit={handleLaunchWebAuth} className="bg-white border border-border rounded-2xl p-5 shadow-xs space-y-4">
                      {/* Presets */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Salesforce Environment Preset:
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handlePresetChange('sandbox')}
                            className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                              envPreset === 'sandbox'
                                ? 'bg-purple-50/70 border-purple-300 ring-1 ring-purple-400'
                                : 'bg-slate-50 border-border hover:bg-slate-100/60'
                            }`}
                          >
                            <span className="font-bold text-xs text-purple-900 block">Sandbox / Stage</span>
                            <span className="text-xs text-purple-700 font-mono block truncate">
                              test.salesforce.com
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePresetChange('prod')}
                            className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                              envPreset === 'prod'
                                ? 'bg-primary-soft/70 border-blue-300 ring-1 ring-blue-400'
                                : 'bg-slate-50 border-border hover:bg-slate-100/60'
                            }`}
                          >
                            <span className="font-bold text-xs text-blue-900 block">Production / Dev</span>
                            <span className="text-xs text-primary-hover font-mono block truncate">
                              login.salesforce.com
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handlePresetChange('custom')}
                            className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                              envPreset === 'custom'
                                ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-400'
                                : 'bg-slate-50 border-border hover:bg-slate-100/60'
                            }`}
                          >
                            <span className="font-bold text-xs text-indigo-900 block">Custom My Domain</span>
                            <span className="text-xs text-indigo-700 font-mono block truncate">
                              *.my.salesforce.com
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Org Alias */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Org Alias <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          placeholder="e.g. qa-sandbox, dev-hub, uat-billing"
                          className="w-full bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-primary focus:bg-white"
                        />
                        <span className="text-xs text-slate-400">
                          Short friendly name used across Orgwright Studio and Salesforce CLI to refer to this org.
                        </span>
                      </div>

                      {/* Login URL */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Login Instance URL <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="url"
                          required
                          value={instanceUrl}
                          onChange={(e) => setInstanceUrl(e.target.value)}
                          placeholder="https://test.salesforce.com or https://company.my.salesforce.com"
                          className="w-full bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-primary focus:bg-white"
                        />
                      </div>

                      {/* Browser Selector */}
                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Browser for Authorization:
                        </label>
                        <select
                          value={browserChoice}
                          onChange={(e) => setBrowserChoice(e.target.value)}
                          className="w-full bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-primary cursor-pointer"
                        >
                          <option value="default">Default System Browser (Recommended)</option>
                          <option value="chrome">Google Chrome</option>
                          <option value="edge">Microsoft Edge</option>
                        </select>
                      </div>

                      {/* Checkbox: Set as active */}
                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          id="set-active-checkbox"
                          type="checkbox"
                          checked={setAsActive}
                          onChange={(e) => setSetAsActive(e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <label htmlFor="set-active-checkbox" className="text-xs text-slate-700 cursor-pointer select-none">
                          Set this new org as active in Orgwright Studio upon successful authorization
                        </label>
                      </div>

                      {/* Submit */}
                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={isSubmitting || !newAlias.trim() || !instanceUrl.trim()}
                          className="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                        >
                          {isSubmitting ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Globe className="h-4 w-4" />
                          )}
                          <span>Launch Salesforce Web Authorization</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* METHOD 2: ACCESS TOKEN */}
                  {authMethod === 'token' && (
                    <form onSubmit={handleTokenAuth} className="bg-white border border-border rounded-2xl p-5 shadow-xs space-y-4">
                      <div className="p-3 bg-primary-soft/80 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
                        <span className="font-bold block">Direct Session / Token Authorization</span>
                        <p className="text-xs text-primary-hover">
                          Authorize instantly without opening a browser window. Access tokens must follow the Salesforce session format: <code className="bg-white px-1 py-0.5 rounded font-mono text-xs">&lt;orgId&gt;!&lt;token&gt;</code> (e.g. from Workbench or Dev Console).
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Org Alias <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          placeholder="e.g. test-token-org"
                          className="w-full bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Instance URL <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="url"
                          required
                          value={instanceUrl}
                          onChange={(e) => setInstanceUrl(e.target.value)}
                          placeholder="https://company.my.salesforce.com"
                          className="w-full bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs text-slate-800 font-mono focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Access Token / Session ID <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          placeholder="00Dce000008a6iE!AQEAQ..."
                          className="w-full bg-slate-50 border border-border rounded-lg p-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-primary resize-none"
                        />
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          id="token-active-checkbox"
                          type="checkbox"
                          checked={setAsActive}
                          onChange={(e) => setSetAsActive(e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <label htmlFor="token-active-checkbox" className="text-xs text-slate-700 cursor-pointer">
                          Set as active org upon successful connection
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting || !newAlias || !instanceUrl || !accessToken}
                        className="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                      >
                        {isSubmitting ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Key className="h-4 w-4" />
                        )}
                        <span>Authorize with Access Token</span>
                      </button>
                    </form>
                  )}

                  {/* METHOD 3: SFDX AUTH URL */}
                  {authMethod === 'sfdx-url' && (
                    <form onSubmit={handleSfdxUrlAuth} className="bg-white border border-border rounded-2xl p-5 shadow-xs space-y-4">
                      <div className="p-3 bg-warning-soft/80 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                        <span className="font-bold block">SFDX Authorization URL Import</span>
                        <p className="text-xs text-warning">
                          Import and authorize using a Salesforce DX Auth URL (format: <code className="bg-white px-1 py-0.5 rounded font-mono text-xs">force://PlatformCLI:&lt;refreshToken&gt;@&lt;instanceUrl&gt;</code>).
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          Org Alias <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={newAlias}
                          onChange={(e) => setNewAlias(e.target.value)}
                          placeholder="e.g. ci-cd-org"
                          className="w-full bg-slate-50 border border-border rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-slate-700">
                          SFDX Auth URL <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          required
                          rows={3}
                          value={sfdxUrl}
                          onChange={(e) => setSfdxUrl(e.target.value)}
                          placeholder="force://PlatformCLI:..."
                          className="w-full bg-slate-50 border border-border rounded-lg p-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:border-primary resize-none"
                        />
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          id="sfdx-active-checkbox"
                          type="checkbox"
                          checked={setAsActive}
                          onChange={(e) => setSetAsActive(e.target.checked)}
                          className="rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <label htmlFor="sfdx-active-checkbox" className="text-xs text-slate-700 cursor-pointer">
                          Set as active org upon successful import
                        </label>
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting || !newAlias || !sfdxUrl}
                        className="w-full py-2.5 px-4 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center space-x-2 transition shadow-xs cursor-pointer"
                      >
                        {isSubmitting ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Terminal className="h-4 w-4" />
                        )}
                        <span>Import & Authorize SFDX URL</span>
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-border p-4 px-6 flex items-center justify-between text-xs text-muted">
          <div className="flex items-center space-x-1.5">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span>Encrypted OAuth credentials managed by Salesforce CLI securely.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-border text-slate-700 font-medium transition shadow-2xs cursor-pointer"
          >
            Close
          </button>
        </div>
      
        </Modal>
  );
};
