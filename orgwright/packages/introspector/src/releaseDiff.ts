import {
  OrgMetadataCache,
  SObjectDescribe,
  FieldDescribe,
  ActionDescribe,
  TabDescribe
} from '@orgwright/core';

export interface FieldRenameCandidate {
  previousApiName: string;
  currentApiName: string;
  field: FieldDescribe;
  confidence: number;
  reason: string;
}

export interface FieldTypeChange {
  apiName: string;
  label: string;
  previousType: FieldDescribe['type'];
  currentType: FieldDescribe['type'];
  breaking: boolean;
}

export interface PicklistChange {
  apiName: string;
  label: string;
  addedValues: string[];
  removedValues: string[];
}

export interface FieldModifiedDetails {
  apiName: string;
  label: string;
  changes: {
    label?: { from: string; to: string };
    required?: { from: boolean; to: boolean };
    readOnly?: { from: boolean; to: boolean };
    referenceTo?: { added: string[]; removed: string[] };
  };
}

export interface ActionDiff {
  added: ActionDescribe[];
  removed: ActionDescribe[];
  renamed: Array<{
    previousName: string;
    currentName: string;
    action: ActionDescribe;
    reason: string;
  }>;
}

export interface TabDiff {
  added: TabDescribe[];
  removed: TabDescribe[];
  modified: Array<{
    label: string;
    addedFields: string[];
    removedFields: string[];
  }>;
}

export interface SObjectDiff {
  apiName: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  fields: {
    added: FieldDescribe[];
    removed: FieldDescribe[];
    renamed: FieldRenameCandidate[];
    typeChanged: FieldTypeChange[];
    picklistChanges: PicklistChange[];
    modified: FieldModifiedDetails[];
  };
  actions: ActionDiff;
  tabs: TabDiff;
  breakingChanges: string[];
}

export interface SchemaDiffSummary {
  addedObjects: string[];
  removedObjects: string[];
  modifiedObjects: string[];
  unchangedObjects: string[];
  totalBreakingChanges: number;
  totalFieldChanges: number;
  totalActionChanges: number;
}

export interface SchemaDiffReport {
  previousRelease: string;
  currentRelease: string;
  orgAlias: string;
  diffTimestamp: string;
  summary: SchemaDiffSummary;
  breakingChanges: string[];
  objectDiffs: Record<string, SObjectDiff>;
}

/**
 * Compares two OrgMetadataCache snapshots (e.g. Winter '27 vs Spring '28)
 * to detect removed/renamed fields, action buttons, tab changes, and breaking regressions.
 */
export function diffOrgSchemas(
  previous: OrgMetadataCache,
  current: OrgMetadataCache
): SchemaDiffReport {
  const previousObjects = previous.objects || {};
  const currentObjects = current.objects || {};

  const allObjectNames = Array.from(
    new Set([...Object.keys(previousObjects), ...Object.keys(currentObjects)])
  ).sort();

  const objectDiffs: Record<string, SObjectDiff> = {};
  const allBreakingChanges: string[] = [];

  const addedObjects: string[] = [];
  const removedObjects: string[] = [];
  const modifiedObjects: string[] = [];
  const unchangedObjects: string[] = [];

  let totalFieldChanges = 0;
  let totalActionChanges = 0;

  for (const objName of allObjectNames) {
    const prevObj = previousObjects[objName];
    const currObj = currentObjects[objName];

    if (!prevObj && currObj) {
      // Object added
      addedObjects.push(objName);
      objectDiffs[objName] = {
        apiName: objName,
        status: 'added',
        fields: {
          added: Object.values(currObj.fields),
          removed: [],
          renamed: [],
          typeChanged: [],
          picklistChanges: [],
          modified: []
        },
        actions: {
          added: currObj.actions,
          removed: [],
          renamed: []
        },
        tabs: {
          added: currObj.tabs,
          removed: [],
          modified: []
        },
        breakingChanges: []
      };
      totalFieldChanges += Object.keys(currObj.fields).length;
      totalActionChanges += currObj.actions.length;
      continue;
    }

    if (prevObj && !currObj) {
      // Object removed (Breaking Change!)
      removedObjects.push(objName);
      const breaking = `SObject '${objName}' (${prevObj.label}) was removed.`;
      allBreakingChanges.push(breaking);

      objectDiffs[objName] = {
        apiName: objName,
        status: 'removed',
        fields: {
          added: [],
          removed: Object.values(prevObj.fields),
          renamed: [],
          typeChanged: [],
          picklistChanges: [],
          modified: []
        },
        actions: {
          added: [],
          removed: prevObj.actions,
          renamed: []
        },
        tabs: {
          added: [],
          removed: prevObj.tabs,
          modified: []
        },
        breakingChanges: [breaking]
      };
      totalFieldChanges += Object.keys(prevObj.fields).length;
      totalActionChanges += prevObj.actions.length;
      continue;
    }

    // Object exists in both: perform deep diff
    if (prevObj && currObj) {
      const objDiff = diffSingleSObject(prevObj, currObj);
      objectDiffs[objName] = objDiff;

      if (objDiff.status === 'modified') {
        modifiedObjects.push(objName);
      } else {
        unchangedObjects.push(objName);
      }

      if (objDiff.breakingChanges.length > 0) {
        allBreakingChanges.push(...objDiff.breakingChanges);
      }

      const fieldChangesForObj =
        objDiff.fields.added.length +
        objDiff.fields.removed.length +
        objDiff.fields.renamed.length +
        objDiff.fields.typeChanged.length +
        objDiff.fields.picklistChanges.length +
        objDiff.fields.modified.length;

      const actionChangesForObj =
        objDiff.actions.added.length +
        objDiff.actions.removed.length +
        objDiff.actions.renamed.length;

      totalFieldChanges += fieldChangesForObj;
      totalActionChanges += actionChangesForObj;
    }
  }

  return {
    previousRelease: previous.release || "Winter '27",
    currentRelease: current.release || "Spring '28",
    orgAlias: current.orgAlias || previous.orgAlias || 'default',
    diffTimestamp: new Date().toISOString(),
    summary: {
      addedObjects,
      removedObjects,
      modifiedObjects,
      unchangedObjects,
      totalBreakingChanges: allBreakingChanges.length,
      totalFieldChanges,
      totalActionChanges
    },
    breakingChanges: allBreakingChanges,
    objectDiffs
  };
}

/**
 * Computes deep diff between two versions of the same SObject.
 */
function diffSingleSObject(prev: SObjectDescribe, curr: SObjectDescribe): SObjectDiff {
  const breakingChanges: string[] = [];
  const sObjectName = curr.apiName;

  // 1. Fields diffing
  const prevFields = prev.fields || {};
  const currFields = curr.fields || {};

  const prevFieldNames = Object.keys(prevFields);
  const currFieldNames = Object.keys(currFields);

  const rawRemovedFieldNames = prevFieldNames.filter((name) => !currFields[name]);
  const rawAddedFieldNames = currFieldNames.filter((name) => !prevFields[name]);

  // Rename detection heuristic
  const renamed: FieldRenameCandidate[] = [];
  const consumedAddedNames = new Set<string>();
  const consumedRemovedNames = new Set<string>();

  for (const removedName of rawRemovedFieldNames) {
    const removedField = prevFields[removedName];

    for (const addedName of rawAddedFieldNames) {
      if (consumedAddedNames.has(addedName)) continue;
      const addedField = currFields[addedName];

      // Exact match on label and type
      if (
        removedField.label.toLowerCase() === addedField.label.toLowerCase() &&
        removedField.type === addedField.type
      ) {
        renamed.push({
          previousApiName: removedName,
          currentApiName: addedName,
          field: addedField,
          confidence: 0.95,
          reason: `Identical field label '${addedField.label}' and type '${addedField.type}'`
        });
        consumedAddedNames.add(addedName);
        consumedRemovedNames.add(removedName);
        breakingChanges.push(
          `Field '${removedName}' was renamed to '${addedName}' in '${sObjectName}'. Automated tests referencing '${removedName}' must be updated.`
        );
        break;
      }

      // Name similarity match (e.g. Patient_MRN__c -> MRN__c)
      const cleanPrev = removedName.replace(/__c$/, '').replace(/_/g, '').toLowerCase();
      const cleanCurr = addedName.replace(/__c$/, '').replace(/_/g, '').toLowerCase();
      if (cleanPrev === cleanCurr && removedField.type === addedField.type) {
        renamed.push({
          previousApiName: removedName,
          currentApiName: addedName,
          field: addedField,
          confidence: 0.85,
          reason: `Normalized name match ('${cleanPrev}') and identical type '${addedField.type}'`
        });
        consumedAddedNames.add(addedName);
        consumedRemovedNames.add(removedName);
        breakingChanges.push(
          `Field '${removedName}' was renamed to '${addedName}' in '${sObjectName}'.`
        );
        break;
      }
    }
  }

  // Final un-renamed added and removed fields
  const removed: FieldDescribe[] = rawRemovedFieldNames
    .filter((name) => !consumedRemovedNames.has(name))
    .map((name) => {
      const field = prevFields[name];
      breakingChanges.push(
        `Field '${name}' (${field.label}) was removed from '${sObjectName}'.`
      );
      return field;
    });

  const added: FieldDescribe[] = rawAddedFieldNames
    .filter((name) => !consumedAddedNames.has(name))
    .map((name) => {
      const field = currFields[name];
      if (field.required) {
        breakingChanges.push(
          `New required field '${name}' was added to '${sObjectName}' (may break existing test record creation).`
        );
      }
      return field;
    });

  // Fields present in both: check modifications
  const commonFieldNames = prevFieldNames.filter((name) => currFields[name]);
  const typeChanged: FieldTypeChange[] = [];
  const picklistChanges: PicklistChange[] = [];
  const modified: FieldModifiedDetails[] = [];

  for (const name of commonFieldNames) {
    const pf = prevFields[name];
    const cf = currFields[name];
    const fieldChanges: FieldModifiedDetails['changes'] = {};
    let isModified = false;

    // Check type change
    if (pf.type !== cf.type) {
      typeChanged.push({
        apiName: name,
        label: cf.label,
        previousType: pf.type,
        currentType: cf.type,
        breaking: true
      });
      breakingChanges.push(
        `Field '${name}' type changed from '${pf.type}' to '${cf.type}' in '${sObjectName}'.`
      );
      isModified = true;
    }

    // Check required change
    if (pf.required !== cf.required) {
      fieldChanges.required = { from: pf.required, to: cf.required };
      if (!pf.required && cf.required) {
        breakingChanges.push(
          `Field '${name}' in '${sObjectName}' became required.`
        );
      }
      isModified = true;
    }

    // Check readOnly change
    if (pf.readOnly !== cf.readOnly) {
      fieldChanges.readOnly = { from: pf.readOnly, to: cf.readOnly };
      if (!pf.readOnly && cf.readOnly) {
        breakingChanges.push(
          `Field '${name}' in '${sObjectName}' became read-only.`
        );
      }
      isModified = true;
    }

    // Check label change
    if (pf.label !== cf.label) {
      fieldChanges.label = { from: pf.label, to: cf.label };
      isModified = true;
    }

    // Check referenceTo
    const prevRef = new Set(pf.referenceTo || []);
    const currRef = new Set(cf.referenceTo || []);
    const addedRef = (cf.referenceTo || []).filter((r) => !prevRef.has(r));
    const removedRef = (pf.referenceTo || []).filter((r) => !currRef.has(r));
    if (addedRef.length > 0 || removedRef.length > 0) {
      fieldChanges.referenceTo = { added: addedRef, removed: removedRef };
      isModified = true;
    }

    // Check picklist values
    if (pf.type === 'picklist' || pf.type === 'multipicklist') {
      const prevVals = new Set(pf.picklistValues || []);
      const currVals = new Set(cf.picklistValues || []);
      const addedVals = (cf.picklistValues || []).filter((v) => !prevVals.has(v));
      const removedVals = (pf.picklistValues || []).filter((v) => !currVals.has(v));

      if (addedVals.length > 0 || removedVals.length > 0) {
        picklistChanges.push({
          apiName: name,
          label: cf.label,
          addedValues: addedVals,
          removedValues: removedVals
        });
        if (removedVals.length > 0) {
          breakingChanges.push(
            `Picklist '${name}' in '${sObjectName}' removed values: [${removedVals.join(', ')}].`
          );
        }
        isModified = true;
      }
    }

    if (isModified) {
      modified.push({
        apiName: name,
        label: cf.label,
        changes: fieldChanges
      });
    }
  }

  // 2. Action diffing
  const prevActions = prev.actions || [];
  const currActions = curr.actions || [];

  const rawRemovedActions = prevActions.filter(
    (pa) => !currActions.some((ca) => ca.name === pa.name)
  );
  const rawAddedActions = currActions.filter(
    (ca) => !prevActions.some((pa) => pa.name === ca.name)
  );

  const renamedActions: ActionDiff['renamed'] = [];
  const consumedAddedActionNames = new Set<string>();
  const consumedRemovedActionNames = new Set<string>();

  for (const remAct of rawRemovedActions) {
    for (const addAct of rawAddedActions) {
      if (consumedAddedActionNames.has(addAct.name)) continue;

      if (remAct.label.toLowerCase() === addAct.label.toLowerCase()) {
        renamedActions.push({
          previousName: remAct.name,
          currentName: addAct.name,
          action: addAct,
          reason: `Action label match '${addAct.label}'`
        });
        consumedAddedActionNames.add(addAct.name);
        consumedRemovedActionNames.add(remAct.name);
        breakingChanges.push(
          `Action button '${remAct.label}' was renamed from '${remAct.name}' to '${addAct.name}' in '${sObjectName}'.`
        );
        break;
      }
    }
  }

  const removedActions = rawRemovedActions
    .filter((a) => !consumedRemovedActionNames.has(a.name))
    .map((act) => {
      breakingChanges.push(
        `Action button '${act.label}' (${act.name}) was removed from '${sObjectName}'.`
      );
      return act;
    });

  const addedActions = rawAddedActions.filter(
    (a) => !consumedAddedActionNames.has(a.name)
  );

  // 3. Tab diffing
  const prevTabs = prev.tabs || [];
  const currTabs = curr.tabs || [];

  const removedTabs = prevTabs.filter(
    (pt) => !currTabs.some((ct) => ct.label.toLowerCase() === pt.label.toLowerCase())
  );
  for (const tab of removedTabs) {
    breakingChanges.push(`Tab '${tab.label}' was removed from '${sObjectName}'.`);
  }

  const addedTabs = currTabs.filter(
    (ct) => !prevTabs.some((pt) => pt.label.toLowerCase() === ct.label.toLowerCase())
  );

  const modifiedTabs: TabDiff['modified'] = [];
  for (const pt of prevTabs) {
    const ct = currTabs.find(
      (t) => t.label.toLowerCase() === pt.label.toLowerCase()
    );
    if (ct) {
      const prevSet = new Set(pt.fields || []);
      const currSet = new Set(ct.fields || []);
      const addedFields = (ct.fields || []).filter((f) => !prevSet.has(f));
      const removedFields = (pt.fields || []).filter((f) => !currSet.has(f));

      if (addedFields.length > 0 || removedFields.length > 0) {
        modifiedTabs.push({
          label: ct.label,
          addedFields,
          removedFields
        });
      }
    }
  }

  const isStatusModified =
    added.length > 0 ||
    removed.length > 0 ||
    renamed.length > 0 ||
    typeChanged.length > 0 ||
    picklistChanges.length > 0 ||
    modified.length > 0 ||
    addedActions.length > 0 ||
    removedActions.length > 0 ||
    renamedActions.length > 0 ||
    addedTabs.length > 0 ||
    removedTabs.length > 0 ||
    modifiedTabs.length > 0;

  return {
    apiName: sObjectName,
    status: isStatusModified ? 'modified' : 'unchanged',
    fields: {
      added,
      removed,
      renamed,
      typeChanged,
      picklistChanges,
      modified
    },
    actions: {
      added: addedActions,
      removed: removedActions,
      renamed: renamedActions
    },
    tabs: {
      added: addedTabs,
      removed: removedTabs,
      modified: modifiedTabs
    },
    breakingChanges
  };
}
