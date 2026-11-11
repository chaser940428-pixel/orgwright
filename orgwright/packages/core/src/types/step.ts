import { z } from 'zod';

export const ActionTypeEnum = z.enum([
  'navigate_app',
  'open_list',
  'open_record',
  'activate_tab',
  'click_action',
  'fill_field',
  'select_picklist',
  'select_lookup',
  'set_checkbox',
  'create_note',
  'sync_notes',
  'save_modal',
  'close_modal',
  'assert_toast',
  'assert_field',
  'assert_visible',
  'assert_not_visible',
  'assert_field_readonly',
  'assert_field_editable',
  'assert_field_error',
  'remember_value',
  'related_list_open',
  'related_list_action',
  'assert_related_count',
  'path_select',
  'select_record_type',
  'dual_listbox',
  'delete_record',
  'change_owner',
  'global_search',
  'inline_edit',
  'submit_for_approval',
  'convert_lead',
  'api_create',
  'app_launcher_open',
  'nav_tab',
  'select_list_view',
  'select_list_records',
  'run_apex',
  'scroll',
  'custom'
]);

export type ActionType = z.infer<typeof ActionTypeEnum>;

export const ResolvedActionSchema = z.object({
  type: ActionTypeEnum,
  target: z.string(), // e.g. "DreamHouse App", "Property__c", "Sync Property Notes"
  field: z.string().optional(),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  tab: z.string().optional(),
  extra: z.record(z.any()).optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  generatedCode: z.string().optional()
});

export type ResolvedAction = z.infer<typeof ResolvedActionSchema>;

export const TestStepSchema = z.object({
  id: z.string().uuid().optional(),
  index: z.number(),
  rawText: z.string(),
  action: ResolvedActionSchema.optional(),
  status: z.enum(['pending', 'resolved', 'review_required', 'failed']).default('pending'),
  reviewNotes: z.string().optional()
});

export type TestStep = z.infer<typeof TestStepSchema>;

export const TestCaseSchema = z.object({
  id: z.string(), // e.g. "TC_002"
  ticketNumber: z.string().optional(), // e.g. "AMS-2272"
  name: z.string(), // e.g. "Verify That User can Create a Note in Encounter"
  projectName: z.string().default('Salesforce'),
  targetOrg: z.string().default('default'),
  persona: z.string().default('admin'),
  steps: z.array(TestStepSchema),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export type TestCase = z.infer<typeof TestCaseSchema>;
