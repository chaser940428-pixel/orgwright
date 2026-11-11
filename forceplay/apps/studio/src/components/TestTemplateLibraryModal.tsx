import React, { useState } from 'react';
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
  onImportAllToSuite?: () => Promise<void>;
}

export const TestTemplateLibraryModal: React.FC<TestTemplateLibraryModalProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  onImportToSuite,
  onImportAllToSuite
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedTemplate, setSelectedTemplate] = useState<SalesforceTestTemplate>(
    SALESFORCE_STANDARD_TEMPLATES[0]
  );
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);

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
        return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'CPQ & Billing':
        return <Calculator className="h-4 w-4 text-amber-600" />;
      case 'Service Cloud':
        return <Headphones className="h-4 w-4 text-teal-600" />;
      case 'Field Service (SFS)':
        return <Wrench className="h-4 w-4 text-orange-600" />;
      case 'Knowledge & Service':
        return <BookOpen className="h-4 w-4 text-violet-600" />;
      case 'Financial Services (FSC)':
        return <Briefcase className="h-4 w-4 text-emerald-600" />;
      case 'Health Cloud':
        return <HeartPulse className="h-4 w-4 text-rose-600" />;
      case 'Agentforce & AI':
        return <Bot className="h-4 w-4 text-indigo-600" />;
      case 'Commerce Cloud':
        return <ShoppingCart className="h-4 w-4 text-cyan-600" />;
      case 'Marketing Cloud':
        return <Megaphone className="h-4 w-4 text-fuchsia-600" />;
      case 'Reports & Analytics':
        return <BarChart3 className="h-4 w-4 text-sky-600" />;
      case 'Experience Cloud':
        return <Globe className="h-4 w-4 text-blue-600" />;
      case 'Platform & Security':
        return <ShieldCheck className="h-4 w-4 text-emerald-600" />;
      case 'Automations & Flows':
        return <Zap className="h-4 w-4 text-amber-600" />;
      case 'Integrations & Data Cloud':
        return <Database className="h-4 w-4 text-purple-600" />;
      case 'Omnistudio & Vlocity':
        return <Workflow className="h-4 w-4 text-teal-700" />;
      case 'Open-Source & Custom Apps':
        return <Boxes className="h-4 w-4 text-emerald-600" />;
      case 'End-to-End':
        return <Layers className="h-4 w-4 text-indigo-600" />;
      default:
        return <Sparkles className="h-4 w-4 text-blue-600" />;
    }
  };

  const getComplexityBadge = (complexity: string) => {
    switch (complexity) {
      case 'Smoke':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Functional':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Regression':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'End-to-End':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-6xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-900 text-base">Standard Salesforce Test Library</h3>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {SALESFORCE_STANDARD_TEMPLATES.length} Verified Templates
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Pre-built test specifications curated from enterprise QA repositories, Salesforce documentation, and best practices.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {onImportAllToSuite && (
              <button
                type="button"
                onClick={onImportAllToSuite}
                className="hidden sm:flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition cursor-pointer shadow-2xs"
                title="Add all templates into your active test suite catalog"
              >
                <PlusCircle className="h-3.5 w-3.5" />
                <span>Import All to Suite</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="bg-slate-50/80 border-b border-slate-200 px-6 py-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
                      ? 'bg-white text-blue-700 font-semibold shadow-2xs border border-slate-200'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {cat !== 'All' && <span className="flex-shrink-0 scale-90">{getCategoryIcon(cat)}</span>}
                  <span>{cat}</span>
                  <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-500 font-mono">
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
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
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
                <p className="text-[11px] text-slate-400 mt-1">Try clearing your search query or switching categories.</p>
              </div>
            ) : (
              filteredTemplates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                const isImported = importedIds.includes(template.id);
                return (
                  <div
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`p-3.5 cursor-pointer transition flex items-start justify-between gap-3 text-left ${
                      isSelected
                        ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                        : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                          {template.ticketNumber}
                        </span>
                        <span className="text-[11px] font-mono text-blue-700 font-semibold bg-blue-100/60 px-1.5 py-0.2 rounded">
                          {template.objectName}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-full border ${getComplexityBadge(
                            template.complexity
                          )}`}
                        >
                          {template.complexity}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 leading-snug truncate" title={template.testName}>
                        {template.testName}
                      </h4>

                      <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    </div>

                    <div className="flex items-center space-x-1 flex-shrink-0 pt-1">
                      {isImported ? (
                        <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[11px]">
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
              <div className="space-y-2 pb-3 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {selectedTemplate.ticketNumber}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      Target Object: <strong className="text-slate-900 font-mono">{selectedTemplate.objectName}</strong>
                    </span>
                  </div>

                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getComplexityBadge(
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
                    <span key={tag} className="text-[11px] bg-white text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Step Sequence Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                    <Sliders className="h-3.5 w-3.5 text-blue-600" />
                    <span>Manual Test Steps (Customizable)</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {selectedTemplate.steps.split('\n').filter(Boolean).length} Action Steps
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3.5 font-mono text-xs text-slate-800 space-y-1 leading-relaxed max-h-56 overflow-y-auto shadow-2xs">
                  {selectedTemplate.steps.split('\n').map((step, idx) => (
                    <div key={idx} className="flex items-start space-x-2">
                      <span className="text-slate-400 select-none text-[11px]">{idx + 1}.</span>
                      <span className="text-slate-800">{step.replace(/^\d+[\.\)]\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customization Guidance Callout */}
              {selectedTemplate.customizationTips && selectedTemplate.customizationTips.length > 0 && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-3.5 space-y-1.5">
                  <div className="flex items-center space-x-1.5 text-emerald-800 font-semibold text-xs">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    <span>How to Customize for Your Salesforce Org:</span>
                  </div>
                  <ul className="text-[11px] text-emerald-900 space-y-1 list-disc list-inside">
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
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                  }`}
                >
                  {importedIds.includes(selectedTemplate.id) ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Added to Test Suite</span>
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-3.5 w-3.5 text-slate-500" />
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
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
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
      </div>
    </div>
  );
};
