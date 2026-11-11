import {
  introspectSObject,
  getCachedMetadata,
  saveCachedMetadata,
  getCachedSObject,
  updateObjectInCache,
  clearCache,
  diffOrgSchemas
} from '../dist/index.js';
import * as assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';

async function testAll() {
  console.log('--- Testing introspectSObject with mockData ---');
  const mockSObject = {
    name: 'Account',
    label: 'Account',
    fields: [
      { name: 'Id', label: 'Account ID', type: 'id', nillable: false, updateable: false, createable: false },
      { name: 'Name', label: 'Account Name', type: 'string', nillable: false, updateable: true, createable: true },
      { name: 'Type', label: 'Account Type', type: 'picklist', picklistValues: [{ value: 'Customer', active: true }, { value: 'Prospect', active: true }], nillable: true, updateable: true, createable: true },
      { name: 'AnnualRevenue', label: 'Annual Revenue', type: 'currency', nillable: true, updateable: true, createable: true }
    ],
    actionOverrides: [
      { name: 'CustomAction', pageOrSObjectType: 'CustomLwc' }
    ]
  };

  const described = await introspectSObject('Account', 'testOrg', { mockData: mockSObject });
  assert.strictEqual(described.apiName, 'Account');
  assert.strictEqual(described.fields['Name'].type, 'string');
  assert.strictEqual(described.fields['Type'].type, 'picklist');
  assert.deepStrictEqual(described.fields['Type'].picklistValues, ['Customer', 'Prospect']);
  console.log('✓ introspectSObject passed');

  console.log('--- Testing schemaCache ---');
  const tempDir = path.join(os.tmpdir(), 'forceplay-test-cache-' + Date.now());
  const cachePayload = {
    orgAlias: 'testOrg',
    release: "Winter '27",
    updatedAt: new Date().toISOString(),
    apps: {},
    objects: {
      Account: described
    }
  };

  await saveCachedMetadata(cachePayload, tempDir);
  const fetched = await getCachedMetadata('testOrg', tempDir);
  assert.ok(fetched !== null);
  assert.strictEqual(fetched.orgAlias, 'testOrg');
  assert.ok(fetched.objects['Account']);

  const accountObj = await getCachedSObject('Account', 'testOrg', tempDir);
  assert.strictEqual(accountObj.apiName, 'Account');

  // Test updateObjectInCache
  const updatedAccount = { ...described, label: 'Updated Account' };
  await updateObjectInCache('testOrg', updatedAccount, tempDir);
  const fetchedUpdated = await getCachedSObject('Account', 'testOrg', tempDir);
  assert.strictEqual(fetchedUpdated.label, 'Updated Account');

  await clearCache('testOrg', tempDir);
  const cleared = await getCachedMetadata('testOrg', tempDir);
  assert.strictEqual(cleared, null);
  console.log('✓ schemaCache passed');

  console.log('--- Testing releaseDiff ---');
  const prevSnapshot = {
    orgAlias: 'testOrg',
    release: "Winter '27",
    updatedAt: new Date().toISOString(),
    apps: {},
    objects: {
      Account: {
        apiName: 'Account',
        label: 'Account',
        listUrl: '/lightning/o/Account/list',
        tabs: [{ label: 'Details', isDefault: true, fields: ['Name', 'Status__c', 'Legacy_Code__c'] }],
        actions: [
          { name: 'New', label: 'New', type: 'StandardButton' },
          { name: 'OldAction', label: 'Submit Ticket', type: 'QuickAction' }
        ],
        fields: {
          Name: { apiName: 'Name', label: 'Name', type: 'string', picklistValues: [], referenceTo: [], required: true, readOnly: false },
          Status__c: { apiName: 'Status__c', label: 'Status', type: 'picklist', picklistValues: ['Draft', 'Active', 'DeprecatedVal'], referenceTo: [], required: false, readOnly: false },
          Legacy_Code__c: { apiName: 'Legacy_Code__c', label: 'Legacy Code', type: 'string', picklistValues: [], referenceTo: [], required: false, readOnly: false }
        }
      }
    }
  };

  const currSnapshot = {
    orgAlias: 'testOrg',
    release: "Spring '28",
    updatedAt: new Date().toISOString(),
    apps: {},
    objects: {
      Account: {
        apiName: 'Account',
        label: 'Account',
        listUrl: '/lightning/o/Account/list',
        tabs: [{ label: 'Details', isDefault: true, fields: ['Name', 'Status__c', 'New_Code__c'] }],
        actions: [
          { name: 'New', label: 'New', type: 'StandardButton' },
          { name: 'NewAction', label: 'Submit Ticket', type: 'QuickAction' } // renamed action
        ],
        fields: {
          Name: { apiName: 'Name', label: 'Name', type: 'string', picklistValues: [], referenceTo: [], required: true, readOnly: false },
          Status__c: { apiName: 'Status__c', label: 'Status', type: 'picklist', picklistValues: ['Draft', 'Active'], referenceTo: [], required: true, readOnly: false }, // required became true, 'DeprecatedVal' removed
          New_Code__c: { apiName: 'New_Code__c', label: 'Legacy Code', type: 'string', picklistValues: [], referenceTo: [], required: false, readOnly: false } // renamed field!
        }
      }
    }
  };

  const diffReport = diffOrgSchemas(prevSnapshot, currSnapshot);
  console.log('Diff Summary:', JSON.stringify(diffReport.summary, null, 2));
  console.log('Breaking changes count:', diffReport.breakingChanges.length);
  for (const b of diffReport.breakingChanges) {
    console.log('  ! ' + b);
  }

  assert.strictEqual(diffReport.previousRelease, "Winter '27");
  assert.strictEqual(diffReport.currentRelease, "Spring '28");
  assert.strictEqual(diffReport.objectDiffs['Account'].fields.renamed.length, 1);
  assert.strictEqual(diffReport.objectDiffs['Account'].fields.renamed[0].previousApiName, 'Legacy_Code__c');
  assert.strictEqual(diffReport.objectDiffs['Account'].fields.renamed[0].currentApiName, 'New_Code__c');
  assert.strictEqual(diffReport.objectDiffs['Account'].actions.renamed.length, 1);
  assert.strictEqual(diffReport.objectDiffs['Account'].actions.renamed[0].previousName, 'OldAction');
  assert.strictEqual(diffReport.objectDiffs['Account'].actions.renamed[0].currentName, 'NewAction');
  assert.ok(diffReport.breakingChanges.length > 0);
  console.log('✓ releaseDiff passed');

  console.log('\n======================================');
  console.log('ALL @forceplay/introspector TESTS PASSED!');
  console.log('======================================');
}

testAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
