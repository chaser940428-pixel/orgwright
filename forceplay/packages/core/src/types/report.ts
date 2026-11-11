import { z } from 'zod';

export const StepExecutionResultSchema = z.object({
  stepIndex: z.number(),
  rawText: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  durationMs: z.number(),
  error: z.string().optional(),
  screenshotPath: z.string().optional()
});

export type StepExecutionResult = z.infer<typeof StepExecutionResultSchema>;

export const TestExecutionReportSchema = z.object({
  testId: z.string(),
  ticketNumber: z.string().optional(),
  name: z.string(),
  status: z.enum(['passed', 'failed', 'timedOut', 'interrupted']),
  durationMs: z.number(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  steps: z.array(StepExecutionResultSchema).default([]),
  tracePath: z.string().optional(),
  videoPath: z.string().optional(),
  errorSummary: z.string().optional(),
  rawLogs: z.string().optional()
});

export type TestExecutionReport = z.infer<typeof TestExecutionReportSchema>;
