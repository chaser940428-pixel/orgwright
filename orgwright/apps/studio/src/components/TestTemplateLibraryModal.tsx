import React, { useMemo, useState } from 'react';
import { Modal, btn } from './ui/Modal';
import {
  SALESFORCE_STANDARD_TEMPLATES,
  SalesforceTestTemplate
} from '../data/salesforce-templates';
import {
  BookOpen,
  Search,
  X,
  Check,
  ChevronRight,
  Sparkles,
  Layers,
  ShieldCheck,
  Zap,
  ArrowRight,
  TrendingUp,
  Headphones,
  Sliders,
  PlusCircle,
  FileCode2,
  HelpCircle,
  ExternalLink,
  Calculator,
  Wrench,
  Briefcase,
  HeartPulse,
  Bot,
  ShoppingCart,
  Megaphone,
  BarChart3,
  Globe,
  Database,
  Workflow,
  Boxes
} from 'lucide-react';

interface TestTemplateLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (template: SalesforceTestTemplate) => void;
  onImportToSuite: (template: SalesforceTestTemplate) => Promise<void>;
  /** Imports every template; mode decides what happens to tests that already exist */
  onImportAllToSuite?: (mode: 'skip' | 'replace') => Promise<void>;
  /** Object API names in the connected org (for compatibility badges); empty when not connected */
  orgObjects?: string[];
}

export type TemplateFit = 'fits' | 'missing' | 'unknown';

/** Does the org have every object the template works on? */
export function templateFit(objectName: string, orgObjects: Set<string>): { fit: TemplateFit; missing: string[] } {
  if (orgObjects.size === 0) return { fit: 'unknown', missing: [] };
  const needed = String(objectName || '')
    .split(/[,/&+]| and /i)
    .map((o) => o.trim())
    .filter(Boolean);
  const missing = needed.filter((o) => !orgObjects.has(o.toLowerCase()) && !orgObjects.has(o.replace(/\s+/g, '').toLowerCase()));
  return { fit: missing.length ? 'missing' : 'fits', missing };
}

export function FitBadge({ objectName, orgObjects }: { objectName: string; orgObjects: Set<string> }) {
  const { fit, missing } = templateFit(objectName, orgObjects);
  if (fit === 'unknown')
    return (
      <span className="text-xs px-1.5 rounded-full border border-border text-muted" title="Connect an org to check which templates fit">
        Not checked
      </span>
    );
  return fit === 'fits' ? (
    <span className="text-xs px-1.5 rounded-full border border-emerald-200 bg-success-soft text-success font-semibold" title="Every object this template uses exists in the connected org">
      Fits your org
    </span>
  ) : (
    <span className="text-xs px-1.5 rounded-full border border-amber-200 bg-warning-soft text-warning font-semibold" title={`Not found in the connected org: ${missing.join(', ')}`}>
      Needs {missing.join(', ')}
    </span>
  );
}

export const TestTemplateLibraryModal: React.FC<TestTemplateLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  onImportToSuite,
  onImportAllToSuite,
  orgObjects = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedTemplate, setSelectedTemplate] = useState<SalesforceTestTemplate>(
    SALESFORCE_STANDARD_TEMPLATES[0]
  );
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importPlan, setImportPlan] = useState<{ add: string[]; exist: string[] } | null>(null);
  const [importMode, setImportMode] = useState<'skip' | 'replace'>('skip');
  const [planError, setPlanError] = useState<string | null>(null);
  const orgObjectSet = useMemo(() => new Set(orgObjects.map((o) => o.toLowerCase())), [orgObjects]);
  const fitCount = useMemo(
    () => (orgObjectSet.size ? SALESFORCE_STANDARD_TEMPLATES.filter((t) => templateFit(t.objectName, orgObjectSet).fit === 'fits').length : null),
    [orgObjectSet]
  );

  // Dry run first: show what Import All would add and what already exists
  const planImportAll = async () => {
    setPlanError(null);
    try {
      const res = await fetch('/api/templates/import-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true })
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || 'Could not check the suite');
      setImportMode('skip');
      setImportPlan({ add: d.add || [], exist: d.exist || [] });
    } catch (e: any) {
      setPlanError(e?.message || 'Could not check the suite');
    }
  };

  const confirmImportAll = async () => {
    if (!onImportAllToSuite) return;
    setIsImporting(true);
    try {
      await onImportAllToSuite(importMode);
      setImportPlan(null);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  const categories = [
    'All',
    'Sales Cloud',
    'CPQ & Billing',
    'Service Cloud',
    'Field Service (SFS)',
    'Knowledge & Service',
    'Financial Services (FSC)',
    'Health Cloud',
    'Agentforce & AI',
    'Commerce Cloud',
    'Marketing Cloud',
    'Reports & Analytics',
    'Experience Cloud',
    'Platform & Security',
    'Automations & Flows',
    'Integrations & Data Cloud',
    'Omnistudio & Vlocity',
    'Open-Source & Custom Apps',
    'End-to-End'
  ];

  const filteredTemplates = SALESFORCE_STANDARD_TEMPLATES.filter((t) => {
    const matchCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchQuery =
      !searchQuery ||
      t.testName.toLowerCase().includes(q) ||
      t.ticketNumber.toLowerCase().includes(q) ||
      t.objectName.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.toLowerCase().includes(q));
    return matchCategory && matchQuery;
  });

  const handleImportSingle = async (tmpl: SalesforceTestTemplate) => {
    setIsImporting(true);
    try {
      await onImportToSuite(tmpl);
      setImportedIds((prev) => [...prev, tmpl.id]);
    } finally {
      setIsImporting(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Sales Cloud':
        return <TrendingUp className="h-4 w-4 text-primary" />;
      case 'CPQ & Billing':
        return <Calculator className="h-4 w-4 text-warning" />;
      case 'Service Cloud':
        return <Headphones className="h-4 w-4 text-teal-600" />;
      case 'Field Service (SFS)':
        return <Wrench className="h-4 w-4 text-orange-600" />;
      case 'Knowledge & Service':
        return <BookOpen className="h-4 w-4 text-violet-600" />;
      case 'Financial Services (FSC)':
        return <Briefcase className="h-4 w-4 text-success" />;
      case 'Health Cloud':
        return <HeartPulse className="h-4 w-4 text-danger" />;
      case 'Agentforce & AI':
        return <Bot className="h-4 w-4 text-indigo-600" />;
      case 'Commerce Cloud':
        return <ShoppingCart className="h-4 w-4 text-cyan-600" />;
      case 'Marketing Cloud':
        return <Megaphone className="h-4 w-4 text-fuchsia-600" />;
      case 'Reports & Analytics':
        return <BarChart3 className="h-4 w-4 text-sky-600" />;
      case 'Experience Cloud':
        return <Globe className="h-4 w-4 text-primary" />;
      case 'Platform & Security':
        return <ShieldCheck className="h-4 w-4 text-success" />;
      case 'Automations & Flows':
        return <Zap className="h-4 w-4 text-warning" />;
      case 'Integrations & Data Cloud':
        return <Database className="h-4 w-4 text-purple-600" />;
      case 'Omnistudio & Vlocity':
        return <Workflow className="h-4 w-4 text-teal-700" />;
      case 'Open-Source & Custom Apps':
        return <Boxes className="h-4 w-4 text-success" />;
      case 'End-to-End':
        return <Layers className="h-4 w-4 text-indigo-600" />;
      default:
        return <Sparkles className="h-4 w-4 text-primary" />;
    }
  };

  const getComplexityBadge = (complexity: string) => {
    switch (complexity) {
      case 'Smoke':
        return 'bg-success-soft text-success border-emerald-200';
      case 'Functional':
        return 'bg-primary-soft text-primary-hover border-blue-200';
      case 'Regression':
        return 'bg-warning-soft text-warning border-amber-200';
      case 'End-to-End':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-border';
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      size="2xl"
      flush
      title={
        <span className="flex flex-wrap items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden="true" />
          Standard Salesforce Test Library
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-soft text-primary-hover border border-blue-200">
            {SALESFORCE_STANDARD_TEMPLATES.length} templates{fitCount !== null ? ` · ${fitCount} fit your org` : ''}
          </span>
        </span>
      }
    >
        {/* Import All: dry run, then Skip/Replace */}
        {onImportAllToSuite && (
          <div className="border-b border-border px-6 py-2 flex flex-wrap items-center gap-2 text-xs">
            {!importPlan ? (
              <>
                <span className="text-muted">Pre-built test specifications from Salesforce documentation and QA practice. Check a template's steps against your org before relying on it.</span>
                <button type="button" onClick={planImportAll} className={btn.secondary + ' !h-7 ml-auto'}>
                  <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" /> Import all…
                </button>
                {planError && <span className="text-danger w-full">{planError}</span>}
              </>
            ) : (
              <>
                <strong className="text-slate-900">
                  Add {importPlan.add.length} · {importPlan.exist.length} exist
                </strong>
                {importPlan.exist.length > 0 && (
                  <div className="inline-flex rounded-md border border-slate-300 overflow-hidden" role="group" aria-label="Tests that already exist">
                    {(['skip', 'replace'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-pressed={importMode === m}
                        onClick={() => setImportMode(m)}
                        className={`px-2.5 py-1 capitalize cursor-pointer ${importMode === m ? 'bg-primary text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
                <span className="text-muted">
                  {importPlan.exist.length > 0
                    ? importMode === 'skip'
                      ? 'Existing tests are left as they are.'
                      : 'Existing tests are overwritten (Undo restores them).'
                    : 'Nothing will be overwritten.'}
                </span>
                <span className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setImportPlan(null)} className={btn.ghost + ' !h-7'}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isImporting || (importPlan.add.length === 0 && importMode === 'skip')}
                    onClick={confirmImportAll}
                    className={btn.primary + ' !h-7'}
                  >
                    {importMode === 'replace' ? `Import ${importPlan.add.length + importPlan.exist.length}` : `Import ${importPlan.add.length}`}
                  </button>
                </span>
              </>
            )}
          </div>
        )}

        {/* Search & Category Filter Bar */}
        <div className="bg-slate-50/80 border-b border-border px-6 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none text-xs">
            {categories.map((cat) => {
              const count =
                cat === 'All'
                  ? SALESFORCE_STANDARD_TEMPLATES.length
                  : SALESFORCE_STANDARD_TEMPLATES.filter((t) => t.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 ${
                    selectedCategory === cat
                      ? 'bg-white text-primary-hover font-semibold shadow-2xs border border-border'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {cat !== 'All' && <span className="flex-shrink-0 scale-90">{getCategoryIcon(cat)}</span>}
                  <span>{cat}</span>
                  <span className="text-xs px-1.5 py-0.2 rounded-full bg-slate-100 text-muted font-mono">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search templates, objects, tags..."
              aria-label="Search templates"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-2xs"
            />
          </div>
        </div>

        {/* Master-Detail Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 overflow-hidden">
          {/* Left: Template List (5 cols) */}
          <div className="md:col-span-5 flex flex-col overflow-y-auto divide-y divide-slate-100 max-h-[550px]">
            {filteredTemplates.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Search className="h-8 w-8 mx-auto mb-2 text-slate-300 stroke-1" />
                <p className="text-xs font-semibold text-slate-600">No matching templates found</p>
                <p className="text-xs text-slate-400 mt-1">Try clearing your search query or switching categories.</p>
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                const isImported = importedIds.includes(template.id);
                return (
                  <div
                    key={template.id}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedTemplate(template);
                      }
                    }}
                    onClick={() => setSelectedTemplate(template)}
                    className={`p-3.5 cursor-pointer transition flex items-start justify-between gap-3 text-left ${
                      isSelected
                        ? 'bg-primary-soft/70 border-l-4 border-l-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-muted bg-white px-1.5 py-0.5 rounded border border-border">
                          {template.ticketNumber}
                        </span>
                        <span className="text-xs font-mono text-primary-hover font-semibold bg-blue-100/60 px-1.5 py-0.2 rounded">
                          {template.objectName}
                        </span>
                        <FitBadge objectName={template.objectName} orgObjects={orgObjectSet} />
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 leading-snug truncate" title={template.testName}>
                        {template.testName}
                      </h4>

                      <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0 pt-1">
                      {isImported ? (
                        <span className="h-5 w-5 rounded-full bg-emerald-100 text-success flex items-center justify-center text-xs" aria-label="Added to suite">
                          <Check className="h-3 w-3" aria-hidden="true" />
                        </span>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Template Detail & Action Panel (7 cols) */}
          {selectedTemplate ? (
            <div className="md:col-span-7 flex flex-col p-6 overflow-y-auto space-y-4 max-h-[550px] bg-slate-50/40">
              {/* Template Top Info */}
              <div className="space-y-2 pb-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-primary-hover bg-primary-soft px-2 py-0.5 rounded border border-blue-200">
                      {selectedTemplate.ticketNumber}
                    </span>
                    <span className="text-xs font-semibold text-muted">
                      Target Object: <strong className="text-slate-900 font-mono">{selectedTemplate.objectName}</strong>
                    </span>
                    <FitBadge objectName={selectedTemplate.objectName} orgObjects={orgObjectSet} />
                  </div>

                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getComplexityBadge(
                      selectedTemplate.complexity
                    )}`}
                  >
                    {selectedTemplate.complexity} Test
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900">
                  {selectedTemplate.testName}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedTemplate.description}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedTemplate.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-white text-slate-600 border border-border px-2 py-0.5 rounded-full font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Step Sequence Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sliders className="h-3.5 w-3.5 text-primary" />
                    <span>Manual Test Steps (Customizable)</span>
                  </label>
                  <span className="text-xs text-slate-400">
                    {selectedTemplate.steps.split('\n').filter(Boolean).length} Action Steps
                  </span>
                </div>

                <div className="bg-white border border-border rounded-lg p-3.5 font-mono text-xs text-slate-800 space-y-1 leading-relaxed max-h-56 overflow-y-auto shadow-2xs">
                  {selectedTemplate.steps.split('\n').map((step, idx) => (
                    <div key={idx} className="flex items-start space-x-2">
                      <span className="text-slate-400 select-none text-xs">{idx + 1}.</span>
                      <span className="text-slate-800">{step.replace(/^\d+[\.\)]\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customization Guidance Callout */}
              {selectedTemplate.customizationTips && selectedTemplate.customizationTips.length > 0 && (
                <div className="bg-success-soft/70 border border-emerald-200 rounded-lg p-3.5 space-y-1.5">
                  <div className="flex items-center space-x-1.5 text-emerald-800 font-semibold text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-success" />
                    <span>How to Customize for Your Salesforce Org:</span>
                  </div>
                  <ul className="text-xs text-emerald-900 space-y-1 list-disc list-inside">
                    {selectedTemplate.customizationTips.map((tip, idx) => (
                      <li key={idx} className="leading-relaxed">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => handleImportSingle(selectedTemplate)}
                  disabled={isImporting || importedIds.includes(selectedTemplate.id)}
                  className={`w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs ${
                    importedIds.includes(selectedTemplate.id)
                      ? 'bg-success-soft text-success border-emerald-200'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  {importedIds.includes(selectedTemplate.id) ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success" />
                      <span>Added to Test Suite</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-3.5 w-3.5 text-muted" />
                      <span>Add to Test Suite</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSelectTemplate(selectedTemplate);
                    onClose();
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  <span>Load in Editor & Customize</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="md:col-span-7 flex flex-col items-center justify-center text-center p-12 text-slate-400">
              <BookOpen className="h-10 w-10 text-slate-300 stroke-1 mb-2" />
              <p className="text-sm font-semibold text-slate-600">Select a template to preview</p>
              <p className="text-xs text-slate-400">Browse standard test cases on the left to inspect steps and customization guidelines.</p>
            </div>
          )}
        </div>
    </Modal>
  );
};
