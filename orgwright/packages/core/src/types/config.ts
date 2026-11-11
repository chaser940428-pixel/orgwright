import { z } from 'zod';
import { OrgConfigSchema } from './org.js';

export const OrgwrightConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  defaultOrg: z.string().default('default'),
  orgs: z.record(OrgConfigSchema).default({}),
  paths: z.object({
    specsDir: z.string().default('./tests/generated'),
    pagesDir: z.string().default('./pages'),
    reportsDir: z.string().default('./playwright-report'),
    authDir: z.string().default('./.auth')
  }).default({}),
  execution: z.object({
    headed: z.boolean().default(true),
    workers: z.number().int().positive().default(1),
    timeoutMs: z.number().int().positive().default(90000),
    actionTimeoutMs: z.number().int().positive().default(25000),
    slowMo: z.number().int().nonnegative().default(150)
  }).default({}),
  connectors: z.object({
    jira: z.object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().url().optional(),
      email: z.string().optional(),
      apiToken: z.string().optional(),
      projectKey: z.string().optional()
    }).default({ enabled: false })
  }).default({})
});

export type OrgwrightConfig = z.infer<typeof OrgwrightConfigSchema>;
