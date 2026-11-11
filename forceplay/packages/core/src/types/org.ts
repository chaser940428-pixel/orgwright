import { z } from 'zod';

export const PersonaSchema = z.object({
  name: z.string(), // e.g. "admin", "salesAgent", "billingManager"
  username: z.string(),
  profile: z.string().optional(),
  permissionSets: z.array(z.string()).default([])
});

export type Persona = z.infer<typeof PersonaSchema>;

export const OrgConfigSchema = z.object({
  alias: z.string(), // e.g. "sandboxOrg", "stage", "prod"
  loginUrl: z.string().url().default('https://test.salesforce.com'),
  instanceUrl: z.string().url().optional(),
  clientId: z.string().optional(),
  keyRef: z.string().optional(), // reference to private key in OS keychain
  defaultPersona: z.string().default('admin'),
  personas: z.array(PersonaSchema).default([])
});

export type OrgConfig = z.infer<typeof OrgConfigSchema>;

export const SfSessionSchema = z.object({
  alias: z.string(),
  persona: z.string(),
  instanceUrl: z.string(),
  accessToken: z.string().optional(),
  frontdoorUrl: z.string().optional(),
  storageStatePath: z.string(),
  expiresAt: z.number().optional()
});

export type SfSession = z.infer<typeof SfSessionSchema>;
