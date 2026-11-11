import { z } from 'zod';

export const FieldDescribeSchema = z.object({
  apiName: z.string(),
  label: z.string(),
  type: z.enum([
    'string',
    'textarea',
    'picklist',
    'multipicklist',
    'boolean',
    'currency',
    'date',
    'datetime',
    'reference',
    'number',
    'url',
    'email',
    'phone',
    'other'
  ]),
  picklistValues: z.array(z.string()).default([]),
  referenceTo: z.array(z.string()).default([]),
  required: z.boolean().default(false),
  readOnly: z.boolean().default(false)
});

export type FieldDescribe = z.infer<typeof FieldDescribeSchema>;

export const ActionDescribeSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['QuickAction', 'CustomButton', 'StandardButton', 'LwcButton']),
  target: z.string().optional()
});

export type ActionDescribe = z.infer<typeof ActionDescribeSchema>;

export const TabDescribeSchema = z.object({
  label: z.string(), // e.g. "Details", "Related", "Notes"
  isDefault: z.boolean().default(false),
  fields: z.array(z.string()).default([])
});

export type TabDescribe = z.infer<typeof TabDescribeSchema>;

export const SObjectDescribeSchema = z.object({
  apiName: z.string(), // e.g. "Property__c", "Account"
  label: z.string(),
  listUrl: z.string(),
  tabs: z.array(TabDescribeSchema).default([]),
  actions: z.array(ActionDescribeSchema).default([]),
  fields: z.record(FieldDescribeSchema).default({})
});

export type SObjectDescribe = z.infer<typeof SObjectDescribeSchema>;

export const OrgMetadataCacheSchema = z.object({
  orgAlias: z.string(),
  release: z.string().default("Winter '27"),
  updatedAt: z.string().datetime(),
  apps: z.record(z.object({
    name: z.string(),
    label: z.string(),
    defaultObject: z.string().optional()
  })).default({}),
  objects: z.record(SObjectDescribeSchema).default({})
});

export type OrgMetadataCache = z.infer<typeof OrgMetadataCacheSchema>;
