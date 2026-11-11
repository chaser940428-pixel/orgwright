import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  Code2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Terminal,
  FileCode,
  Layers,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  Save,
  CloudLightning,
  UserCheck,
  ShieldCheck,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  Monitor,
  Globe,
  Lock,
  Maximize2,
  Plus,
  Trash2,
  FolderOpen,
  Filter,
  CheckSquare,
  Square,
  PlayCircle,
  Search,
  FolderGit2,
  ListFilter,
  Disc,
  MousePointerClick,
  ArrowDown,
  ArrowUp,
  Keyboard,
  CornerDownLeft,
  X,
  HelpCircle,
  Wrench,
  AlertTriangle,
  ChevronDown,
  Users,
  FileText,
  Activity,
  Flame,
  Zap,
  Database,
  Award,
  Cloud,
  BookOpen,
  FileSpreadsheet,
  UploadCloud,
  Download,
  FileCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { QASkillsHub } from './components/QASkillsHub';
import { OrgConnectorModal } from './components/OrgConnectorModal';
import { TestTemplateLibraryModal } from './components/TestTemplateLibraryModal';
import { StepEditor, StepCheckSummary } from './components/StepEditor';
import { SuitePanel, SuiteRunSummary, HistorySummary } from './components/SuitePanel';
import { NightlyModal } from './components/NightlyModal';
import { RepairPanel, RepairState } from './components/RepairPanel';
import { DataRowsPanel } from './components/DataRowsPanel';
import { OnboardingWizard, WizardResult } from './components/OnboardingWizard';
import { ResultsPanel } from './components/ResultsPanel';
import { SalesforceTestTemplate } from './data/salesforce-templates';

import type { FailureAnalysis, ResolvedStep, SalesforceTriggerEvent, SalesforceFlowEvent, SalesforceValidationEvent, SalesforceDmlEvent, SalesforceCalloutEvent, SalesforceLimitSummary, StepBackendActivity, ParsedApexLog, FullExecutionLogReport, OrgUser, MatrixResultItem, MatrixSummary } from './types/results';
export type { SalesforceTriggerEvent, SalesforceFlowEvent, SalesforceValidationEvent, SalesforceDmlEvent, SalesforceCalloutEvent, SalesforceLimitSummary, StepBackendActivity, ParsedApexLog, FullExecutionLogReport, OrgUser, MatrixResultItem, MatrixSummary } from './types/results';

interface OrgInfo {
  alias: string;
  username: string;
  instanceUrl: string;
  name: string;
  isSandbox: boolean;
  status: string;
}

interface OrgStatus {
  connected: boolean;
  alias: string;
  username: string;
  instanceUrl: string;
  status: string;
}

interface TestCaseItem {
  id: string;
  ticketNumber: string;
  testName: string;
  project: string;
  objectName: string;
  scenarioType?: 'positive' | 'negative';
  steps: string;
  stepCount: number;
  specCode?: string;
  hasSpec: boolean;
  lastStatus?: 'passed' | 'failed' | 'idle';
  lastDurationMs?: number;
  lastRunAt?: string;
  updatedAt: string;
  tags?: string[];
  priority?: 'High' | 'Medium' | 'Low';
  owner?: string;
  dataRows?: Array<Record<string, string>>;
  dataRowCount?: number;
  codeEdited?: boolean;
  history?: HistorySummary;
}

export default function App() {
  // Connected Orgs & Objects state
  const [orgList, setOrgList] = useState<OrgInfo[]>([]);
  // Empty until /api/org/list answers, so nothing is loaded from an org the user did not pick
  const [selectedOrg, setSelectedOrg] = useState('');
  const [orgStatus, setOrgStatus] = useState<OrgStatus | null>(null);
  const [isConnectingOrg, setIsConnectingOrg] = useState(false);
  const [showOrgConnectorModal, setShowOrgConnectorModal] = useState(false);
  const [showTemplateLibraryModal, setShowTemplateLibraryModal] = useState(false);

  // SObjects dynamic list
  const [customObjects, setCustomObjects] = useState<string[]>([]);
  const [standardObjects, setStandardObjects] = useState<string[]>([
    'Account', 'Contact', 'Opportunity', 'Lead', 'Case', 'Task', 'Event', 'Campaign', 'User'
  ]);
  const [isLoadingObjects, setIsLoadingObjects] = useState(false);

  // Test Definition metadata
  const [ticketNumber, setTicketNumber] = useState('CRM-101');
  const [testId, setTestId] = useState('TC_001');
  const [projectName, setProjectName] = useState('Sales Cloud');
  const [testName, setTestName] = useState('Create New Account with Industry and Billing Address');
  const [objectContext, setObjectContext] = useState('Account');
  const [scenarioType, setScenarioType] = useState<'positive' | 'negative'>('positive');
  const [manualSteps, setManualSteps] = useState(
`1. Log in to Salesforce
2. Navigate to Account tab
3. Click on New button
4. Enter "Acme Corporation" in Account Name
5. Select "Technology" from Industry picklist
6. Enter "100 Market St, San Francisco" in Billing Address
7. Click on Save button
8. Verify toast "Account was created"
9. Verify field "Account Name" equals "Acme Corporation"`
  );

  // Execution options
  const [headed, setHeaded] = useState(true);
  const [selectedBrowser, setSelectedBrowser] = useState<'chrome' | 'msedge' | 'chromium'>('chrome');
  const [activeTab, setActiveTab] = useState<'suite' | 'plan' | 'code' | 'browser' | 'terminal' | 'logs' | 'qa-hub'>('suite');

  // Execution & Salesforce Backend Logs state
  const [executionLogReport, setExecutionLogReport] = useState<FullExecutionLogReport | null>(null);
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState<string>('');
  const [logCategoryFilter, setLogCategoryFilter] = useState<'all' | 'clicks' | 'automations' | 'validations' | 'errors'>('all');
  const [showRawApexLogModal, setShowRawApexLogModal] = useState<boolean>(false);
  const [selectedRawLogIndex, setSelectedRawLogIndex] = useState<number>(0);
  const [copiedRawLog, setCopiedRawLog] = useState<boolean>(false);

  // Live Interactive Recorder state
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecorder, setIsStartingRecorder] = useState(false);
  const [recordedStepsCount, setRecordedStepsCount] = useState(0);

  // Live Browser Viewport Streaming states
  const [liveFrame, setLiveFrame] = useState<string | null>(null);
  const [liveUrl, setLiveUrl] = useState<string>('https://login.salesforce.com');
  const [liveStep, setLiveStep] = useState<string>('');
  const [quickTypeText, setQuickTypeText] = useState('');

  // Async states
  const [isResolving, setIsResolving] = useState(false);

  // Tester mode hides developer-only tabs/buttons; preference kept per browser
  const [uiMode, setUiMode] = useState<'tester' | 'developer'>(() => {
    try {
      return localStorage.getItem('orgwright.uiMode') === 'developer' ? 'developer' : 'tester';
    } catch {
      return 'tester';
    }
  });
  const isTesterMode = uiMode === 'tester';
  const [stepCheckSummary, setStepCheckSummary] = useState<StepCheckSummary>({ total: 0, ok: 0, warnings: 0, errors: 0 });

  // Suite organisation, data-driven rows and failure repair
  const [tagsText, setTagsText] = useState('');
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [owner, setOwner] = useState('');
  const [dataRows, setDataRows] = useState<Array<Record<string, string>>>([]);
  const [pauseOnFailure, setPauseOnFailure] = useState(true);
  const [repair, setRepair] = useState<RepairState | null>(null);
  const repairRef = useRef<RepairState | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [lastSuiteSummary, setLastSuiteSummary] = useState<SuiteRunSummary | null>(null);
  const [showNightly, setShowNightly] = useState(false);
  const [showWizard, setShowWizard] = useState(() => {
    try {
      return localStorage.getItem('orgwright.onboarded') !== '1';
    } catch {
      return false;
    }
  });
  const tagList = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
  const dataColumns = dataRows.length ? Object.keys(dataRows[0]) : [];
  const [zoomedScreenshot, setZoomedScreenshot] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [pausedStepIndex, setPausedStepIndex] = useState<number | null>(null);
  const [pausedStepText, setPausedStepText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Data states
  const [resolvedSteps, setResolvedSteps] = useState<ResolvedStep[]>([]);
  const [generatedCode, setGeneratedCode] = useState('');
  const [pristineGeneratedCode, setPristineGeneratedCode] = useState('');
  const [isCodeEdited, setIsCodeEdited] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'passed' | 'failed' | 'interrupted'>('idle');
  const [runDuration, setRunDuration] = useState<number | null>(null);

  // Failure Analysis Modal State
  const [showFailureModal, setShowFailureModal] = useState<boolean>(false);
  const [failureAnalysis, setFailureAnalysis] = useState<FailureAnalysis | null>(null);
  const [showTechDetails, setShowTechDetails] = useState<boolean>(false);
  const [showFailureScreenshot, setShowFailureScreenshot] = useState<boolean>(true);

  // Saved Test Cases Catalog & Regression state
  const [testCases, setTestCases] = useState<TestCaseItem[]>([]);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>(['TC_002']);
  const [projectFilter, setProjectFilter] = useState<string>('all');

  // Excel Import / Export & Jira Test Proof State
  const [showExcelImportModal, setShowExcelImportModal] = useState<boolean>(false);
  const [importedScenariosPreview, setImportedScenariosPreview] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isImportingExcel, setIsImportingExcel] = useState<boolean>(false);
  const [excelImportError, setExcelImportError] = useState<string | null>(null);
  const [excelImportSuccess, setExcelImportSuccess] = useState<string | null>(null);
  const [jiraProofDownloaded, setJiraProofDownloaded] = useState<boolean>(false);
  const [availableJiraProofTestId, setAvailableJiraProofTestId] = useState<string | null>(null);

  // Persona & User Management
  const defaultAdminUser: OrgUser = {
    id: 'admin',
    name: 'Current Admin',
    username: '',
    email: '',
    profileName: 'System Administrator',
    roleName: 'System Admin',
    isDefault: true
  };
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([defaultAdminUser]);
  const [selectedPersona, setSelectedPersona] = useState<OrgUser>(defaultAdminUser);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [personaSearchQuery, setPersonaSearchQuery] = useState('');
  const [selectedProfileFilter, setSelectedProfileFilter] = useState('All');
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Multi-User Persona Matrix Execution State
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [selectedMatrixUserIds, setSelectedMatrixUserIds] = useState<string[]>(['admin', '005UP00000BWXFdYAP', '005UP00000EwJa5YAF']);
  const [isMatrixRunning, setIsMatrixRunning] = useState(false);
  const [matrixResults, setMatrixResults] = useState<MatrixResultItem[]>([]);
  const [matrixSummary, setMatrixSummary] = useState<MatrixSummary | null>(null);
  const [currentMatrixPersona, setCurrentMatrixPersona] = useState<OrgUser | null>(null);
  const [matrixProgressIndex, setMatrixProgressIndex] = useState(0);
  const [copiedMatrixReport, setCopiedMatrixReport] = useState(false);
  const personaDropdownRef = useRef<HTMLDivElement>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const liveImgRef = useRef<HTMLImageElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const formMetaRef = useRef({
    ticketNumber,
    testId,
    testName,
    projectName,
    objectContext,
    scenarioType
  });

  useEffect(() => {
    formMetaRef.current = {
      ticketNumber,
      testId,
      testName,
      projectName,
      objectContext,
      scenarioType
    };
  }, [ticketNumber, testId, testName, projectName, objectContext, scenarioType]);

  useEffect(() => {
    try {
      localStorage.setItem('orgwright.uiMode', uiMode);
    } catch {}
  }, [uiMode]);

  useEffect(() => {
    repairRef.current = repair;
  }, [repair]);

  // Developer-only tabs are hidden in Tester mode; fall back to a visible tab
  useEffect(() => {
    if (isTesterMode && ['plan', 'code', 'terminal', 'qa-hub'].includes(activeTab)) {
      setActiveTab(runStatus === 'running' ? 'browser' : 'suite');
    }
  }, [isTesterMode, activeTab, runStatus]);

  // Fetch Saved Test Cases
  const fetchTestCases = async () => {
    try {
      const res = await fetch('/api/testcases');
      const data = await res.json();
      if (data.success && data.testCases) {
        setTestCases(data.testCases);
      }
    } catch (err) {
      console.error('Failed to fetch test cases:', err);
    }
  };

  // Real-time auto spec generation from recorded steps
  const triggerRealtimeSpecGen = async (updatedSteps: string) => {
    const meta = formMetaRef.current;
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber: meta.ticketNumber,
          testId: meta.testId,
          testName: meta.testName,
          project: meta.projectName,
          objectName: meta.objectContext,
          targetOrg: selectedOrg,
          dataRows,
          steps: updatedSteps
        })
      });
      const data = await res.json();
      if (data.specCode) {
        setGeneratedCode(data.specCode);
        setPristineGeneratedCode(data.specCode);
        if (data.resolvedSteps) setResolvedSteps(data.resolvedSteps);
      }
    } catch (err) {
      console.error('Auto spec generation error:', err);
    }
  };

  // Fetch SObjects for an org
  const fetchObjects = async (alias: string, refresh = false) => {
    setIsLoadingObjects(true);
    try {
      const res = await fetch(`/api/org/objects?alias=${encodeURIComponent(alias)}${refresh ? '&refresh=true' : ''}`);
      const data = await res.json();
      if (data.success) {
        if (data.custom && data.custom.length > 0) setCustomObjects(data.custom);
        if (data.standard && data.standard.length > 0) setStandardObjects(data.standard);
        if (data.objects && data.objects.includes(objectContext)) {
          // keep context
        } else if (data.standard && data.standard.includes('Account')) {
          setObjectContext('Account');
        } else if (data.objects && data.objects.length > 0) {
          setObjectContext(data.objects[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch org objects:', err);
    } finally {
      setIsLoadingObjects(false);
    }
  };

  // Fetch Org Status
  const fetchOrgStatus = async (alias: string) => {
    setIsConnectingOrg(true);
    try {
      const res = await fetch(`/api/org/status?alias=${encodeURIComponent(alias)}`);
      const data = await res.json();
      setOrgStatus(data);
      if (data?.instanceUrl) {
        setLiveUrl(data.instanceUrl);
      }
    } catch {
      // ignore
    } finally {
      setIsConnectingOrg(false);
    }
  };

  // Fetch Org Users for Persona selection
  const fetchOrgUsers = async (alias: string, force = false) => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`/api/org/users?alias=${encodeURIComponent(alias)}${force ? '&refresh=true' : ''}`);
      const data = await res.json();
      if (data.users && Array.isArray(data.users)) {
        setOrgUsers(data.users);
        if (!selectedPersona || selectedPersona.id === 'admin') {
          setSelectedPersona(data.users[0]);
        }
      }
    } catch (e) {
      console.error('Failed to load org users', e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // Close persona dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (personaDropdownRef.current && !personaDropdownRef.current.contains(e.target as Node)) {
        setShowPersonaDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial Data Load & Persistent WebSocket
  useEffect(() => {
    // 1. Fetch available orgs
    fetch('/api/org/list')
      .then((res) => res.json())
      .then((data) => {
        if (data.orgs && data.orgs.length > 0) {
          setOrgList(data.orgs);
          // The server picks the default (ORGWRIGHT_DEFAULT_ORG / SF_ORG_ALIAS); fall back to the first org
          const defaultAlias = data.orgs.some((o: OrgInfo) => o.alias === data.defaultAlias) ? data.defaultAlias : data.orgs[0].alias;
          setSelectedOrg(defaultAlias);
          fetchOrgStatus(defaultAlias);
          fetchObjects(defaultAlias, false);
          fetchOrgUsers(defaultAlias, false);
        }
      })
      .catch(() => {
        // No org list: leave the org unselected rather than guessing an alias
      });

    // 2. Fetch saved test cases
    fetchTestCases();

    // 2.5 Fetch recent execution & backend logs
    fetch('/api/test-results/execution-logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.report) setExecutionLogReport(data.report);
      })
      .catch(() => {});

    // 3. Persistent WebSocket with Auto-Reconnect
    let ws: WebSocket | null = null;
    let isMounted = true;
    let reconnectTimer: any = null;

    function connectWs() {
      if (!isMounted) return;
      const wsHost = window.location.hostname || 'localhost';
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // Primary: connect via window.location.host so other laptops on the network connect over port 5173 via Vite proxy
      const proxyWsUrl = `${protocol}//${window.location.host}/ws`;
      const directWsUrl = `${protocol}//${wsHost}:3001/ws`;

      try {
        ws = new WebSocket(proxyWsUrl);
      } catch {
        ws = new WebSocket(directWsUrl);
      }
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'stream_frame') {
            if (payload.frame) setLiveFrame(payload.frame);
            if (payload.url) setLiveUrl(payload.url);
            if (payload.step) setLiveStep(payload.step);
          } else if (payload.type === 'stream_step') {
            if (payload.step) setLiveStep(payload.step);
            if (payload.url) setLiveUrl(payload.url);
          } else if (payload.type === 'step_failed_paused') {
            // A step failed in a headed Studio run: the test is paused and waiting for a repair decision
            const next: RepairState = {
              stepIndex: payload.stepIndex,
              step: payload.step,
              error: payload.error || 'The step failed.'
            };
            repairRef.current = next;
            setRepair(next);
            setRepairBusy(false);
            setIsPaused(true);
            setPausedStepIndex(payload.stepIndex);
            setActiveTab('browser');
            setLiveStep(`Paused on failed step ${payload.stepIndex}: ${payload.step}`);
          } else if (payload.type === 'step_repaired') {
            const n = payload.stepIndex as number;
            const replacement = String(payload.step || '').replace(/^\s*\d+[.)]\s*/, '');
            // Rewrite step N in the editor with what actually worked
            setManualSteps((prev) => {
              const lines = prev.split('\n');
              let seen = 0;
              for (let i = 0; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                seen++;
                if (seen === n) {
                  const prefix = lines[i].match(/^\s*\d+[.)]\s*/)?.[0] || '';
                  if (!/^\s*(?:use|run|include|insert)\s+(?:the\s+)?block\b/i.test(lines[i].replace(prefix, ''))) {
                    lines[i] = prefix + replacement;
                  }
                  break;
                }
              }
              return lines.join('\n');
            });
            repairRef.current = null;
            setRepair(null);
            setRepairBusy(false);
            setIsPaused(false);
            setLogs((prev) => [...prev, `\n[Orgwright Studio] Step ${n} repaired: ${replacement}\n`]);
          } else if (payload.type === 'recorded_step' && repairRef.current) {
            // While repairing, a click in the Live Browser becomes the candidate replacement step
            const captured = payload.rawStep || String(payload.step || '').replace(/^\d+\.\s*/, '');
            const next = { ...(repairRef.current as RepairState), capturedStep: captured };
            repairRef.current = next;
            setRepair(next);
          } else if (payload.type === 'recorded_step') {
            // LIVE INTERACTION RECORDED EVENT!
            console.log('[studio] Received recorded step:', payload.step);
            if (payload.allSteps && Array.isArray(payload.allSteps)) {
              const joined = payload.allSteps.join('\n');
              setManualSteps(joined);
              triggerRealtimeSpecGen(joined);
              setRecordedStepsCount(Math.max(0, payload.allSteps.length - 2));
            } else {
              setManualSteps((prev) => {
                const existingLines = prev.split('\n').filter((s) => s.trim().length > 0);
                const cleanText = payload.rawStep || payload.step.replace(/^\d+\.\s*/, '');
                let updatedLines: string[];
                if (payload.isPausedInteraction && pausedStepIndex !== null && pausedStepIndex >= 0 && pausedStepIndex <= existingLines.length) {
                  existingLines.splice(pausedStepIndex, 0, cleanText);
                  updatedLines = existingLines.map((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, '')}`);
                  setPausedStepIndex((prevIdx) => (prevIdx !== null ? prevIdx + 1 : null));
                } else {
                  const stepNum = existingLines.length + 1;
                  updatedLines = [...existingLines, `${stepNum}. ${cleanText}`];
                }
                const updated = updatedLines.join('\n');
                triggerRealtimeSpecGen(updated);
                return updated;
              });
              setRecordedStepsCount((prev) => prev + 1);
            }
            setLiveStep(`Recorded: ${payload.step}`);
          } else if (payload.type === 'execution_paused') {
            setIsPaused(true);
            if (payload.step) setPausedStepText(payload.step);
            if (payload.stepIndex !== undefined) setPausedStepIndex(payload.stepIndex);
            setLiveStep(`Paused at: ${payload.step || 'Current Step'} (Interactive Mode)`);
            setLogs((prev) => [
              ...prev,
              `\n[Orgwright Studio] Live test paused at: ${payload.step || 'Current Step'}. Screen is interactive. Enter values, click elements, or add steps, then click Resume.\n`
            ]);
          } else if (payload.type === 'execution_resumed') {
            setIsPaused(false);
            setLiveStep('▶ Resuming test execution...');
            setLogs((prev) => [...prev, `\n▶ [Orgwright Studio] Resuming test execution...\n`]);
          } else if (payload.type === 'recorder_started') {
            setIsRecording(true);
            setActiveTab('browser');
            setLiveStep('Interactive Recorder active. Click elements in browser to auto-create steps...');
          } else if (payload.type === 'recorder_stopped') {
            setIsRecording(false);
            setLiveStep('Recording finished.');
          } else if (payload.type === 'ORG_AUTH_COMPLETED') {
            fetch('/api/org/list')
              .then((r) => r.json())
              .then((d) => {
                if (d.orgs) setOrgList(d.orgs);
              })
              .catch(() => {});
            if (payload.status === 'authorized' && payload.alias) {
              handleSwitchOrg(payload.alias);
            }
          } else if (payload.type === 'log') {
            setLogs((prev) => [...prev, payload.line]);
          } else if (payload.type === 'start') {
            const browserName = payload.browser === 'msedge' ? 'Microsoft Edge' : payload.browser === 'chromium' ? 'Chromium' : 'Google Chrome';
            setRunStatus('running');
            setIsPaused(false);
            setPausedStepIndex(null);
            setPausedStepText(null);
            setLogs((prev) => [
              ...prev,
              `\n[Orgwright Engine] Launching ${browserName} session for ${payload.testId}...\n`,
              `Live Browser Viewport streaming active in studio window...\n`
            ]);
          } else if (payload.type === 'stopped') {
            setIsRunning(false);
            setIsBatchRunning(false);
            setIsStopping(false);
            setIsPaused(false);
            setPausedStepIndex(null);
            setPausedStepText(null);
            setRunStatus('interrupted');
            setLiveStep('Automation execution stopped by user.');
            setLogs((prev) => [...prev, '\n[Orgwright Studio] Automation execution stopped by user.\n']);
          } else if (payload.type === 'finished') {
            setRunStatus(payload.report.status);
            setRunDuration(payload.report.durationMs);
            setIsRunning(false);
            setIsBatchRunning(false);
            setIsPaused(false);
            setPausedStepIndex(null);
            setPausedStepText(null);
            repairRef.current = null;
            setRepair(null);
            setAvailableJiraProofTestId(payload.testId || testId);
            fetchTestCases();

            // Batch / tag runs report one result per test in the suite view
            if (payload.isBatch && payload.report.suite) {
              setLastSuiteSummary(payload.report.suite);
              setActiveTab('suite');
              return;
            }

            if (payload.report.executionLogReport) {
              setExecutionLogReport(payload.report.executionLogReport);
              setActiveTab('logs');
            } else {
              fetch(`/api/test-results/execution-logs?testId=${payload.testId}`)
                .then((r) => r.json())
                .then((data) => {
                  if (data.report) {
                    setExecutionLogReport(data.report);
                    setActiveTab('logs');
                  }
                })
                .catch(() => {});
            }

            if (payload.report.status === 'failed') {
              if (payload.report.failureAnalysis) {
                setFailureAnalysis(payload.report.failureAnalysis);
                setShowFailureModal(true);
              } else {
                fetch('/api/test-results/last-failure')
                  .then((r) => r.json())
                  .then((data) => {
                    if (data.failureAnalysis) {
                      setFailureAnalysis(data.failureAnalysis);
                      setShowFailureModal(true);
                    }
                  })
                  .catch(() => {});
              }
            }
          } else if (payload.type === 'execution_log_report') {
            setExecutionLogReport(payload.report);
            setActiveTab('logs');
          } else if (payload.type === 'jira_proof_ready') {
            setAvailableJiraProofTestId(payload.testId);
            setLogs((prev) => [
              ...prev,
              `[Jira Proof Ready] Test execution evidence document compiled: ${payload.docName || 'Jira_Test_Proof.docx'}\n`
            ]);
          } else if (payload.type === 'matrix_start') {
            setIsMatrixRunning(true);
            setMatrixSummary(null);
            setMatrixResults(
              payload.personas.map((p: OrgUser) => ({
                persona: p,
                status: 'pending'
              }))
            );
          } else if (payload.type === 'matrix_persona_start') {
            setCurrentMatrixPersona(payload.persona);
            setMatrixProgressIndex(payload.personaIndex);
            setMatrixResults((prev) =>
              prev.map((item, idx) =>
                idx === payload.personaIndex ? { ...item, status: 'running' } : item
              )
            );
          } else if (payload.type === 'matrix_persona_log') {
            setLogs((prev) => [...prev, `[${payload.persona.name}] ${payload.line}`]);
          } else if (payload.type === 'matrix_persona_finish') {
            setMatrixResults((prev) =>
              prev.map((item, idx) =>
                idx === payload.personaIndex
                  ? {
                      ...item,
                      status: payload.status,
                      durationMs: payload.durationMs,
                      error: payload.error
                    }
                  : item
              )
            );
          } else if (payload.type === 'matrix_finish') {
            setIsMatrixRunning(false);
            setMatrixSummary(payload.summary);
            fetchTestCases();
          }
        } catch {
          // ignore parse error
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          reconnectTimer = setTimeout(connectWs, 2000);
        }
      };
    }

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  // Polling fallback to guarantee 100% sync of recorded steps
  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/record/status');
        const data = await res.json();
        if (data.success && data.recordedSteps && data.recordedSteps.length > 0) {
          const joined = data.recordedSteps.join('\n');
          setManualSteps((prev) => {
            if (prev !== joined) {
              triggerRealtimeSpecGen(joined);
              return joined;
            }
            return prev;
          });
          const userCount = Math.max(0, data.recordedSteps.length - 2);
          setRecordedStepsCount(userCount);
        }
      } catch {}
    }, 1200);

    return () => clearInterval(interval);
  }, [isRecording]);

  // Switch Active Org
  const handleSwitchOrg = (newAlias: string) => {
    setSelectedOrg(newAlias);
    fetchOrgStatus(newAlias);
    fetchObjects(newAlias, false);
    fetchOrgUsers(newAlias, false);
  };

  // Refresh Org Status, Objects & Users
  const handleRefreshOrg = (alias: string) => {
    fetchOrgStatus(alias);
    fetchObjects(alias, true);
    fetchOrgUsers(alias, true);
  };

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Create New Test Case (Reset form with next sequential ID)
  const handleNewTestCase = () => {
    const maxNum = testCases.reduce((max, tc) => {
      const m = tc.id.match(/^TC_(\d+)$/i);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 2);
    const nextId = `TC_${String(maxNum + 1).padStart(3, '0')}`;

    setTestId(nextId);
    setTicketNumber('');
    setTestName('');
    setScenarioType('positive');
    setTagsText('');
    setPriority('Medium');
    setOwner('');
    setDataRows([]);
    // Every new test starts with the standard opening: log in, App Launcher, app, tab
    setManualSteps('1. Log in to Salesforce\n2. Click App Launcher\n3. Search app ""\n4. Select "" tab\n5. ');
    setResolvedSteps([]);
    setGeneratedCode('');
    setPristineGeneratedCode('');
    setIsCodeEdited(false);
    setRunStatus('idle');
    setRunDuration(null);
    setActiveTab('code');
  };

  // Load a Saved Test Case into the Editor
  const handleLoadTestCase = async (tc: TestCaseItem) => {
    setTestId(tc.id);
    setTicketNumber(tc.ticketNumber || '');
    setProjectName(tc.project || 'Sales Cloud');
    setTestName(tc.testName || '');
    setObjectContext(tc.objectName || 'Account');
    setScenarioType(
      tc.scenarioType ||
      ((tc.testName && (tc.testName.toLowerCase().includes('negative') || tc.testName.toLowerCase().includes('validation') || tc.testName.toLowerCase().includes('read-only'))) ? 'negative' : 'positive')
    );
    setManualSteps(tc.steps || '');
    setTagsText((tc.tags || []).join(', '));
    setPriority(tc.priority || 'Medium');
    setOwner(tc.owner || '');
    setDataRows(Array.isArray(tc.dataRows) ? tc.dataRows : []);
    setResolvedSteps([]);
    setRunStatus(tc.lastStatus || 'idle');
    setRunDuration(tc.lastDurationMs || null);

    if (tc.specCode) {
      setGeneratedCode(tc.specCode);
      setPristineGeneratedCode(tc.specCode);
      setIsCodeEdited(Boolean(tc.codeEdited));
    } else {
      try {
        const res = await fetch(`/api/testcases/${tc.id}`);
        const data = await res.json();
        if (data.success && data.testCase?.specCode) {
          setGeneratedCode(data.testCase.specCode);
          setPristineGeneratedCode(data.testCase.specCode);
          setIsCodeEdited(false);
        } else {
          setGeneratedCode('');
          setPristineGeneratedCode('');
        }
      } catch {
        setGeneratedCode('');
        setPristineGeneratedCode('');
      }
    }
  };

  // Load standard template into editor for instant customization
  const handleLoadTemplate = (tmpl: SalesforceTestTemplate) => {
    setTestId(tmpl.id);
    setTicketNumber(tmpl.ticketNumber);
    setProjectName(tmpl.category || 'Sales Cloud');
    setTestName(tmpl.testName);
    setObjectContext(tmpl.objectName || 'Account');
    setScenarioType(
      tmpl.testName.toLowerCase().includes('negative') ||
      tmpl.testName.toLowerCase().includes('validation') ||
      tmpl.testName.toLowerCase().includes('read-only') ||
      tmpl.testName.toLowerCase().includes('error')
        ? 'negative'
        : 'positive'
    );
    setManualSteps(tmpl.steps);
    setResolvedSteps([]);
    setGeneratedCode('');
    setPristineGeneratedCode('');
    setIsCodeEdited(false);
    setRunStatus('idle');
    setRunDuration(null);
    setActiveTab('code');
  };

  // Import a single standard template into test suite
  const handleImportTemplateToSuite = async (tmpl: SalesforceTestTemplate) => {
    try {
      const res = await fetch('/api/templates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: tmpl.id, template: tmpl })
      });
      const data = await res.json();
      if (data.success) {
        fetchTestCases();
      }
    } catch (err) {
      console.error('Failed to import template:', err);
    }
  };

  // Import all standard templates into test suite
  const handleImportAllTemplates = async () => {
    try {
      const res = await fetch('/api/templates/import-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (data.success) {
        fetchTestCases();
        setShowTemplateLibraryModal(false);
      }
    } catch (err) {
      console.error('Failed to import all templates:', err);
    }
  };

  // Delete a Test Case
  const handleDeleteTestCase = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete test case ${id}?`)) return;
    try {
      await fetch(`/api/testcases/${id}`, { method: 'DELETE' });
      setSelectedTestIds((prev) => prev.filter((t) => t !== id));
      fetchTestCases();
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Live Interaction Recording Mode
  const handleToggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      try {
        await fetch('/api/record/stop', { method: 'POST' });
        setIsRecording(false);
        setLiveStep('Recording complete. Steps and script ready!');
      } catch (err) {
        console.error(err);
        setIsRecording(false);
      }
    } else {
      // Start recording
      setIsStartingRecorder(true);
      setActiveTab('browser');
      setRecordedStepsCount(0);
      try {
        const initialSteps = `1. Log in to Salesforce as standard user\n2. Navigate to ${objectContext} record recent`;
        setManualSteps(initialSteps);
        triggerRealtimeSpecGen(initialSteps);

        const res = await fetch('/api/record/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            objectName: objectContext,
            browser: selectedBrowser,
            instanceUrl: orgStatus?.instanceUrl || liveUrl || ''
          })
        });
        const data = await res.json();
        if (data.success) {
          setIsRecording(true);
        }
      } catch (err) {
        console.error('Failed to start recording:', err);
      } finally {
        setIsStartingRecorder(false);
      }
    }
  };

  // Pixel-perfect In-UI Viewport Canvas Click interaction
  const handleLiveViewportClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isRecording && !isPaused) return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const targetWidth = 1280;
    const targetHeight = 720;

    const imgRatio = targetWidth / targetHeight;
    const rectRatio = rect.width / rect.height;

    let renderWidth = rect.width;
    let renderHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    if (rectRatio > imgRatio) {
      renderWidth = rect.height * imgRatio;
      offsetX = (rect.width - renderWidth) / 2;
    } else {
      renderHeight = rect.width / imgRatio;
      offsetY = (rect.height - renderHeight) / 2;
    }

    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    if (clickX >= 0 && clickX <= renderWidth && clickY >= 0 && clickY <= renderHeight) {
      const x = Math.round((clickX / renderWidth) * targetWidth);
      const y = Math.round((clickY / renderHeight) * targetHeight);

      fetch('/api/record/click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y })
      }).catch((err) => console.error('Click dispatch error:', err));
    }
  };

  // Direct Scroll interaction & Wheel capture
  const scrollWheelTimerRef = useRef<any>(null);
  const handleLiveViewportWheel = (e: React.WheelEvent) => {
    if (!isRecording && !isPaused) return;
    e.preventDefault();
    const dy = e.deltaY;
    if (Math.abs(dy) < 15) return;

    if (scrollWheelTimerRef.current) clearTimeout(scrollWheelTimerRef.current);
    scrollWheelTimerRef.current = setTimeout(() => {
      handleLiveViewportScroll(dy > 0 ? 350 : -350);
    }, 100);
  };

  const handleLiveViewportScroll = async (deltaY: number) => {
    if (!isRecording && !isPaused) return;
    await fetch('/api/record/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deltaY })
    }).catch(() => {});
  };

  // Live Quick Type into focused browser field
  const handleQuickTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTypeText) return;
    const toSend = quickTypeText;
    setQuickTypeText('');
    fetch('/api/record/type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: toSend })
    }).catch((err) => console.error('Quick type error:', err));
  };

  // Live Special Key Press (Enter, Tab, Backspace)
  const handleSpecialKey = async (key: string) => {
    fetch('/api/record/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    }).catch((err) => console.error('Special key error:', err));
  };

  // Global Keyboard listener for the live browser viewport
  useEffect(() => {
    if (!isRecording && !isPaused) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // If typing in standard studio inputs on the left side, do not intercept
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (target.id !== 'live-quick-type-input') {
          return;
        }
      }

      // If user is focused on quick-type input, let Enter submit naturally via form onSubmit
      if (target?.id === 'live-quick-type-input' && e.key === 'Enter') {
        return;
      }

      // Forward single character keystrokes to active browser
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (target?.id !== 'live-quick-type-input') {
          fetch('/api/record/type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: e.key })
          }).catch(() => {});
        }
      } else if (['Backspace', 'Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Delete'].includes(e.key)) {
        if (target?.id !== 'live-quick-type-input') {
          if (['Backspace', 'Tab'].includes(e.key)) {
            e.preventDefault();
          }
          fetch('/api/record/key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: e.key })
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isRecording, isPaused]);

  // Repair decisions for a step that failed while the run is paused
  const sendRepair = async (action: 'clicked' | 'retry' | 'fail', newStep?: string) => {
    setRepairBusy(true);
    try {
      await fetch('/api/execute/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, newStep })
      });
      if (action === 'fail') {
        repairRef.current = null;
        setRepair(null);
        setIsPaused(false);
      }
    } catch (err) {
      console.error('Repair request failed', err);
      setRepairBusy(false);
    }
  };

  // First-run wizard: load the chosen starter test (and optionally run it)
  const handleWizardFinish = (result: WizardResult) => {
    setShowWizard(false);
    handleNewTestCase();
    setObjectContext(result.objectName);
    setTestName(result.testName);
    setManualSteps(result.steps);
    setTagsText(result.tags.join(', '));
    setActiveTab('suite');
    if (result.run) {
      // Let state settle before running with the new steps
      setTimeout(() => runButtonRef.current?.click(), 300);
    }
  };

  // 1. Resolve Steps
  const handleResolve = async () => {
    setIsResolving(true);
    try {
      const stepLines = manualSteps.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
      const res = await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawSteps: stepLines, objectContext, targetOrg: selectedOrg })
      });
      const data = await res.json();
      if (data.steps) {
        setResolvedSteps(data.steps);
        setActiveTab('plan');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsResolving(false);
    }
  };

  // 2. Generate Automation Spec
  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketNumber,
          testId,
          testName,
          project: projectName,
          objectName: objectContext,
          targetOrg: selectedOrg,
          dataRows,
          steps: manualSteps
        })
      });
      const data = await res.json();
      if (data.specCode) {
        setGeneratedCode(data.specCode);
        setPristineGeneratedCode(data.specCode);
        setIsCodeEdited(false);
        if (data.resolvedSteps) {
          setResolvedSteps(data.resolvedSteps);
        }
        setActiveTab('code');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Reset Code to Pristine Generated
  const handleResetCode = () => {
    if (pristineGeneratedCode) {
      setGeneratedCode(pristineGeneratedCode);
      setIsCodeEdited(false);
    }
  };

  // 4. Save Test Case & Spec
  const handleSaveTestCase = async () => {
    try {
      const res = await fetch('/api/testcases/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: testId,
          ticketNumber,
          testName,
          project: projectName,
          objectName: objectContext,
          scenarioType,
          steps: manualSteps,
          specCode: generatedCode,
          lastStatus: runStatus !== 'running' ? runStatus : undefined,
          lastDurationMs: runDuration || undefined,
          tags: tagList,
          priority,
          owner,
          dataRows,
          codeEdited: isCodeEdited
        })
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        fetchTestCases();
      }
    } catch (err) {
      console.error('Failed to save test case:', err);
    }
  };

  // 5. Copy Code
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 6. Copy Direct Automation CLI Command
  const handleCopyCmd = () => {
    const cmd = `npm test -- tests/generated/${testId}.spec.ts --headed`;
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  // 6.5 Apply Failure Fix
  const handleApplyFailureFix = (reRun = false) => {
    if (!failureAnalysis || !failureAnalysis.suggestedStepFix || !failureAnalysis.failedStepIndex) {
      setShowFailureModal(false);
      return;
    }
    const idx = failureAnalysis.failedStepIndex;
    const fix = failureAnalysis.suggestedStepFix;
    const lines = manualSteps.split('\n');

    let replaced = false;
    const updatedLines = lines.map((l) => {
      if (l.trim().startsWith(`${idx}.`)) {
        replaced = true;
        return fix;
      }
      return l;
    });

    if (!replaced && idx - 1 < updatedLines.length) {
      updatedLines[idx - 1] = fix;
    }

    const newSteps = updatedLines.join('\n');
    setManualSteps(newSteps);
    triggerRealtimeSpecGen(newSteps);
    setShowFailureModal(false);

    if (reRun) {
      setTimeout(() => {
        handleExecute();
      }, 500);
    }
  };

  // 7. Execute Single Test Live
  const handleExecute = async () => {
    setIsRunning(true);
    setIsPaused(false);
    setPausedStepIndex(null);
    setPausedStepText(null);
    setRunStatus('running');
    setLogs([]);
    setActiveTab('browser');
    setLiveFrame(null);
    setLiveStep('Initializing Salesforce session...');

    try {
      let codeToRun = generatedCode;
      if (!codeToRun || !isCodeEdited) {
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber,
            testId,
            testName,
            project: projectName,
            objectName: objectContext,
            targetOrg: selectedOrg,
            dataRows,
            steps: manualSteps
          })
        });
        const genData = await genRes.json();
        codeToRun = genData.specCode;
        setGeneratedCode(codeToRun);
        setPristineGeneratedCode(codeToRun);
        setIsCodeEdited(false);
        if (genData.resolvedSteps) setResolvedSteps(genData.resolvedSteps);
      }

      const execRes = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          specCode: codeToRun,
          headed,
          browser: selectedBrowser,
          ticketNumber,
          testName,
          scenarioType,
          steps: manualSteps,
          persona: selectedPersona,
          targetOrg: selectedOrg,
          pauseOnFailure,
          codeEdited: isCodeEdited
        })
      });
      const execData = await execRes.json();
      if (execData.success && execData.report) {
        if (execData.report.executionLogReport) {
          setExecutionLogReport(execData.report.executionLogReport);
          setActiveTab('logs');
        }
        if (execData.report.status === 'failed' && execData.report.failureAnalysis) {
          setFailureAnalysis(execData.report.failureAnalysis);
          setShowFailureModal(true);
        }
      }
    } catch (err) {
      console.error(err);
      setIsRunning(false);
      setRunStatus('failed');
    }
  };

  // 7.1 Stop Live Automation Execution (Immediate Abort)
  const handleStopExecution = async () => {
    setIsStopping(true);
    setLiveStep('Stopping automation execution...');
    try {
      await fetch('/api/execute/stop', { method: 'POST' });
    } catch (err) {
      console.error('Failed to stop execution:', err);
    } finally {
      setIsRunning(false);
      setIsBatchRunning(false);
      setIsStopping(false);
      setIsPaused(false);
      setPausedStepIndex(null);
      setPausedStepText(null);
      setRunStatus('interrupted');
      setLiveStep('Automation execution stopped.');
      setLogs((prev) => [...prev, '\n[Orgwright Studio] Automation execution stopped by user.\n']);
    }
  };

  // 7.2 Pause Live Automation Execution
  const handlePauseExecution = async () => {
    try {
      setIsPaused(true);
      await fetch('/api/execute/pause', { method: 'POST' });
      setLiveStep('Execution paused. Screen is interactive — enter values or add steps!');
    } catch (err) {
      console.error('Failed to pause execution:', err);
    }
  };

  // 7.3 Resume Live Automation Execution
  const handleResumeExecution = async () => {
    try {
      setIsPaused(false);
      const stepLines = manualSteps.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
      await fetch('/api/execute/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          steps: stepLines,
          pausedStepIndex
        })
      });
      setLiveStep('Resuming test execution from current state...');
    } catch (err) {
      console.error('Failed to resume execution:', err);
    }
  };

  // 7.4 Insert New Test Step During Pause
  const handleAddStepAtPause = (stepTextToAdd?: string) => {
    const promptText = stepTextToAdd || window.prompt('Enter new test step to insert at current pause point:');
    if (!promptText || !promptText.trim()) return;
    const clean = promptText.trim().replace(/^\d+\.\s*/, '');
    setManualSteps((prev) => {
      const lines = prev.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      const insertIdx = pausedStepIndex !== null && pausedStepIndex >= 0 && pausedStepIndex <= lines.length
        ? pausedStepIndex
        : lines.length;
      lines.splice(insertIdx, 0, clean);
      const renumbered = lines.map((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, '')}`).join('\n');
      triggerRealtimeSpecGen(renumbered);
      return renumbered;
    });
    setPausedStepIndex((prev) => (prev !== null ? prev + 1 : null));
  };

  // 8. Execute Batch Regression for Selected Test Cases
  const handleRunBatch = async (testIdsToRun?: string[], tag?: string) => {
    const ids = testIdsToRun || selectedTestIds;
    if (ids.length === 0 && !tag) return;
    setLastSuiteSummary(null);

    setIsRunning(true);
    setIsBatchRunning(true);
    setRunStatus('running');
    setLogs([]);
    setActiveTab('browser');
    setLiveFrame(null);
    setLiveStep(`Starting batch execution of ${ids.length} test cases...`);

    try {
      await fetch('/api/testcases/run-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testIds: tag ? [] : ids,
          tag,
          headed,
          browser: selectedBrowser,
          targetOrg: selectedOrg,
          projectName: projectFilter !== 'all' ? projectFilter : projectName
        })
      });
    } catch (err) {
      console.error(err);
      setIsRunning(false);
      setIsBatchRunning(false);
      setRunStatus('failed');
    }
  };

  // 8.5 Execute Multi-User Persona Matrix
  const handleRunMatrix = async () => {
    const selectedPersonas = orgUsers.filter((u) => selectedMatrixUserIds.includes(u.id));
    if (selectedPersonas.length === 0) return;

    setIsMatrixRunning(true);
    setMatrixSummary(null);
    setMatrixResults(
      selectedPersonas.map((p) => ({
        persona: p,
        status: 'pending'
      }))
    );

    try {
      let codeToRun = generatedCode;
      if (!codeToRun || !isCodeEdited) {
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketNumber,
            testId,
            testName,
            project: projectName,
            objectName: objectContext,
            targetOrg: selectedOrg,
            dataRows,
            steps: manualSteps
          })
        });
        const genData = await genRes.json();
        codeToRun = genData.specCode;
      }

      const res = await fetch('/api/testcases/run-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          specCode: codeToRun,
          personas: selectedPersonas,
          headed,
          browser: selectedBrowser,
          ticketNumber,
          testName,
          steps: manualSteps
        })
      });

      const data = await res.json();
      if (data.success) {
        setMatrixSummary(data.summary);
        setMatrixResults(data.results);
      }
    } catch (err) {
      console.error('Matrix run error:', err);
    } finally {
      setIsMatrixRunning(false);
    }
  };

  const handleCopyMatrixJiraReport = () => {
    if (!matrixSummary) return;
    const lines = [
      `h3. Orgwright Multi-User Matrix Execution Report`,
      `*Test Case:* ${ticketNumber || testId} - ${testName}`,
      `*Target SObject:* ${objectContext}`,
      `*Org:* ${selectedOrg}`,
      `*Matrix Compliance Rate:* ${matrixSummary.complianceRate} (${matrixSummary.passed}/${matrixSummary.total} Passed)`,
      `*Completed At:* ${new Date(matrixSummary.completedAt).toLocaleString()}`,
      ``,
      `|| User / Persona || Profile || Status || Duration || Root Cause / Error ||`,
      ...matrixResults.map(
        (r) =>
          `| ${r.persona.name} | ${r.persona.profileName} | ${r.status === 'passed' ? '(/) Passed' : '(x) Failed'} | ${r.durationMs ? (r.durationMs / 1000).toFixed(1) + 's' : '-'} | ${r.error || 'Passed without validation errors'} |`
      )
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedMatrixReport(true);
    setTimeout(() => setCopiedMatrixReport(false), 2500);
  };

  // 10. Export Test Scenarios to Excel (.xlsx)
  const handleExportToExcel = () => {
    try {
      const rows = (testCases.length > 0 ? testCases : []).map((tc, idx) => {
        const itemType = tc.scenarioType || (
          (tc.testName && (tc.testName.toLowerCase().includes('negative') || tc.testName.toLowerCase().includes('validation') || tc.testName.toLowerCase().includes('read-only')))
            ? 'negative'
            : 'positive'
        );
        return {
          'Test ID': tc.id || `TC_${idx + 1}`,
          'Jira Ticket': tc.ticketNumber || '',
          'Project': tc.project || 'Sales Cloud',
          'Scenario Type': itemType === 'negative' ? 'Negative' : 'Positive',
          'Test Scenario Objective': tc.testName || '',
          'Persona / Profile': 'Standard User',
          'Step Count': tc.stepCount || (tc.steps ? tc.steps.split('\n').filter(s => s.trim()).length : 0),
          'Test Steps & Data': tc.steps || '',
          'Last Status': tc.lastStatus ? tc.lastStatus.toUpperCase() : 'READY',
          'Duration (ms)': tc.lastDurationMs || 0,
          'Last Executed': tc.lastRunAt || tc.updatedAt || new Date().toISOString()
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 14 },
        { wch: 18 },
        { wch: 15 },
        { wch: 45 },
        { wch: 18 },
        { wch: 12 },
        { wch: 65 },
        { wch: 12 },
        { wch: 14 },
        { wch: 22 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Salesforce Scenarios');
      XLSX.writeFile(wb, `Orgwright_Test_Scenarios_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Failed to export scenarios to Excel:', err);
      alert('Error exporting scenarios to Excel');
    }
  };

  // 11. Download Clean Sample Excel Template for Test Scenarios
  const handleDownloadSampleExcel = () => {
    try {
      const sampleRows = [
        {
          'Test ID': 'TC_001',
          'Jira Ticket': 'CRM-101',
          'Project': 'Sales Cloud',
          'Scenario Type': 'Positive',
          'Test Scenario Objective': 'Create New Account with Industry and Billing Address',
          'Persona / Profile': 'Standard User',
          'Test Steps & Data': `1. Log in to Salesforce
2. Navigate to Account tab
3. Click on New button
4. Enter "Acme Corporation" in Account Name
5. Select "Technology" from Industry picklist
6. Enter "100 Market St, San Francisco" in Billing Address
7. Click on Save button
8. Verify toast "Account was created"
9. Verify field "Account Name" equals "Acme Corporation"`
        },
        {
          'Test ID': 'TC_002',
          'Jira Ticket': 'CRM-102',
          'Project': 'Sales Cloud',
          'Scenario Type': 'Negative',
          'Test Scenario Objective': 'Verify Validation Rule Prevents Saving Account Without Rating when Annual Revenue Exceeds 1M',
          'Persona / Profile': 'Standard User',
          'Test Steps & Data': `1. Log in to Salesforce
2. Navigate to Account tab
3. Click on New button
4. Enter "Global Enterprise Corp" in Account Name
5. Enter "1500000" in Annual Revenue
6. Leave Rating field blank
7. Click on Save button
8. Verify error message "Rating is mandatory when Annual Revenue exceeds $1,000,000"`
        },
        {
          'Test ID': 'TC_003',
          'Jira Ticket': 'CRM-103',
          'Project': 'Service Cloud',
          'Scenario Type': 'Negative',
          'Test Scenario Objective': 'Verify Support Persona Cannot Edit Closed/Resolved Case',
          'Persona / Profile': 'Restricted Support User',
          'Test Steps & Data': `1. Log in to Salesforce as Restricted Support User
2. Navigate to Cases tab
3. Open recent Case with status "Closed"
4. Verify "Edit" button is hidden or disabled
5. Verify field "Subject" is read-only`
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleRows);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
        { wch: 50 },
        { wch: 22 },
        { wch: 65 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sample Scenarios');
      XLSX.writeFile(wb, 'Orgwright_Test_Scenarios_Template.xlsx');
    } catch (err) {
      console.error('Failed to generate template:', err);
    }
  };

  // 12. Parse Uploaded Excel (.xlsx / .csv) File
  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    setExcelImportError(null);
    setExcelImportSuccess(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setExcelImportError('The selected spreadsheet does not contain any scenario rows.');
          return;
        }

        const parsedScenarios = rawJson.map((row, idx) => {
          const normalized: Record<string, any> = {};
          for (const key of Object.keys(row)) {
            normalized[key.trim().toLowerCase()] = row[key];
          }

          const rawId = normalized['test id'] || normalized['id'] || normalized['test case id'] || `TC_IMP_${String(idx + 1).padStart(3, '0')}`;
          const rawTicket = normalized['jira ticket'] || normalized['ticket'] || normalized['jira'] || normalized['ticket number'] || '';
          const rawProject = normalized['project'] || projectName || 'Sales Cloud';
          const rawType = (normalized['scenario type'] || normalized['type'] || normalized['scenario classification'] || '').toString().toLowerCase();
          const scenarioType: 'positive' | 'negative' = rawType.includes('neg') ? 'negative' : 'positive';
          const rawName = normalized['test scenario objective'] || normalized['scenario objective'] || normalized['scenario name'] || normalized['test name'] || normalized['objective'] || normalized['name'] || `Imported Scenario ${idx + 1}`;
          const rawSteps = normalized['test steps & data'] || normalized['test steps'] || normalized['steps'] || normalized['step definitions'] || '';

          const formattedSteps = Array.isArray(rawSteps)
            ? rawSteps.join('\n')
            : String(rawSteps).replace(/\\n/g, '\n');

          const stepCount = formattedSteps.split('\n').filter((s: string) => s.trim().length > 0).length;

          return {
            id: String(rawId).trim(),
            ticketNumber: String(rawTicket).trim(),
            project: String(rawProject).trim(),
            testName: String(rawName).trim(),
            objectName: 'Account',
            scenarioType,
            steps: formattedSteps,
            stepCount: stepCount || 1,
            hasSpec: false,
            lastStatus: 'idle'
          };
        });

        setImportedScenariosPreview(parsedScenarios);
      } catch (err: any) {
        console.error('Error parsing Excel file:', err);
        setExcelImportError(`Failed to parse spreadsheet: ${err.message || 'Invalid format'}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 13. Confirm Bulk Scenario Import to Server
  const handleConfirmImportScenarios = async () => {
    if (importedScenariosPreview.length === 0) return;
    setIsImportingExcel(true);
    setExcelImportError(null);
    try {
      const res = await fetch('/api/testcases/save-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testCases: importedScenariosPreview })
      });
      const data = await res.json();
      if (data.success) {
        setExcelImportSuccess(`Successfully imported ${data.count} test scenarios into Orgwright Studio!`);
        await fetchTestCases();
        setTimeout(() => {
          setShowExcelImportModal(false);
          setImportedScenariosPreview([]);
          setImportFileName('');
          setExcelImportSuccess(null);
          setActiveTab('suite');
        }, 1200);
      } else {
        setExcelImportError(data.error || 'Failed to import scenarios');
      }
    } catch (err: any) {
      console.error('Error importing batch scenarios:', err);
      setExcelImportError(err.message || 'Network error during scenario import');
    } finally {
      setIsImportingExcel(false);
    }
  };

  // 14. Download Jira Execution Proof Word Document (.docx)
  const handleDownloadJiraProof = (tcId?: string) => {
    const targetId = tcId || availableJiraProofTestId || testId;
    const url = `/api/test-results/jira-proof?testId=${encodeURIComponent(targetId)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${targetId}_Jira_Test_Proof.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setJiraProofDownloaded(true);
    setTimeout(() => setJiraProofDownloaded(false), 3000);
  };

  // 9. Run Entire Project Regression
  const handleRunProjectRegression = () => {
    const targetProject = projectFilter !== 'all' ? projectFilter : projectName;
    const projectTests = testCases.filter((t) => t.project === targetProject).map((t) => t.id);
    if (projectTests.length === 0) {
      alert(`No test cases found for project "${targetProject}"`);
      return;
    }
    setSelectedTestIds(projectTests);
    handleRunBatch(projectTests);
  };

  const distinctProjects = Array.from(new Set(testCases.map((t) => t.project || 'Sales Cloud'))).filter(Boolean);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      {/* ENTERPRISE TOP NAVIGATION BAR */}
      <header className="border-b border-slate-200/90 bg-white sticky top-0 z-50 shadow-2xs">
        <div className="max-w-[1920px] mx-auto px-5 py-2.5 flex items-center justify-between">
          {/* Left: Brand + Project Context */}
          <div className="flex items-center space-x-3">
            <img
              src="/logo-icon.png"
              alt="OrgWright"
              className="h-8 w-8 rounded-lg object-contain shadow-xs border border-slate-200 bg-white"
              onError={(e) => {
                // Fallback if image not yet loaded
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="flex items-center space-x-2">
              <span className="font-bold text-base text-slate-900 tracking-tight">
                OrgWright <span className="text-blue-600 font-semibold">Studio</span>
              </span>
            </div>

            {/* Subtle Divider */}
            <div className="h-4 w-px bg-slate-200 hidden sm:block" />

            {/* Project Context Breadcrumb */}
            <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-500">
              <span className="text-slate-400">Project:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={projectName}>
                {projectName}
              </span>
            </div>
          </div>

          {/* Center: Live Execution & Recording Status */}
          <div className="hidden xl:flex items-center">
            {isRecording ? (
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-pulse shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-rose-600" />
                <span>Recording ({recordedStepsCount} steps)</span>
              </div>
            ) : runStatus === 'running' ? (
              <div className="flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold animate-pulse shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                <span>Running test…</span>
              </div>
            ) : null}
          </div>

          {/* Right: Consolidated Enterprise Controls */}
          <div className="flex items-center space-x-2">
            {/* Tester / Developer mode */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5 text-[11px] font-semibold" role="group" aria-label="Studio mode">
              <button
                type="button"
                onClick={() => setUiMode('tester')}
                className={`px-2 py-1 rounded-md cursor-pointer transition ${isTesterMode ? 'bg-white text-blue-700 shadow-2xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                title="Simple view for writing and running tests"
              >
                Tester
              </button>
              <button
                type="button"
                onClick={() => setUiMode('developer')}
                className={`px-2 py-1 rounded-md cursor-pointer transition ${!isTesterMode ? 'bg-white text-indigo-700 shadow-2xs border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
                title="Show plan, generated code, console and QA hub"
              >
                Developer
              </button>
            </div>
            {/* Org Connector & Active Environment */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50/80 shadow-2xs divide-x divide-slate-200">
              <button
                type="button"
                onClick={() => setShowOrgConnectorModal(true)}
                className="flex items-center space-x-2 px-2.5 py-1.5 hover:bg-slate-100 text-xs text-slate-700 transition cursor-pointer rounded-l-lg"
                title="Manage Salesforce Org Connections (Click to open Org Connector)"
              >
                <div className={`h-2 w-2 rounded-full ${orgStatus?.connected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="font-semibold text-slate-900">{selectedOrg}</span>
                <span className="px-1.5 py-0.2 rounded text-[11px] font-medium bg-white text-slate-600 border border-slate-200">
                  {(() => {
                    const org = orgList.find(o => o.alias === selectedOrg);
                    if (org?.isSandbox) return 'Sandbox';
                    // Developer Edition orgs live on *.develop.my.salesforce.com
                    if (/\.develop\.my\.salesforce\.com|dev-ed/i.test((org as { instanceUrl?: string } | undefined)?.instanceUrl || '')) return 'Developer';
                    return 'Prod';
                  })()}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400 ml-0.5" />
              </button>

              <button
                type="button"
                onClick={() => handleRefreshOrg(selectedOrg)}
                disabled={isConnectingOrg}
                className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer rounded-r-lg"
                title="Refresh Org Metadata & Latency"
              >
                <RefreshCw className={`h-3 w-3 ${isConnectingOrg ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            </div>

            {/* Persona Selector Dropdown */}
            <div className="relative" ref={personaDropdownRef}>
              <button
                type="button"
                onClick={() => setShowPersonaDropdown((prev) => !prev)}
                className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs text-slate-800 font-medium transition shadow-2xs cursor-pointer"
                title="Select Salesforce User Persona"
              >
                <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                <span className="font-semibold text-slate-800 truncate max-w-[110px]">
                  {selectedPersona?.name || 'Standard User'}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[11px] bg-slate-100 text-slate-600 border border-slate-200 font-mono truncate max-w-[80px]">
                  {selectedPersona?.profileName?.replace(/Profile/i, '').trim() || 'Admin'}
                </span>
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>

            {/* Persona Dropdown Popover */}
            {showPersonaDropdown && (
              <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 rounded-lg shadow-xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <UserCheck className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Select User Persona</span>
                  </div>
                  <span className="text-[11px] text-slate-500">{orgUsers.length} Users Found</span>
                </div>

                {/* Search input */}
                <div className="relative mb-2">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, username, or profile..."
                    value={personaSearchQuery}
                    onChange={(e) => setPersonaSearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                {/* Profile quick-filter pills */}
                <div className="flex items-center space-x-1 overflow-x-auto pb-2 mb-2 scrollbar-none text-[11px]">
                  {['All', ...Array.from(new Set(orgUsers.map((u) => u.profileName))).filter(Boolean).slice(0, 5)].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSelectedProfileFilter(p)}
                      className={`px-2 py-0.5 rounded-full whitespace-nowrap transition ${
                        selectedProfileFilter === p
                          ? 'bg-blue-600 text-white font-medium shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {/* User List */}
                <div className="max-h-60 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                  {orgUsers
                    .filter((u) => {
                      const q = personaSearchQuery.toLowerCase();
                      const matchQuery =
                        u.name.toLowerCase().includes(q) ||
                        u.username.toLowerCase().includes(q) ||
                        u.profileName.toLowerCase().includes(q);
                      const matchProf = selectedProfileFilter === 'All' || u.profileName === selectedProfileFilter;
                      return matchQuery && matchProf;
                    })
                    .map((user) => {
                      const isSelected = selectedPersona?.id === user.id;
                      return (
                        <div
                          key={user.id}
                          onClick={() => {
                            setSelectedPersona(user);
                            setShowPersonaDropdown(false);
                          }}
                          className={`p-2 rounded-lg cursor-pointer flex items-center justify-between transition ${
                            isSelected
                              ? 'bg-blue-50 border border-blue-200 text-blue-900'
                              : 'hover:bg-slate-50 border border-transparent text-slate-800'
                          }`}
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <div className="h-6 w-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                              {user.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-xs font-semibold text-slate-900 truncate">{user.name}</span>
                                {user.isDefault && (
                                  <span className="px-1 rounded text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                                <span className="text-blue-700 font-mono">{user.profileName}</span>
                                <span>•</span>
                                <span className="truncate max-w-[140px] text-slate-500">{user.username}</span>
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                        </div>
                      );
                    })}
                </div>

                {/* Footer refresh */}
                <div className="pt-2 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Connected: {selectedOrg}</span>
                  <button
                    type="button"
                    onClick={() => fetchOrgUsers(selectedOrg, true)}
                    disabled={isLoadingUsers}
                    className="flex items-center space-x-1 text-blue-600 hover:text-blue-700 font-medium transition"
                  >
                    <RefreshCw className={`h-3 w-3 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                    <span>Sync Org Users</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Multi-User Matrix Runner Button */}
          <button
            type="button"
            onClick={() => {
              setShowMatrixModal(true);
              if (orgUsers.length <= 1) fetchOrgUsers(selectedOrg);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition shadow-xs cursor-pointer"
            title="Execute test case across multiple user personas simultaneously"
          >
            <Users className="h-3.5 w-3.5 text-indigo-600" />
            <span>Multi-User Matrix</span>
            <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
              {selectedMatrixUserIds.length}
            </span>
          </button>
        </div>
      </div>
    </header>

      {/* Main Container */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1850px] w-full mx-auto">
        {/* Left Column: Test Case Builder Form (5 cols) */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900">Test case</h2>
              </div>

              {/* Action buttons in header: Standard Library, + New Test Case & Quick Jump */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateLibraryModal(true)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition cursor-pointer shadow-2xs"
                  title="Browse, search, and load standard Salesforce test templates"
                >
                  <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                  <span>Standard Tests</span>
                </button>

                <button
                  type="button"
                  onClick={handleNewTestCase}
                  className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-medium transition cursor-pointer"
                  title="Create fresh blank test case"
                >
                  <Plus className="h-3.5 w-3.5 text-slate-500" />
                  <span>New Test</span>
                </button>

                {/* Quick select saved test case */}
                <div className="flex items-center space-x-1">
                  <select
                    className="bg-white border border-slate-300 rounded text-xs text-slate-800 px-2 py-1 outline-none focus:border-blue-500 cursor-pointer max-w-[150px] truncate shadow-xs"
                    onChange={(e) => {
                      const found = testCases.find((tc) => tc.id === e.target.value);
                      if (found) handleLoadTestCase(found);
                    }}
                    value={testId}
                  >
                    {testCases.map((tc) => (
                      <option key={tc.id} value={tc.id}>
                        {tc.id}: {tc.testName.slice(0, 22)}...
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Ticket Number</label>
                <input
                  type="text"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono shadow-xs"
                  value={ticketNumber}
                  onChange={(e) => setTicketNumber(e.target.value)}
                  placeholder="e.g. CRM-101"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Test Case ID</label>
                <input
                  type="text"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-mono shadow-xs"
                  value={testId}
                  onChange={(e) => setTestId(e.target.value)}
                  placeholder="e.g. TC_001"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Project Name</label>
                <input
                  type="text"
                  list="project-suggestions"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-xs"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Sales Cloud Implementation"
                />
                <datalist id="project-suggestions">
                  {distinctProjects.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>

              {/* Scenario Classification Selector (Replaces Object Reference) */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Scenario Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScenarioType('positive')}
                    className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      scenarioType === 'positive'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs ring-1 ring-emerald-500'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Positive Scenario</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScenarioType('negative')}
                    className={`flex items-center justify-center space-x-1.5 py-2 px-3 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      scenarioType === 'negative'
                        ? 'bg-rose-50 border-rose-500 text-rose-800 shadow-xs ring-1 ring-rose-500'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <span>Negative Scenario</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {scenarioType === 'positive'
                    ? 'Happy path: the record saves and the flow completes.'
                    : 'Error path: validation rules, required fields, read-only fields and permissions.'}
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Test name</label>
              <input
                type="text"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-xs"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="e.g. Verify Account Creation and Required Fields Validation"
              />
            </div>

            {/* Suite organisation: tags, priority, owner */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="tc-tags">Tags</label>
                <input
                  id="tc-tags"
                  type="text"
                  list="orgwright-known-tags"
                  className="w-full bg-white border border-slate-300 rounded-md px-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:border-blue-500"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Smoke, Regression, Release 26.4"
                />
                <datalist id="orgwright-known-tags">
                  {[...new Set(testCases.flatMap((t) => t.tags || []))].map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="tc-priority">Priority</label>
                <select
                  id="tc-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="bg-white border border-slate-300 rounded-md px-2 py-2 text-[13px] text-slate-900 focus:outline-none focus:border-blue-500"
                >
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="tc-owner">Owner</label>
                <input
                  id="tc-owner"
                  type="text"
                  className="w-36 bg-white border border-slate-300 rounded-md px-3 py-2 text-[13px] text-slate-900 focus:outline-none focus:border-blue-500"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Name"
                />
              </div>
            </div>

            {/* Test Steps Header with Live Interaction Recorder Button */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2">
                  <label className="text-xs font-semibold text-slate-700">Steps</label>
                  {isRecording && (
                    <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-semibold border border-rose-200 animate-pulse">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                      <span>Recording Live ({recordedStepsCount})</span>
                    </span>
                  )}
                </div>

                {/* Primary Live Recorder Button */}
                <button
                  type="button"
                  onClick={handleToggleRecording}
                  disabled={isStartingRecorder}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs ${
                    isRecording
                      ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                  }`}
                  title="Click to interact directly with Salesforce in browser. Your clicks, dropdown selections, input typing, and scrolling are automatically turned into test steps!"
                >
                  {isStartingRecorder ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : isRecording ? (
                    <Square className="h-3 w-3 fill-current" />
                  ) : (
                    <Disc className="h-3 w-3 text-rose-600" />
                  )}
                  <span>{isRecording ? 'Stop recording' : 'Record'}</span>
                </button>
              </div>

              {/* Paused Mode Callout & Step Insertion */}
              {isPaused && !repair && (
                <div className="mb-2 p-2.5 bg-amber-50 border border-amber-300 rounded-lg flex items-center justify-between text-xs text-amber-900 shadow-2xs">
                  <div className="flex items-center space-x-2 truncate mr-2">
                    <Pause className="h-4 w-4 text-amber-600 flex-shrink-0 animate-pulse" />
                    <div className="truncate">
                      <div className="font-semibold text-amber-900">
                        Execution Paused {pausedStepIndex !== null ? `at Step ${pausedStepIndex}` : ''}
                      </div>
                      <div className="text-[11px] text-amber-700 truncate">
                        Add or edit steps below. Clicking Resume will continue execution with new steps.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddStepAtPause()}
                    className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] flex items-center space-x-1 flex-shrink-0 cursor-pointer shadow-xs"
                    title="Insert a new step right at the current pause position"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Insert Step</span>
                  </button>
                </div>
              )}

              {repair && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px]">
                  <span className="text-slate-800">
                    <strong>Step {repair.stepIndex} failed.</strong> The run is paused so you can fix it.
                  </span>
                  {activeTab !== 'browser' && (
                    <button type="button" onClick={() => setActiveTab('browser')} className="h-7 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 cursor-pointer flex-shrink-0">
                      Fix in Live Browser
                    </button>
                  )}
                </div>
              )}

              {/* Step editor: autocomplete, live step check, cheat sheet */}
              <StepEditor
                dataColumns={dataColumns}
                value={manualSteps}
                onChange={setManualSteps}
                objectContext={objectContext}
                onObjectChange={setObjectContext}
                standardObjects={standardObjects}
                customObjects={customObjects}
                selectedOrg={selectedOrg}
                isRecording={isRecording}
                isPaused={isPaused}
                onSummaryChange={setStepCheckSummary}
                placeholder={'1. Log in to Salesforce\n2. Open Account list\n3. Click on New button\n4. Enter "Acme {{unique}}" in "Account Name"\n5. Click on Save button\n6. Verify toast "was created"'}
              />

              {isRecording && (
                <div className="text-xs text-slate-500 mt-1">Recording: your clicks in the browser are added as steps.</div>
              )}

              <div className="mt-2">
                <DataRowsPanel rows={dataRows} onChange={setDataRows} />
              </div>
            </div>

            {/* Options & Execution Bar */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={headed}
                      onChange={(e) => setHeaded(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-slate-700 font-medium">Headed Browser</span>
                  </label>

                  <label
                    className={`flex items-center space-x-1.5 select-none ${headed ? 'cursor-pointer' : 'opacity-50'}`}
                    title="When a step fails, keep the browser open so you can click the right element and continue"
                  >
                    <input
                      type="checkbox"
                      checked={pauseOnFailure && headed}
                      disabled={!headed}
                      onChange={(e) => setPauseOnFailure(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="text-slate-700 font-medium">Pause on failure</span>
                  </label>

                  <div className="flex items-center space-x-1.5 pl-2 border-l border-slate-200">
                    <span className="text-[11px] text-slate-500">Browser:</span>
                    <select
                      value={selectedBrowser}
                      onChange={(e) => setSelectedBrowser(e.target.value as any)}
                      className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs text-slate-800 font-medium focus:outline-none focus:border-blue-500 cursor-pointer shadow-xs"
                    >
                      <option value="chrome">Google Chrome (Default)</option>
                      <option value="msedge">Microsoft Edge</option>
                      <option value="chromium">Chromium</option>
                    </select>
                  </div>
                </div>

              </div>

              {stepCheckSummary.errors > 0 && !isRunning && (
                <div className="flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-800">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>
                    {stepCheckSummary.errors} step{stepCheckSummary.errors > 1 ? 's need' : ' needs'} fixing before this test can run correctly
                    (not understood, or uses a {'{{value}}'} that was never remembered). See Step check above.
                  </span>
                </div>
              )}

              {/* Enterprise Action Toolbar */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveTestCase}
                  className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs transition cursor-pointer"
                  title="Save current test case definition and spec"
                >
                  {saved ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Save className="h-3.5 w-3.5 text-slate-500" />}
                  <span>{saved ? 'Saved!' : 'Save'}</span>
                </button>

                {!isTesterMode && (
                <button
                  type="button"
                  onClick={handleResolve}
                  disabled={isResolving}
                  className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs transition cursor-pointer"
                  title="Resolve manual steps against Salesforce object metadata"
                >
                  {isResolving ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" /> : <Layers className="h-3.5 w-3.5 text-slate-500" />}
                  <span>Resolve Plan</span>
                </button>
                )}

                {!isTesterMode && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-white hover:bg-indigo-50/50 text-indigo-700 text-xs font-semibold border border-indigo-200 shadow-2xs transition cursor-pointer"
                  title="Compile steps into automated test spec code"
                >
                  {isGenerating ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" /> : <Code2 className="h-3.5 w-3.5" />}
                  <span>Generate Spec</span>
                </button>
                )}

                {isRunning ? (
                  <div className="flex-1 flex items-center space-x-1.5">
                    {isPaused ? (
                      <button
                        type="button"
                        onClick={handleResumeExecution}
                        className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer ring-2 ring-emerald-400/50 animate-pulse"
                        title="Resume testing from current step"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Resume Run</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePauseExecution}
                        className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                        title="Pause live automation execution to enter values or add steps"
                      >
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        <span>Pause Run</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleStopExecution}
                      disabled={isStopping}
                      className="flex items-center justify-center space-x-1 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                      title="Stop running live automation immediately"
                    >
                      {isStopping ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Square className="h-3.5 w-3.5 fill-current" />
                      )}
                      <span>{isStopping ? 'Stopping...' : 'Stop'}</span>
                    </button>
                  </div>
                ) : (
                  <button
                    ref={runButtonRef}
                    type="button"
                    onClick={handleExecute}
                    disabled={isRecording}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                    title={isTesterMode ? 'Check the steps, build the automation and run it in the browser' : 'Run live automated execution in browser'}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{isTesterMode ? 'Run Test' : 'Run Live'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Studio Inspector & Execution Hub (7 cols) */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg flex-1 flex flex-col overflow-hidden shadow-xs min-h-[660px]">
            {/* Tabs Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 bg-slate-50/80">
              <div className="flex items-center space-x-1 overflow-x-auto">
                {/* 1. Test Suite & Regression Tab */}
                <button
                  type="button"
                  onClick={() => setActiveTab('suite')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'suite'
                      ? 'border-blue-600 text-blue-600 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <FolderGit2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>Test Suite</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                    {testCases.length}
                  </span>
                </button>

                {/* 2. Resolved Plan Tab */}
                {!isTesterMode && (
                <button
                  type="button"
                  onClick={() => setActiveTab('plan')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'plan'
                      ? 'border-blue-600 text-blue-600 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Plan ({resolvedSteps.length})</span>
                </button>
                )}

                {/* 3. Automation Spec Tab */}
                {!isTesterMode && (
                <button
                  type="button"
                  onClick={() => setActiveTab('code')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'code'
                      ? 'border-blue-600 text-blue-600 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5" />
                  <span>Automation Spec</span>
                  {isCodeEdited && (
                    <span className="h-2 w-2 rounded-full bg-amber-500 ml-0.5" title="Script has manual edits" />
                  )}
                </button>
                )}

                {/* 4. Live Browser Screen Tab */}
                <button
                  type="button"
                  onClick={() => setActiveTab('browser')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'browser'
                      ? 'border-blue-600 text-blue-600 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <Monitor className="h-3.5 w-3.5" />
                  <span>Live Browser</span>
                  {isRecording && (
                    <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping ml-0.5" title="Interactive recorder active" />
                  )}
                  {runStatus === 'running' && !isRecording && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" title="Live stream active" />
                  )}
                </button>

                {/* 5. Execution & Backend Logs Tab */}
                <button
                  type="button"
                  onClick={() => setActiveTab('logs')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'logs'
                      ? 'border-blue-600 text-blue-600 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Results</span>
                  {executionLogReport && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono border ${
                        executionLogReport.status === 'passed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      {executionLogReport.steps.length} Steps
                    </span>
                  )}
                  {executionLogReport?.backendAutomationSummary &&
                    executionLogReport.backendAutomationSummary.totalTriggersFired > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-amber-50 text-amber-700 border border-amber-200 font-mono">
                        {executionLogReport.backendAutomationSummary.totalTriggersFired} Triggers
                      </span>
                    )}
                </button>

                {/* 6. QA Standards & Skills Hub (petrkindlmann) */}
                {!isTesterMode && (
                <button
                  type="button"
                  onClick={() => setActiveTab('qa-hub')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'qa-hub'
                      ? 'border-emerald-600 text-emerald-700 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <Award className="h-3.5 w-3.5 text-emerald-600" />
                  <span>QA Skills Hub</span>
                </button>
                )}

                {/* 7. Terminal Console Tab */}
                {!isTesterMode && (
                <button
                  type="button"
                  onClick={() => setActiveTab('terminal')}
                  className={`flex items-center space-x-2 py-3 px-3 text-xs font-medium border-b-2 transition cursor-pointer ${
                    activeTab === 'terminal'
                      ? 'border-blue-600 text-blue-600 font-semibold bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Console</span>
                  {runStatus === 'running' && (
                    <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse ml-1" />
                  )}
                  {runStatus === 'passed' && (
                    <span className="h-2 w-2 rounded-full bg-emerald-500 ml-1" />
                  )}
                  {runStatus === 'failed' && (
                    <span className="h-2 w-2 rounded-full bg-rose-500 ml-1" />
                  )}
                </button>
                )}
              </div>

              {/* Status or actions */}
              <div className="flex items-center space-x-2">
                {activeTab === 'code' && generatedCode && (
                  <>
                    {isCodeEdited && (
                      <button
                        type="button"
                        onClick={handleResetCode}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-2xs cursor-pointer"
                        title="Revert edits back to generated code"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-2xs cursor-pointer"
                    >
                      {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveTestCase}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-medium transition shadow-2xs cursor-pointer"
                    >
                      {saved ? <Check className="h-3 w-3 text-emerald-600" /> : <Save className="h-3 w-3 text-blue-500" />}
                      <span>{saved ? 'Saved!' : 'Save'}</span>
                    </button>
                  </>
                )}

                {activeTab === 'terminal' && (
                  <div className="flex items-center space-x-2 text-xs">
                    <button
                      type="button"
                      onClick={handleCopyCmd}
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-medium transition shadow-2xs cursor-pointer"
                      title="Copy command to run in your terminal"
                    >
                      {copiedCmd ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3 text-slate-400" />}
                      <span>Copy CLI Command</span>
                    </button>

                    {runDuration && (
                      <span className="text-slate-500 flex items-center space-x-1 text-xs font-mono">
                        <Clock className="h-3 w-3 text-slate-400" />
                        <span>{(runDuration / 1000).toFixed(1)}s</span>
                      </span>
                    )}

                    {runStatus !== 'idle' && (
                      <span
                        onClick={() => {
                          if (runStatus === 'failed') setShowFailureModal(true);
                        }}
                        className={`px-2.5 py-0.5 rounded-full font-semibold text-[11px] uppercase transition cursor-pointer ${
                          runStatus === 'passed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : runStatus === 'failed'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 flex items-center space-x-1 shadow-2xs animate-pulse'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                        title={runStatus === 'failed' ? 'Click to open Failure Reason Analysis' : ''}
                      >
                        {runStatus === 'failed' && <AlertTriangle className="h-3 w-3 inline text-rose-600 mr-1" />}
                        <span>{runStatus}</span>
                        {runStatus === 'failed' && <span className="text-[11px] lowercase text-rose-600 font-normal ml-1">· View Reason</span>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 flex flex-col p-4 overflow-auto">
              {/* 1. TEST SUITE & REGRESSION CATALOG TAB */}
              {activeTab === 'suite' && (
                <SuitePanel
                  testCases={testCases}
                  currentTestId={testId}
                  selectedTestIds={selectedTestIds}
                  setSelectedTestIds={setSelectedTestIds}
                  projectFilter={projectFilter}
                  setProjectFilter={setProjectFilter}
                  isRunning={isRunning}
                  isBatchRunning={isBatchRunning}
                  isStopping={isStopping}
                  lastSuiteSummary={lastSuiteSummary}
                  onDismissSummary={() => setLastSuiteSummary(null)}
                  onLoad={(tc) => handleLoadTestCase(tc as TestCaseItem)}
                  onRunTests={(ids, tag) => handleRunBatch(ids, tag)}
                  onRunProject={handleRunProjectRegression}
                  onStop={handleStopExecution}
                  onDelete={handleDeleteTestCase}
                  onDownloadProof={handleDownloadJiraProof}
                  onImportExcel={() => setShowExcelImportModal(true)}
                  onExportExcel={handleExportToExcel}
                  onDownloadTemplate={handleDownloadSampleExcel}
                  onOpenStandardTests={() => setShowTemplateLibraryModal(true)}
                  onOpenNightly={() => setShowNightly(true)}
                />
              )}

              {/* 2. PLAN TAB */}
              {activeTab === 'plan' && (
                <div className="flex-1 space-y-3">
                  {resolvedSteps.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                      <Layers className="h-10 w-10 mb-2 stroke-1 text-slate-400" />
                      <p className="text-sm font-medium text-slate-700">No Resolved Steps Yet</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        Click <strong>"Record"</strong> to record clicks into steps, or click <strong>"Resolve Plan"</strong> to compile manual steps.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg shadow-xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px] tracking-wider font-semibold">
                            <th className="py-2.5 px-3">Step</th>
                            <th className="py-2.5 px-3">Original Step Text</th>
                            <th className="py-2.5 px-3">Resolved Action</th>
                            <th className="py-2.5 px-3">Target</th>
                            <th className="py-2.5 px-3">Confidence</th>
                            <th className="py-2.5 px-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {resolvedSteps.map((step) => (
                            <tr key={step.index} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-3 text-slate-500 font-semibold">{step.index}</td>
                              <td className="py-2.5 px-3 text-slate-800 font-sans max-w-[240px] truncate" title={step.rawText}>
                                {step.rawText}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 font-medium">
                                  {step.action.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-700">
                                {step.action.target || step.action.field || '—'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`inline-block px-1.5 py-0.5 rounded font-semibold text-[11px] ${
                                    step.action.confidence >= 0.90
                                      ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                                      : 'text-amber-700 bg-amber-50 border border-amber-200'
                                  }`}
                                >
                                  {Math.round(step.action.confidence * 100)}%
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {step.status === 'resolved' ? (
                                  <span className="inline-flex items-center text-emerald-600 space-x-1 font-semibold text-[11px]">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>Verified</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center text-amber-600 space-x-1 font-semibold text-[11px]">
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <span>Review</span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 3. CODE TAB - FULLY EDITABLE CODE EDITOR */}
              {activeTab === 'code' && (
                <div className="flex-1 flex flex-col h-full">
                  <div className="flex-1 flex flex-col rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs">
                    {/* Editor Sub-header */}
                    <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs">
                      <div className="flex items-center space-x-2">
                        <FileCode className="h-3.5 w-3.5 text-blue-600" />
                        <span className="font-mono text-[11px] text-slate-700 font-medium">tests/generated/{testId}.spec.ts</span>
                        {isCodeEdited ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-200">
                            Modified (Editable)
                          </span>
                        ) : generatedCode ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold border border-blue-200">
                            Generated (Editable)
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium border border-slate-200">
                            Editor Ready
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {!generatedCode && (
                          <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1 cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3" />
                            <span>Auto-Generate from Steps</span>
                          </button>
                        )}
                        <span className="text-[11px] text-slate-400">Directly editable before running</span>
                      </div>
                    </div>

                    {/* Interactive Code Area */}
                    <textarea
                      value={generatedCode}
                      onChange={(e) => {
                        setGeneratedCode(e.target.value);
                        setIsCodeEdited(true);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                          e.preventDefault();
                          const target = e.target as HTMLTextAreaElement;
                          const start = target.selectionStart;
                          const end = target.selectionEnd;
                          const value = target.value;
                          const newValue = value.substring(0, start) + '  ' + value.substring(end);
                          setGeneratedCode(newValue);
                          setIsCodeEdited(true);
                          setTimeout(() => {
                            target.selectionStart = target.selectionEnd = start + 2;
                          }, 0);
                        }
                      }}
                      spellCheck={false}
                      className="flex-1 w-full p-4 bg-white font-mono text-xs text-slate-900 leading-relaxed outline-none resize-none selection:bg-blue-100 selection:text-blue-900 placeholder:text-slate-400"
                      placeholder={`// Orgwright Automation Spec — click "Record" or "Generate Spec" to auto-compile\n// 1. Define or auto-record steps in the left editor\n// 2. Click "Generate Spec" to synthesize deterministic Lightning automation\n// 3. Click "Run Live" to execute test with zero flakiness\n`}
                    />
                  </div>
                </div>
              )}

              {/* 4. LIVE BROWSER SCREEN TAB */}
              {activeTab === 'browser' && (
                <div className="flex-1 flex flex-col h-full space-y-3">
                  {repair && (
                    <RepairPanel
                      repair={repair}
                      busy={repairBusy}
                      onUseClick={() => sendRepair('clicked', repair.capturedStep)}
                      onRetry={(text) => sendRepair('retry', text)}
                      onFail={() => sendRepair('fail')}
                    />
                  )}
                  {/* Interactive Recorder Control Banner */}
                  {isRecording && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-2 flex items-center justify-between text-xs text-rose-800 shadow-xs">
                      <div className="flex items-center space-x-2">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-600 animate-ping" />
                        <span className="font-semibold text-rose-900">Live Recording Active:</span>
                        <span>Click buttons, dropdowns, fields or scroll in the browser window below to auto-record steps!</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => handleLiveViewportScroll(350)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs shadow-xs font-medium cursor-pointer"
                          title="Trigger Scroll Down"
                        >
                          <ArrowDown className="h-3 w-3" />
                          <span>Scroll Down</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLiveViewportScroll(-350)}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs shadow-xs font-medium cursor-pointer"
                          title="Trigger Scroll Up"
                        >
                          <ArrowUp className="h-3 w-3" />
                          <span>Scroll Up</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleToggleRecording}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                        >
                          Stop Recording
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Browser Window Mockup Frame */}
                  <div className="flex-1 flex flex-col bg-slate-100 rounded-lg border border-slate-200 overflow-hidden shadow-xs">
                    {/* Simulated Browser Address & Controls Bar */}
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs">
                      {/* Window Controls */}
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-1.5">
                          <div className="h-3 w-3 rounded-full bg-rose-400 border border-rose-500/30" />
                          <div className="h-3 w-3 rounded-full bg-amber-400 border border-amber-500/30" />
                          <div className="h-3 w-3 rounded-full bg-emerald-400 border border-emerald-500/30" />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-600 ml-2 hidden sm:inline">
                          Salesforce Lightning Execution Viewport
                        </span>
                      </div>

                      {/* URL Bar */}
                      <div className="flex-1 max-w-lg mx-3 flex items-center space-x-2 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 shadow-xs">
                        <Lock className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                        <span className="truncate text-[11px] text-slate-700">
                          {liveUrl || 'https://login.salesforce.com'}
                        </span>
                      </div>

                      {/* Live Badge */}
                      <div className="flex items-center space-x-2">
                        {isRecording ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-200 text-rose-800 text-[11px] font-semibold flex items-center space-x-1 animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                              <span>RECORDING ({recordedStepsCount})</span>
                            </span>
                            <div className="flex items-center space-x-1 pl-1 border-l border-slate-200">
                              <button
                                type="button"
                                onClick={() => handleLiveViewportScroll(-350)}
                                className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-medium flex items-center space-x-0.5 shadow-2xs transition cursor-pointer"
                                title="Scroll Page Up in Salesforce"
                              >
                                <ArrowUp className="h-2.5 w-2.5 text-blue-600" />
                                <span>Up</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleLiveViewportScroll(350)}
                                className="px-1.5 py-0.5 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-medium flex items-center space-x-0.5 shadow-2xs transition cursor-pointer"
                                title="Scroll Page Down in Salesforce"
                              >
                                <ArrowDown className="h-2.5 w-2.5 text-blue-600" />
                                <span>Down</span>
                              </button>
                            </div>
                          </div>
                        ) : runStatus === 'running' ? (
                          <div className="flex items-center space-x-2">
                            {isPaused ? (
                              <>
                                <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-semibold flex items-center space-x-1 animate-pulse">
                                  <Pause className="h-2.5 w-2.5 text-amber-700 fill-current" />
                                  <span>PAUSED — SCREEN INTERACTIVE</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={handleResumeExecution}
                                  className="px-2.5 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer animate-pulse"
                                  title="Resume test execution from current position"
                                >
                                  <Play className="h-2.5 w-2.5 fill-current" />
                                  <span>Resume</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center space-x-1 animate-pulse">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                  <span>LIVE STREAM</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={handlePauseExecution}
                                  className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer"
                                  title="Pause automation execution to enter values or add steps"
                                >
                                  <Pause className="h-2.5 w-2.5 fill-current" />
                                  <span>Pause</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={handleStopExecution}
                              disabled={isStopping}
                              className="px-2 py-0.5 rounded-md bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer"
                              title="Stop running live automation"
                            >
                              <Square className="h-2.5 w-2.5 fill-current" />
                              <span>{isStopping ? 'Stopping...' : 'Stop Live'}</span>
                            </button>
                          </div>
                        ) : runStatus === 'interrupted' ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-semibold flex items-center space-x-1">
                            <Square className="h-2.5 w-2.5 fill-current text-amber-600" />
                            <span>STOPPED BY USER</span>
                          </span>
                        ) : runStatus === 'passed' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-semibold flex items-center space-x-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                            <span>COMPLETED</span>
                          </span>
                        ) : runStatus === 'failed' ? (
                          <button
                            type="button"
                            onClick={() => setShowFailureModal(true)}
                            className="px-2.5 py-0.5 rounded-full bg-rose-100 border border-rose-200 text-rose-800 hover:bg-rose-200 text-[11px] font-semibold flex items-center space-x-1 transition cursor-pointer"
                            title="Click to view failure reason popup"
                          >
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            <span>FAILED (VIEW REASON)</span>
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-300">
                            STANDBY
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Jira Execution Proof Banner */}
                    {(runStatus === 'passed' || runStatus === 'failed' || availableJiraProofTestId) && (
                      <div className="px-4 py-2 bg-blue-50/90 border-b border-blue-200 flex items-center justify-between text-xs transition">
                        <div className="flex items-center space-x-2 text-blue-900 truncate mr-2">
                          <FileCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />
                          <span className="font-semibold text-blue-950">
                            Jira Test Proof Ready:
                          </span>
                          <span className="text-blue-800 hidden sm:inline truncate">
                            Word document (.docx) with scenario steps, updated test data values & telemetry is compiled.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadJiraProof(availableJiraProofTestId || testId)}
                          className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium text-[11px] flex items-center space-x-1.5 shadow-xs transition cursor-pointer flex-shrink-0"
                          title="Download Word (.docx) test execution proof for Jira upload"
                        >
                          <Download className="h-3 w-3" />
                          <span>{jiraProofDownloaded ? 'Downloaded!' : 'Download Jira Proof (.docx)'}</span>
                        </button>
                      </div>
                    )}

                    {/* Prominent Failure Alert Banner */}
                    {runStatus === 'failed' && (
                      <div className="px-4 py-2 bg-rose-50 border-b border-rose-200 flex items-center justify-between text-xs transition">
                        <div className="flex items-center space-x-2 text-rose-800 truncate mr-2">
                          <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0 animate-pulse" />
                          <span className="font-semibold text-rose-900">
                            {failureAnalysis?.errorTitle || 'Step Execution Timed Out'}
                          </span>
                          <span className="text-slate-600 hidden md:inline truncate">
                            — {failureAnalysis?.humanExplanation || 'Element was not found on screen within timeout.'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowFailureModal(true)}
                          className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-xs flex items-center space-x-1 flex-shrink-0 transition cursor-pointer"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span>View Why Test Failed</span>
                        </button>
                      </div>
                    )}

                    {/* Step Sub-banner */}
                    {liveStep && (
                      <div className={`px-4 py-2 border-b flex items-center justify-between text-xs font-mono transition ${
                        isRecording
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : isPaused
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-blue-50 border-blue-200 text-blue-900'
                      }`}>
                        <div className="flex items-center space-x-2 truncate mr-2">
                          {isRecording ? (
                            <Disc className="h-3.5 w-3.5 text-rose-600 animate-spin flex-shrink-0" />
                          ) : isPaused ? (
                            <Pause className="h-3.5 w-3.5 text-amber-600 fill-current flex-shrink-0 animate-pulse" />
                          ) : (
                            <Play className="h-3.5 w-3.5 text-blue-600 fill-current flex-shrink-0" />
                          )}
                          <span className="font-semibold">{isRecording ? 'Last Recorded Action:' : isPaused ? 'Paused at Step:' : 'Active Step:'}</span>
                          <span className="truncate text-slate-800">{liveStep}</span>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          {isPaused && (
                            <button
                              type="button"
                              onClick={() => handleAddStepAtPause()}
                              className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-sans font-semibold flex items-center space-x-1 shadow-xs cursor-pointer"
                              title="Insert a new step right after the paused step"
                            >
                              <Plus className="h-2.5 w-2.5" />
                              <span>Insert Step</span>
                            </button>
                          )}
                          <span className="text-[11px] font-sans font-medium text-slate-500 hidden sm:inline">
                            {isRecording ? 'Interactive Codegen Active' : isPaused ? 'Live Screen Interactive' : 'Real-time Screencast'}
                          </span>
                          {isRunning && isPaused && (
                            <button
                              type="button"
                              onClick={handleResumeExecution}
                              className="px-2.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer animate-pulse"
                              title="Resume automation testing"
                            >
                              <Play className="h-2.5 w-2.5 fill-current" />
                              <span>Resume</span>
                            </button>
                          )}
                          {isRunning && !isPaused && (
                            <button
                              type="button"
                              onClick={handlePauseExecution}
                              className="px-2.5 py-0.5 rounded bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer"
                              title="Pause automation execution to enter values or add steps"
                            >
                              <Pause className="h-2.5 w-2.5 fill-current" />
                              <span>Pause</span>
                            </button>
                          )}
                          {isRunning && (
                            <button
                              type="button"
                              onClick={handleStopExecution}
                              disabled={isStopping}
                              className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-semibold flex items-center space-x-1 shadow-xs transition cursor-pointer"
                              title="Stop running live automation immediately"
                            >
                              <Square className="h-2.5 w-2.5 fill-current" />
                              <span>{isStopping ? 'Stopping...' : 'Stop'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Live Keyboard & Quick-Type Toolbar when recording or paused */}
                    {(isRecording || isPaused) && (
                      <div className={`border-b px-4 py-2 flex items-center justify-between text-xs space-x-3 ${
                        isPaused
                          ? 'bg-amber-50/90 border-amber-200'
                          : 'bg-blue-50/80 border-blue-100'
                      }`}>
                        <div className="flex items-center space-x-2 text-slate-700 flex-shrink-0">
                          <Keyboard className={`h-4 w-4 ${isPaused ? 'text-amber-600' : 'text-blue-600'}`} />
                          <span className="font-semibold text-slate-800">{isPaused ? 'Interactive Typing (Paused):' : 'Live Typing:'}</span>
                          <span className="text-[11px] text-slate-500 hidden sm:inline">{isPaused ? 'Click screen to focus, then enter value:' : 'Type directly on keyboard or send value:'}</span>
                        </div>
                        <form
                          onSubmit={handleQuickTypeSubmit}
                          className="flex-1 max-w-md flex items-center space-x-1.5"
                        >
                          <input
                            id="live-quick-type-input"
                            type="text"
                            value={quickTypeText}
                            onChange={(e) => setQuickTypeText(e.target.value)}
                            placeholder={isPaused ? "Type value to enter (e.g. 100, Acme Corp) & press Enter..." : "Type value (e.g. 23, Insurance) & press Enter..."}
                            className={`flex-1 bg-white border rounded-md px-3 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none shadow-xs ${
                              isPaused ? 'border-amber-300 focus:border-amber-500' : 'border-blue-200 focus:border-blue-500'
                            }`}
                          />
                          <button
                            type="submit"
                            disabled={!quickTypeText}
                            className={`px-2.5 py-1 text-white rounded-md text-[11px] font-semibold flex items-center space-x-1 flex-shrink-0 shadow-xs transition cursor-pointer disabled:opacity-50 ${
                              isPaused ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            <span>Type</span>
                            <CornerDownLeft className="h-3 w-3" />
                          </button>
                          {isPaused && (
                            <button
                              type="button"
                              disabled={!quickTypeText}
                              onClick={() => {
                                if (quickTypeText) {
                                  handleAddStepAtPause(`Enter "${quickTypeText}" into focused field`);
                                  setQuickTypeText('');
                                }
                              }}
                              className="px-2 py-1 bg-white hover:bg-amber-50 border border-amber-300 text-amber-900 rounded-md text-[11px] font-semibold flex-shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
                              title="Type value and add as step to test scenario"
                            >
                              + Step
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSpecialKey('Enter')}
                            className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md text-[11px] font-mono flex-shrink-0 shadow-xs cursor-pointer"
                            title="Send Enter key to focused field"
                          >
                            Enter ↵
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSpecialKey('Tab')}
                            className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md text-[11px] font-mono flex-shrink-0 shadow-xs cursor-pointer"
                            title="Send Tab key to focused field"
                          >
                            Tab ⇥
                          </button>
                          <div className="flex items-center space-x-1 pl-1.5 border-l border-slate-300">
                            <button
                              type="button"
                              onClick={() => handleLiveViewportScroll(-350)}
                              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md text-[11px] font-medium flex items-center space-x-1 flex-shrink-0 shadow-xs cursor-pointer"
                              title="Scroll page up in Salesforce"
                            >
                              <ArrowUp className="h-3 w-3 text-blue-600" />
                              <span>Up</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLiveViewportScroll(350)}
                              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md text-[11px] font-medium flex items-center space-x-1 flex-shrink-0 shadow-xs cursor-pointer"
                              title="Scroll page down in Salesforce"
                            >
                              <ArrowDown className="h-3 w-3 text-blue-600" />
                              <span>Down</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Live Viewport Screen Canvas */}
                    <div className="flex-1 flex items-center justify-center bg-slate-100/70 p-2 overflow-hidden relative">
                      {liveFrame ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                          <img
                            ref={liveImgRef}
                            src={`data:image/jpeg;base64,${liveFrame}`}
                            onClick={handleLiveViewportClick}
                            onWheel={handleLiveViewportWheel}
                            alt="Live Salesforce Browser Screen"
                            className={`max-h-[520px] w-auto max-w-full rounded-lg shadow-md border border-slate-200 object-contain ${
                              (isRecording || isPaused) ? 'cursor-pointer hover:ring-2 hover:ring-blue-500/50' : ''
                            } ${isPaused ? 'ring-2 ring-amber-500 shadow-amber-500/20' : ''}`}
                            title={(isRecording || isPaused) ? 'Screen is interactive! Click to click, scroll mouse wheel, or type values below.' : ''}
                          />
                        </div>
                      ) : isRecording || runStatus === 'running' ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
                          <div className="h-12 w-12 rounded-full border-2 border-rose-500 border-t-transparent animate-spin mb-2" />
                          <p className="text-sm font-medium text-slate-200">
                            {isRecording ? 'Connecting to Interactive Recording Browser...' : 'Connecting to Live Viewport...'}
                          </p>
                          <p className="text-xs text-slate-500 max-w-xs">
                            Launching Chrome session and establishing screencast stream...
                          </p>
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-3">
                          <MousePointerClick className="h-14 w-14 stroke-1 text-slate-400 mb-2" />
                          <p className="text-sm font-medium text-slate-700">Live Interactive Browser Ready</p>
                          <p className="text-xs text-slate-500 max-w-md">
                            Click <strong>"Record"</strong>. A browser session will open directly with Salesforce. As you click buttons, select dropdowns, fill fields, and scroll, steps will automatically be written into the text definition and compiled into test automation code in real time!
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ticker for latest Terminal Log at the bottom */}
                  {logs.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 flex items-center justify-between text-xs font-mono shadow-xs">
                      <div className="flex items-center space-x-2 text-slate-500 truncate mr-3">
                        <Terminal className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                        <span className="text-[11px] truncate text-slate-700">
                          {logs[logs.length - 1]}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('terminal')}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex-shrink-0 flex items-center space-x-1 cursor-pointer"
                      >
                        <span>View Console Logs ({logs.length})</span>
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 5. EXECUTION & BACKEND LOGS TAB */}
              {activeTab === 'logs' && (
                <ResultsPanel
                  executionLogReport={executionLogReport}
                  setExecutionLogReport={setExecutionLogReport}
                  expandedStepIndex={expandedStepIndex}
                  setExpandedStepIndex={setExpandedStepIndex}
                  logSearchQuery={logSearchQuery}
                  setLogSearchQuery={setLogSearchQuery}
                  logCategoryFilter={logCategoryFilter}
                  setLogCategoryFilter={setLogCategoryFilter}
                  setShowFailureModal={setShowFailureModal}
                  setShowRawApexLogModal={setShowRawApexLogModal}
                  setZoomedScreenshot={setZoomedScreenshot}
                  isTesterMode={isTesterMode}
                  selectedOrg={selectedOrg}
                  selectedPersona={selectedPersona}
                  testId={testId}
                />
              )}

              {/* 6. TERMINAL TAB */}
              {activeTab === 'terminal' && (
                <div className="flex-1 flex flex-col bg-slate-950 border border-slate-800/80 rounded-lg p-4 font-mono text-xs overflow-auto">
                  {logs.length === 0 && runStatus === 'idle' ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                      <Terminal className="h-10 w-10 mb-2 stroke-1 text-slate-600" />
                      <p className="text-sm font-medium text-slate-400">Execution Console Ready</p>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm">
                        Click <strong>"Run Live"</strong> or <strong>"Run Selected"</strong> to watch execution logs and assertions in real time.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1 text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {logs.map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.includes('passed') || line.includes('Passed') || line.includes('2 passed')
                              ? 'text-emerald-400'
                              : line.includes('failed') || line.includes('Failed') || line.includes('Error')
                              ? 'text-rose-400'
                              : line.includes('Launching') || line.includes('Running') || line.includes('foreground')
                              ? 'text-sky-400 font-semibold'
                              : 'text-slate-300'
                          }
                        >
                          {line}
                        </div>
                      ))}
                      <div ref={terminalEndRef} />
                    </div>
                  )}
                </div>
              )}

              {/* 6. QA STANDARDS & SKILLS HUB TAB (petrkindlmann/qa-skills) */}
              {activeTab === 'qa-hub' && (
                <QASkillsHub
                  currentSpecCode={generatedCode}
                  ticketNumber={ticketNumber}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* USER-FRIENDLY TEST FAILURE POPUP MODAL */}
      {showFailureModal && failureAnalysis && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-rose-50/90 border-b border-rose-100 p-4 px-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-lg bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                    <span>{failureAnalysis.errorTitle || 'Test Execution Failed'}</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    {ticketNumber} ({testId}) • Test Execution Failure
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFailureModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-rose-100/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto text-sm text-slate-800">
              {/* Failing Step Callout */}
              {failureAnalysis.failedStepText && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-rose-800 flex items-center space-x-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
                      <span>Failing Step #{failureAnalysis.failedStepIndex || '?'}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-mono text-[11px] font-semibold border border-rose-200">
                      Timed out (25s)
                    </span>
                  </div>
                  <div className="font-mono text-xs text-rose-900 bg-white p-2.5 rounded-lg border border-rose-200">
                    {failureAnalysis.failedStepText}
                  </div>
                </div>
              )}

              {/* Plain-English Explanation */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-4 space-y-1.5">
                <div className="text-xs font-semibold text-blue-800 flex items-center space-x-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-blue-600" />
                  <span>Why Did This Test Fail? (Simple Explanation)</span>
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">
                  {failureAnalysis.humanExplanation}
                </p>
              </div>

              {/* Root Cause in Salesforce */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-4 space-y-1.5">
                <div className="text-xs font-semibold text-amber-800 flex items-center space-x-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  <span>Under the Hood (Salesforce Root Cause)</span>
                </div>
                <p className="text-slate-700 text-xs leading-relaxed">
                  {failureAnalysis.rootCause}
                </p>
              </div>

              {/* Recommendation & One-Click Fix */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-emerald-800 flex items-center space-x-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Recommended Fix</span>
                  </div>
                  {failureAnalysis.suggestedStepFix && (
                    <span className="text-[11px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                      1-Click Auto-Fix Ready
                    </span>
                  )}
                </div>
                <p className="text-emerald-900 text-xs leading-relaxed">
                  {failureAnalysis.recommendation}
                </p>
                {failureAnalysis.suggestedStepFix && (
                  <div className="bg-white border border-emerald-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
                    <div className="text-xs font-mono text-emerald-900">
                      <span className="text-slate-500 text-[11px] block">Suggested Replacement Step:</span>
                      {failureAnalysis.suggestedStepFix}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyFailureFix(false)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs flex items-center space-x-1 flex-shrink-0 transition cursor-pointer"
                    >
                      <Wrench className="h-3.5 w-3.5" />
                      <span>Apply Fix to Step #{failureAnalysis.failedStepIndex}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Failure Screenshot Preview */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowFailureScreenshot(!showFailureScreenshot)}
                  className="w-full p-2.5 px-3 flex items-center justify-between text-xs text-slate-700 hover:text-slate-900 bg-slate-100/70 transition cursor-pointer"
                >
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Monitor className="h-3.5 w-3.5 text-blue-600" />
                    <span>Browser State at Moment of Failure</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {showFailureScreenshot ? 'Hide Screenshot ▲' : 'Show Screenshot ▼'}
                  </span>
                </button>
                {showFailureScreenshot && (
                  <div className="p-3 bg-white flex items-center justify-center border-t border-slate-200">
                    <img
                      src="/api/test-results/screenshot"
                      alt="Browser failure screenshot"
                      className="max-h-64 rounded border border-slate-200 object-contain shadow-xs"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Collapsible Technical Details */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowTechDetails(!showTechDetails)}
                  className="w-full p-2.5 px-3 flex items-center justify-between text-xs text-slate-700 hover:text-slate-900 bg-slate-100/70 transition cursor-pointer"
                >
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Terminal className="h-3.5 w-3.5 text-slate-500" />
                    <span>Technical Details (Execution Trace & Call Log)</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {showTechDetails ? 'Hide Details ▲' : 'Show Details ▼'}
                  </span>
                </button>
                {showTechDetails && (
                  <div className="p-3 bg-slate-950 font-mono text-[11px] text-slate-300 space-y-2 border-t border-slate-200">
                    {failureAnalysis.specFile && (
                      <div>
                        <span className="text-slate-500">Location: </span>
                        <span className="text-sky-300">
                          {failureAnalysis.specFile.replace(/.*[\\/](Playwright|orgwright)[\\/]/, '')}:{failureAnalysis.specLine}
                        </span>
                      </div>
                    )}
                    {failureAnalysis.rawErrorMessage && (
                      <div className="text-rose-400 font-semibold">
                        {failureAnalysis.rawErrorMessage}
                      </div>
                    )}
                    {failureAnalysis.callLog && failureAnalysis.callLog.length > 0 && (
                      <div>
                        <span className="text-slate-500 block mb-1">Execution Call Log:</span>
                        <div className="bg-slate-900 p-2 rounded text-slate-400 space-y-0.5">
                          {failureAnalysis.callLog.map((c, i) => (
                            <div key={i}>• {c}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowFailureModal(false)}
                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                Close & Review Steps
              </button>
              <div className="w-full sm:w-auto flex items-center space-x-2">
                {failureAnalysis.suggestedStepFix && (
                  <button
                    type="button"
                    onClick={() => handleApplyFailureFix(true)}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Auto-Fix & Re-Run Live</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-USER PERSONA MATRIX RUNNER MODAL */}
      {showMatrixModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-200 p-4 px-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900 text-base">Multi-User Persona Matrix Runner</h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                      Cross-Profile Validation
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Execute <strong className="text-slate-800">{testId}</strong> ({ticketNumber || 'Ticket'}) across multiple Salesforce profiles to validate permissions, read-only fields & FLS.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMatrixModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800">
              {/* Context strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">Active Test Case</span>
                  <span className="font-semibold text-slate-900">{testId}: {testName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Scenario Classification</span>
                  <span className={`font-semibold font-mono ${scenarioType === 'positive' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {scenarioType === 'positive' ? 'Positive Scenario' : 'Negative Scenario'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">Connected Org</span>
                  <span className="font-semibold text-emerald-700">{selectedOrg} (Sandbox)</span>
                </div>
              </div>

              {/* Selection Toolbar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMatrixUserIds(orgUsers.map((u) => u.id))}
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer shadow-xs"
                  >
                    Select All ({orgUsers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMatrixUserIds([])}
                    className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition cursor-pointer shadow-xs"
                  >
                    Deselect All
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const seen = new Set<string>();
                      const diverse: string[] = [];
                      for (const u of orgUsers) {
                        if (!seen.has(u.profileName)) {
                          seen.add(u.profileName);
                          diverse.push(u.id);
                        }
                      }
                      setSelectedMatrixUserIds(diverse);
                    }}
                    className="px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-medium transition cursor-pointer shadow-xs"
                    title="Select 1 user from each distinct profile"
                  >
                    Diverse Profiles (1 / Profile)
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-xs text-indigo-800 font-semibold px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200">
                    {selectedMatrixUserIds.length} of {orgUsers.length} Personas Selected
                  </span>
                </div>
              </div>

              {/* Persona Selection Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {orgUsers.map((user) => {
                  const isChecked = selectedMatrixUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => {
                        setSelectedMatrixUserIds((prev) =>
                          prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                        );
                      }}
                      className={`p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
                        isChecked
                          ? 'bg-indigo-50/80 border-indigo-300 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div
                          className={`h-4 w-4 rounded flex items-center justify-center border transition ${
                            isChecked
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-semibold text-slate-900 truncate">{user.name}</span>
                            {user.isDefault && (
                              <span className="px-1 text-[10px] rounded bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="flex items-center space-x-1.5 text-[11px]">
                            <span className="font-mono text-indigo-700 px-1 py-0.2 rounded bg-indigo-100/60 font-semibold">
                              {user.profileName}
                            </span>
                            {user.roleName && (
                              <span className="text-slate-500 truncate max-w-[120px]">• {user.roleName}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Matrix Live Results Table & Summary */}
              {(isMatrixRunning || matrixResults.length > 0) && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-indigo-600" />
                      <h4 className="text-xs font-semibold text-slate-900 uppercase tracking-wider">
                        Execution Matrix Results
                      </h4>
                    </div>

                    {matrixSummary && (
                      <div className="flex items-center space-x-3">
                        <span className="text-xs font-semibold text-slate-700">
                          Compliance: <strong className="text-emerald-600">{matrixSummary.complianceRate}</strong> ({matrixSummary.passed}/{matrixSummary.total} Passed)
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyMatrixJiraReport}
                          className="px-2.5 py-1 rounded bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium flex items-center space-x-1 transition cursor-pointer shadow-xs"
                        >
                          {copiedMatrixReport ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                          <span>{copiedMatrixReport ? 'Report Copied!' : 'Copy Jira Summary'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Progress Indicator */}
                  {isMatrixRunning && (
                    <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center space-x-3">
                      <RefreshCw className="h-4 w-4 text-indigo-600 animate-spin flex-shrink-0" />
                      <div className="text-xs">
                        <span className="text-indigo-800 font-medium">Executing persona {matrixProgressIndex + 1} of {selectedMatrixUserIds.length}: </span>
                        <strong className="text-slate-900">{currentMatrixPersona?.name}</strong>{' '}
                        <span className="text-indigo-700 font-semibold">[{currentMatrixPersona?.profileName}]</span>
                      </div>
                    </div>
                  )}

                  {/* Results List */}
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
                    {matrixResults.map((item, idx) => (
                      <div key={idx} className="p-3 flex items-center justify-between hover:bg-slate-50 transition">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="h-7 w-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700 flex-shrink-0">
                            {item.persona.name.charAt(0)}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-semibold text-slate-900">{item.persona.name}</span>
                              <span className="text-[11px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                                {item.persona.profileName}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">{item.persona.username}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          {item.durationMs && (
                            <span className="text-xs text-slate-500 font-mono">
                              {(item.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}

                          {item.status === 'pending' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Queued
                            </span>
                          )}
                          {item.status === 'running' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 flex items-center space-x-1 animate-pulse">
                              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                              <span>Running</span>
                            </span>
                          )}
                          {item.status === 'passed' && (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>Passed</span>
                            </span>
                          )}
                          {item.status === 'failed' && (
                            <div className="flex items-center space-x-2">
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center space-x-1">
                                <AlertCircle className="h-3 w-3 text-rose-600" />
                                <span>Failed</span>
                              </span>
                              {item.error && (
                                <span className="text-[11px] text-rose-700 max-w-[240px] truncate" title={item.error}>
                                  {item.error}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowMatrixModal(false)}
                className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handleRunMatrix}
                disabled={isMatrixRunning || selectedMatrixUserIds.length === 0}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs flex items-center space-x-2 disabled:opacity-50 transition cursor-pointer"
              >
                {isMatrixRunning ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Executing Matrix ({selectedMatrixUserIds.length} Personas)...</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Run Multi-User Matrix ({selectedMatrixUserIds.length} Personas)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RAW SALESFORCE APEX DEBUG LOG MODAL */}
      {showRawApexLogModal && executionLogReport && executionLogReport.salesforceLogs.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="bg-slate-50 border-b border-slate-200 p-4 px-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-lg bg-amber-600 flex items-center justify-center text-white shadow-xs">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Salesforce Apex Debug Log Viewer</h3>
                  <p className="text-xs text-slate-500">
                    Live captured from connected org: <strong className="text-slate-800">{selectedOrg}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRawApexLogModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col overflow-hidden space-y-3">
              {/* Log selector pills */}
              <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
                {executionLogReport.salesforceLogs.map((log, idx) => (
                  <button
                    key={log.logId}
                    type="button"
                    onClick={() => setSelectedRawLogIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg font-mono transition flex items-center space-x-1.5 cursor-pointer shadow-xs ${
                      selectedRawLogIndex === idx
                        ? 'bg-amber-600 text-white font-semibold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <span>{log.logId}</span>
                    <span className="text-[11px] opacity-75">({log.operation})</span>
                  </button>
                ))}
              </div>

              {/* Log content */}
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-[11px] text-slate-300 overflow-y-auto space-y-0.5 leading-relaxed">
                {executionLogReport.salesforceLogs[selectedRawLogIndex]?.rawLogPreview.map((line, lIdx) => (
                  <div key={lIdx} className="hover:bg-slate-900/50 px-1 rounded flex">
                    <span className="text-slate-600 w-8 select-none flex-shrink-0 text-right pr-2">{lIdx + 1}</span>
                    <span
                      className={
                        line.includes('FATAL_ERROR') || line.includes('EXCEPTION')
                          ? 'text-rose-400 font-bold'
                          : line.includes('VALIDATION_PASS')
                          ? 'text-emerald-400'
                          : line.includes('CODE_UNIT_STARTED') || line.includes('FLOW_')
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }
                    >
                      {line}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-mono">
                Log ID: {executionLogReport.salesforceLogs[selectedRawLogIndex]?.logId}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const text = executionLogReport.salesforceLogs[selectedRawLogIndex]?.rawLogPreview.join('\n') || '';
                    navigator.clipboard.writeText(text);
                    setCopiedRawLog(true);
                    setTimeout(() => setCopiedRawLog(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                >
                  {copiedRawLog ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedRawLog ? 'Copied Log!' : 'Copy Debug Log'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRawApexLogModal(false)}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* EXCEL TEST SCENARIO IMPORT MODAL */}
      {showExcelImportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-slate-50 border-b border-slate-200 p-4 px-6 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-xs">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-slate-900 text-base">Import Test Scenarios from Excel</h3>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      .XLSX / .CSV Bulk Ingestion
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Upload an Excel spreadsheet with test scenarios, step definitions, and positive/negative classifications.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowExcelImportModal(false);
                  setImportedScenariosPreview([]);
                  setImportFileName('');
                  setExcelImportError(null);
                  setExcelImportSuccess(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1 text-slate-800">
              {/* File Upload Drop Area */}
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl p-6 bg-slate-50/50 hover:bg-emerald-50/20 transition flex flex-col items-center justify-center text-center cursor-pointer relative">
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleExcelFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
                <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {importFileName ? (
                    <span className="text-emerald-700 font-bold">{importFileName}</span>
                  ) : (
                    'Click to select or drag and drop your Excel spreadsheet (.xlsx, .csv)'
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Columns recognized: <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono">Test ID</code>, <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono">Scenario Type</code>, <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono">Jira Ticket</code>, <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono">Test Scenario Objective</code>, <code className="bg-slate-200/80 px-1 py-0.5 rounded text-[11px] font-mono">Test Steps & Data</code>.
                </p>
                <div className="mt-3 flex items-center space-x-3 text-xs">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadSampleExcel();
                    }}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold underline flex items-center space-x-1 cursor-pointer"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download Standard Scenario Template</span>
                  </button>
                </div>
              </div>

              {/* Status Alerts */}
              {excelImportError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  <span>{excelImportError}</span>
                </div>
              )}

              {excelImportSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  <span>{excelImportSuccess}</span>
                </div>
              )}

              {/* Parsed Scenarios Preview */}
              {importedScenariosPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <div className="flex items-center space-x-2">
                      <span>Parsed Scenarios ({importedScenariosPreview.length})</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px]">
                        {importedScenariosPreview.filter(s => s.scenarioType === 'positive').length} Positive
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px]">
                        {importedScenariosPreview.filter(s => s.scenarioType === 'negative').length} Negative
                      </span>
                    </div>
                    <span className="text-slate-400 font-normal text-[11px]">Click badge to toggle type</span>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 text-[11px]">
                        <tr>
                          <th className="py-2 px-3 w-16">ID</th>
                          <th className="py-2 px-3 w-28">Type</th>
                          <th className="py-2 px-3 w-24">Ticket</th>
                          <th className="py-2 px-3">Test Scenario Objective</th>
                          <th className="py-2 px-3 w-20 text-center">Steps</th>
                          <th className="py-2 px-3 w-12 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-800">
                        {importedScenariosPreview.map((sc, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="py-2 px-3 font-mono text-blue-700 font-bold">{sc.id}</td>
                            <td className="py-2 px-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setImportedScenariosPreview(prev =>
                                    prev.map((item, i) =>
                                      i === idx
                                        ? { ...item, scenarioType: item.scenarioType === 'positive' ? 'negative' : 'positive' }
                                        : item
                                    )
                                  );
                                }}
                                className="cursor-pointer"
                                title="Click to toggle Positive / Negative"
                              >
                                {sc.scenarioType === 'negative' ? (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-semibold">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                                    <span>Negative</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                    <span>Positive</span>
                                  </span>
                                )}
                              </button>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-slate-600">{sc.ticketNumber || '—'}</td>
                            <td className="py-2 px-3 font-medium text-slate-900 max-w-[280px] truncate" title={sc.testName}>
                              {sc.testName}
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-slate-500 text-[11px]">
                              {sc.stepCount}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setImportedScenariosPreview(prev => prev.filter((_, i) => i !== idx));
                                }}
                                className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                title="Remove row from import"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-200 p-4 px-6 flex items-center justify-between">
              <button
                type="button"
                onClick={handleDownloadSampleExcel}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center space-x-1 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 text-slate-500" />
                <span>Download Sample .xlsx Template</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExcelImportModal(false);
                    setImportedScenariosPreview([]);
                    setImportFileName('');
                    setExcelImportError(null);
                    setExcelImportSuccess(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImportScenarios}
                  disabled={importedScenariosPreview.length === 0 || isImportingExcel}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold shadow-xs flex items-center space-x-1.5 transition cursor-pointer"
                >
                  {isImportingExcel ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {isImportingExcel
                      ? 'Importing...'
                      : `Import Scenarios (${importedScenariosPreview.length})`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SALESFORCE ORG CONNECTOR MODAL */}
      <OrgConnectorModal
        isOpen={showOrgConnectorModal}
        onClose={() => setShowOrgConnectorModal(false)}
        currentOrgAlias={selectedOrg}
        onSelectOrg={(alias) => {
          handleSwitchOrg(alias);
          setShowOrgConnectorModal(false);
        }}
      />

      {/* SALESFORCE STANDARD TEST TEMPLATES LIBRARY MODAL */}
      <TestTemplateLibraryModal
        isOpen={showTemplateLibraryModal}
        onClose={() => setShowTemplateLibraryModal(false)}
        onSelectTemplate={handleLoadTemplate}
        onImportToSuite={handleImportTemplateToSuite}
        onImportAllToSuite={handleImportAllTemplates}
      />
      <NightlyModal
        open={showNightly}
        onClose={() => setShowNightly(false)}
        tags={[...new Set(testCases.flatMap((t) => t.tags || []))]}
        defaultOrg={selectedOrg}
      />
      <OnboardingWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        orgConnected={Boolean(orgStatus?.connected)}
        orgLabel={selectedOrg}
        onOpenConnector={() => setShowOrgConnectorModal(true)}
        standardObjects={standardObjects}
        customObjects={customObjects}
        initialObject={objectContext}
        onFinish={handleWizardFinish}
      />
      {zoomedScreenshot && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/80 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setZoomedScreenshot(null)}
        >
          <img src={zoomedScreenshot} alt="Step screenshot" className="max-h-full max-w-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}
