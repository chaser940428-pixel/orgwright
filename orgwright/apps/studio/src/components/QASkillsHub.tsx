import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  Layers,
  FileCode,
  Zap,
  RefreshCw,
  ExternalLink,
  Code2,
  BookmarkCheck,
  Award,
  Filter
} from 'lucide-react';

export interface LocatorAnalysis {
  line: number;
  code: string;
  type: 'role' | 'label' | 'testid' | 'scoped_lightning' | 'css_class' | 'brittle_css';
  score: number;
  recommendation?: string;
}

export interface SpecAuditResult {
  overallScore: number;
  roleFirstCompliancePercent: number;
  totalLocators: number;
  locators: LocatorAnalysis[];
  antiFlakinessChecks: {
    noWaitForTimeout: boolean;
    usesWebFirstAssertions: boolean;
    usesPageObjects: boolean;
    usesStreamTelemetry: boolean;
    usesLightningReady: boolean;
  };
  warnings: string[];
  recommendations: string[];
}

export interface QASkillItem {
  name: string;
  category: string;
  tags: string[];
  description?: string;
}

interface QASkillsHubProps {
  currentSpecCode: string;
  ticketNumber?: string;
}

export const QASkillsHub: React.FC<QASkillsHubProps> = ({ currentSpecCode, ticketNumber }) => {
  const [auditResult, setAuditResult] = useState<SpecAuditResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [skills, setSkills] = useState<QASkillItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [qaContextContent, setQaContextContent] = useState<string>('');
  const [activeSubTab, setActiveSubTab] = useState<'audit' | 'catalog' | 'rubric' | 'context'>('audit');

  const fetchCatalog = () => {
    fetch('/api/qa-skills/catalog')
      .then((res) => res.json())
      .then((data) => {
        if (data.skills) setSkills(data.skills);
      })
      .catch(() => {});
  };

  const fetchContext = () => {
    fetch('/api/qa-skills/context')
      .then((res) => res.json())
      .then((data) => {
        if (data.content) setQaContextContent(data.content);
      })
      .catch(() => {});
  };

  const runAudit = () => {
    if (!currentSpecCode) return;
    setIsAuditing(true);
    fetch('/api/qa-skills/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specCode: currentSpecCode })
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.audit) setAuditResult(data.audit);
      })
      .finally(() => setIsAuditing(false));
  };

  useEffect(() => {
    fetchCatalog();
    fetchContext();
    runAudit();
  }, [currentSpecCode]);

  const filteredSkills = skills.filter((s) => {
    const matchesCat = selectedCategory === 'all' || s.category === selectedCategory;
    const matchesQuery =
      !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesQuery;
  });

  const categories = ['all', ...Array.from(new Set(skills.map((s) => s.category).filter(Boolean)))];

  return (
    <div className="flex-1 flex flex-col space-y-4 overflow-y-auto p-1 text-slate-800">
      {/* Top Banner: petrkindlmann/qa-skills Engine */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-white border border-blue-200/80 rounded-lg p-4 shadow-xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center text-white shadow-xs">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="font-bold text-slate-900 text-sm">petrkindlmann/qa-skills Standards Engine</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-primary-hover border border-blue-200">
                50 QA Skills Active
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Production-grade quality rules: auto-waiting, role-first locators (Score 0-5), drift recovery, and anti-flakiness discipline.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={runAudit}
            disabled={isAuditing}
            className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium flex items-center space-x-1.5 shadow-xs transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>Audit Spec</span>
          </button>
          <a
            href="https://github.com/petrkindlmann/qa-skills"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-medium flex items-center space-x-1.5 shadow-xs transition"
          >
            <span>GitHub Repo</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center space-x-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('audit')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeSubTab === 'audit'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white border border-border text-slate-600 hover:bg-slate-50'
          }`}
        >
          Spec Health Audit
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('rubric')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeSubTab === 'rubric'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white border border-border text-slate-600 hover:bg-slate-50'
          }`}
        >
          0-5 Selector Stability Rubric
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('catalog')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeSubTab === 'catalog'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white border border-border text-slate-600 hover:bg-slate-50'
          }`}
        >
          50 Skills Catalog ({skills.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('context')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            activeSubTab === 'context'
              ? 'bg-primary text-white shadow-xs'
              : 'bg-white border border-border text-slate-600 hover:bg-slate-50'
          }`}
        >
          qa-project-context.md
        </button>
      </div>

      {/* Tab 1: Spec Health Audit */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          {auditResult ? (
            <>
              {/* Score summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white border border-border rounded-lg p-3.5 shadow-xs">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">Overall QA Score</div>
                  <div className="text-2xl font-bold text-slate-900 mt-1 flex items-baseline space-x-1.5">
                    <span>{auditResult.overallScore}%</span>
                    <span className="text-xs font-semibold text-success">
                      {auditResult.overallScore >= 85 ? 'Production Ready' : 'Needs Optimization'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2">
                    <div
                      className="bg-primary h-1.5 rounded-full"
                      style={{ width: `${auditResult.overallScore}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white border border-border rounded-lg p-3.5 shadow-xs">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">Role-First Locators</div>
                  <div className="text-2xl font-bold text-primary mt-1">
                    {auditResult.roleFirstCompliancePercent}%
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {auditResult.totalLocators} locators evaluated
                  </div>
                </div>

                <div className="bg-white border border-border rounded-lg p-3.5 shadow-xs">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">Anti-Flakiness Rules</div>
                  <div className="text-2xl font-bold text-success mt-1">
                    {auditResult.antiFlakinessChecks.noWaitForTimeout ? 'Compliant' : 'Warning'}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {auditResult.antiFlakinessChecks.noWaitForTimeout ? 'Zero hardcoded sleeps' : 'waitForTimeout found'}
                  </div>
                </div>

                <div className="bg-white border border-border rounded-lg p-3.5 shadow-xs">
                  <div className="text-xs font-semibold text-muted uppercase tracking-wider">POM & Sync Helpers</div>
                  <div className="text-2xl font-bold text-indigo-600 mt-1">
                    {auditResult.antiFlakinessChecks.usesPageObjects ? 'Active' : 'Basic'}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    BasePage & LightningHelpers
                  </div>
                </div>
              </div>

              {/* Checklist & Recommendations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-border rounded-lg p-4 shadow-xs space-y-2.5">
                  <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span>petrkindlmann Anti-Flakiness Checklist</span>
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-700">Auto-Waiting (No raw waitForTimeout)</span>
                      {auditResult.antiFlakinessChecks.noWaitForTimeout ? (
                        <span className="text-success font-semibold bg-success-soft px-2 py-0.5 rounded border border-emerald-200">PASS</span>
                      ) : (
                        <span className="text-danger font-semibold bg-danger-soft px-2 py-0.5 rounded border border-rose-200">FAIL</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-700">Web-First Assertions (expect().toBeVisible)</span>
                      {auditResult.antiFlakinessChecks.usesWebFirstAssertions ? (
                        <span className="text-success font-semibold bg-success-soft px-2 py-0.5 rounded border border-emerald-200">PASS</span>
                      ) : (
                        <span className="text-warning font-semibold bg-warning-soft px-2 py-0.5 rounded border border-amber-200">OPTIONAL</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-700">Page Object Model Architecture</span>
                      {auditResult.antiFlakinessChecks.usesPageObjects ? (
                        <span className="text-success font-semibold bg-success-soft px-2 py-0.5 rounded border border-emerald-200">PASS</span>
                      ) : (
                        <span className="text-muted font-semibold bg-slate-100 px-2 py-0.5 rounded">N/A</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-700">Lightning Ready Queue Synchronization</span>
                      {auditResult.antiFlakinessChecks.usesLightningReady ? (
                        <span className="text-success font-semibold bg-success-soft px-2 py-0.5 rounded border border-emerald-200">PASS</span>
                      ) : (
                        <span className="text-warning font-semibold bg-warning-soft px-2 py-0.5 rounded border border-amber-200">MISSING</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-700">Live Telemetry & Step Tracking</span>
                      {auditResult.antiFlakinessChecks.usesStreamTelemetry ? (
                        <span className="text-success font-semibold bg-success-soft px-2 py-0.5 rounded border border-emerald-200">PASS</span>
                      ) : (
                        <span className="text-muted font-semibold bg-slate-100 px-2 py-0.5 rounded">N/A</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-border rounded-lg p-4 shadow-xs space-y-2.5">
                  <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>Actionable Recommendations</span>
                  </h4>
                  {auditResult.recommendations.length === 0 ? (
                    <div className="p-3 bg-success-soft border border-emerald-200 rounded-lg text-xs text-emerald-800">
                      Spec fully adheres to petrkindlmann/qa-skills standards! Locators are resilient against Salesforce Lightning drift.
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {auditResult.recommendations.map((rec, i) => (
                        <div key={i} className="p-2.5 bg-primary-soft/60 border border-blue-200/70 rounded-lg text-blue-900 flex items-start space-x-2">
                          <span className="font-bold text-primary">{i + 1}.</span>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {auditResult.warnings.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <div className="text-xs font-semibold text-danger uppercase">Warnings ({auditResult.warnings.length})</div>
                      {auditResult.warnings.map((w, i) => (
                        <div key={i} className="p-2 bg-danger-soft border border-rose-200 rounded text-xs text-rose-800 flex items-center space-x-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-danger flex-shrink-0" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Evaluated Locators List */}
              <div className="bg-white border border-border rounded-lg p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
                    Evaluated Locators in Spec ({auditResult.locators.length})
                  </h4>
                  <span className="text-xs text-muted">Scored using 0-5 Stability Rubric</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {auditResult.locators.map((loc, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-border bg-slate-50 hover:bg-slate-100/70 flex items-center justify-between text-xs transition"
                    >
                      <div className="flex items-center space-x-2.5 flex-1 min-w-0 pr-3">
                        <span className="font-mono text-muted text-xs w-12 flex-shrink-0">L:{loc.line}</span>
                        <span className="font-mono text-slate-800 text-xs truncate">{loc.code}</span>
                      </div>
                      <div className="flex items-center space-x-2 flex-shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            loc.score >= 4
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : loc.score === 3
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          Score {loc.score}/5 ({loc.type})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white border border-border rounded-lg p-8 text-center text-muted">
              <Code2 className="h-8 w-8 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium">Click "Audit Spec" to evaluate the current test spec.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 0-5 Selector Stability Rubric */}
      {activeSubTab === 'rubric' && (
        <div className="space-y-3">
          <div className="bg-white border border-border rounded-lg p-4 shadow-xs">
            <h4 className="font-bold text-slate-900 text-sm">petrkindlmann Selector Stability Rubric (0 to 5)</h4>
            <p className="text-xs text-slate-600 mt-1">
              Every selector generated or recorded is scored from 0 (brittle, forbidden) to 5 (most resilient against Salesforce releases).
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="bg-white border-l-4 border-emerald-500 border-border border rounded-lg p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-emerald-800">Score 5: Semantic Role + Accessible Name (Best)</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Primary Standard</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Matches the element the way assistive tech and users perceive it. Resilient to markup refactors and LWC hash changes.
              </p>
              <div className="mt-2 p-2 bg-slate-900 text-emerald-400 rounded-lg font-mono text-xs">
                page.getByRole('button', &#123; name: /Save/i &#125;)
              </div>
            </div>

            <div className="bg-white border-l-4 border-primary border-border border rounded-lg p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-blue-800">Score 4: Form Label / Explicit Test ID</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">High Stability</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Tied directly to the user-facing field label on Salesforce record layouts.
              </p>
              <div className="mt-2 p-2 bg-slate-900 text-sky-400 rounded-lg font-mono text-xs">
                page.getByLabel(/Total Expected Reimbursement/i)
              </div>
            </div>

            <div className="bg-white border-l-4 border-indigo-500 border-border border rounded-lg p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-indigo-800">Score 3: Region-Scoped Semantic Locator</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">Disambiguated</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Scoped to a modal or region rather than global DOM. Never use deprecated layout selectors (:near, :right-of).
              </p>
              <div className="mt-2 p-2 bg-slate-900 text-indigo-300 rounded-lg font-mono text-xs">
                page.getByRole('dialog', &#123; name: /Edit/i &#125;).getByRole('button', &#123; name: /Save/i &#125;)
              </div>
            </div>

            <div className="bg-white border-l-4 border-amber-500 border-border border rounded-lg p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-amber-800">Score 2: Scoped Lightning Element with Text Filter</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">Salesforce Specific</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Targeting custom Salesforce LWC wrappers with text containment. Acceptable when role is not exposed.
              </p>
              <div className="mt-2 p-2 bg-slate-900 text-amber-300 rounded-lg font-mono text-xs">
                page.locator('records-record-layout-item').filter(&#123; hasText: /Reimbursement/i &#125;).locator('input')
              </div>
            </div>

            <div className="bg-white border-l-4 border-rose-500 border-border border rounded-lg p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-rose-800">Score 0-1: Brittle Positional CSS / Nth-Child (Forbidden)</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">Forbidden</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Breaks on minor DOM re-renders or layout changes. Strict AI rule: never generate positional CSS paths.
              </p>
              <div className="mt-2 p-2 bg-slate-900 text-rose-400 rounded-lg font-mono text-xs">
                {"// DO NOT USE: page.locator('div > div:nth-child(3) > button')"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 50 Skills Catalog Explorer */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-3">
          {/* Filter Bar */}
          <div className="bg-white border border-border rounded-lg p-3 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition ${
                    selectedCategory === cat
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search 50 skills or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-primary"
              />
            </div>
          </div>

          {/* Grid of skills */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSkills.map((sk) => (
              <div
                key={sk.name}
                className="bg-white border border-border hover:border-blue-400 rounded-lg p-3.5 shadow-xs transition hover:shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-slate-900 text-xs font-mono">{sk.name}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase bg-slate-100 text-slate-700">
                      {sk.category}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {sk.tags.slice(0, 4).map((t, idx) => (
                      <span key={idx} className="text-xs px-1.5 py-0.2 rounded bg-primary-soft text-primary-hover border border-blue-100">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: qa-project-context.md */}
      {activeSubTab === 'context' && (
        <div className="bg-white border border-border rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center space-x-2">
              <BookmarkCheck className="h-4 w-4 text-primary" />
              <span className="font-semibold text-xs text-slate-900 uppercase">.agents/qa-project-context.md</span>
            </div>
            <span className="text-xs text-muted">Live configuration file read by QA Skills</span>
          </div>
          <pre className="bg-slate-50 border border-border rounded-lg p-4 font-mono text-xs text-slate-800 overflow-x-auto leading-relaxed max-h-[500px]">
            {qaContextContent || 'Loading context...'}
          </pre>
        </div>
      )}
    </div>
  );
};
