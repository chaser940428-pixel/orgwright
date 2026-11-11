import {
  ActionType,
  OrgMetadataCache,
  ResolvedAction,
  SObjectDescribe,
  FieldDescribe
} from '@orgwright/core';
import { ParsedStepResult } from './stepParser.js';

export interface ResolutionContext {
  currentApp?: string;
  currentObject?: string;
  currentRecordId?: string;
  lastField?: string;
}

export interface CatalogMatchResult {
  action: ResolvedAction;
  updatedContext: ResolutionContext;
}

// Built-in standard Salesforce catalog
const STANDARD_OBJECTS: Record<string, { apiName: string; label: string; listUrl: string; fields?: Record<string, Partial<FieldDescribe>> }> = {
  property: {
    apiName: 'Property__c',
    label: 'Property',
    listUrl: '/lightning/o/Property__c/list',
    fields: {
      price: { apiName: 'Price__c', label: 'Price', type: 'currency' },
      status: { apiName: 'Status__c', label: 'Status', type: 'picklist', picklistValues: ['Available', 'Under Contract', 'Closed'] },
      bedrooms: { apiName: 'Bedrooms__c', label: 'Bedrooms', type: 'number' },
      broker: { apiName: 'Broker__c', label: 'Broker', type: 'reference', referenceTo: ['Broker__c', 'Contact'] },
      title: { apiName: 'Title__c', label: 'Title', type: 'string' }
    }
  },
  property__c: {
    apiName: 'Property__c',
    label: 'Property',
    listUrl: '/lightning/o/Property__c/list'
  },
  account: {
    apiName: 'Account',
    label: 'Account',
    listUrl: '/lightning/o/Account/list',
    fields: {
      name: { apiName: 'Name', label: 'Account Name', type: 'string' },
      type: { apiName: 'Type', label: 'Type', type: 'picklist' },
      industry: { apiName: 'Industry', label: 'Industry', type: 'picklist' }
    }
  },
  contact: {
    apiName: 'Contact',
    label: 'Contact',
    listUrl: '/lightning/o/Contact/list'
  },
  opportunity: {
    apiName: 'Opportunity',
    label: 'Opportunity',
    listUrl: '/lightning/o/Opportunity/list',
    fields: {
      stagename: { apiName: 'StageName', label: 'Stage', type: 'picklist' },
      amount: { apiName: 'Amount', label: 'Amount', type: 'currency' }
    }
  },
  case: {
    apiName: 'Case',
    label: 'Case',
    listUrl: '/lightning/o/Case/list',
    fields: {
      status: { apiName: 'Status', label: 'Status', type: 'picklist' },
      priority: { apiName: 'Priority', label: 'Priority', type: 'picklist' }
    }
  },
  claim: {
    apiName: 'Claim__c',
    label: 'Claim',
    listUrl: '/lightning/o/Claim__c/list'
  },
  payment: {
    apiName: 'Payment__c',
    label: 'Payment',
    listUrl: '/lightning/o/Payment__c/list'
  }
};

const STANDARD_APPS: Record<string, { name: string; label: string; defaultObject?: string }> = {
  revenueopsconsole: {
    name: 'Revenue_Ops_Console',
    label: 'Revenue Ops Console',
    defaultObject: 'Account'
  },
  sales: {
    name: 'Sales',
    label: 'Sales',
    defaultObject: 'Opportunity'
  },
  service: {
    name: 'Service',
    label: 'Service',
    defaultObject: 'Case'
  },
  healthcloud: {
    name: 'Health_Cloud',
    label: 'Health Cloud',
    defaultObject: 'Account'
  }
};

/**
 * Normalizes an identifier by lowercasing and stripping non-alphanumeric characters.
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds an SObject in either user cache or standard catalog.
 */
function findSObject(
  targetName: string,
  cache?: OrgMetadataCache
): { apiName: string; label: string; describe?: SObjectDescribe } | undefined {
  const norm = normalizeKey(targetName);

  // 1. Check user-supplied OrgMetadataCache
  if (cache?.objects) {
    for (const [key, obj] of Object.entries(cache.objects)) {
      if (
        normalizeKey(key) === norm ||
        normalizeKey(obj.apiName) === norm ||
        normalizeKey(obj.label) === norm ||
        normalizeKey(obj.apiName.replace(/__c$/i, '')) === norm
      ) {
        return { apiName: obj.apiName, label: obj.label, describe: obj };
      }
    }
  }

  // 2. Check standard built-in catalog
  const standard = STANDARD_OBJECTS[norm] || STANDARD_OBJECTS[norm + 'c'] || STANDARD_OBJECTS[norm.replace(/c$/, '')];
  if (standard) {
    return { apiName: standard.apiName, label: standard.label };
  }

  return undefined;
}

/**
 * Finds an App in user cache or standard catalog.
 */
function findApp(
  appName: string,
  cache?: OrgMetadataCache
): { name: string; label: string; defaultObject?: string } | undefined {
  const norm = normalizeKey(appName);

  if (cache?.apps) {
    for (const [key, app] of Object.entries(cache.apps)) {
      if (
        normalizeKey(key) === norm ||
        normalizeKey(app.name) === norm ||
        normalizeKey(app.label) === norm
      ) {
        return { name: app.name, label: app.label, defaultObject: app.defaultObject };
      }
    }
  }

  const standard = STANDARD_APPS[norm];
  if (standard) {
    return standard;
  }

  return undefined;
}

/**
 * Matches a field name against an SObjectDescribe's fields.
 */
function findField(
  fieldName: string,
  sObjectApi: string,
  cache?: OrgMetadataCache
): FieldDescribe | Partial<FieldDescribe> | undefined {
  const norm = normalizeKey(fieldName);
  const objKey = normalizeKey(sObjectApi);
  const strippedObjKey = objKey.endsWith('c') ? objKey.slice(0, -1) : objKey;

  if (cache?.objects) {
    const describe = cache.objects[sObjectApi] || cache.objects[objKey] || cache.objects[strippedObjKey];
    if (describe?.fields) {
      for (const [key, field] of Object.entries(describe.fields)) {
        if (
          normalizeKey(key) === norm ||
          normalizeKey(field.apiName) === norm ||
          normalizeKey(field.label) === norm ||
          normalizeKey(field.apiName.replace(/__c$/i, '')) === norm
        ) {
          return field;
        }
      }
    }
  }

  const stdObj = STANDARD_OBJECTS[objKey] || STANDARD_OBJECTS[strippedObjKey];
  if (stdObj?.fields) {
    for (const [key, field] of Object.entries(stdObj.fields)) {
      if (
        normalizeKey(key) === norm ||
        (field.apiName && normalizeKey(field.apiName) === norm) ||
        (field.label && normalizeKey(field.label) === norm)
      ) {
        return field;
      }
    }
  }

  return undefined;
}

/**
 * Matches parsed manual steps against the Salesforce component catalog.
 * Refines action types based on field types (e.g. fill_field -> select_picklist / set_checkbox),
 * canonicalizes object / app / tab names, and computes calibrated confidence scores.
 */
export function matchCatalog(
  parsed: ParsedStepResult,
  catalog?: OrgMetadataCache,
  context: ResolutionContext = {}
): CatalogMatchResult {
  const updatedContext: ResolutionContext = { ...context };
  let actionType: ActionType = parsed.actionType;
  let target = parsed.target;
  let field = parsed.field;
  let value = parsed.value;
  let tab = parsed.tab;
  let confidence = parsed.rawConfidence;

  switch (actionType) {
    case 'navigate_app': {
      const matchedApp = findApp(target, catalog);
      if (matchedApp) {
        target = matchedApp.label;
        updatedContext.currentApp = matchedApp.label;
        if (matchedApp.defaultObject && !updatedContext.currentObject) {
          updatedContext.currentObject = matchedApp.defaultObject;
        }
        confidence = Math.min(1.0, confidence + 0.08);
      } else if (!/salesforce\s*home|^home$|^salesforce$/i.test(target)) {
        updatedContext.currentApp = target;
      }
      break;
    }

    case 'nav_tab': {
      updatedContext.currentRecordId = undefined;
      // Tab in the selected app's navigation bar; remember the object it opens for field checks
      const singular = target.trim().replace(/ies$/i, 'y').replace(/s$/i, '');
      const objMatch = findSObject(target, catalog) || findSObject(singular, catalog);
      if (objMatch) {
        updatedContext.currentObject = objMatch.apiName;
        parsed = { ...parsed, extra: { ...(parsed.extra || {}), objectApi: objMatch.apiName } };
      }
      break;
    }

    case 'open_list':
    case 'open_record': {
      if (target === 'Record' && updatedContext.currentObject) {
        target = updatedContext.currentObject;
      }

      const matchedObj = findSObject(target, catalog);
      if (matchedObj) {
        target = matchedObj.apiName;
        updatedContext.currentObject = matchedObj.apiName;
        confidence = Math.min(1.0, confidence + 0.08);
      } else if (target && target !== 'Record') {
        // Unknown to the catalog: keep what the tester typed so it can still be navigated to
        updatedContext.currentObject = target;
      }

      // On a record page, "X tab" means a record-page tab; on a list it means the app's nav tab
      updatedContext.currentRecordId = actionType === 'open_record' ? String(value || 'Recent') : undefined;
      break;
    }

    case 'activate_tab': {
      // "Navigate to Encounter tab" means the object's navigation tab (list view), not a record-page tab
      const RECORD_PAGE_TABS = /^(details|related|activity|activities|chatter|feed|news|history|notes|files|overview|summary)$/i;
      if (!RECORD_PAGE_TABS.test(target.trim())) {
        const singular = target.trim().replace(/ies$/i, 'y').replace(/s$/i, '');
        const objMatch = findSObject(target, catalog) || findSObject(singular, catalog);
        if (updatedContext.currentApp && !updatedContext.currentRecordId) {
          // Inside an app: click the tab in the app's navigation bar, like a user would
          actionType = 'nav_tab';
          updatedContext.currentRecordId = undefined;
          if (objMatch) {
            updatedContext.currentObject = objMatch.apiName;
            parsed = { ...parsed, extra: { ...(parsed.extra || {}), objectApi: objMatch.apiName } };
          }
          break;
        }
        if (objMatch) {
          actionType = 'open_list';
          target = objMatch.apiName;
          tab = undefined;
          updatedContext.currentObject = objMatch.apiName;
          confidence = Math.min(1.0, confidence + 0.03);
          break;
        }
      }
      // If we have an active object describe, verify tab
      const currentObj = updatedContext.currentObject;
      if (currentObj && catalog?.objects?.[currentObj]?.tabs) {
        const foundTab = catalog.objects[currentObj].tabs.find(
          t => normalizeKey(t.label) === normalizeKey(target)
        );
        if (foundTab) {
          target = foundTab.label;
          tab = foundTab.label;
          confidence = Math.min(1.0, confidence + 0.08);
        }
      }
      break;
    }

    case 'fill_field':
    case 'select_picklist':
    case 'select_lookup':
    case 'set_checkbox':
    case 'assert_field': {
      // If filling a value without explicit field name (e.g. "Type 23 as value"), inherit from lastField
      if (actionType === 'fill_field' && (!field || target === 'ActiveField') && updatedContext.lastField) {
        field = updatedContext.lastField;
        target = updatedContext.lastField;
      }

      if (field && field !== 'ActiveField') {
        updatedContext.lastField = field;
      } else if (target && target !== 'ActiveField') {
        updatedContext.lastField = target;
      }

      const currentObj = updatedContext.currentObject || 'Account';
      const fieldToInspect = field || target;
      const matchedField = findField(fieldToInspect, currentObj, catalog);

      if (matchedField) {
        field = matchedField.label || matchedField.apiName || fieldToInspect;
        target = field;

        // Upgrade action type according to metadata field type!
        if (actionType === 'fill_field') {
          if (matchedField.type === 'picklist' || matchedField.type === 'multipicklist') {
            actionType = 'select_picklist';
          } else if (matchedField.type === 'boolean') {
            actionType = 'set_checkbox';
            value = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
          } else if (matchedField.type === 'reference') {
            actionType = 'select_lookup';
          }
        }
        confidence = Math.min(1.0, confidence + 0.08);
      }
      break;
    }

    case 'assert_field_readonly':
    case 'assert_field_editable':
    case 'assert_field_error':
    case 'assert_not_visible':
    case 'remember_value': {
      // Canonicalise the field label against org metadata when the step targets a field
      if (field) {
        const currentObj = updatedContext.currentObject || 'Account';
        const matchedField = findField(field, currentObj, catalog);
        if (matchedField) {
          field = matchedField.label || matchedField.apiName || field;
          target = field;
          confidence = Math.min(1.0, confidence + 0.04);
        }
      }
      break;
    }

    case 'api_create': {
      const objName = String(parsed.extra?.objectName || target);
      const objMatch = findSObject(objName, catalog) || findSObject(objName.replace(/s$/i, ''), catalog);
      const apiObject = objMatch ? objMatch.apiName : objName.replace(/\s+/g, '_');
      const rawFields = (parsed.extra?.fields || {}) as Record<string, string>;
      const apiFields: Record<string, string> = {};
      const unmappedFields: string[] = [];
      for (const [label, val] of Object.entries(rawFields)) {
        const f = findField(label, apiObject, catalog);
        if (f?.apiName) {
          apiFields[f.apiName] = val;
        } else {
          // Assume the tester typed an API name (e.g. Status__c) when no label matches
          apiFields[label.replace(/\s+/g, '_')] = val;
          unmappedFields.push(label);
        }
      }
      target = apiObject;
      parsed = { ...parsed, extra: { ...(parsed.extra || {}), apiObject, apiFields, unmappedFields, objectKnown: Boolean(objMatch) } };
      if (objMatch) confidence = Math.min(1.0, confidence + 0.03);
      break;
    }

    case 'inline_edit':
    case 'dual_listbox': {
      if (field) {
        const matchedField = findField(field, updatedContext.currentObject || 'Account', catalog);
        if (matchedField) {
          field = matchedField.label || field;
          target = field;
        }
      }
      break;
    }

    case 'click_action': {
      // Check for Property notes sync alias
      if (/sync.*property|sync.*note/i.test(target)) {
        actionType = 'sync_notes';
        target = 'Sync Property Notes';
        confidence = 0.98;
      }
      break;
    }

    case 'create_note':
    case 'sync_notes':
    case 'assert_toast':
    case 'assert_visible':
    case 'save_modal':
    case 'close_modal':
    case 'run_apex':
    case 'scroll':
    default:
      // High confidence actions already calibrated in parser
      break;
  }

  const resolvedAction: ResolvedAction = {
    type: actionType,
    target,
    field,
    value,
    tab,
    extra: parsed.extra,
    confidence: Number(confidence.toFixed(2))
  };

  return {
    action: resolvedAction,
    updatedContext
  };
}
