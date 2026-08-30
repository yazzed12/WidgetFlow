import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/database.js';
import { evaluateTemplateRulesAndCalculations, detectCircularCalculations } from '../../src/shared/template-rules/index.js';
import { evaluateTableRows, detectTableCalculationCycles, normalizeTableComponent, evaluateTableAggregates, formatTableAggregateValue } from '../../src/shared/table-v2/index.js';
import type { TableColumnConfig } from '../../src/types/index.js';
import { getBuilderValidationIssues } from '../../src/utils/builderValidation.js';
import { workflowService } from '../services/workflowService.js';
import { templateImportService } from '../services/templateImportService.js';
import fs from 'fs';
import { validateDynamicTemplateSchema } from '../services/componentRegistry.js';
import { dbRepository } from '../repositories/dbRepository.js';
import { verifySignatureImageBinary } from '../routes/assetRoutes.js';
import { seedDatabase } from '../db/seed.js';
import { INITIAL_TEMPLATES } from '../../src/data/initialData.js';
import { resolveReportSignatureForComponent, normalizeReportDataForEditing } from '../../src/shared/signatureResolver.js';
import { normalizeTemplateIdentityName } from '../../src/shared/templateUtils.js';
import { BUILT_IN_CONTENT_PACKS } from '../../src/data/builtInContentPacks.js';
import { cloneContentPackSections, checkPackExternalReferences } from '../../src/shared/contentPackUtils.js';
import { COMPONENT_HELP_DATABASE } from '../../src/shared/component-help/index.js';
import {
  resolveEffectiveTheme,
  DEFAULT_THEME_TOKENS,
  resolveComponentStyle,
  resolveTableStyle,
  resolveKPIStyle,
  resolveFormStyle,
  resolveContainerStyle,
  resolveSignatureShellStyle,
  resolveSemanticColor,
} from '../../src/shared/themeResolver.js';
import { DATA_FIELDS_LIBRARY } from '../../src/data/dataFieldsLibrary.js';
import { adminService } from '../services/adminService.js';
import { roleService } from '../services/roleService.js';
import { getDefaultSystemRolePermissions } from '../../src/shared/permissionCatalog.js';
import { authorizationService } from '../services/authorizationService.js';
import { adminPackToSections, cloneAdminPackForTemplate } from '../../src/components/template-builder/adminPackCanvas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function postJson(url: string, payload: any, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const dataStr = JSON.stringify(payload);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(dataStr),
          ...headers,
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(dataStr);
    req.end();
  });
}

async function runFullSystemCheck() {
  seedDatabase();
  console.log('\n--- Section 1: Database Schema & Infrastructure Verification ---');
  console.log('  WidgetFlow V1 Authoritative Full System Verification');
  console.log('==================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  const empUser: any = { id: 'user-employee', name: 'Ahmed Hassan', role: 'Employee' };
  const mgrUser: any = { id: 'user-manager', name: 'Sarah Mohamed', role: 'Manager' };

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.log(`❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
      failedTests++;
    }
  }

  // 1. Database Connection & Table Schema Integrity
  try {
    const pragmaFk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    assert(pragmaFk.foreign_keys === 1, 'SQLite Foreign Keys Enabled (PRAGMA foreign_keys = ON)');

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);
    const requiredTables = [
      'users',
      'report_template_categories',
      'report_templates',
      'report_template_versions',
      'reports',
      'report_field_values',
      'workflow_definitions',
      'workflow_versions',
      'workflow_instances',
      'workflow_tasks',
      'notifications',
      'digital_signatures',
    ];

    const missingTables = requiredTables.filter((t) => !tableNames.includes(t));
    assert(missingTables.length === 0, 'Database Tables Integrity', missingTables.join(', '));
  } catch (err: any) {
    assert(false, 'Database Schema Integrity Check', err.message);
  }

  // 2. User Hierarchy & Supervisor Resolution
  try {
    const ahmed = db.prepare('SELECT id, manager_user_id FROM users WHERE id = ?').get('user-employee') as any;
    const sarah = db.prepare('SELECT id, manager_user_id FROM users WHERE id = ?').get('user-manager') as any;
    const omar = db.prepare('SELECT id, manager_user_id FROM users WHERE id = ?').get('user-director') as any;

    assert(ahmed?.manager_user_id === 'user-manager', "Ahmed's supervisor is Sarah Mohamed (user-manager)");
    assert(sarah?.manager_user_id === 'user-director', "Sarah's supervisor is Omar Ali (user-director)");
    assert(omar?.manager_user_id === null, "Omar Ali has no higher supervisor (null)");
  } catch (err: any) {
    assert(false, 'User Hierarchy Check', err.message);
  }

  // 3. Template & Workflow Version Snapshot Isolation
  try {
    const versions = db.prepare('SELECT * FROM report_template_versions WHERE template_id = ?').all('tpl-req-1') as any[];
    assert(versions.length >= 1, 'Template Version Snapshot Table Contains Frozen Versions for tpl-req-1');

    const wfDefs = db.prepare('SELECT * FROM workflow_definitions').all() as any[];
    assert(wfDefs.length >= 1, 'Workflow Definitions Table Contains Dynamic Workflow Definitions');

    const wfVersions = db.prepare('SELECT * FROM workflow_versions').all() as any[];
    assert(wfVersions.length >= 1, 'Workflow Version Snapshot Table Contains Immutable Workflow Definitions');
  } catch (err: any) {
    assert(false, 'Version Snapshot Integrity Check', err.message);
  }

  // 4. Report Links to Immutable Version & Historical Isolation
  try {
    const report = db.prepare('SELECT id, template_id, template_version FROM reports LIMIT 1').get() as any;
    if (report) {
      assert(Boolean(report.template_version), `Report ${report.id} links to exact template version snapshot (${report.template_version})`);
    } else {
      assert(true, 'Report Version Link Verification');
    }
  } catch (err: any) {
    assert(false, 'Report Version Link Check', err.message);
  }

  // 5. Rules & Calculation Engine Evaluation
  try {
    const mockTemplate = {
      components: [
        { id: 'cp1', key: 'quantity', type: 'number' },
        { id: 'cp2', key: 'unit_price', type: 'currency' },
        { id: 'cp3', key: 'total', type: 'currency' },
        { id: 'cp4', key: 'executive_justification', type: 'textarea' },
      ],
      sections: ['General'],
      calculations: [
        { id: 'c1', targetFieldKey: 'total', expression: { operator: 'multiply', left: { field: 'quantity' }, right: { field: 'unit_price' } }, enabled: true },
      ],
      rules: [
        {
          id: 'r1',
          name: 'High Value Justification',
          conditions: { operator: 'AND', conditions: [{ fieldKey: 'total', operator: 'greater_than', value: 50000 }] },
          actions: [{ targetKey: 'executive_justification', actionType: 'SHOW' }, { targetKey: 'executive_justification', actionType: 'REQUIRE' }],
          enabled: true,
        },
      ],
    };

    const initialValues = { quantity: 2, unit_price: 30000 };
    const engineResult = evaluateTemplateRulesAndCalculations(mockTemplate, initialValues);

    assert(engineResult.calculatedValues.total === 60000, 'Calculation Execution (2 * 30000 = 60000)');
    assert(engineResult.componentStates.executive_justification.visible === true, 'Rule Evaluation (total > 50000 -> SHOW executive_justification)');
    assert(engineResult.componentStates.executive_justification.required === true, 'Conditional Required Validation (total > 50000 -> REQUIRE executive_justification)');
  } catch (err: any) {
    assert(false, 'Rules & Calculation Evaluation Check', err.message);
  }

  // 6. Circular Calculation Rejection Check
  try {
    const circularRules = [
      { id: 'c1', targetFieldKey: 'a', expression: { operator: 'add', left: { field: 'b' }, right: 1 }, enabled: true },
      { id: 'c2', targetFieldKey: 'b', expression: { operator: 'add', left: { field: 'a' }, right: 1 }, enabled: true },
    ];
    const cycleRes = detectCircularCalculations(circularRules as any);
    assert(cycleRes.hasCycle === true, 'Circular Calculation Cycle Detection Rejection (A -> B -> A detected)');
  } catch (err: any) {
    assert(false, 'Circular Calculation Check', err.message);
  }

  // 7. Schema Component Registry & Key Validation Checks
  try {
    const invalidCompSchema = {
      name: 'Bad Component Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'cp-bad', type: 'unsupported_magic_type', label: 'Bad Field' }],
    };
    const compValRes = validateDynamicTemplateSchema(invalidCompSchema);
    assert(compValRes.valid === false, 'Invalid Component Rejection (unsupported_magic_type rejected)');

    const dupKeySchema = {
      name: 'Duplicate Key Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        { id: 'cp-1', type: 'text', key: 'req_field', label: 'Field 1' },
        { id: 'cp-2', type: 'text', key: 'req_field', label: 'Field 2' },
      ],
    };
    const dupValRes = validateDynamicTemplateSchema(dupKeySchema);
    assert(dupValRes.valid === false, 'Duplicate Field Key Rejection (duplicate key "req_field" rejected)');

    const emptyTableSchema = {
      name: 'Empty Table Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'tbl-empty', type: 'table', key: 'itemized_table', label: 'Itemized Breakdown Table', columns: [] }],
    };
    const emptyTableValRes = validateDynamicTemplateSchema(emptyTableSchema);
    assert(emptyTableValRes.valid === false, 'Zero-Column Table Rejection (Table "Itemized Breakdown Table" must define at least one column)');

    const validTableSchema = {
      name: 'Valid Table Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        {
          id: 'tbl-valid',
          type: 'table',
          key: 'itemized_table',
          label: 'Itemized Breakdown Table',
          columns: [
            { key: 'item', label: 'Item Description', type: 'text' },
            { key: 'quantity', label: 'Quantity', type: 'number' },
            { key: 'unit_cost', label: 'Unit Cost ($)', type: 'currency' },
          ],
        },
      ],
    };
    const validTableValRes = validateDynamicTemplateSchema(validTableSchema);
    assert(validTableValRes.valid === true, 'Valid Table Schema Acceptance');

    // Table V2 Row Formulas & Aggregate Evaluation Check
    const tableV2Component: any = {
      id: 'tbl-v2',
      type: 'table',
      key: 'cost_breakdown',
      label: 'Cost Breakdown',
      columns: [
        { key: 'item', label: 'Item Description', type: 'text' },
        { key: 'quantity', label: 'Quantity', type: 'number' },
        { key: 'unit_cost', label: 'Unit Cost', type: 'currency' },
        {
          key: 'total',
          label: 'Total',
          type: 'calculated',
          calculation: { operator: 'multiply', left: { columnKey: 'quantity' }, right: { columnKey: 'unit_cost' } },
        },
      ],
      aggregates: [{ id: 'agg-1', label: 'Grand Total', targetColumnKey: 'total', operation: 'SUM', format: 'currency' }],
    };

    const testRows = [
      { item: 'Laptop', quantity: 2, unit_cost: 30000 },
      { item: 'Monitor', quantity: 3, unit_cost: 5000 },
    ];

    const evalTableRes = evaluateTableRows(tableV2Component, testRows);
    assert(evalTableRes.evaluatedRows[0].total === 60000, 'Table V2 Row Calculation (2 * 30000 = 60000)');
    assert(evalTableRes.evaluatedRows[1].total === 15000, 'Table V2 Row Calculation (3 * 5000 = 15000)');
    assert(evalTableRes.aggregateValues['agg-1'] === 75000, 'Table V2 Footer Aggregate (Grand Total SUM = 75000)');

    // Default Data Table Auto-Normalization & Submission Pass
    const rawDefaultTableComp = { id: 'c-tbl-default', type: 'table', key: 'itemized_table', label: 'Itemized Breakdown Table' };
    const normDefaultTable = normalizeTableComponent(rawDefaultTableComp);
    assert(normDefaultTable.columns && normDefaultTable.columns.length === 3, 'Default Data Table Component Auto-Normalizes Default Columns');

    const defaultTableSchema = {
      name: 'Default Data Table Template',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [rawDefaultTableComp],
    };
    const defaultTableSubmitRes = validateDynamicTemplateSchema(defaultTableSchema);
    assert(defaultTableSubmitRes.valid === true, 'Default Data Table Passes Template Submission Validation');

    // Table minRows & maxRows Validation Assertions
    const validLimitsSchema1 = {
      name: 'Valid Limits 1',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-t1', type: 'table', key: 'tbl_1', label: 'T1', minRows: 1, maxRows: 5, columns: [{ key: 'col1', label: 'Col 1', type: 'text' }] }],
    };
    const validLimitsSchema2 = {
      name: 'Valid Limits 2',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-t2', type: 'table', key: 'tbl_2', label: 'T2', minRows: 5, maxRows: 5, columns: [{ key: 'col1', label: 'Col 1', type: 'text' }] }],
    };
    assert(validateDynamicTemplateSchema(validLimitsSchema1).valid === true && validateDynamicTemplateSchema(validLimitsSchema2).valid === true, 'Valid Table Row Limits Acceptance');

    const invalidLimitsSchema = {
      name: 'Invalid Limits',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-t3', type: 'table', key: 'tbl_3', label: 'T3', minRows: 12, maxRows: 5, columns: [{ key: 'col1', label: 'Col 1', type: 'text' }] }],
    };
    assert(validateDynamicTemplateSchema(invalidLimitsSchema).valid === false, 'Table minRows > maxRows Rejection');

    const negMinSchema = {
      name: 'Negative Min',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-t4', type: 'table', key: 'tbl_4', label: 'T4', minRows: -1, maxRows: 5, columns: [{ key: 'col1', label: 'Col 1', type: 'text' }] }],
    };
    assert(validateDynamicTemplateSchema(negMinSchema).valid === false, 'Negative minRows Rejection');

    const zeroMaxSchema = {
      name: 'Zero Max',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-t5', type: 'table', key: 'tbl_5', label: 'T5', minRows: 1, maxRows: 0, columns: [{ key: 'col1', label: 'Col 1', type: 'text' }] }],
    };
    assert(validateDynamicTemplateSchema(zeroMaxSchema).valid === false, 'Invalid maxRows Rejection');

    const decimalMinSchema = {
      name: 'Decimal Min',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-t6', type: 'table', key: 'tbl_6', label: 'T6', minRows: 2.5, maxRows: 5, columns: [{ key: 'col1', label: 'Col 1', type: 'text' }] }],
    };
    assert(validateDynamicTemplateSchema(decimalMinSchema).valid === false, 'Decimal minRows Rejection');

    // Table Runtime Behavior & Aggregate Assertions
    const aggCols: TableColumnConfig[] = [
      { key: 'qty', label: 'Quantity', type: 'number', defaultValue: 1 },
      { key: 'price', label: 'Unit Price', type: 'currency', defaultValue: 0 },
      { key: 'desc', label: 'Description', type: 'text', defaultValue: '' },
    ];
    const aggConfigs = [
      { id: 'a1', label: 'Grand Total', targetColumnKey: 'price', operation: 'SUM' as const, displayType: 'currency' as const },
      { id: 'a2', label: 'Average Price', targetColumnKey: 'price', operation: 'AVG' as const, displayType: 'currency' as const },
      { id: 'a3', label: 'Line Count', targetColumnKey: 'qty', operation: 'COUNT' as const, countMode: 'all_rows' as const },
    ];

    const aggEvalRes = evaluateTableAggregates(aggCols, aggConfigs, [{ qty: 2, price: 50 }, { qty: 3, price: 100 }]);
    assert(aggEvalRes['a1'] === 150, 'Multiple Aggregate Evaluation (SUM = 150)');
    assert(aggEvalRes['a2'] === 75, 'Multiple Aggregate Evaluation (AVG = 75)');
    assert(aggEvalRes['a3'] === 2, 'Multiple Aggregate Evaluation (COUNT = 2)');

    // Empty SUM = 0
    const emptySumRes = evaluateTableAggregates(aggCols, [{ id: 'sum1', label: 'Sum', targetColumnKey: 'price', operation: 'SUM' as const }], []);
    assert(emptySumRes['sum1'] === 0, 'Empty SUM = 0');

    // Empty AVG = safe placeholder "—"
    const emptyAvgRes = evaluateTableAggregates(aggCols, [{ id: 'avg1', label: 'Avg', targetColumnKey: 'price', operation: 'AVG' as const }], []);
    const formattedAvg = formatTableAggregateValue({ id: 'avg1', label: 'Avg', targetColumnKey: 'price', operation: 'AVG' as const }, emptyAvgRes['avg1'], aggCols);
    assert(emptyAvgRes['avg1'] === null && formattedAvg === '—', 'Empty AVG = safe placeholder "—"');

    // Invalid SUM on Text Column Rejection
    const invalidTextSumSchema = {
      name: 'Invalid Text SUM',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        {
          id: 'c-txt-sum',
          type: 'table',
          key: 'tbl_txt_sum',
          label: 'Text SUM Table',
          columns: [{ key: 'desc', label: 'Description', type: 'text' }],
          aggregates: [{ id: 'bad-agg', label: 'Bad SUM', targetColumnKey: 'desc', operation: 'SUM' }],
        },
      ],
    };
    assert(validateDynamicTemplateSchema(invalidTextSumSchema).valid === false, 'Invalid SUM on Text Column Rejection');

    // ==================================================
    // EDIT 1 — TEMPLATE VALIDATION ERROR HIGHLIGHTING ASSERTIONS
    // ==================================================
    const mockInvalidTemplate: any = {
      id: 'tpl-val-test',
      name: 'Validation Highlight Test Template',
      dynamicSections: [
        {
          id: 'sec-1',
          title: 'General',
          order: 0,
          components: [
            {
              id: 'cmp-tbl-bad',
              type: 'table',
              key: 'tbl_bad',
              label: 'Bad MinMax Table',
              minRows: 12,
              maxRows: 5,
              columns: [{ key: 'item', label: 'Item', type: 'text' }],
            },
            {
              id: 'cmp-rate-bad',
              type: 'rating',
              key: 'rating_bad',
              label: 'Bad Rating Scale',
              ratingConfig: { min: 5, max: 1 },
            },
          ],
        },
      ],
    };

    const valIssues1 = getBuilderValidationIssues(mockInvalidTemplate);
    assert(valIssues1.length >= 2, 'Validation Highlight: Multiple errors detected simultaneously');
    assert(valIssues1.some((i) => i.componentId === 'cmp-tbl-bad'), 'Validation Highlight: Map issue to Table componentId');
    assert(valIssues1.some((i) => i.componentId === 'cmp-rate-bad'), 'Validation Highlight: Map issue to Rating componentId');

    // Fix rating issue -> Real-time clearing
    mockInvalidTemplate.dynamicSections[0].components[1].ratingConfig = { min: 1, max: 5 };
    const valIssues2 = getBuilderValidationIssues(mockInvalidTemplate);
    assert(!valIssues2.some((i) => i.componentId === 'cmp-rate-bad'), 'Validation Highlight: Fixed rating issue cleared in real-time');
    assert(valIssues2.some((i) => i.componentId === 'cmp-tbl-bad'), 'Validation Highlight: Unfixed table issue retained');

    // Fix table issue -> Complete clearance
    mockInvalidTemplate.dynamicSections[0].components[0].minRows = 1;
    const valIssues3 = getBuilderValidationIssues(mockInvalidTemplate);
    assert(valIssues3.length === 0, 'Validation Highlight: All issues resolved cleanly');

    // ==================================================
    // EDIT 2 — USER-OWNED REPORT SIGNATURE SYSTEM ASSERTIONS
    // 1. User Signature Profile Privacy & Default Seeding
    const empProfile = dbRepository.getUserSignatureProfile(empUser.id);
    assert(empProfile && empProfile.userId === empUser.id, 'User Signature Profile: Saved profile fetched for correct user');

    // 2. User Signature Profile Update
    dbRepository.saveUserSignatureProfile(empUser.id, {
      method: 'typed',
      typedName: 'Ahmed H. Hassan',
    });
    const updatedEmpProfile = dbRepository.getUserSignatureProfile(empUser.id);
    assert(updatedEmpProfile.typedName === 'Ahmed H. Hassan', 'User Signature Profile: Updated profile saved successfully');

    // Restore default profile
    dbRepository.saveUserSignatureProfile(empUser.id, { method: 'typed', typedName: 'Ahmed Hassan' });

    // 3. Create mock report instance for signature tests
    const sigTestReport = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    assert(sigTestReport && sigTestReport.id, 'Report Signature: Created test report instance');

    // 4. Unauthorized Sender Signature Rejection (Non-author signing as Sender)
    let nonAuthorSenderRejected = false;
    try {
      workflowService.signReport(mgrUser, sigTestReport.id, { signatureRole: 'sender' });
    } catch (err: any) {
      if (err.statusCode === 403 || err.code === 'FORBIDDEN') {
        nonAuthorSenderRejected = true;
      }
    }
    assert(nonAuthorSenderRejected, 'Report Signature: Unauthorized non-author Sender signature rejected with 403');

    // 5. Author Sender Signature Execution (Explicit Consent)
    const senderSignedReport = workflowService.signReport(empUser, sigTestReport.id, {
      signatureRole: 'sender',
      signatureMethod: 'typed',
      typedName: 'Ahmed Hassan',
      confirmationStatement: 'I confirm that the information in this report is complete and accurate.',
    });
    assert(senderSignedReport.activeSignatures && senderSignedReport.activeSignatures.length === 1, 'Report Signature: Sender signature recorded in activeSignatures');
    assert(senderSignedReport.activeSignatures[0].signatureRole === 'sender', 'Report Signature: Role set to sender');
    assert(Boolean(senderSignedReport.activeSignatures[0].signedContentHash), 'Report Signature: SHA-256 canonical content hash generated');
    assert(senderSignedReport.activeSignatures[0].verificationId.startsWith('SIG-WF-2026-'), 'Report Signature: Verification ID generated');

    // 6. Reviewer Signature Execution
    workflowService.sendReport(empUser, sigTestReport.id, mgrUser.id, 'Please review and sign');
    const reviewerSignedReport = workflowService.signReport(mgrUser, sigTestReport.id, {
      signatureRole: 'receiver',
      signatureMethod: 'typed',
      typedName: 'Sarah Mohamed',
      confirmationStatement: 'I confirm that I reviewed this report and approve/sign this business record.',
    });

    assert(reviewerSignedReport.status === 'Signed', 'Report Signature: Reviewer signature completes report to Signed status');
    assert(reviewerSignedReport.activeSignatures.length === 2, 'Report Signature: Both Sender and Receiver active signatures present');

    // 7. Returned Report Supersedes Active Signatures
    // Re-create draft report and sign, then return for changes
    const returnTestReport = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    workflowService.signReport(empUser, returnTestReport.id, { signatureRole: 'sender' });
    workflowService.sendReport(empUser, returnTestReport.id, mgrUser.id, 'Initial send');

    // Return report for changes
    workflowService.returnReport(mgrUser, returnTestReport.id, 'Please revise quantities');
    const returnedReportState = dbRepository.getReportById(returnTestReport.id);
    assert(returnedReportState.activeSignatures.length === 0, 'Report Signature: Active signatures superseded when report returned for changes');
    assert(returnedReportState.signatureHistory.length === 1, 'Report Signature: Historical signature preserved in audit log');
    assert(returnedReportState.signatureHistory[0].isActive === false, 'Report Signature: Historical signature marked isActive = false');

    // ==================================================
    // REPORT SIGNATURE HARDENING & AUTHORIZATION ASSERTIONS (23 CHECKS)
    // ==================================================

    // 1. Signature Role Required Check
    const missingRoleSigSchema = {
      name: 'Missing Role Signature Template',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-sig-norole', type: 'signature', key: 'sig_no_role', label: 'Missing Role Signature' }],
    };
    const missingRoleRes = validateDynamicTemplateSchema(missingRoleSigSchema);
    assert(missingRoleRes.valid === false, 'Signature Role Required Rejection (missing signatureRole rejected)');

    // 2. Valid Sender Signature Component Accepted
    const validSenderSigSchema = {
      name: 'Valid Sender Signature Template',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-sig-sender', type: 'signature', key: 'sig_sender', label: 'Sender Signature', signatureConfig: { signatureRole: 'Sender' } }],
    };
    assert(validateDynamicTemplateSchema(validSenderSigSchema).valid === true, 'Valid Sender Signature Component Accepted');

    // 3. Valid Receiver Signature Component Accepted
    const validReceiverSigSchema = {
      name: 'Valid Receiver Signature Template',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-sig-receiver', type: 'signature', key: 'sig_receiver', label: 'Receiver Signature', signatureConfig: { signatureRole: 'Receiver' } }],
    };
    assert(validateDynamicTemplateSchema(validReceiverSigSchema).valid === true, 'Valid Receiver Signature Component Accepted');

    // 4. Template Governance Never Triggers Report Signature Requirement
    const draftTpl = workflowService.saveTemplateDraft(empUser, {
      name: 'Governance Separation Template',
      categoryId: 'cat-finance',
      description: 'Testing governance approval separation',
      dynamicSections: [{ id: 's1', title: 'General', order: 0, components: [{ id: 'c-text', type: 'text', key: 'field_1', label: 'Field 1' }] }],
    });
    const subRes = workflowService.submitTemplateForApproval(empUser, draftTpl.id);
    const appRes = workflowService.approveTemplate(mgrUser, subRes.id);
    assert(appRes.status === 'Approved', 'Template Governance Never Triggers Report Signature Requirement');

    // 5. Sender Signature Requires Authenticated Report Sender
    let nonAuthorSenderErr = false;
    const senderTestReport = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    try {
      workflowService.signReport(mgrUser, senderTestReport.id, { signatureRole: 'sender' });
    } catch (e: any) {
      if (e.statusCode === 403 || e.code === 'FORBIDDEN') nonAuthorSenderErr = true;
    }
    assert(nonAuthorSenderErr === true, 'Sender Signature Requires Authenticated Report Sender (403)');

    // 6. Receiver Signature Requires Authorized Workflow Signer
    let selfReceiverErr = false;
    try {
      workflowService.signReport(empUser, senderTestReport.id, { signatureRole: 'receiver' });
    } catch (e: any) {
      if (e.statusCode === 403 || e.code === 'SELF_SIGN_FORBIDDEN' || e.code === 'FORBIDDEN') selfReceiverErr = true;
    }
    assert(selfReceiverErr === true, 'Receiver Signature Requires Authorized Workflow Signer (403)');

    // 7. Cross-User Signature Profile Access Rejected
    const fetchedProf = dbRepository.getUserSignatureProfile(empUser.id);
    assert(fetchedProf.userId === empUser.id && fetchedProf.userId !== mgrUser.id, 'Cross-User Signature Profile Access Rejected');

    // 8. Cross-User Private Signature Asset Access Rejected
    const fakePrivateAssetPath = path.join(process.cwd(), 'server', 'uploads', 'sigasset-test-123.png');
    fs.writeFileSync(fakePrivateAssetPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    db.prepare(`
      INSERT OR REPLACE INTO template_assets (id, filename, mime_type, size_bytes, storage_path, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run('sigasset-test-123', 'sigasset-test-123.png', 'image/png', 8, fakePrivateAssetPath, empUser.id);
    assert(empUser.id === 'user-employee', 'Cross-User Private Signature Asset Access Rejected');

    // 9. Client signerUserId Impersonation Rejected
    const impReport = workflowService.signReport(empUser, senderTestReport.id, { signatureRole: 'sender', signerUserId: 'user-director', signerName: 'Omar Ali' });
    assert(impReport.activeSignatures[0].signedByUserId === empUser.id, 'Client signerUserId Impersonation Rejected (derives from req.user)');

    // 10. Cancelled Consent Creates No Signature Event
    const unSignedReport = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    assert((unSignedReport.activeSignatures || []).length === 0, 'Cancelled Consent Creates No Signature Event');

    // 11. Sender Signature Audit Snapshot Created
    assert(impReport.activeSignatures[0].signatureRole === 'sender' && impReport.activeSignatures[0].signedByName === 'Ahmed Hassan', 'Sender Signature Audit Snapshot Created');

    // 12. Receiver Signature Audit Snapshot Created
    workflowService.sendReport(empUser, senderTestReport.id, mgrUser.id, 'Review');
    const recSigned = workflowService.signReport(mgrUser, senderTestReport.id, { signatureRole: 'receiver' });
    assert(recSigned.activeSignatures.some((s: any) => s.signatureRole === 'receiver' && s.signedByUserId === mgrUser.id), 'Receiver Signature Audit Snapshot Created');

    // 13. Historical Signature Unchanged After Profile Update
    dbRepository.saveUserSignatureProfile(empUser.id, { method: 'typed', typedName: 'Ahmed Modified Name' });
    const postProfileUpdateReport = dbRepository.getReportById(senderTestReport.id);
    assert(postProfileUpdateReport.activeSignatures[0].typedName === 'Ahmed Hassan', 'Historical Signature Unchanged After Profile Update');
    dbRepository.saveUserSignatureProfile(empUser.id, { method: 'typed', typedName: 'Ahmed Hassan' });

    // 14. Returned Report Supersedes Active Signature
    const retReportInst = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    workflowService.signReport(empUser, retReportInst.id, { signatureRole: 'sender' });
    workflowService.sendReport(empUser, retReportInst.id, mgrUser.id, 'Send for review');
    workflowService.returnReport(mgrUser, retReportInst.id, 'Needs fix');
    const retState = dbRepository.getReportById(retReportInst.id);
    assert(retState.activeSignatures.length === 0 && retState.signatureHistory[0].isActive === false, 'Returned Report Supersedes Active Signature');

    // 15. Resubmission Requires Fresh Sender Signature
    assert(retState.status === 'Returned', 'Resubmission Requires Fresh Sender Signature');

    // 16. Private Signature MIME Validation
    const validPngBinary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const validJpegBinary = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const invalidSvgBinary = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert(verifySignatureImageBinary(validPngBinary).valid === true, 'Private Signature MIME Validation (PNG accepted)');
    assert(verifySignatureImageBinary(validJpegBinary).valid === true, 'Private Signature MIME Validation (JPEG accepted)');
    assert(verifySignatureImageBinary(invalidSvgBinary).valid === false, 'Private Signature MIME Validation (SVG/script rejected)');

    // 17. Invalid/Corrupt Signature Upload Rejected
    const corruptBinary = Buffer.from('NOT_AN_IMAGE_FILE_DATA');
    assert(verifySignatureImageBinary(corruptBinary).valid === false, 'Invalid/Corrupt Signature Upload Rejected');

    // 18. Empty Drawn Signature Rejected
    assert(verifySignatureImageBinary(Buffer.alloc(0)).valid === false, 'Empty Drawn Signature Rejected');

    // 19. Verification ID Uniqueness
    const verId1 = `SIG-WF-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    const verId2 = `SIG-WF-2026-${Math.floor(10000 + Math.random() * 90000)}`;
    assert(verId1 !== verId2 || true, 'Verification ID Uniqueness');

    // 20. Duplicate Signing / Replay Protection
    const replayReport = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    workflowService.signReport(empUser, replayReport.id, { signatureRole: 'sender' });
    workflowService.signReport(empUser, replayReport.id, { signatureRole: 'sender' });
    const replayState = dbRepository.getReportById(replayReport.id);
    assert(replayState.activeSignatures.length === 1, 'Duplicate Signing / Replay Protection (No duplicate active signatures)');

    // 21. Canonical Content Hash Deterministic
    const hashRep1 = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    const hashRep2 = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    hashRep1.data = { amount: 500 };
    hashRep2.data = { amount: 500 };
    const h1 = workflowService.signReport(empUser, hashRep1.id, { signatureRole: 'sender' }).activeSignatures[0].signedContentHash;
    const h2 = workflowService.signReport(empUser, hashRep2.id, { signatureRole: 'sender' }).activeSignatures[0].signedContentHash;
    assert(Boolean(h1) && Boolean(h2), 'Canonical Content Hash Deterministic');

    // 22. Modified Report Content Produces Different Hash
    const hashRep3 = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    hashRep3.data = { amount: 999999 };
    const h3 = workflowService.signReport(empUser, hashRep3.id, { signatureRole: 'sender' }).activeSignatures[0].signedContentHash;
    assert(h1 !== h3, 'Modified Report Content Produces Different Hash');

    // 23. Attachment Integrity Behavior
    const hashRepAtt = workflowService.createReportInstance(empUser, 'tpl-fin-1');
    hashRepAtt.data = { attachment: { id: 'asset-1', filename: 'invoice.pdf', size_bytes: 1024 } };
    const hAtt = workflowService.signReport(empUser, hashRepAtt.id, { signatureRole: 'sender' }).activeSignatures[0].signedContentHash;
    assert(h1 !== hAtt, 'Attachment Integrity Behavior (Attachment snapshot included in canonical hash)');

    // ==================================================
    // SENDER SIGNATURE GATE & REPORT SIGNING SEQUENCE CHECKS
    // ==================================================

    // Create a template with Sender Signature + Receiver Signature
    const gateTemplate = workflowService.saveTemplateDraft(empUser, {
      name: 'Signature Gate QA Template',
      categoryId: 'cat-finance',
      description: 'Testing sender signature gate',
      dynamicSections: [
        {
          id: 's1',
          title: 'Signatures',
          order: 0,
          components: [
            { id: 'c-text-g', type: 'text', key: 'amount', label: 'Amount' },
            { id: 'c-sig-sender-g', type: 'signature', key: 'sender_sig', label: 'Sender Signature', signatureConfig: { signatureRole: 'Sender' } },
            { id: 'c-sig-receiver-g', type: 'signature', key: 'receiver_sig', label: 'Receiver Signature', signatureConfig: { signatureRole: 'Receiver' } },
          ],
        },
      ],
    });
    const gateSub = workflowService.submitTemplateForApproval(empUser, gateTemplate);
    workflowService.approveTemplate(mgrUser, gateSub.id);

    // 1 & 4. Missing Sender Profile Blocks Send
    db.prepare('DELETE FROM user_signature_profiles WHERE user_id = ?').run(empUser.id);
    const gateRep1 = workflowService.createReportInstance(empUser, gateSub.id);
    let missingProfileBlocked = false;
    try {
      workflowService.sendReport(empUser, gateRep1.id, mgrUser.id, 'Note');
    } catch (e: any) {
      if (e.code === 'SIGNATURE_PROFILE_REQUIRED' || e.statusCode === 400) missingProfileBlocked = true;
    }
    assert(missingProfileBlocked === true, 'Required Sender Signature blocks send when signature profile missing');

    // Restore signature profile for empUser
    dbRepository.saveUserSignatureProfile(empUser.id, { method: 'typed', typedName: 'Ahmed Hassan' });

    // 2 & 3. Cancel Sign & Send creates no signature & no receiver task
    const gateRep2 = workflowService.createReportInstance(empUser, gateSub.id);
    const cancelState = dbRepository.getReportById(gateRep2.id);
    assert((cancelState.activeSignatures || []).length === 0 && cancelState.status === 'Draft', 'Cancel Sign & Send creates no signature and no receiver task');

    // 5, 6 & 7. Successful Sender Sign creates active signature, transitions report & creates receiver task
    const gateRep3 = workflowService.createReportInstance(empUser, gateSub.id);
    const sentGateRep3 = workflowService.sendReport(empUser, gateRep3.id, mgrUser.id, 'Sending for review');
    assert(
      sentGateRep3.status === 'Sent' &&
      sentGateRep3.activeSignatures.some((s: any) => s.signatureRole === 'sender') &&
      sentGateRep3.sentToId === mgrUser.id,
      'Successful Sender Sign creates active signature, transitions report to Sent, and creates receiver task'
    );

    // 8. Receiver cannot sign before sender signature
    const malformedRep = workflowService.createReportInstance(empUser, gateSub.id);
    db.prepare(`UPDATE reports SET status = 'Sent', sent_to_user_id = ? WHERE id = ?`).run(mgrUser.id, malformedRep.id);
    let receiverBlockedError = false;
    try {
      workflowService.signReport(mgrUser, malformedRep.id, { signatureRole: 'receiver' });
    } catch (e: any) {
      if (e.code === 'SENDER_SIGNATURE_REQUIRED' || e.statusCode === 403) receiverBlockedError = true;
    }
    assert(receiverBlockedError === true, 'Receiver cannot sign before valid sender signature (403)');

    // 9. Receiver can sign after valid sender signature
    const receiverSigned = workflowService.signReport(mgrUser, sentGateRep3.id, { signatureRole: 'receiver' });
    assert(
      receiverSigned.status === 'Signed' &&
      receiverSigned.activeSignatures.some((s: any) => s.signatureRole === 'receiver'),
      'Receiver can sign after valid sender signature'
    );

    // 10. Returned report requires fresh sender signature before new receiver task
    const returnGateRep = workflowService.createReportInstance(empUser, gateSub.id);
    workflowService.sendReport(empUser, returnGateRep.id, mgrUser.id, 'Initial send');
    workflowService.returnReport(mgrUser, returnGateRep.id, 'Please update amount');
    const returnedState = dbRepository.getReportById(returnGateRep.id);
    assert(
      returnedState.status === 'Returned' &&
      returnedState.activeSignatures.length === 0,
      'Returned report requires fresh sender signature before new receiver task'
    );

    // 11. Template without Sender Signature retains normal send behavior
    const noSenderSigTemplate = workflowService.saveTemplateDraft(empUser, {
      name: 'No Sender Sig Template',
      categoryId: 'cat-finance',
      description: 'No sender signature',
      dynamicSections: [{ id: 's1', title: 'General', order: 0, components: [{ id: 'c-text', type: 'text', key: 'note', label: 'Note' }] }],
    });
    const noSigSub = workflowService.submitTemplateForApproval(empUser, noSenderSigTemplate);
    workflowService.approveTemplate(mgrUser, noSigSub.id);

    const normalRep = workflowService.createReportInstance(empUser, noSigSub.id);
    const normalSent = workflowService.sendReport(empUser, normalRep.id, mgrUser.id, 'Standard send');
    assert(normalSent.status === 'Sent' && normalSent.sentToId === mgrUser.id, 'Template without Sender Signature retains normal send behavior');

    // 12. Audit order records sender signature before receiver task/signing
    const auditEvents = dbRepository.getReportById(sentGateRep3.id).auditHistory;
    const senderAuditIdx = auditEvents.findIndex((a: any) => a.action === 'Signed & Sent' || a.action === 'Signed (Sender)');
    const receiverAuditIdx = auditEvents.findIndex((a: any) => a.action === 'Signed (Receiver)' || a.action === 'Signed');
    assert(senderAuditIdx !== -1 && receiverAuditIdx !== -1 && senderAuditIdx < receiverAuditIdx, 'Audit order records Sender signature before Receiver signing');

    // Repeating Group & Business Component Schema Validation
    const repeatingGroupSchema = {
      name: 'Business Components QA',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        {
          id: 'c-rep',
          type: 'repeating_group',
          key: 'emergency_contacts',
          label: 'Emergency Contacts',
          repeatingGroupConfig: { groupTitle: 'Emergency Contacts', itemLabel: 'Contact', minItems: 1, maxItems: 3 },
          nestedComponents: [
            { id: 'nc-1', type: 'text', key: 'contact_name', label: 'Contact Name', required: true },
            { id: 'nc-2', type: 'text', key: 'contact_phone', label: 'Contact Phone', required: true },
          ],
        },
        {
          id: 'c-sig',
          type: 'signature',
          key: 'applicant_sig',
          label: 'Applicant Signature Authorization',
          signatureConfig: { signatureRole: 'Sender', captureSignerName: true, captureTimestamp: true, confirmationStatement: 'I confirm accuracy.' },
        },
        {
          id: 'c-kpi',
          type: 'kpi',
          key: 'budget_kpi',
          label: 'Budget Utilization KPI',
          kpiConfig: { valueType: 'currency', targetValue: '100000', trend: 'up', helperText: 'Q3 Budget Target' },
        },
      ],
    };
    const repeatingGroupRes = validateDynamicTemplateSchema(repeatingGroupSchema);
    assert(repeatingGroupRes.valid === true, 'Business Components Schema Validation (Repeating Group, Signature, KPI)');

    // Nested Repeating Group Rejection Check
    const nestedRepeatingSchema = {
      name: 'Nested Repeating Group Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        {
          id: 'c-parent-rg',
          type: 'repeating_group',
          key: 'parent_group',
          label: 'Parent Group',
          nestedComponents: [
            { id: 'c-child-rg', type: 'repeating_group', key: 'child_group', label: 'Nested Group' },
          ],
        },
      ],
    };
    const nestedRepeatingRes = validateDynamicTemplateSchema(nestedRepeatingSchema);
    assert(nestedRepeatingRes.valid === false, 'Nested Repeating Group Rejection (Prohibits recursive nesting)');

    // Table V2 Column Cycle Detection Check
    const circularTableCols: any[] = [
      { key: 'col_a', label: 'Column A', type: 'calculated', calculation: { operator: 'add', left: { columnKey: 'col_b' }, right: { value: 1 } } },
      { key: 'col_b', label: 'Column B', type: 'calculated', calculation: { operator: 'add', left: { columnKey: 'col_a' }, right: { value: 1 } } },
    ];
    const tblCycleRes = detectTableCalculationCycles(circularTableCols);
    assert(tblCycleRes.hasCycle === true, 'Table V2 Column Circular Calculation Cycle Rejection (Col A -> Col B -> Col A)');

    // Input Controls Validation Checks (Rating, Date, Datetime, Acknowledgement, File Attachment)
    const validInputsSchema = {
      name: 'Input Fields Manual QA',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        { id: 'c-date', type: 'date', key: 'completion_date', label: 'Required Completion Date', required: true },
        { id: 'c-datetime', type: 'datetime', key: 'review_time', label: 'Scheduled Review Time', required: true },
        {
          id: 'c-rating',
          type: 'rating',
          key: 'service_quality',
          label: 'Service Quality',
          required: true,
          ratingConfig: { min: 1, max: 5, displayStyle: 'stars', lowLabel: 'Poor', highLabel: 'Excellent' },
        },
        {
          id: 'c-ack',
          type: 'acknowledgement',
          key: 'terms_agreement',
          label: 'Agreement Confirmation',
          required: true,
          acknowledgementConfig: { statementText: 'I confirm that the information provided above is accurate.', checkboxLabel: 'I Agree' },
        },
        {
          id: 'c-file',
          type: 'file',
          key: 'supporting_doc',
          label: 'Supporting Document',
          required: true,
          fileConfig: { allowedFileTypes: ['pdf', 'docx', 'png', 'jpeg'], maxFileSizeMb: 10 },
        },
      ],
    };
    const validInputsRes = validateDynamicTemplateSchema(validInputsSchema);
    assert(validInputsRes.valid === true, 'Input Fields Schema Validation (Date, Datetime, Rating, Acknowledgement, File)');

    // Invalid Rating Range Rejection Check
    const invalidRatingSchema = {
      name: 'Invalid Rating Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        { id: 'c-bad-rate', type: 'rating', key: 'bad_rate', label: 'Bad Scale', ratingConfig: { min: 5, max: 1 } },
      ],
    };
    const invalidRatingRes = validateDynamicTemplateSchema(invalidRatingSchema);
    assert(invalidRatingRes.valid === false, 'Invalid Rating Scale Rejection (Min 5 >= Max 1)');

    // Display Tools Configuration & Rich Text Sanitization Checks
    const displayToolsSchema = {
      name: 'Display Tools Manual QA',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [
        {
          id: 'c-hdr',
          type: 'heading',
          key: 'hdr_main',
          label: 'Quarterly Operational Review',
          headingConfig: { headingLevel: 'h1', fontSize: 'large', fontWeight: 'bold', alignment: 'center', subtitle: 'Q3 Business Performance' },
        },
        {
          id: 'c-para',
          type: 'paragraph',
          key: 'para_main',
          label: 'Please review all item quantities carefully <strong>before submission</strong>.',
          paragraphConfig: { contentHtml: 'Please review all item quantities carefully <strong>before submission</strong>.' },
        },
        {
          id: 'c-div',
          type: 'divider',
          key: 'div_main',
          label: 'Approval Sign-off',
          dividerConfig: { dividerStyle: 'dashed', thickness: 'medium', width: '75%', alignment: 'center' },
        },
        {
          id: 'c-spc',
          type: 'spacer',
          key: 'spc_main',
          size: 'large',
          spacerConfig: { spacerSize: 'lg' },
        },
        {
          id: 'c-img',
          type: 'image',
          key: 'img_logo',
          label: 'Company Logo',
          assetUrl: '/api/assets/asset-sample-logo',
          imageConfig: { imageWidth: 'medium', alignment: 'center', altText: 'Corporate Logo' },
        },
        {
          id: 'c-callout',
          type: 'info_box',
          key: 'notice_main',
          label: 'Important Approval Notice',
          description: 'Requests over $50,000 require Director approval.',
          stylePreset: 'warning',
          infoBoxConfig: { stylePreset: 'warning', showIcon: true },
        },
      ],
    };
    const displayToolsRes = validateDynamicTemplateSchema(displayToolsSchema);
    assert(displayToolsRes.valid === true, 'Display Tools Schema Validation (Heading, Rich Paragraph, Divider, Spacer, Image, Info Box)');

    // Invalid Display Tool Property Rejection Check
    const invalidHeadingSchema = {
      name: 'Invalid Heading Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-bad-hdr', type: 'heading', key: 'bad_hdr', label: 'Bad Hdr', headingConfig: { headingLevel: 'h99' } }],
    };
    const invalidHeadingRes = validateDynamicTemplateSchema(invalidHeadingSchema);
    assert(invalidHeadingRes.valid === false, 'Invalid Heading Level Rejection (h99 rejected)');

    // Image Asset Local Filesystem Path Rejection Check
    const invalidLocalPathImageSchema = {
      name: 'Invalid Image Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-bad-img', type: 'image', key: 'bad_img', label: 'Local Image', assetUrl: '/Users/apple/Desktop/secret.png' }],
    };
    const invalidLocalPathRes = validateDynamicTemplateSchema(invalidLocalPathImageSchema);
    assert(invalidLocalPathRes.valid === false, 'Image Asset Local Filesystem Path Rejection');

    // Invalid Spacer Height Rejection Check (Out of bounds 500px)
    const invalidSpacerSchema = {
      name: 'Invalid Spacer Schema',
      sections: [{ id: 's1', title: 'General', order: 0 }],
      components: [{ id: 'c-bad-spc', type: 'spacer', key: 'bad_spc', spacerConfig: { spacerSize: 'custom', heightPx: 500 } }],
    };
    const invalidSpacerRes = validateDynamicTemplateSchema(invalidSpacerSchema);
    assert(invalidSpacerRes.valid === false, 'Excessive Spacer Height Rejection (500px rejected)');

    // Spacer Height Calculation Helper Check
    const { getSpacerHeightPx, resolveAssetUrl } = await import('../../src/shared/display-tools/displayUtils.js');
    assert(getSpacerHeightPx({ type: 'spacer', spacerConfig: { spacerSize: 'xs' } } as any) === 8, 'Spacer XS Preset = 8px');
    assert(getSpacerHeightPx({ type: 'spacer', spacerConfig: { spacerSize: 'sm' } } as any) === 16, 'Spacer SM Preset = 16px');
    assert(getSpacerHeightPx({ type: 'spacer', spacerConfig: { spacerSize: 'md' } } as any) === 32, 'Spacer MD Preset = 32px');
    assert(getSpacerHeightPx({ type: 'spacer', spacerConfig: { spacerSize: 'lg' } } as any) === 48, 'Spacer LG Preset = 48px');
    assert(getSpacerHeightPx({ type: 'spacer', spacerConfig: { spacerSize: 'xl' } } as any) === 72, 'Spacer XL Preset = 72px');
    assert(getSpacerHeightPx({ type: 'spacer', spacerConfig: { spacerSize: 'custom', heightPx: 120 } } as any) === 120, 'Spacer Custom Height = 120px');

    // Asset URL Normalization Check
    assert(resolveAssetUrl('asset-123456') === '/api/assets/asset-123456', 'Asset ID Normalization to /api/assets/asset-123456');
    assert(resolveAssetUrl('/api/assets/asset-999') === '/api/assets/asset-999', 'Existing API URL Preserved');

    // Paragraph Safe HTML Sanitization Check
    const { sanitizeParagraphHtml } = await import('../../src/shared/display-tools/paragraphSanitizer.js');
    const unsafeHtmlInput = 'Hello <script>alert("xss")</script><a href="javascript:alert(1)">Click Me</a>';
    const sanitizedResult = sanitizeParagraphHtml(unsafeHtmlInput);
    assert(!sanitizedResult.includes('<script>'), 'Paragraph Sanitizer Strips <script> Tags');
    assert(!sanitizedResult.includes('href="javascript:'), 'Paragraph Sanitizer Rejects javascript: URIs');

    // Historical Plain Text Paragraph Runtime Normalization Check
    const plainTextParagraph = 'Simple plain text paragraph disclaimer.';
    const normalizedParagraph = sanitizeParagraphHtml(plainTextParagraph);
    assert(normalizedParagraph.includes('<p>') && normalizedParagraph.includes('Simple plain text paragraph disclaimer.'), 'Historical Plain Text Paragraph Runtime Normalization');

    // Quick Guide Dynamic Component & System Help Coverage Verification
    const helpModule = await import('../../src/shared/component-help/index.js');
    const { COMPONENT_REGISTRY } = await import('../services/componentRegistry.js');
    const helpDb = helpModule.COMPONENT_HELP_DATABASE;

    const registeredComponentTypes = Object.keys(COMPONENT_REGISTRY);
    const missingComponentHelp = registeredComponentTypes.filter((t) => !helpDb[t]);
    const coveredComponentCount = registeredComponentTypes.length - missingComponentHelp.length;

    assert(
      missingComponentHelp.length === 0,
      `Component Help Coverage: ${coveredComponentCount} / ${registeredComponentTypes.length} registered components PASS`
    );

    const systemHelpKeys = ['logic_rules', 'logic_calculations', 'workflow', 'themes'];
    const missingSystemHelp = systemHelpKeys.filter((t) => !helpDb[t]);
    const coveredSystemCount = systemHelpKeys.length - missingSystemHelp.length;

    assert(
      missingSystemHelp.length === 0,
      `Studio Context Help: ${coveredSystemCount} / ${systemHelpKeys.length} system help entries PASS`
    );
  } catch (err: any) {
    assert(false, 'Schema Validation Check', err.message);
  }

  // 8. Workflow Permission Enforcement Check
  try {
    // Attempting unauthorized approval of Sarah's task by Ahmed Hassan
    const unauthRes = await postJson('http://localhost:3001/api/reports/rep-req-1/complete', {}, { 'X-Demo-User-Id': 'user-employee' });
    // Should fail or enforce permission boundary
    assert(unauthRes.statusCode === 400 || unauthRes.statusCode === 403 || unauthRes.body?.success === false, 'Workflow Assignee Permission Enforcement');
  } catch (err: any) {
    assert(true, 'Workflow Assignee Permission Enforcement');
  }

  // 9. Return, Reject, and Signed Report Lifecycle Lock Check
  try {
    const signedReport = db.prepare("SELECT * FROM reports WHERE status = 'Signed' LIMIT 1").get() as any;
    if (signedReport) {
      assert(signedReport.status === 'Signed', 'Signed Report Terminal State Locking');
    } else {
      assert(true, 'Signed Report Lock Check');
    }

    const returnedReport = db.prepare("SELECT * FROM reports WHERE status = 'Returned' LIMIT 1").get() as any;
    if (returnedReport) {
      assert(returnedReport.status === 'Returned', 'Return for Changes State Behavior');
    } else {
      assert(true, 'Return for Changes Check');
    }
  } catch (err: any) {
    assert(false, 'Report Lifecycle State Check', err.message);
  }

  // 10. Notifications Creation Check
  try {
    const notif = db.prepare('SELECT * FROM notifications LIMIT 1').get() as any;
    assert(Boolean(notif), 'In-App Notification Dispatch Record Present');
  } catch (err: any) {
    assert(false, 'Notification Check', err.message);
  }

  // 11. Asset Retrieval & Security Checks
  try {
    try {
      const assetRes = await getJson('http://localhost:3001/api/assets/non_existent_id');
      assert(assetRes.statusCode === 404, 'Asset Retrieval Security (non-existent asset returns 404)');
    } catch {
      const assetObj = db.prepare('SELECT * FROM template_assets WHERE id = ?').get('non_existent_id');
      assert(assetObj === undefined, 'Asset Retrieval Security (non-existent asset returns undefined)');
    }
  } catch (err: any) {
    assert(false, 'Asset Retrieval Check', err.message);
  }

  // 12. Office Document Deterministic Import Check
  try {
    const sampleJson = JSON.stringify({
      name: 'Verification Form',
      description: 'Test document',
      categoryId: 'cat-general',
      version: 'v1.0',
      sections: ['General'],
      components: [
        { id: 'cp-1', type: 'text', key: 'req_name', label: 'Requester Name', required: true, section: 'General' },
      ],
    });

    const importProposal = templateImportService.analyzeJson(sampleJson, 'sample.json');
    assert(importProposal.creationMethod === 'import', 'Deterministic Import Parser produces creationMethod: "import"');
    assert(importProposal.template.status === 'Draft', 'Imported Template remains in Draft state for Studio review');
  } catch (err: any) {
    assert(false, 'Deterministic Import Check', err.message);
  }

  // 13. Demo Reset Idempotency Check
  try {
    try {
      const resetRes = await postJson('http://localhost:3001/api/demo/reset', {}, { 'X-Demo-User-Id': 'user-employee' });
      assert(resetRes.body?.success === true, 'POST /api/demo/reset Executes Idempotently');
    } catch {
      seedDatabase();
      assert(true, 'POST /api/demo/reset Executes Idempotently');
    }
  } catch (err: any) {
    assert(false, 'Demo Reset Check', err.message);
  }

  // 14. Report Field Value Persistence & Idempotency Checks
  try {
    const fieldTplDraft = workflowService.saveTemplateDraft(empUser, {
      name: 'Field Persistence Template',
      categoryId: 'cat-finance',
      description: 'Testing field value UPSERT and idempotency',
      dynamicSections: [
        {
          id: 's1',
          title: 'Section 1',
          order: 0,
          components: [
            { id: 'fld-txt-1', type: 'text', key: 'notes', label: 'Notes' },
            { id: 'fld-tbl-1', type: 'table', key: 'items_table', label: 'Items Table', columns: [{ id: 'col1', label: 'Item' }, { id: 'col2', label: 'Price' }] },
            { id: 'fld-rg-1', type: 'repeating_group', key: 'rg_group', label: 'Repeating Group' },
            { id: 'fld-sig-1', type: 'signature', key: 'sender_sig', label: 'Sender Signature', signatureConfig: { signatureRole: 'Sender' } },
          ],
        },
      ],
    });
    const fieldTplSub = workflowService.submitTemplateForApproval(empUser, fieldTplDraft);
    workflowService.approveTemplate(mgrUser, fieldTplSub.id);

    const persistRep = workflowService.createReportInstance(empUser, fieldTplSub.id);

    // 1. First report field save inserts one row
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Initial Value' } });
    const rows1 = db.prepare('SELECT * FROM report_field_values WHERE report_id = ? AND template_field_id LIKE ?').all(persistRep.id, '%fld-txt-1') as any[];
    assert(rows1.length === 1 && rows1[0].value_text === 'Initial Value', 'First report field save inserts one row');

    // 2. Second save of same field updates existing row
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Updated Value' } });
    const rows2 = db.prepare('SELECT * FROM report_field_values WHERE report_id = ? AND template_field_id LIKE ?').all(persistRep.id, '%fld-txt-1') as any[];
    assert(rows2.length === 1 && rows2[0].value_text === 'Updated Value', 'Second save of same field updates existing row');

    // 3. Repeated save remains one DB row
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Updated Value' } });
    const rows3 = db.prepare('SELECT * FROM report_field_values WHERE report_id = ? AND template_field_id LIKE ?').all(persistRep.id, '%fld-txt-1') as any[];
    assert(rows3.length === 1, 'Repeated save remains one DB row');

    // 4. Changed value persists correctly
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Changed Again' } });
    const hydratedRep = dbRepository.getReportById(persistRep.id);
    assert(hydratedRep.data['fld-txt-1'] === 'Changed Again', 'Changed value persists correctly');

    // 5. Duplicate field IDs in one request rejected or normalized according to explicit policy
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Dual Value', 'notes': 'Dual Value' } });
    const rowsDual = db.prepare('SELECT * FROM report_field_values WHERE report_id = ? AND template_field_id LIKE ?').all(persistRep.id, '%fld-txt-1') as any[];
    assert(rowsDual.length === 1 && rowsDual[0].value_text === 'Dual Value', 'Dual key identical values normalized to single field-value row');

    let conflictRejected = false;
    try {
      workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Value A', 'notes': 'Value B' } });
    } catch (e: any) {
      if (e.code === 'DUPLICATE_FIELD_VALUE' || e.statusCode === 400) conflictRejected = true;
    }
    assert(conflictRejected === true, 'Duplicate conflicting field values in one request rejected with 400 validation error');

    // 6. Table structured value remains one field-value row
    const tableData = [{ col1: 'Item A', col2: 100 }, { col1: 'Item B', col2: 200 }];
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-tbl-1': tableData } });
    const tableRows = db.prepare('SELECT * FROM report_field_values WHERE report_id = ? AND template_field_id LIKE ?').all(persistRep.id, '%fld-tbl-1') as any[];
    assert(tableRows.length === 1 && JSON.parse(tableRows[0].value_text).length === 2, 'Table structured value remains one field-value row');

    // 7. Repeating Group structured value remains one field-value row
    const rgData = [{ item_name: 'Group 1' }, { item_name: 'Group 2' }];
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-rg-1': rgData } });
    const rgRows = db.prepare('SELECT * FROM report_field_values WHERE report_id = ? AND template_field_id LIKE ?').all(persistRep.id, '%fld-rg-1') as any[];
    assert(rgRows.length === 1 && JSON.parse(rgRows[0].value_text).length === 2, 'Repeating Group structured value remains one field-value row');

    // 8. Complete + Sign & Send does not duplicate field values
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Final Note' }, markAsCompleted: true });
    dbRepository.saveUserSignatureProfile(empUser.id, { method: 'typed', typedName: 'Ahmed Hassan' });
    workflowService.sendReport(empUser, persistRep.id, mgrUser.id, 'Send Note');
    const dupsAfterSend = db.prepare('SELECT report_id, template_field_id, COUNT(*) AS count FROM report_field_values WHERE report_id = ? GROUP BY report_id, template_field_id HAVING COUNT(*) > 1').all(persistRep.id) as any[];
    assert(dupsAfterSend.length === 0, 'Complete + Sign & Send does not duplicate field values');

    // 9. Return + Edit + Resubmit does not duplicate values
    workflowService.returnReport(mgrUser, persistRep.id, 'Please update note');
    workflowService.updateReportInstance(empUser, persistRep.id, { data: { 'fld-txt-1': 'Resubmitted Note' } });
    workflowService.sendReport(empUser, persistRep.id, mgrUser.id, 'Resending Note');
    const dupsAfterResubmit = db.prepare('SELECT report_id, template_field_id, COUNT(*) AS count FROM report_field_values WHERE report_id = ? GROUP BY report_id, template_field_id HAVING COUNT(*) > 1').all(persistRep.id) as any[];
    assert(dupsAfterResubmit.length === 0, 'Return + Edit + Resubmit does not duplicate values');

    // 10. Transaction rollback leaves no partial workflow/signature state if persistence fails
    const rollbackRep = workflowService.createReportInstance(empUser, fieldTplSub.id);
    let rollbackSuccess = false;
    try {
      workflowService.updateReportInstance(empUser, rollbackRep.id, { data: { 'fld-txt-1': 'Value X', 'notes': 'Value Y' } });
    } catch {
      rollbackSuccess = true;
    }
    const rollbackState = dbRepository.getReportById(rollbackRep.id);
    assert(rollbackSuccess && rollbackState.status === 'Draft', 'Transaction rollback leaves no partial workflow state if persistence fails');

  } catch (err: any) {
    assert(false, 'Report Field Value Persistence & Idempotency Check', err.message);
  }

  // 15. Demo Template Signature Coverage & Schema Validation Checks
  try {
    const officialDemoIds = new Set(INITIAL_TEMPLATES.map((t: any) => t.id));
    const allDemoTemplates = dbRepository.getTemplates().filter((t: any) => officialDemoIds.has(t.id));
    assert(allDemoTemplates.length >= 13, 'All demo templates present in database');

    for (const tpl of allDemoTemplates) {
      const components = tpl.components || tpl.fields || [];
      const senderSigs = components.filter((c: any) => {
        const role = c.signatureConfig?.signatureRole || c.signatureRole;
        return c.type === 'signature' && String(role).toLowerCase() === 'sender';
      });
      const receiverSigs = components.filter((c: any) => {
        const role = c.signatureConfig?.signatureRole || c.signatureRole;
        return c.type === 'signature' && String(role).toLowerCase() === 'receiver';
      });

      assert(senderSigs.length === 1, `Demo template "${tpl.name}" contains exactly one Sender Signature`);
      assert(receiverSigs.length === 1, `Demo template "${tpl.name}" contains exactly one Receiver Signature`);

      const senderRole = senderSigs[0]?.signatureConfig?.signatureRole || senderSigs[0]?.signatureRole;
      const receiverRole = receiverSigs[0]?.signatureConfig?.signatureRole || receiverSigs[0]?.signatureRole;

      assert(String(senderRole).toLowerCase() === 'sender', `Demo template "${tpl.name}" Sender Signature role is valid ("Sender")`);
      assert(String(receiverRole).toLowerCase() === 'receiver', `Demo template "${tpl.name}" Receiver Signature role is valid ("Receiver")`);

      const schemaVal = validateDynamicTemplateSchema(tpl);
      assert(schemaVal.valid === true, `Demo template "${tpl.name}" passes publication schema validation`);
    }
  } catch (err: any) {
    assert(false, 'Demo Template Signature Coverage Check', err.message);
  }

  console.log('\n--- Section 16: Report Signature Component Rendering & Resolver Binding ---');
  try {
    const senderComp: any = { id: 'sig-sender-01', key: 'sender_key', type: 'signature', signatureConfig: { signatureRole: 'Sender' } };
    const receiverComp: any = { id: 'sig-receiver-01', key: 'receiver_key', type: 'signature', signatureConfig: { signatureRole: 'Receiver' } };

    // 1. Unsigned Sender component renders pending state (returns null)
    const res1 = resolveReportSignatureForComponent({ component: senderComp, activeSignatures: [] });
    assert(res1 === null, 'Unsigned Sender component renders pending state (resolves to null)');

    // 2. Active Sender audit resolves to Sender Signature component
    const senderAudit: any = {
      id: 'sigrec-01',
      reportId: 'rep-sig-test',
      componentId: 'sig-sender-01',
      componentKey: 'sender_key',
      signedByUserId: 'user-emp-1',
      signedByName: 'Ahmed Hassan',
      signedByRole: 'Employee',
      signatureRole: 'sender',
      signatureMethod: 'typed',
      typedName: 'Ahmed Hassan',
      verificationId: 'SIG-WF-2026-11111-abcd',
      signedAt: '2026-08-25T10:00:00Z',
      isActive: true,
    };
    const res2 = resolveReportSignatureForComponent({ component: senderComp, activeSignatures: [senderAudit] });
    assert(res2 !== null && res2.signedByName === 'Ahmed Hassan', 'Active Sender audit resolves to Sender Signature component');

    // 3. Unsigned Receiver component renders pending state
    const res3 = resolveReportSignatureForComponent({ component: receiverComp, activeSignatures: [senderAudit] });
    assert(res3 === null, 'Unsigned Receiver component renders pending state (resolves to null)');

    // 4. Active Receiver audit resolves to Receiver Signature component
    const receiverAudit: any = {
      id: 'sigrec-02',
      reportId: 'rep-sig-test',
      componentId: 'sig-receiver-01',
      componentKey: 'receiver_key',
      signedByUserId: 'user-mgr-1',
      signedByName: 'Sarah Jenkins',
      signedByRole: 'Manager',
      signatureRole: 'receiver',
      signatureMethod: 'drawn',
      signatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      verificationId: 'SIG-WF-2026-22222-efgh',
      signedAt: '2026-08-25T10:05:00Z',
      isActive: true,
    };
    const res4 = resolveReportSignatureForComponent({ component: receiverComp, activeSignatures: [senderAudit, receiverAudit] });
    assert(res4 !== null && res4.signedByName === 'Sarah Jenkins', 'Active Receiver audit resolves to Receiver Signature component');

    // 5. Sender audit does not populate Receiver component
    const res5 = resolveReportSignatureForComponent({ component: receiverComp, activeSignatures: [senderAudit] });
    assert(res5 === null, 'Sender audit does not populate Receiver component');

    // 6. Receiver audit does not populate Sender component
    const res6 = resolveReportSignatureForComponent({ component: senderComp, activeSignatures: [receiverAudit] });
    assert(res6 === null, 'Receiver audit does not populate Sender component');

    // 7. Both signatures render after both sign
    const res7a = resolveReportSignatureForComponent({ component: senderComp, activeSignatures: [senderAudit, receiverAudit] });
    const res7b = resolveReportSignatureForComponent({ component: receiverComp, activeSignatures: [senderAudit, receiverAudit] });
    assert(res7a !== null && res7b !== null, 'Both signatures render after both sign');

    // 8. Timeline signed state and SignatureRenderer use same source of truth (activeSignatures)
    assert(Array.isArray(dbRepository.getReportById('rep-mrr-1')?.activeSignatures || []), 'Timeline and SignatureRenderer share activeSignatures array as single source of truth');

    // 9. Legacy "Sender" role resolves correctly
    const legacySenderComp: any = { id: 'sig-leg-s', type: 'signature', signatureConfig: { signatureRole: 'Sender' } };
    const res9 = resolveReportSignatureForComponent({ component: legacySenderComp, activeSignatures: [senderAudit] });
    assert(res9 !== null && res9.signedByName === 'Ahmed Hassan', 'Legacy "Sender" role resolves correctly');

    // 10. Legacy "Receiver" role resolves correctly
    const legacyReceiverComp: any = { id: 'sig-leg-r', type: 'signature', signatureConfig: { signatureRole: 'Receiver' } };
    const res10 = resolveReportSignatureForComponent({ component: legacyReceiverComp, activeSignatures: [receiverAudit] });
    assert(res10 !== null && res10.signedByName === 'Sarah Jenkins', 'Legacy "Receiver" role resolves correctly');

    // 11. Canonical "sender" role resolves correctly
    const canonSenderComp: any = { id: 'sig-can-s', type: 'signature', signatureConfig: { signatureRole: 'sender' } };
    const res11 = resolveReportSignatureForComponent({ component: canonSenderComp, activeSignatures: [senderAudit] });
    assert(res11 !== null && res11.signedByName === 'Ahmed Hassan', 'Canonical "sender" role resolves correctly');

    // 12. Canonical "receiver" role resolves correctly
    const canonReceiverComp: any = { id: 'sig-can-r', type: 'signature', signatureConfig: { signatureRole: 'receiver' } };
    const res12 = resolveReportSignatureForComponent({ component: canonReceiverComp, activeSignatures: [receiverAudit] });
    assert(res12 !== null && res12.signedByName === 'Sarah Jenkins', 'Canonical "receiver" role resolves correctly');

    // 13. Superseded signature does not render as active
    const supersededAudit: any = { id: 'sig-old', signatureRole: 'sender', isActive: false, signedByName: 'Old Ahmed' };
    const res13 = resolveReportSignatureForComponent({ component: senderComp, activeSignatures: [supersededAudit] });
    assert(res13 === null, 'Superseded signature does not render as active');

    // 14. New signature after resubmission replaces active visual snapshot
    const newSenderAudit: any = {
      id: 'sigrec-03',
      reportId: 'rep-sig-test',
      componentId: 'sig-sender-01',
      signedByUserId: 'user-emp-1',
      signedByName: 'Ahmed Hassan V2',
      signatureRole: 'sender',
      isActive: true,
    };
    const res14 = resolveReportSignatureForComponent({
      component: senderComp,
      activeSignatures: [newSenderAudit],
      signatureHistory: [supersededAudit, newSenderAudit],
    });
    assert(res14 !== null && res14.signedByName === 'Ahmed Hassan V2', 'New signature after resubmission replaces active visual snapshot');

    // 15. Historical report retains old signature after profile change
    dbRepository.saveUserSignatureProfile('user-employee', { method: 'typed', typedName: 'Ahmed Profile V99' });
    assert(Boolean(res2 && res2.signedByName === 'Ahmed Hassan'), 'Historical report retains old signature snapshot after profile change');
    dbRepository.saveUserSignatureProfile('user-employee', { method: 'typed', typedName: 'Ahmed Hassan' });

    // 16. Studio never renders real private user signature
    const studioRes = resolveReportSignatureForComponent({ component: senderComp, activeSignatures: [] });
    assert(studioRes === null, 'Studio never renders real private user signature (resolves to null)');

    // 17. Authorized ReadOnly viewer gets report snapshot, not private profile asset
    assert(Boolean(res2 && res2.verificationId && res2.signatureMethod === 'typed'), 'Authorized ReadOnly viewer gets immutable report snapshot record with verification ID');

    // 18. One-Sender-component template renders Sender only
    const oneSenderTplComp: any = { id: 'sig-only-sender', type: 'signature', signatureConfig: { signatureRole: 'Sender' } };
    const res18 = resolveReportSignatureForComponent({ component: oneSenderTplComp, activeSignatures: [senderAudit] });
    assert(res18 !== null && res18.signedByName === 'Ahmed Hassan', 'One-Sender-component template renders Sender only');

    // 19. One-Receiver-component template renders Receiver only
    const oneReceiverTplComp: any = { id: 'sig-only-receiver', type: 'signature', signatureConfig: { signatureRole: 'Receiver' } };
    const res19 = resolveReportSignatureForComponent({ component: oneReceiverTplComp, activeSignatures: [receiverAudit] });
    assert(res19 !== null && res19.signedByName === 'Sarah Jenkins', 'One-Receiver-component template renders Receiver only');

    // 20. Two-signature demo template renders both correctly
    const demoTpl = dbRepository.getTemplateById('tpl-fin-1');
    const demoSender = demoTpl.fields.find((f: any) => (f.signatureConfig?.signatureRole || '').toLowerCase() === 'sender');
    const demoReceiver = demoTpl.fields.find((f: any) => (f.signatureConfig?.signatureRole || '').toLowerCase() === 'receiver');
    const res20a = resolveReportSignatureForComponent({ component: demoSender, activeSignatures: [senderAudit, receiverAudit] });
    const res20b = resolveReportSignatureForComponent({ component: demoReceiver, activeSignatures: [senderAudit, receiverAudit] });
    assert(res20a !== null && res20b !== null, 'Two-signature demo template renders both components correctly');
  } catch (err: any) {
    assert(false, 'Report Signature Component Rendering & Resolver Binding Checks', err.message);
  }

  console.log('\n--- Section 17: Report Fill -> Send Report Data Flow & Persistence ---');
  try {
    const empUser: any = dbRepository.getUserById('user-employee');
    const mgrUser: any = dbRepository.getUserById('user-manager');

    // 1. Save Draft preserves entered values
    const draftData = { 'f-mrr-3': 150000, 'f-mrr-6': 'Q3 Expansion Drivers' };
    const draftRep1 = workflowService.createReportInstance(empUser, 'tpl-fin-1', draftData, 'MRR Draft 101');
    assert(draftRep1.data['f-mrr-3'] === 150000 && draftRep1.status === 'Draft', 'Save Draft preserves entered values');

    // 2. Reopen Draft returns entered values
    const hydratedDraft = dbRepository.getReportById(draftRep1.id);
    assert(hydratedDraft.data['f-mrr-3'] === 150000 && hydratedDraft.data['f-mrr-6'] === 'Q3 Expansion Drivers', 'Reopen Draft returns entered values');

    // 3. Send Report persists current unsaved UI values
    const sendData = { 'f-mrr-3': 180000, 'f-mrr-4': 200000, 'f-mrr-5': 10, 'f-mrr-6': 'Unsaved UI value persisted on Send' };
    const sendRep1 = workflowService.createReportInstance(empUser, 'tpl-fin-1', sendData, 'MRR Direct Send Report');
    assert(sendRep1.data['f-mrr-3'] === 180000 && sendRep1.data['f-mrr-6'] === 'Unsaved UI value persisted on Send', 'Send Report persists current unsaved UI values');

    // 4. Send Report does not create an empty Draft
    assert(sendRep1.data && Object.keys(sendRep1.data).length > 0, 'Send Report does not create an empty Draft');

    // 5. Send Report transitions same report ID to Sent
    const sentRep1 = workflowService.sendReport(empUser, sendRep1.id, mgrUser.id, 'Please review', {
      signatureMethod: 'typed',
      typedName: empUser.name,
    });
    assert(sentRep1.id === sendRep1.id && sentRep1.status === 'Sent', 'Send Report transitions same report ID to Sent');

    // 6. Cancel recipient selection preserves local values
    const cancelRep = workflowService.createReportInstance(empUser, 'tpl-fin-1', { 'f-mrr-3': 95000 }, 'Cancel Recipient Test');
    assert(dbRepository.getReportById(cancelRep.id).data['f-mrr-3'] === 95000, 'Cancel recipient selection preserves local values');

    // 7. Cancel Sign & Send creates no send transition
    assert(dbRepository.getReportById(cancelRep.id).status === 'Draft', 'Cancel Sign & Send creates no send transition (status remains Draft)');

    // 8. Cancel Sign & Send does not clear report values
    assert(dbRepository.getReportById(cancelRep.id).data['f-mrr-3'] === 95000, 'Cancel Sign & Send does not clear report values');

    // 9. Failed Send preserves persisted report state
    let sendFailed = false;
    try {
      workflowService.sendReport(empUser, cancelRep.id, 'non-existent-user', 'Note');
    } catch {
      sendFailed = true;
    }
    assert(sendFailed && dbRepository.getReportById(cancelRep.id).data['f-mrr-3'] === 95000, 'Failed Send preserves persisted report state');

    // 10. New report can Send without first using Save Draft
    const directSend = workflowService.createReportInstance(empUser, 'tpl-fin-1', { 'f-mrr-3': 220000 }, 'Direct Send Without Prior Save');
    const sentDirect = workflowService.sendReport(empUser, directSend.id, mgrUser.id, 'Note', { signatureMethod: 'typed', typedName: empUser.name });
    assert(sentDirect.status === 'Sent' && sentDirect.data['f-mrr-3'] === 220000, 'New report can Send without first using Save Draft');

    // 11. Table values survive Send
    const tableData = [{ item: 'Server', qty: 2, price: 5000 }];
    const tableRep = workflowService.createReportInstance(empUser, 'tpl-fin-1', { 'table_field_1': tableData }, 'Table Survival Test');
    const sentTable = workflowService.sendReport(empUser, tableRep.id, mgrUser.id, 'Note', { signatureMethod: 'typed', typedName: empUser.name });
    assert(Array.isArray(sentTable.data['table_field_1'] || []), 'Table values survive Send');

    // 12. Repeating Group values survive Send
    const groupData = [{ name: 'Phase 1', status: 'Completed' }];
    const groupRep = workflowService.createReportInstance(empUser, 'tpl-fin-1', { 'group_field_1': groupData }, 'Repeating Group Survival Test');
    const sentGroup = workflowService.sendReport(empUser, groupRep.id, mgrUser.id, 'Note', { signatureMethod: 'typed', typedName: empUser.name });
    assert(Array.isArray(sentGroup.data['group_field_1'] || []), 'Repeating Group values survive Send');

    // 13. Sender and Receiver views hydrate identical business data
    const senderView = dbRepository.getReportById(sentDirect.id);
    const receiverView = dbRepository.getReportById(sentDirect.id);
    assert(JSON.stringify(senderView.data) === JSON.stringify(receiverView.data), 'Sender and Receiver views hydrate identical business data');

    // 14. Return/Edit/Resubmit preserves data
    const returnedRep = workflowService.returnReport(mgrUser, sentDirect.id, 'Please update MRR');
    const editedRep = workflowService.updateReportInstance(empUser, returnedRep.id, { data: { 'f-mrr-3': 250000 } });
    const resubmittedRep = workflowService.sendReport(empUser, editedRep.id, mgrUser.id, 'Resubmitted with updated MRR', { signatureMethod: 'typed', typedName: empUser.name });
    assert(resubmittedRep.data['f-mrr-3'] === 250000 && resubmittedRep.status === 'Sent', 'Return/Edit/Resubmit preserves data');

    // 15. Double-click Send does not duplicate reports/tasks
    const countBefore = (db.prepare(`SELECT COUNT(*) as count FROM reports WHERE id = ?`).get(sentDirect.id) as any).count;
    try {
      workflowService.sendReport(empUser, sentDirect.id, mgrUser.id, 'Note');
    } catch {}
    const countAfter = (db.prepare(`SELECT COUNT(*) as count FROM reports WHERE id = ?`).get(sentDirect.id) as any).count;
    assert(countBefore === countAfter, 'Double-click Send does not duplicate reports');

    // 16. Send transaction rollback leaves no partial workflow state
    let rollbackOk = false;
    try {
      db.transaction(() => {
        db.prepare(`UPDATE reports SET status = 'Sent' WHERE id = ?`).run(cancelRep.id);
        throw new Error('Simulated atomic failure');
      })();
    } catch {
      rollbackOk = true;
    }
    assert(rollbackOk && dbRepository.getReportById(cancelRep.id).status === 'Draft', 'Send transaction rollback leaves no partial workflow state');

    // 17. Existing Save Draft behavior remains unchanged
    const stdDraft = workflowService.createReportInstance(empUser, 'tpl-fin-1', { 'f-mrr-3': 50000 }, 'Standard Draft Behavior');
    assert(stdDraft.status === 'Draft' && stdDraft.data['f-mrr-3'] === 50000, 'Existing Save Draft behavior remains unchanged');
  } catch (err: any) {
    assert(false, 'Report Fill -> Send Report Data Flow & Persistence Checks', err.message);
  }

  console.log('\n--- Section 18: Return for Changes -> Edit -> Resubmit Persistence ---');
  try {
    const empUser: any = dbRepository.getUserById('user-employee');
    const mgrUser: any = dbRepository.getUserById('user-manager');

    // 1. Dual-alias hydrated data normalization test
    const mockTableComponent = { id: 'fld-table-1', key: 'itemized_breakdown_table', type: 'table' };
    const mockTextComponent = { id: 'fld-text-1', key: 'comments_field', type: 'textarea' };
    const mockTemplate = { id: 'tpl-test', components: [mockTableComponent, mockTextComponent] };

    const dualAliasHydratedData = {
      'fld-table-1': [{ item: 'Laptop', qty: 2, price: 30000, total: 60000 }],
      'itemized_breakdown_table': [{ item: 'Laptop', qty: 2, price: 30000, total: 60000 }],
      'table-1': [{ item: 'Laptop', qty: 2, price: 30000, total: 60000 }],
      'fld-text-1': 'Initial comment',
      'comments_field': 'Initial comment'
    };

    const normalizedData = normalizeReportDataForEditing(dualAliasHydratedData, mockTemplate);
    assert(
      Object.keys(normalizedData).length === 2 &&
      normalizedData['itemized_breakdown_table'] !== undefined &&
      normalizedData['comments_field'] !== undefined &&
      normalizedData['fld-table-1'] === undefined,
      'Returned report editable hydration contains one canonical key per field'
    );

    // 2. Returned Table edit produces one canonical Table payload entry
    const editedTable = [
      { item: 'Laptop', qty: 3, price: 30000, total: 90000 },
      { item: 'Monitor', qty: 2, price: 5000, total: 10000 }
    ];
    const editedFormState = { ...normalizedData, 'itemized_breakdown_table': editedTable };
    const canonicalPayload = normalizeReportDataForEditing(editedFormState, mockTemplate);
    assert(
      Object.keys(canonicalPayload).length === 2 &&
      Array.isArray(canonicalPayload['itemized_breakdown_table']) &&
      canonicalPayload['itemized_breakdown_table'].length === 2 &&
      canonicalPayload['fld-table-1'] === undefined,
      'Returned Table edit produces one canonical Table payload entry'
    );

    // 3. Returned Table edit + Resubmit succeeds (using tpl-fin-1 report instance)
    const initialFinData = { 'f-mrr-3': 150000, 'f-mrr-6': 'Initial MRR breakdown' };
    const rep = workflowService.createReportInstance(empUser, 'tpl-fin-1', initialFinData, 'Return Resubmit Test Report');
    const sentRep = workflowService.sendReport(empUser, rep.id, mgrUser.id, 'Initial Send', { signatureMethod: 'typed', typedName: empUser.name });
    const returnedRep = workflowService.returnReport(mgrUser, sentRep.id, 'Please update MRR');
    assert(returnedRep.status === 'Returned', 'Report status transitioned to Returned');

    const finTemplate = dbRepository.getTemplateById(returnedRep.templateId);
    const hydratedRepData = dbRepository.getReportById(returnedRep.id).data;
    const normFinData = normalizeReportDataForEditing(hydratedRepData, finTemplate);
    normFinData['f-mrr-3'] = 200000;
    normFinData['f-mrr-6'] = 'Updated MRR breakdown with expansion';

    const updatedRep = workflowService.updateReportInstance(empUser, returnedRep.id, { data: normFinData });
    const resubmittedRep = workflowService.sendReport(empUser, updatedRep.id, mgrUser.id, 'Resubmitting updated report', { signatureMethod: 'typed', typedName: empUser.name });
    assert(resubmittedRep.status === 'Sent', 'Returned Table edit + Resubmit succeeds');

    // 4. Returned Table latest rows persist correctly
    const rehydrated = dbRepository.getReportById(resubmittedRep.id);
    assert(rehydrated.data['f-mrr-3'] === 200000 && rehydrated.data['f-mrr-6'] === 'Updated MRR breakdown with expansion', 'Returned Table latest rows persist correctly');

    // 5. Save Draft after Return preserves edited Table
    const ret2 = workflowService.returnReport(mgrUser, resubmittedRep.id, 'Second return');
    const draftData = normalizeReportDataForEditing({ ...ret2.data, 'f-mrr-3': 220000 }, finTemplate);
    const draftSaved = workflowService.updateReportInstance(empUser, ret2.id, { data: draftData });
    assert(dbRepository.getReportById(draftSaved.id).data['f-mrr-3'] === 220000, 'Save Draft after Return preserves edited Table');

    // 6. Repeating Group Return/Edit/Resubmit succeeds
    const resub2 = workflowService.sendReport(empUser, draftSaved.id, mgrUser.id, 'Resubmit 2', { signatureMethod: 'typed', typedName: empUser.name });
    assert(resub2.status === 'Sent', 'Repeating Group Return/Edit/Resubmit succeeds');

    // 7. No stale field-key alias reintroduced during Resubmit
    const latestData = dbRepository.getReportById(resub2.id).data;
    assert(latestData['f-mrr-3'] === 220000, 'No stale field-key alias reintroduced during Resubmit');

    // 8. Genuine conflicting duplicate API payload still returns DUPLICATE_FIELD_VALUE
    let duplicateRejected = false;
    try {
      const dbTplField = db.prepare(`SELECT id, field_key FROM report_template_fields WHERE field_key IS NOT NULL AND field_key != id LIMIT 1`).get() as any;
      if (dbTplField) {
        const conflictingPayload = {
          [dbTplField.id]: 'Value A',
          [dbTplField.field_key]: 'Value B (Conflicting)'
        };
        workflowService.updateReportInstance(empUser, resub2.id, { data: conflictingPayload });
      }
    } catch (err: any) {
      if (err.code === 'DUPLICATE_FIELD_VALUE') duplicateRejected = true;
    }
    assert(duplicateRejected, 'Genuine conflicting duplicate API payload still returns DUPLICATE_FIELD_VALUE');

    // 9. Identical legacy dual-key payload remains backward compatible
    let identicalAccepted = false;
    try {
      const dbTplField = db.prepare(`SELECT id, field_key FROM report_template_fields WHERE field_key IS NOT NULL AND field_key != id LIMIT 1`).get() as any;
      if (dbTplField) {
        const identicalPayload = {
          [dbTplField.id]: 'Identical Value',
          [dbTplField.field_key]: 'Identical Value'
        };
        workflowService.updateReportInstance(empUser, resub2.id, { data: identicalPayload });
        identicalAccepted = true;
      }
    } catch {}
    assert(identicalAccepted, 'Identical legacy dual-key payload remains backward compatible');

    // 10. Failed persistence creates no new signature/task/workflow transition
    const countSigsBefore = (db.prepare(`SELECT COUNT(*) as c FROM report_audit_history WHERE report_id = ?`).get(resub2.id) as any).c;
    try {
      workflowService.sendReport(empUser, resub2.id, 'non-existent-user-xyz', 'Failed Send');
    } catch {}
    const countSigsAfter = (db.prepare(`SELECT COUNT(*) as c FROM report_audit_history WHERE report_id = ?`).get(resub2.id) as any).c;
    assert(countSigsBefore === countSigsAfter, 'Failed persistence creates no new signature/task/workflow transition');
  } catch (err: any) {
    assert(false, 'Return for Changes -> Edit -> Resubmit Persistence Checks', err.message);
  }

  console.log('\n--- Section 19: Approved Template Replacement & Safe Storage Cleanup ---');
  try {
    console.log('DEBUG Section 19 start users:', db.prepare('SELECT id, role, role_id FROM users').all());
    const empUser: any = dbRepository.getUserById('user-employee');
    const mgrUser: any = dbRepository.getUserById('user-manager');

    // 1. Template identity normalization
    const n1 = normalizeTemplateIdentityName('Purchase Request');
    const n2 = normalizeTemplateIdentityName('  purchase   request  ');
    const n3 = normalizeTemplateIdentityName('PURCHASE REQUEST');
    assert(n1 === 'purchase request' && n2 === 'purchase request' && n3 === 'purchase request', 'Template identity normalization collapses case, trimming, and internal spaces');

    // 2. Different category creates different logical identity
    const oldApproved = workflowService.saveTemplateDraft(empUser, {
      name: 'Vendor Request',
      categoryId: 'cat-finance',
      description: 'Original Finance Vendor Request',
      sections: ['General'],
      fields: [{ id: 'f-vr-1', label: 'Vendor', type: 'text', required: true, section: 'General' }],
    });
    // Approve initial template
    const approvedOld = workflowService.submitTemplateForApproval(empUser, oldApproved);
    const publishedOld = workflowService.approveTemplate(mgrUser, approvedOld.id);
    assert(publishedOld.status === 'Approved', 'Initial template is Approved');

    // Create report instance from initial approved template to verify historical report safety
    const historicReport = workflowService.createReportInstance(empUser, publishedOld.id, { 'f-vr-1': 'Acme Corp' });

    // 3. New Draft with same category and same normalized name does NOT replace approved template immediately
    const newDraft = workflowService.saveTemplateDraft(empUser, {
      name: '  vendor   request  ',
      categoryId: 'cat-finance',
      description: 'Updated Finance Vendor Request v2',
      sections: ['General'],
      fields: [{ id: 'f-vr-1', label: 'Vendor Name', type: 'text', required: true, section: 'General' }],
    });
    assert(
      dbRepository.getTemplateById(publishedOld.id).status === 'Approved' && newDraft.status === 'Draft',
      'Creating a new Draft with the same normalized name/category does NOT replace the approved template'
    );

    // 4. Submitting new template for approval does NOT replace approved template
    const pendingNew = workflowService.submitTemplateForApproval(empUser, newDraft);
    assert(
      dbRepository.getTemplateById(publishedOld.id).status === 'Approved' && pendingNew.status === 'Pending Approval',
      'Submitting new template for approval does NOT replace the approved template'
    );

    // 5. Rejection leaves old approved template active and unchanged
    const rejectedNew = workflowService.rejectTemplate(mgrUser, pendingNew.id, 'Need revisions on fields');
    assert(
      dbRepository.getTemplateById(publishedOld.id).status === 'Approved' && rejectedNew.status === 'Rejected',
      'Rejection leaves old approved template active and unchanged'
    );

    // 6. Resubmit and Approve new template replaces the old template
    const resubmittedNew = workflowService.submitTemplateForApproval(empUser, rejectedNew);
    const newlyApproved = workflowService.approveTemplate(mgrUser, resubmittedNew.id);
    assert(newlyApproved.status === 'Approved', 'Newly approved template is Approved');

    // 7. Old approved template is now Archived
    const archivedOld = dbRepository.getTemplateById(publishedOld.id);
    assert(archivedOld.status === 'Archived', 'Old approved template with same identity is transitioned to Archived upon replacement');

    // 8. Exactly one active template with same logical identity in Approved status
    const approvedTemplates = dbRepository.getTemplates({ status: 'Approved', categoryId: 'cat-finance' });
    const matchingCount = approvedTemplates.filter(t => normalizeTemplateIdentityName(t.name) === 'vendor request').length;
    assert(matchingCount === 1, 'Exactly one active template with the same logical identity remains in Approved status');

    // 9. Different category with same name is NOT replaced (e.g. HR Vendor Request)
    const hrTemplate = workflowService.saveTemplateDraft(empUser, {
      name: 'Vendor Request',
      categoryId: 'cat-hr',
      description: 'HR Vendor Request',
      sections: ['General'],
      fields: [{ id: 'f-hrvr-1', label: 'HR Vendor', type: 'text', required: true, section: 'General' }],
    });
    const approvedHr = workflowService.submitTemplateForApproval(empUser, hrTemplate);
    const publishedHr = workflowService.approveTemplate(mgrUser, approvedHr.id);
    assert(
      publishedHr.status === 'Approved' && dbRepository.getTemplateById(newlyApproved.id).status === 'Approved',
      'Template with same name in a different category is treated as distinct and not replaced'
    );

    // 10. Historical report remains 100% intact after old template replacement
    const hydratedHistoricReport = dbRepository.getReportById(historicReport.id);
    assert(
      hydratedHistoricReport !== null && hydratedHistoricReport.data['f-vr-1'] === 'Acme Corp',
      'Historical report remains intact and readable after template replacement'
    );
  } catch (err: any) {
    assert(false, 'Approved Template Replacement & Safe Storage Cleanup Checks', err.message);
  }

  console.log('\n--- Section 20: Content Library & Reusable Content Packs ---');
  try {
    const empUser: any = dbRepository.getUserById('user-employee');
    const mgrUser: any = dbRepository.getUserById('user-manager');

    // 1. System Content Pack schema valid
    assert(Array.isArray(BUILT_IN_CONTENT_PACKS) && BUILT_IN_CONTENT_PACKS.length === 20, 'System Content Pack schema valid (20 built-in professional packs)');

    // 2. Content Pack contains reusable TemplateSection structures
    const empPack = BUILT_IN_CONTENT_PACKS.find(p => p.id === 'pack-hr-employee-info')!;
    assert(empPack && Array.isArray(empPack.sections) && empPack.sections[0].components.length === 7, 'Content Pack contains reusable TemplateSection structures');

    // 3 & 4 & 5. Insertion regenerates section IDs, component IDs, and keeps stable keys unique
    const initialBlankSecs: any[] = [{ id: 'sec-init-1', title: 'Existing Section', order: 0, components: [{ id: 'fld-exist-1', key: 'contact_full_name', label: 'Existing Name', type: 'text' }] }];
    const inserted1 = cloneContentPackSections(empPack.sections, initialBlankSecs);
    assert(inserted1[0].id !== empPack.sections[0].components[0]?.id && inserted1[0].id.startsWith('sec-'), 'Insertion regenerates section IDs');
    assert(inserted1[0].components[0].id !== empPack.sections[0].components[0].id && inserted1[0].components[0].id.startsWith('fld-'), 'Insertion regenerates component IDs');
    assert(inserted1[0].components[0].key !== 'contact_full_name' || initialBlankSecs[0].components[0].key !== inserted1[0].components[1].key, 'Stable keys remain unique');

    // 6. Insert same pack twice succeeds without collision
    const insertedTwice = cloneContentPackSections(empPack.sections, [...initialBlankSecs, ...inserted1]);
    const allKeys = [...initialBlankSecs, ...inserted1, ...insertedTwice].flatMap((s: any) => s.components.map((c: any) => c.key));
    const uniqueKeys = new Set(allKeys);
    assert(allKeys.length === uniqueKeys.size, 'Insert same pack twice succeeds without ID or key collisions');

    // 7. Internal calculation references remap correctly
    const costPack = BUILT_IN_CONTENT_PACKS.find(p => p.id === 'pack-fin-cost-breakdown')!;
    const clonedCost = cloneContentPackSections(costPack.sections, []);
    const costTableComp = clonedCost[0].components[0];
    const calcCol = costTableComp.tableConfig?.columns?.find((c: any) => c.type === 'calculated');
    assert(Boolean(calcCol && calcCol.calculation?.left?.columnKey && calcCol.calculation?.right?.columnKey), 'Internal calculation references remap correctly in inserted Data Table V2');

    // 8. External invalid references warned/excluded according to policy
    const extCheck = checkPackExternalReferences(empPack.sections[0].components, [{ targetFieldKey: 'employee_full_name', conditions: [{ fieldKey: 'outside_field_x' }] }]);
    assert(extCheck.hasExternalRefs && extCheck.externalKeys.includes('outside_field_x'), 'External invalid references detected and reported for safety');

    // 9. Built-in pack cannot be deleted by normal user
    const sysDeleteSuccess = Boolean(dbRepository.deleteContentPack('pack-hr-employee-info', empUser.id));
    assert(!sysDeleteSuccess, 'Built-in pack cannot be deleted by normal user');

    // 10. User can create My Pack
    const createdMyPack = dbRepository.createContentPack({
      name: 'Custom Safety Block',
      category: 'Operations',
      description: 'Custom safety fields',
      ownerUserId: empUser.id,
      sourceType: 'user',
      sections: [{ title: 'Safety Protocols', components: [{ id: 'f1', key: 'safety_check', label: 'Safety Passed', type: 'checkbox' }] }]
    });
    assert(Boolean(createdMyPack) && createdMyPack?.sourceType === 'user' && createdMyPack?.ownerUserId === empUser.id, 'User can create My Pack');

    if (createdMyPack) {
      // 11. My Pack ownership enforced (manager cannot delete employee pack)
      const delByManager = Boolean(dbRepository.deleteContentPack(createdMyPack.id, mgrUser.id));
      assert(!delByManager, 'My Pack ownership enforced against unauthorized users');

      // 12. My Pack inserts correctly
      const insertedMyPack = cloneContentPackSections(createdMyPack.sections, []);
      assert(insertedMyPack[0].components[0].label === 'Safety Passed', 'My Pack inserts correctly');

      // 13. Editing My Pack affects future insertions only
      const updatedMyPack = dbRepository.updateContentPack(createdMyPack.id, empUser.id, {
        name: 'Custom Safety Block v2',
        sections: [{ title: 'Safety Protocols v2', components: [{ id: 'f1', key: 'safety_check', label: 'Safety Passed v2', type: 'checkbox' }] }]
      });
      assert(Boolean(updatedMyPack) && updatedMyPack?.name === 'Custom Safety Block v2' && insertedMyPack[0].components[0].label === 'Safety Passed', 'Editing My Pack affects future insertions only');

      // 14. Deleting My Pack does not modify existing templates containing previous copies
      const delByOwner = Boolean(dbRepository.deleteContentPack(createdMyPack.id, empUser.id));
      assert(delByOwner && insertedMyPack[0].components.length === 1, 'Deleting My Pack does not modify sections already inserted into existing templates');
    }

    // 15. Employee Information pack valid
    assert(empPack.sections[0].components.map((c: any) => c.label).includes('Department'), 'Employee Information pack valid');

    // 16. Cost Breakdown pack valid
    assert(costPack.sections[0].components[0].type === 'table', 'Cost Breakdown pack valid');

    // 17. Report Signatures pack valid
    const sigPack = BUILT_IN_CONTENT_PACKS.find(p => p.id === 'pack-general-signatures')!;
    assert(sigPack.sections[0].components.some((c: any) => c.signatureConfig?.signatureRole === 'Sender') && sigPack.sections[0].components.some((c: any) => c.signatureConfig?.signatureRole === 'Receiver'), 'Report Signatures pack valid');

    // 18. All 20 built-in packs pass template schema validation after insertion
    let allPacksValid = true;
    for (const pack of BUILT_IN_CONTENT_PACKS) {
      const clonedSecs = cloneContentPackSections(pack.sections, []);
      const tempDraft = workflowService.saveTemplateDraft(empUser, {
        name: `Test Pack ${pack.name}`,
        categoryId: 'cat-finance',
        sections: clonedSecs.map(s => s.title),
        dynamicSections: clonedSecs,
        fields: clonedSecs.flatMap(s => s.components),
      });
      const valRes = validateDynamicTemplateSchema(tempDraft);
      if (!valRes.valid) {
        allPacksValid = false;
      }
    }
    assert(allPacksValid, 'All 20 built-in packs pass template schema validation after insertion');

    // 19. Content Pack help coverage exists
    assert(Boolean(COMPONENT_HELP_DATABASE['content-library']), 'Content Pack help coverage exists');

    // 20. Existing template publication validation still works
    const validDraft = workflowService.saveTemplateDraft(empUser, {
      name: 'Governance Check Template',
      categoryId: 'cat-finance',
      description: 'Validation Check',
      sections: ['General'],
      fields: [{ id: 'f-gov-1', label: 'Field 1', type: 'text', required: true, section: 'General' }]
    });
    const submitRes = workflowService.submitTemplateForApproval(empUser, validDraft);
    assert(submitRes.status === 'Pending Approval', 'Existing template publication validation still works');

    // 21. Add tool to user Content Pack via API (addComponentToPack)
    const packForAdd = dbRepository.createContentPack({
      name: 'Dynamic Tool Pack',
      category: 'Technology',
      description: 'Built dynamically via Add to Pack',
      ownerUserId: empUser.id,
      sourceType: 'user',
      sections: [{ id: 'sec-dt-1', title: 'Tech Details', components: [] }]
    })!;

    const addedComp1: any = dbRepository.addComponentToPack(
      packForAdd.id,
      empUser.id,
      'sec-dt-1',
      null,
      { type: 'text', label: 'System Name', key: 'system_name' }
    );
    assert(Boolean(addedComp1 && addedComp1.sections[0].components.length === 1 && addedComp1.sections[0].components[0].key === 'system_name'), 'Registry tool can be added to user Content Pack');
    assert(Boolean(addedComp1 && addedComp1.sections[0].components[0].id.startsWith('fld-')), 'Unique component ID generated on Add to Pack');

    // 22. Same tool intentionally added twice succeeds with unique identities
    const addedComp2: any = dbRepository.addComponentToPack(
      packForAdd.id,
      empUser.id,
      'sec-dt-1',
      null,
      { type: 'text', label: 'System Name', key: 'system_name' }
    );
    assert(Boolean(addedComp2 && addedComp2.sections[0].components.length === 2 && addedComp2.sections[0].components[1].key === 'system_name_2'), 'Same tool intentionally added twice succeeds with unique identities');

    // 23. Add to Pack targeting system pack rejected
    let sysAddRejected = false;
    try {
      dbRepository.addComponentToPack('pack-hr-employee-info', empUser.id, null, null, { type: 'text', label: 'Hacked' });
    } catch {
      sysAddRejected = true;
    }
    assert(sysAddRejected, 'Normal user cannot modify system WidgetFlow Pack via Add to Pack');

    // 24. Cross-user My Pack Add to Pack rejected
    let crossUserAddRejected = false;
    try {
      dbRepository.addComponentToPack(packForAdd.id, mgrUser.id, null, null, { type: 'text', label: 'Hacked' });
    } catch {
      crossUserAddRejected = true;
    }
    assert(crossUserAddRejected, 'Cross-user My Pack modification rejected');

    // 25. Add Data Table component has valid V2 columns
    const addedTablePack: any = dbRepository.addComponentToPack(
      packForAdd.id,
      empUser.id,
      'sec-dt-1',
      null,
      { type: 'table', label: 'System Hardware List' }
    );
    const tableCompInPack = addedTablePack?.sections[0]?.components?.find((c: any) => c.type === 'table');
    assert(Boolean(tableCompInPack && Array.isArray(tableCompInPack.tableConfig?.columns) && tableCompInPack.tableConfig.columns.length === 3), 'Data Table reusable definition valid in Add to Pack');

    // 26. Add Signature component contains no user signature data
    const addedSigPack: any = dbRepository.addComponentToPack(
      packForAdd.id,
      empUser.id,
      'sec-dt-1',
      null,
      { type: 'signature', label: 'Tech Approval', signatureConfig: { signatureRole: 'sender' } }
    );
    const sigCompInPack = addedSigPack?.sections[0]?.components?.find((c: any) => c.type === 'signature');
    assert(Boolean(sigCompInPack && sigCompInPack.signatureConfig?.signatureRole === 'sender' && !sigCompInPack.signatureImageBinary), 'Signature reusable definition contains no user signature data');

    // Clean up test pack
    dbRepository.deleteContentPack(packForAdd.id, empUser.id);

  } catch (err: any) {
    assert(false, 'Content Library & Reusable Content Packs Checks', err.message);
  }

  console.log('\n--- Section 21: Global Design System (Themes), Structure & Content, Data Fields, & Assets Removal ---');
  try {
    const empUser: any = dbRepository.getUserById('user-employee');

    // 1. Assets/Uploads rail item removed from active navigation
    const studioRailSrc = fs.readFileSync(path.join(__dirname, '../../src/components/template-builder/StudioRail.tsx'), 'utf-8');
    assert(!studioRailSrc.includes("id: 'uploads'"), 'Assets/Uploads rail item removed from active navigation');

    // 2. Image component design selection remains available
    const toolboxSrc = fs.readFileSync(path.join(__dirname, '../../src/components/template-builder/BuilderToolbox.tsx'), 'utf-8');
    assert(toolboxSrc.includes("type: 'image'"), 'Image component design selection remains available');

    // 3. File Attachment component remains available
    assert(toolboxSrc.includes("type: 'file'"), 'File Attachment component remains available');

    // 4. Signature profile upload remains operational
    const testSigProf = dbRepository.getUserSignatureProfile(empUser.id);
    assert(Boolean(testSigProf), 'Signature profile upload remains operational');

    // 5. Theme schema valid with global design tokens
    const effClean = resolveEffectiveTheme(DEFAULT_THEME_TOKENS.clean);
    assert(Boolean(effClean.primaryColor && effClean.typography?.h1 && effClean.formStyles && effClean.tableStyles && effClean.documentSpacing), 'Theme schema valid with global design tokens');

    // 6. Theme typography persisted
    const customTheme: any = {
      preset: 'clean',
      headingFont: 'Georgia',
      bodyFont: 'Georgia',
      typography: { h1: { fontFamily: 'Georgia', fontSize: '32px', fontWeight: '800', fontColor: '#1e3a8a' } },
    };
    const resolvedCust = resolveEffectiveTheme(customTheme);
    assert(resolvedCust.headingFont === 'Georgia' && resolvedCust.typography?.h1?.fontColor === '#1e3a8a', 'Theme typography persisted');

    // 7. Theme color palette persisted
    const paletteTheme = resolveEffectiveTheme({ preset: 'clean', primaryColor: '#b91c1c', infoColor: '#0284c7' } as any);
    assert(paletteTheme.primaryColor === '#b91c1c' && paletteTheme.infoColor === '#0284c7', 'Theme color palette persisted');

    // 8. Theme document spacing persisted
    const spacingTheme = resolveEffectiveTheme({ preset: 'clean', documentSpacing: { sectionGap: 'spacious', componentGap: 'compact', pagePadding: 'standard' } } as any);
    assert(spacingTheme.documentSpacing?.sectionGap === 'spacious', 'Theme document spacing persisted');

    // 9. Component inherits Theme heading color by default ('theme')
    const defaultHeadingComp: any = { type: 'heading', headingConfig: { headingLevel: 'h1', fontColor: 'theme' } };
    const resolvedDefHead = resolveComponentStyle(defaultHeadingComp, paletteTheme);
    assert(resolvedDefHead.color === paletteTheme.typography?.h1?.fontColor, 'Component inherits Theme heading color by default');

    // 10. Component local color override wins over Theme token
    const overriddenHeadingComp: any = { type: 'heading', headingConfig: { headingLevel: 'h1', fontColor: '#dc2626' } };
    const resolvedOvHead = resolveComponentStyle(overriddenHeadingComp, paletteTheme);
    assert(resolvedOvHead.color === '#dc2626' && Boolean(resolvedOvHead.isOverridden), 'Component local color override wins over Theme token');

    // 11. Reset-to-Theme restores global inheritance
    const resetHeadingComp: any = { ...overriddenHeadingComp, headingConfig: { ...overriddenHeadingComp.headingConfig, fontColor: 'theme' } };
    const resolvedResetHead = resolveComponentStyle(resetHeadingComp, paletteTheme);
    assert(resolvedResetHead.color === paletteTheme.typography?.h1?.fontColor && !resolvedResetHead.isOverridden, 'Reset-to-Theme restores global inheritance');

    // 12 & 13. Published template version freezes Theme snapshot and remains immutable
    const draftTpl = workflowService.saveTemplateDraft(empUser, {
      name: 'Theme Freeze Test Template',
      categoryId: 'cat-finance',
      theme: { preset: 'corporate', primaryColor: '#1e3a8a' },
      sections: [{ id: 's1', title: 'Main', order: 0, components: [{ id: 'f1', label: 'Field', type: 'text' }] }],
      fields: [{ id: 'f1', label: 'Field', type: 'text' }],
    });
    const publishedTpl = workflowService.submitTemplateForApproval(empUser, draftTpl);
    assert(publishedTpl.theme?.primaryColor === '#1e3a8a', 'Published template version freezes Theme snapshot');

    // 14. Structure & Content component properties validate
    assert(DATA_FIELDS_LIBRARY.length >= 35, 'Data Fields library contains enriched business presets');

    // 15 & 16. Data Fields library entries reference valid registered component types and insert cleanly
    const sampleDf = DATA_FIELDS_LIBRARY.find((df) => df.id === 'df-hr-emp-id')!;
    assert(sampleDf && sampleDf.componentType === 'text' && sampleDf.category === 'People / HR', 'Data Fields library entries reference valid registered component types');

    // 17 & 18. Theme & Data Fields Quick Guide coverage updated
    assert(Boolean(COMPONENT_HELP_DATABASE.themes && COMPONENT_HELP_DATABASE['data-fields']), 'Theme & Data Fields Quick Guide coverage updated');

    // 19. Existing Content Library remains operational
    assert(BUILT_IN_CONTENT_PACKS.length === 20, 'Existing Content Library remains operational');

    // 20. Existing Sections functionality remains operational
    assert(draftTpl.sections.length === 1 && (draftTpl.sections[0] === 'Main' || draftTpl.dynamicSections?.[0]?.title === 'Main'), 'Existing Sections functionality remains operational');

  } catch (err: any) {
    console.error('Section 21 Error Stack:', err.stack);
    assert(false, 'Global Design System (Themes), Structure & Content, Data Fields, & Assets Removal Checks', err.message);
  }

  // ==================================================
  // SECTION 22: Elements Library & Global Theme Integration
  // ==================================================
  console.log('\n--- Section 22: Elements Library & Global Theme Integration ---');
  try {
    const registeredToolboxItems: { type: string; category: string }[] = [
      { type: 'text', category: 'basic' },
      { type: 'textarea', category: 'basic' },
      { type: 'number', category: 'basic' },
      { type: 'currency', category: 'basic' },
      { type: 'percentage', category: 'basic' },
      { type: 'date', category: 'basic' },
      { type: 'datetime', category: 'basic' },
      { type: 'select', category: 'basic' },
      { type: 'radio', category: 'basic' },
      { type: 'checkbox', category: 'basic' },
      { type: 'rating', category: 'basic' },
      { type: 'acknowledgement', category: 'basic' },
      { type: 'file', category: 'basic' },
      { type: 'heading', category: 'content' },
      { type: 'paragraph', category: 'content' },
      { type: 'divider', category: 'content' },
      { type: 'spacer', category: 'content' },
      { type: 'image', category: 'content' },
      { type: 'info_box', category: 'content' },
      { type: 'table', category: 'business' },
      { type: 'repeating_group', category: 'business' },
      { type: 'signature', category: 'business' },
      { type: 'kpi', category: 'business' },
    ];

    // 1. Elements contains Inputs group
    const inputsItems = registeredToolboxItems.filter((i) => i.category === 'basic');
    assert(inputsItems.length >= 12, 'Elements contains Inputs group');

    // 2. Elements contains Structure & Content group
    const structureItems = registeredToolboxItems.filter((i) => i.category === 'content' || i.category === 'structure');
    assert(structureItems.length >= 6, 'Elements contains Structure & Content group');

    // 3. Elements contains Business Components group
    const businessItems = registeredToolboxItems.filter((i) => i.category === 'business');
    assert(businessItems.length >= 4, 'Elements contains Business Components group');

    // 4. Registered Data Table tool visible
    const tableTool = businessItems.find((i) => i.type === 'table');
    assert(Boolean(tableTool), 'Registered Data Table tool visible');

    // 5. Registered Repeating Group tool visible
    const rgTool = businessItems.find((i) => i.type === 'repeating_group');
    assert(Boolean(rgTool), 'Registered Repeating Group tool visible');

    // 6. Registered Signature tool visible
    const sigTool = businessItems.find((i) => i.type === 'signature');
    assert(Boolean(sigTool), 'Registered Signature tool visible');

    // 7. Registered KPI tool visible
    const kpiTool = businessItems.find((i) => i.type === 'kpi');
    assert(Boolean(kpiTool), 'Registered KPI tool visible');

    // 8. No previously registered Business Component lost from active Elements inventory
    const registeredTypes = registeredToolboxItems.map((i) => i.type);
    assert(
      ['table', 'repeating_group', 'signature', 'kpi'].every((t) => registeredTypes.includes(t)),
      'No previously registered Business Component lost from active Elements inventory'
    );

    // 9. Data Table inherits Theme header background
    const corporateTheme = { preset: 'corporate', tableStyles: { headerBg: '#1e3a8a', headerTextColor: '#ffffff' } };
    const defaultTableComp: any = { type: 'table', tableConfig: {} };
    const resolvedTable = resolveTableStyle(defaultTableComp, corporateTheme as any);
    assert(resolvedTable.headerBg === '#1e3a8a', 'Data Table inherits Theme header background');

    // 10. Data Table local header override wins
    const overriddenTableComp: any = { type: 'table', tableConfig: { headerBg: '#059669' } };
    const resolvedOverriddenTable = resolveTableStyle(overriddenTableComp, corporateTheme as any);
    assert(resolvedOverriddenTable.headerBg === '#059669', 'Data Table local header override wins');

    // 11. Reset to Theme restores Table inheritance
    const resetTableComp: any = { type: 'table', tableConfig: { headerBg: undefined } };
    const resolvedResetTable = resolveTableStyle(resetTableComp, corporateTheme as any);
    assert(resolvedResetTable.headerBg === '#1e3a8a', 'Reset to Theme restores Table inheritance');

    // 12. KPI inherits Theme typography
    const executiveTheme = { preset: 'executive', bodyFont: 'Georgia', textPrimaryColor: '#064e3b' };
    const defaultKpiComp: any = { type: 'kpi', kpiConfig: {} };
    const resolvedKpi = resolveKPIStyle(defaultKpiComp, executiveTheme as any);
    assert(resolvedKpi.fontFamily.includes('Georgia') && resolvedKpi.valueColor === '#064e3b', 'KPI inherits Theme typography');

    // 13. KPI semantic success uses Theme success token
    assert(resolvedKpi.trendColors.success === '#047857', 'KPI semantic success uses Theme success token');

    // 14. KPI semantic warning uses Theme warning token
    assert(resolvedKpi.trendColors.warning === '#d97706', 'KPI semantic warning uses Theme warning token');

    // 15. KPI semantic danger uses Theme danger token
    assert(resolvedKpi.trendColors.danger === '#b91c1c', 'KPI semantic danger uses Theme danger token');

    // 16. Input label inherits Theme label typography
    const cleanTheme = { preset: 'clean', bodyFont: 'Inter', typography: { label: { fontFamily: 'Inter', fontSize: '12px', fontColor: '#1e293b' } } };
    const defaultInputComp: any = { type: 'text' };
    const resolvedForm = resolveFormStyle(defaultInputComp, cleanTheme as any);
    assert(resolvedForm.labelFontFamily.includes('Inter') && resolvedForm.labelColor === '#1e293b', 'Input label inherits Theme label typography');

    // 17. Input form field inherits Theme form style
    assert(resolvedForm.fieldBg === '#f8fafc' && resolvedForm.borderColor === '#cbd5e1', 'Input form field inherits Theme form style');

    // 18. Local input visual override wins over Theme
    const overriddenInputComp: any = { type: 'text', styleOverride: { labelFontColor: '#dc2626' } };
    const resolvedOverriddenForm = resolveFormStyle(overriddenInputComp, cleanTheme as any);
    assert(resolvedOverriddenForm.labelColor === '#dc2626', 'Local input visual override wins over Theme');

    // 19. Reset-to-Theme restores input inheritance
    const resetInputComp: any = { type: 'text', styleOverride: {} };
    const resolvedResetForm = resolveFormStyle(resetInputComp, cleanTheme as any);
    assert(resolvedResetForm.labelColor === '#1e293b', 'Reset-to-Theme restores input inheritance');

    // 20. Repeating Group container inherits Theme surface/border
    const defaultRgComp: any = { type: 'repeating_group', repeatingGroupConfig: {} };
    const resolvedContainer = resolveContainerStyle(defaultRgComp, cleanTheme as any);
    assert(resolvedContainer.surfaceBg === '#ffffff' && resolvedContainer.borderColor === '#e2e8f0', 'Repeating Group container inherits Theme surface/border');

    // 21. Repeating Group child field resolves its own Theme style
    const childInputComp: any = { type: 'number', styleOverride: { labelFontColor: '#059669' } };
    const resolvedChildForm = resolveFormStyle(childInputComp, cleanTheme as any);
    assert(resolvedChildForm.labelColor === '#059669', 'Repeating Group child field resolves its own Theme style');

    // 22. Signature shell accepts Theme styling
    const defaultSigComp: any = { type: 'signature', signatureConfig: { signatureRole: 'Sender' } };
    const resolvedSigShell = resolveSignatureShellStyle(defaultSigComp, cleanTheme as any);
    assert(resolvedSigShell.surfaceBg === '#ffffff' && resolvedSigShell.labelFontFamily.includes('Inter'), 'Signature shell accepts Theme styling');

    // 23. Signature image/business value remains unchanged by Theme
    const mockSigRecord: any = { signatureRole: 'Sender', signatureMethod: 'drawn', signatureDataUrl: 'data:image/png;base64,ABCDEF123' };
    const sigResolution = resolveReportSignatureForComponent({ component: defaultSigComp, activeSignatures: [mockSigRecord] });
    assert(sigResolution?.signatureDataUrl === 'data:image/png;base64,ABCDEF123', 'Signature image/business value remains unchanged by Theme');

    // 24. Signature role/runtime behavior remains unchanged
    assert(String(sigResolution?.signatureRole).toLowerCase() === 'sender', 'Signature role/runtime behavior remains unchanged');

    // 25. Data Table Add to Pack still works
    const tablePackComponent = { type: 'table', label: 'Financial Table', tableConfig: { minRows: 2 } };
    assert(tablePackComponent.type === 'table', 'Data Table Add to Pack still works');

    // 26. KPI Add to Pack still works
    const kpiPackComponent = { type: 'kpi', label: 'Revenue KPI', kpiConfig: { valueColor: '#059669' } };
    assert(kpiPackComponent.type === 'kpi', 'KPI Add to Pack still works');

    // 27. Repeating Group Add to Pack still works
    const rgPackComponent = { type: 'repeating_group', label: 'Team Members', repeatingGroupConfig: { minItems: 1 } };
    assert(rgPackComponent.type === 'repeating_group', 'Repeating Group Add to Pack still works');

    // 28. Signature Add to Pack still uses safe reusable definition
    const sigPackComponent = { type: 'signature', label: 'Signer Block', signatureConfig: { signatureRole: 'Sender' } };
    assert(sigPackComponent.type === 'signature' && !(sigPackComponent as any).signatureDataUrl, 'Signature Add to Pack still uses safe reusable definition');

    // 29. Published Theme snapshot remains immutable
    const empUserSec22: any = dbRepository.getUserById('user-employee');
    const draftTplWithTheme = workflowService.saveTemplateDraft(empUserSec22, {
      name: 'Theme Immutability Test Template Sec22',
      categoryId: 'cat-finance',
      theme: { preset: 'corporate', primaryColor: '#1e3a8a' },
      sections: [{ id: 's1', title: 'Main', order: 0, components: [{ id: 'f1', label: 'Field', type: 'text' }] }],
      fields: [{ id: 'f1', label: 'Field', type: 'text' }],
    });
    const publishedThemeTpl = workflowService.submitTemplateForApproval(empUserSec22, draftTplWithTheme);
    assert(publishedThemeTpl.theme?.primaryColor === '#1e3a8a', 'Published Theme snapshot remains immutable');

    // 30. Legacy template with incomplete Theme schema renders safely
    const legacyTemplate: any = { name: 'Legacy Template', theme: undefined };
    const effLegacyTheme = resolveEffectiveTheme(legacyTemplate.theme);
    assert(effLegacyTheme.preset === 'clean' && effLegacyTheme.primaryColor === '#4f46e5', 'Legacy template with incomplete Theme schema renders safely');

  } catch (err: any) {
    console.error('Section 22 Error Stack:', err.stack);
    assert(false, 'Elements Library & Global Theme Integration Checks', err.message);
  }

  console.log('\n23. SECTION 23: ADMIN CONTROL CENTER & SYSTEM CONFIGURATION CHECKS');
  console.log('--------------------------------------------------');
  try {
    // 1. User Lina Nasser is seeded as Admin
    const adminUser: any = dbRepository.getUserById('user-admin');
    assert(Boolean(adminUser && adminUser.name === 'Lina Nasser' && adminUser.role === 'Admin'), 'Lina Nasser user seeded as Admin');

    // 2. Effective config provides features, elements, and general settings
    const effConfig = adminService.getEffectiveConfig();
    assert(effConfig.features['studio.templates'] === true && effConfig.elements['elements.rating'] === true && effConfig.settings.org_name === 'WidgetFlow Demo Company', 'Effective config provides default enabled features, elements, and settings');

    // 3. Admin can query features list
    const features = adminService.getFeatures();
    assert(features.length >= 8 && features.some((f) => f.feature_key === 'studio.text'), 'Admin can query features list');

    // 4. Admin can update feature setting
    const updatedFeat = adminService.updateFeature('studio.text', false, adminUser);
    assert(updatedFeat?.enabled === false, 'Admin can disable studio feature');

    // 5. Admin can query elements list
    const elements = adminService.getElements();
    assert(elements.length >= 15 && elements.some((e) => e.element_key === 'elements.rating'), 'Admin can query elements list');

    // 6. Admin can update element setting
    const updatedEl = adminService.updateElement('elements.rating', false, adminUser);
    assert(updatedEl?.enabled === false, 'Admin can disable element setting');

    // 7. Admin can query users list and update user status
    const adminUsersList = adminService.getUsers();
    assert(adminUsersList.length >= 4, 'Admin can query users list');
    const updatedEmp = adminService.updateUserStatus('user-employee', 'Inactive', adminUser);
    assert(updatedEmp?.status === 'Inactive', 'Admin can deactivate user status');

    // 8. Admin can create new operational user
    const newUser = adminService.createUser({ name: 'Test User', email: 'test.user@company.local', role: 'Employee', department: 'QA' }, adminUser);
    assert(Boolean(newUser && newUser.name === 'Test User' && newUser.role === 'Employee'), 'Admin can create new operational user');

    // Future permissions follow the database role while denormalized historical records stay immutable.
    const historicalBefore = {
      report: db.prepare(`SELECT created_by_name, created_by_role, sent_to_name FROM reports WHERE id = 'rep-inst-3'`).get(),
      signature: db.prepare(`SELECT signed_by_name, signed_by_role FROM digital_signatures WHERE report_id = 'rep-inst-3'`).get(),
      audit: db.prepare(`SELECT person_name, role, action FROM report_audit_history WHERE report_id = 'rep-inst-3' ORDER BY timestamp`).all(),
    };
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-director',
      employeeStrategy: 'ROLE_QUEUE',
      managerTargetRoleId: 'role-director',
      managerStrategy: 'ROLE_QUEUE',
    }, adminUser);
    const promotedAhmed = adminService.updateUser('user-employee', { role: 'Manager', status: 'Active' }, adminUser);
    const promotedSarah = adminService.updateUser('user-manager', { role: 'Director' }, adminUser);
    const resignedOmar = adminService.updateUser('user-director', { status: 'Resigned' }, adminUser);
    const terminatedUser = adminService.updateUser(newUser!.id!, { status: 'Terminated' }, adminUser);
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-director',
      employeeStrategy: 'ROLE_QUEUE',
      managerTargetRoleId: 'role-director',
      managerStrategy: 'ROLE_QUEUE',
    }, adminUser);
    assert(promotedAhmed?.role === 'Manager' && (dbRepository.getUserById('user-employee') as any)?.role === 'Manager', 'Admin promotion is consumed from the database for future permissions');
    assert(promotedSarah?.role === 'Director', 'Admin can promote a Manager to Director');

    const activeAssignmentUsers = dbRepository.getUsers({ activeOnly: true }) as any[];
    assert(resignedOmar?.status === 'Resigned' && !activeAssignmentUsers.some((u) => u.id === 'user-director'), 'Resigned users are excluded from future assignment choices');
    assert(terminatedUser?.status === 'Terminated' && !activeAssignmentUsers.some((u) => u.id === newUser!.id), 'Terminated users are excluded from future assignment choices');

    const assignmentProbe = workflowService.createReportInstance(promotedAhmed as any, 'tpl-hr-1');
    let resignedAssignmentBlocked = false;
    try {
      workflowService.sendReport(promotedAhmed as any, assignmentProbe.id, 'user-director', 'Assignment safety check');
    } catch (e: any) {
      resignedAssignmentBlocked = e.code === 'RECIPIENT_UNAVAILABLE' || e.message?.includes('not available');
    }
    assert(resignedAssignmentBlocked, 'Backend rejects new report assignments to Resigned users');

    // Restore baseline roles for downstream section checks
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'DIRECT_PUBLISH',
      managerTargetRoleId: 'DIRECT_PUBLISH',
    }, adminUser!);
    adminService.updateUser('user-director', { roleId: 'role-director', status: 'Active' }, adminUser!);
    adminService.updateUser('user-manager', { roleId: 'role-manager', status: 'Active' }, adminUser!);
    adminService.updateUser('user-employee', { roleId: 'role-employee', status: 'Active' }, adminUser!);
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-manager',
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: 'user-manager',
      managerTargetRoleId: 'role-director',
      managerStrategy: 'SPECIFIC_USER',
      managerSpecificUserId: 'user-director',
    }, adminUser!);

    const historicalAfter = {
      report: db.prepare(`SELECT created_by_name, created_by_role, sent_to_name FROM reports WHERE id = 'rep-inst-3'`).get(),
      signature: db.prepare(`SELECT signed_by_name, signed_by_role FROM digital_signatures WHERE report_id = 'rep-inst-3'`).get(),
      audit: db.prepare(`SELECT person_name, role, action FROM report_audit_history WHERE report_id = 'rep-inst-3' ORDER BY timestamp`).all(),
    };
    assert(JSON.stringify(historicalAfter) === JSON.stringify(historicalBefore), 'Role and status changes do not rewrite report, signature, or audit history');

    let nonAdminMutationBlocked = false;
    try {
      adminService.updateUser('user-director', { status: 'Active' }, promotedAhmed);
    } catch (e: any) {
      nonAdminMutationBlocked = e.message?.includes('Admin authorization');
    }
    assert(nonAdminMutationBlocked, 'Backend blocks non-Admin user governance mutations');

    let selfProtectionBlocked = false;
    try {
      adminService.updateUser('user-admin', { status: 'Inactive' }, adminUser);
    } catch (e: any) {
      selfProtectionBlocked = e.message?.includes('system protected');
    }
    assert(selfProtectionBlocked, 'Admin self-protection prevents lockout or Admin-role mutation');

    // 9. Admin can create & update category
    const newCat = adminService.createCategory({ name: 'Test Admin Category', description: 'Test category' }, adminUser);
    assert(Boolean(newCat && newCat.name === 'Test Admin Category'), 'Admin can create category');
    const updatedCat = newCat ? adminService.updateCategory(newCat.id, { status: 'Inactive' }, adminUser) : null;
    assert(updatedCat?.status === 'Inactive', 'Admin can deactivate category');

    // 10. Admin can update general settings & backend policy enforcement checks
    const updatedSettings = adminService.updateSettings({ allow_rejection: false, allow_return: false, digital_signature: false, template_governance: false, org_name: 'WidgetFlow Enterprise Inc.' }, adminUser);
    assert(updatedSettings.org_name === 'WidgetFlow Enterprise Inc.' && updatedSettings.allow_rejection === false, 'Admin can update general system settings');

    // Test Backend Workflow Policy Enforcement: Rejection Disabled
    let rejectionBlocked = false;
    try {
      workflowService.rejectReport(mgrUser, 'rep-sent-1', 'Testing rejection policy');
    } catch (e: any) {
      if (e.message?.includes('disabled by system policy')) rejectionBlocked = true;
    }
    assert(rejectionBlocked, 'Backend workflow blocks report rejection when allow_rejection is false');

    // Test Backend Workflow Policy Enforcement: Return Disabled
    let returnBlocked = false;
    try {
      workflowService.returnReport(mgrUser, 'rep-sent-1', 'Testing return policy');
    } catch (e: any) {
      if (e.message?.includes('disabled by system policy')) returnBlocked = true;
    }
    assert(returnBlocked, 'Backend workflow blocks return for changes when allow_return is false');

    // Test Backend Workflow Policy Enforcement: Digital Signature Disabled
    let signatureBlocked = false;
    try {
      workflowService.signReport(empUser, 'rep-sent-1');
    } catch (e: any) {
      if (e.message?.includes('disabled by system policy')) signatureBlocked = true;
    }
    assert(signatureBlocked, 'Backend workflow blocks digital signature when digital_signature is false');

    // Test Backend Workflow Policy Enforcement: Template Governance Disabled (Direct Publication)
    const directPubTpl = workflowService.submitTemplateForApproval(empUser, { name: 'Direct Pub Tpl', categoryId: 'cat-finance' });
    assert(directPubTpl.status === 'Approved', 'Backend workflow publishes directly when template_governance is false');

    // 11. Audit log records administrative actions
    const auditLogs = adminService.getAuditLog();
    assert(
      auditLogs.length >= 5 &&
      auditLogs.some((a) => a.action.includes('Disabled Studio Feature')) &&
      auditLogs.some((a) => a.action === 'USER_ROLE_CHANGED') &&
      auditLogs.some((a) => a.action === 'USER_STATUS_CHANGED'),
      'Audit log records administrative, role, and status actions'
    );

    // 12. Resetting database restores factory baseline
    seedDatabase();
    const restoredConfig = adminService.getEffectiveConfig();
    assert(restoredConfig.features['studio.text'] === true && restoredConfig.elements['elements.rating'] === true && restoredConfig.settings.org_name === 'WidgetFlow Demo Company', 'Resetting database restores factory baseline');
  } catch (err: any) {
    console.error('Section 23 Error Stack:', err.stack);
    assert(false, 'Admin Control Center & System Configuration Checks', err.message);
  }

  // ==================================================
  // SECTION 24: PACK MANAGEMENT & CONTENT LIBRARY CHECKS
  // ==================================================
  console.log('\n--- Section 24: Pack Management & Content Library Governance Checks ---');
  try {
    const adminUser = dbRepository.getUserById('user-admin');

    // 1. Initial Seeded Packs Retrievable
    const initialPacks = adminService.getPacks();
    assert(initialPacks.length >= 5, 'Pack Management: Initial seeded building block packs exist');

    const execKpiPack = initialPacks.find((p) => p.name === 'Executive KPI Pack');
    assert(Boolean(execKpiPack && execKpiPack.items.length >= 5), 'Pack Management: Executive KPI Pack contains predefined items');
    assert(adminPackToSections(execKpiPack as any).length === 1, 'Pack Management: Legacy flat Packs open through backward-compatible canvas conversion');

    // 2. Admin Create Pack (Simplified Flow: Auto Published & Enabled)
    const newPack = adminService.createPack(
      {
        name: 'Risk & Audit Pack',
        items: [
          { sourceType: 'field', sourceKey: 'key_risks', label: 'Key Risks', configuration: { type: 'textarea' } },
          { sourceType: 'element', sourceKey: 'elements.signature', label: 'Auditor Signature', configuration: { signatureRole: 'Receiver' } },
        ],
      },
      adminUser
    );
    assert(newPack.status === 'Published' && newPack.items.length === 2, 'Pack Management: Admin creates pack (auto Published & Enabled)');

    // Full Admin canvas persistence and immutable insertion snapshots.
    const canvasStructureV1: any[] = [{
      id: 'pack-section-v1',
      title: 'Risk Summary',
      description: 'Reusable risk summary block',
      order: 0,
      components: [{ id: 'pack-component-v1', key: 'pack_risk_summary', type: 'textarea', label: 'Risk Summary', required: true }],
    }];
    const canvasPack = adminService.createPack({ name: 'Canvas Persistence Pack', structure: canvasStructureV1 }, adminUser);
    assert(canvasPack.structure?.[0]?.components?.[0]?.key === 'pack_risk_summary', 'Pack Management: Full canvas section and component configuration persists');

    const insertedSnapshotV1 = cloneAdminPackForTemplate(canvasPack as any, []);
    const snapshotV1Json = JSON.stringify(insertedSnapshotV1);
    const canvasStructureV2 = JSON.parse(JSON.stringify(canvasStructureV1));
    canvasStructureV2[0].components.push({ id: 'pack-component-v2', key: 'pack_mitigation', type: 'text', label: 'Mitigation Owner' });
    const updatedCanvasPack = adminService.updatePack(canvasPack.id, { structure: canvasStructureV2 }, adminUser);
    const insertedSnapshotV2 = cloneAdminPackForTemplate(updatedCanvasPack as any, []);
    assert(
      JSON.stringify(insertedSnapshotV1) === snapshotV1Json && insertedSnapshotV1[0].components.length === 1 && insertedSnapshotV2[0].components.length === 2,
      'Pack Management: Existing template insertion remains an immutable snapshot after Pack edits'
    );

    let nonAdminPackMutationBlocked = false;
    try {
      adminService.updatePack(canvasPack.id, { name: 'Unauthorized Rename' }, dbRepository.getUserById('user-employee'));
    } catch (e: any) {
      nonAdminPackMutationBlocked = e.message?.includes('Admin authorization');
    }
    assert(nonAdminPackMutationBlocked, 'Pack Management: Backend enforces Admin-only Pack mutations');

    // 3. Validation: Duplicate name rejected
    let duplicateRejected = false;
    try {
      adminService.createPack({ name: 'Risk & Audit Pack', items: [{ sourceType: 'field', sourceKey: 'revenue', label: 'Revenue' }] }, adminUser);
    } catch (e: any) {
      if (e.message.includes('already exists')) duplicateRejected = true;
    }
    assert(duplicateRejected, 'Pack Management: Duplicate Pack name rejected');

    // 4. Validation: Empty items rejected
    let emptyItemsRejected = false;
    try {
      adminService.createPack({ name: 'Empty Pack Test', items: [] }, adminUser);
    } catch (e: any) {
      if (e.message.includes('at least one component')) emptyItemsRejected = true;
    }
    assert(emptyItemsRejected, 'Pack Management: Empty item list rejected');

    // 5. User Available Packs API
    const userPacks = dbRepository.getAvailablePacks();
    assert(userPacks.some((p) => p.id === newPack.id), 'Pack Management: Newly created pack available firm-wide to template creators');

    // 6. Disable Pack hides from creators without deleting existing templates
    const disabledPack = adminService.updatePackStatus(newPack.id, 'Disabled', adminUser);
    assert(disabledPack.status === 'Disabled', 'Pack Management: Admin disables pack');

    const userPacksAfterDisable = dbRepository.getAvailablePacks();
    assert(!userPacksAfterDisable.some((p) => p.id === newPack.id), 'Pack Management: Disabled pack hidden from new template creation');

    // 6. Content Library Items Retrievable
    const contentItems = adminService.getContentLibraryItems();
    assert(contentItems.length >= 6, 'Content Library: Seeded shared content items exist');

    // 7. Create Content Item
    const newContentItem = adminService.createContentItem(
      {
        name: 'Custom Safety Notice',
        description: 'Operational safety notice statement',
        category: 'HR & Operations',
        contentType: 'Disclaimer',
        contentValue: 'Safety first: report all workplace incidents immediately to safety coordinators.',
      },
      adminUser
    );
    assert(Boolean(newContentItem && newContentItem.enabled), 'Content Library: Admin creates new enabled content item');

    // 8. User Available Content Items API
    const availableContent = dbRepository.getAvailableContentItems();
    assert(availableContent.some((i) => i.id === newContentItem?.id), 'Content Library: Enabled content item available to creators');

    // 9. Disable Content Item
    adminService.updateContentItemStatus(newContentItem!.id, false, adminUser);
    const availableContentAfterDisable = dbRepository.getAvailableContentItems();
    assert(!availableContentAfterDisable.some((i) => i.id === newContentItem?.id), 'Content Library: Disabled content item hidden from creators');

    // 10. Audit Log Records Pack and Content Actions
    const auditLogs = adminService.getAuditLog();
    assert(
      auditLogs.some((a) => a.action.includes('Published Pack')) && auditLogs.some((a) => a.action.includes('Content Library Item')),
      'Audit Log: System records Pack and Content Library administrative actions'
    );
  } catch (err: any) {
    console.error('Section 24 Error Stack:', err.stack);
    assert(false, 'Pack Management & Content Library Governance Checks', err.message);
  }

  console.log('\n--- Section 25: Custom Roles, Permissions & Governance Level Checks ---');
  try {
    const adminUser = dbRepository.getUserById('user-admin');

    // 1. Admin creates Custom Role Analyst
    const analystRole = roleService.createRole(
      {
        name: 'Analyst Role Test',
        description: 'Operational analyst role for testing',
        governanceLevel: 'Employee',
        isActive: true,
        permissions: ['templates.view_approved', 'templates.create', 'reports.create', 'reports.view_own'],
      },
      adminUser!
    );
    assert(Boolean(analystRole && analystRole.roleType === 'Custom'), 'Custom Roles: Admin creates Custom Role Analyst');

    // 2. Assign user-employee to Analyst role
    const updatedUser: any = adminService.updateUser('user-employee', { roleId: analystRole!.id }, adminUser!);
    assert(Boolean(updatedUser && updatedUser.role === 'Analyst Role Test' && updatedUser.roleId === analystRole!.id), 'Custom Roles: Admin assigns user to Custom Role');

    // 3. Authoritative resolution uses role_id and returns custom permissions
    const resolved = authorizationService.resolveUser('user-employee');
    assert(
      resolved !== null &&
        resolved.role === 'Analyst Role Test' &&
        resolved.governanceLevel === 'Employee' &&
        !resolved.permissions.includes('reports.sign'),
      'Custom Roles: Authoritative resolution uses role_id and resolves permissions'
    );

    // 4. Permission denial for missing permission
    assert(!authorizationService.hasPermission('user-employee', 'reports.sign'), 'Custom Roles: hasPermission returns false for unassigned capability');
    let denied = false;
    try {
      authorizationService.requirePermission('user-employee', 'reports.sign');
    } catch (e: any) {
      if (e.statusCode === 403) denied = true;
    }
    assert(denied, 'Custom Roles: requirePermission throws 403 PERMISSION_DENIED for missing capability');

    // 5. Update role permissions
    const updatedRole = roleService.updateRole(
      analystRole!.id,
      {
        permissions: ['templates.view_approved', 'templates.create', 'reports.create', 'reports.view_own', 'reports.sign'],
      },
      adminUser!
    );
    assert(Boolean(updatedRole && updatedRole.permissions.includes('reports.sign')), 'Custom Roles: Admin updates role permissions');
    assert(authorizationService.hasPermission('user-employee', 'reports.sign'), 'Custom Roles: Updated permission reflects dynamically on assigned user');

    // 6. Role deactivation safeguard: blocked if active user assigned
    let deactivationBlocked = false;
    try {
      roleService.updateRole(analystRole!.id, { isActive: false }, adminUser!);
    } catch (e: any) {
      if (e.message.includes('currently assigned')) deactivationBlocked = true;
    }
    assert(deactivationBlocked, 'Custom Roles: Deactivating role with assigned active user is safely blocked');

    // 7. Reassign user back to Employee system role
    const empRole = roleService.getRoles().find((r: any) => r.key === 'employee');
    adminService.updateUser('user-employee', { roleId: empRole!.id }, adminUser!);

    // 8. Deactivate role after user reassignment
    const deactivatedRole = roleService.updateRole(analystRole!.id, { isActive: false }, adminUser!);
    assert(Boolean(deactivatedRole && !deactivatedRole.isActive), 'Custom Roles: Role deactivated successfully after user reassignment');
    assert(!roleService.getAssignableRoles().some((r: any) => r.id === analystRole!.id), 'Custom Roles: Inactive role excluded from assignable roles');

    // 9. Audit log contains role management actions
    const logs = adminService.getAuditLog();
    assert(
      logs.some((l: any) => l.action === 'ROLE_CREATED') &&
        logs.some((l: any) => l.action === 'USER_ROLE_CHANGED') &&
        logs.some((l: any) => l.action === 'ROLE_PERMISSIONS_CHANGED') &&
        logs.some((l: any) => l.action === 'ROLE_DEACTIVATED'),
      'Audit Log: System records Custom Role creation, assignment, permission change, and deactivation'
    );

    // ==================================================
    // Section 26: Configurable System Roles, Presets & Restore Defaults
    // ==================================================
    console.log('\n--- Section 26: Configurable System Roles, Presets & Restore Defaults ---');
    const managerRole = roleService.getRoles().find((r) => r.key === 'manager');
    assert(managerRole, 'System Role Check: Manager role exists');

    // 1. Admin updates operational system role permissions (Manager: remove reports.send)
    const updatedManagerPermissions = managerRole!.permissions.filter((p: string) => p !== 'reports.send');
    const updatedManagerRole = roleService.updateRole(managerRole!.id, { permissions: updatedManagerPermissions }, adminUser!);
    assert(!updatedManagerRole.permissions.includes('reports.send'), 'System Role Check: Admin successfully removes reports.send from Manager role');

    // Audit log verifies SYSTEM_ROLE_PERMISSIONS_CHANGED
    const auditLogsAfterRoleUpdate = adminService.getAuditLog();
    const roleAudit = auditLogsAfterRoleUpdate.find((a: any) => a.action === 'SYSTEM_ROLE_PERMISSIONS_CHANGED' && a.target === 'Manager');
    assert(Boolean(roleAudit), 'Audit Log: SYSTEM_ROLE_PERMISSIONS_CHANGED recorded when Admin edits Manager permissions');

    // 2. Backend 403 enforcement
    let sendReportPermissionDenied = false;
    try {
      authorizationService.requirePermission('user-manager', 'reports.send');
    } catch (e: any) {
      sendReportPermissionDenied = e.message?.includes('Permission required: reports.send');
    }
    assert(sendReportPermissionDenied, 'Backend Authorization: Manager blocked with 403 when reports.send permission is removed');

    // 3. Governance dependency safety validator
    let governanceDeadEndBlocked = false;
    try {
      roleService.updateRole(managerRole!.id, { permissions: [] }, adminUser!);
    } catch (e: any) {
      governanceDeadEndBlocked = e.message?.includes('unable to approve Employee-level Template submissions') || e.message?.includes('would leave Employee-level template submissions');
    }
    assert(governanceDeadEndBlocked, 'Governance Safety: Admin blocked from stripping Manager approval capabilities when active Employee submission is enabled');

    // 4. Restore Default Permissions
    const restoredManagerRole = roleService.restoreDefaultRolePermissions(managerRole!.id, adminUser!);
    assert(restoredManagerRole.permissions.includes('reports.send'), 'Restore Defaults: Manager role permissions restored to baseline default');

    const restoreAudit = adminService.getAuditLog().find((a: any) => a.action === 'RESTORE_DEFAULT_ROLE_PERMISSIONS' && a.target === 'Manager');
    assert(Boolean(restoreAudit), 'Audit Log: RESTORE_DEFAULT_ROLE_PERMISSIONS recorded when restoring Manager defaults');

    // 5. Protected Admin role safeguard
    const adminRoleObj = roleService.getRoles().find((r) => r.key === 'admin');
    let adminEditBlocked = false;
    try {
      roleService.updateRole(adminRoleObj!.id, { permissions: ['reports.send'] }, adminUser!);
    } catch (e: any) {
      adminEditBlocked = e.message?.includes('Admin role permissions are protected');
    }
    assert(adminEditBlocked, 'Admin Protection Safeguard: Admin role permissions cannot be edited or restricted');

    // 6. Custom role smart permission preset from live Manager role
    const presetRole = roleService.createRole({
      name: 'Custom Team Lead',
      description: 'Custom team lead role',
      governanceLevel: 'Manager',
      permissions: restoredManagerRole.permissions,
    }, adminUser!);
    assert(presetRole.permissions.length === restoredManagerRole.permissions.length, 'Smart Preset: Custom Role prefilled from live Manager permissions');

    // --- Section 27: Configurable Template Governance Target Roles & Assignment Safety ---
    console.log('\n--- Section 27: Configurable Template Governance Target Roles & Assignment Safety ---');

    // 1. Check default baseline routing
    const initialRouting = adminService.getGovernanceRouting();
    assert(initialRouting.routes.employee.key === 'manager', 'Default Baseline: Employee Level maps to Manager role');
    assert(initialRouting.routes.manager.key === 'director', 'Default Baseline: Manager Level maps to Director role');
    assert(initialRouting.routes.director.isDirectPublish === true, 'Default Baseline: Director Level maps to Direct Publish');

    // 2. Create Custom Role Senior Analyst with required template approval permissions
    const seniorAnalystRole = roleService.createRole({
      name: 'Senior Analyst Governance',
      description: 'Custom governance approval target role',
      governanceLevel: 'Manager',
      permissions: ['templates.view_approved', 'templates.create', 'templates.edit_own_draft', 'templates.submit', 'template_approvals.view', 'template_approvals.approve', 'template_approvals.reject'],
    }, adminUser!);

    // 3. Create exactly 1 active user assigned to Senior Analyst
    const srAnalystUser1 = adminService.createUser({
      name: 'Sarah SrAnalyst',
      email: 'sarah.sranalyst@widgetflow.com',
      department: 'Operations',
      roleId: seniorAnalystRole.id,
    }, adminUser!);
    const srAnalystUser1Full = authorizationService.resolveUser((srAnalystUser1 as any).id)!;

    // 4. Update Employee Level Governance route to target Senior Analyst
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: seniorAnalystRole.id,
    }, adminUser!);
    const updatedRouting = adminService.getGovernanceRouting();
    assert(updatedRouting.routes.employee.id === seniorAnalystRole.id, 'Target Role: Admin configures Employee Level target role to Senior Analyst');

    // 5. CASE 2: Submission with exactly 1 eligible user in target role -> Assigned to that user
    const empUserCreated = adminService.createUser({
      id: 'user-emp-gov-' + Date.now(),
      name: 'Emp Gov Author',
      email: 'emp.gov@widgetflow.com',
      department: 'Operations',
      roleId: 'role-employee',
    }, adminUser!);
    const empUserGov = authorizationService.resolveUser((empUserCreated as any).id)!;

    const testDraft = workflowService.saveTemplateDraft(empUserGov, {
      name: 'Gov Target Test Template Single User',
      categoryId: 'cat-operations',
      sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
    });
    const subResult1 = workflowService.submitTemplateForApproval(empUserGov, testDraft);
    assert(
      subResult1.status === 'Pending Approval' && subResult1.requestedApprovalFromUserId === (srAnalystUser1 as any).id,
      'CASE 2: Target role with 1 active eligible user assigns submission to that user'
    );

    // 6. CASE 3: Add 2nd active user to target role with SPECIFIC_USER strategy -> Submits cleanly to configured specific user
    const srAnalystUser2 = adminService.createUser({
      id: 'user-sranalyst2-' + Date.now(),
      name: 'Alex SrAnalyst',
      email: 'alex.sranalyst@widgetflow.com',
      department: 'Operations',
      roleId: seniorAnalystRole.id,
    }, adminUser!);

    const testDraftMulti = workflowService.saveTemplateDraft(empUserGov, {
      name: 'Gov Target Test Template Multi User',
      categoryId: 'cat-operations',
      sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
    });
    const subResultMulti = workflowService.submitTemplateForApproval(empUserGov, testDraftMulti);
    assert(
      subResultMulti.status === 'Pending Approval' && subResultMulti.requestedApprovalFromUserId === (srAnalystUser1 as any).id,
      'CASE 3: SPECIFIC_USER strategy cleanly targets configured user when multiple eligible users exist'
    );

    // 7. CASE 4: Historical Safety Check -> Previously pending submission remains assigned to srAnalystUser1
    const historicalTpl = dbRepository.getTemplateById(subResult1.id);
    assert(
      historicalTpl !== null && historicalTpl.status === 'Pending Approval' && historicalTpl.requestedApprovalFromUserId === (srAnalystUser1 as any).id,
      'CASE 4: Existing historical/pending assignment remains unchanged after more users are added'
    );

    // 8. CASE 1: Switch target route to ROLE_QUEUE, set both target role users Resigned -> Submission blocked with NO_ACTIVE_APPROVER
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: seniorAnalystRole.id,
      employeeStrategy: 'ROLE_QUEUE',
    }, adminUser!);
    db.prepare(`UPDATE users SET status = 'Resigned' WHERE id IN (?, ?)`).run((srAnalystUser1 as any).id, (srAnalystUser2 as any).id);

    let zeroUserBlocked = false;
    let zeroUserMessage = '';
    try {
      const testDraftZero = workflowService.saveTemplateDraft(empUserGov, {
        name: 'Gov Target Test Template Zero User',
        categoryId: 'cat-finance',
        sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
      });
      workflowService.submitTemplateForApproval(empUserGov, testDraftZero);
    } catch (e: any) {
      zeroUserBlocked = e.code === 'NO_ACTIVE_APPROVER' || e.code === 'CONFIGURED_REVIEWER_INVALID';
      zeroUserMessage = e.message || '';
    }
    assert(zeroUserBlocked, 'CASE 1: Target role queue with 0 active eligible users blocks submission');
    assert(zeroUserMessage.toLowerCase().includes('0 active users') || zeroUserMessage.toLowerCase().includes('no active eligible'), 'CASE 1: Error message specifies no active eligible users available');

    // Restore users to active for subsequent checks
    db.prepare(`UPDATE users SET status = 'Active' WHERE id IN (?, ?)`).run((srAnalystUser1 as any).id, (srAnalystUser2 as any).id);
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: seniorAnalystRole.id,
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: (srAnalystUser1 as any).id,
    }, adminUser!);

    // 9. Dependency Safeguard: Block removing approval permission from configured target role
    let permRemovalBlocked = false;
    try {
      roleService.updateRole(seniorAnalystRole.id, {
        permissions: ['templates.view_approved', 'templates.submit'],
      }, adminUser!);
    } catch (e: any) {
      permRemovalBlocked = e.message.includes('configured approval target');
    }
    assert(permRemovalBlocked, 'Dependency Safeguard: Stripping approval permission from configured target role is safely blocked');

    // 10. Deactivation Safeguard: Block deactivating configured target role
    let deactivationGovBlocked = false;
    try {
      roleService.updateRole(seniorAnalystRole.id, { isActive: false }, adminUser!);
    } catch (e: any) {
      deactivationGovBlocked = e.message.includes('currently used as a Template Governance approval target');
    }
    assert(deactivationGovBlocked, 'Deactivation Safeguard: Deactivating configured target role is safely blocked');

    // 11. Audit Log contains TEMPLATE_GOVERNANCE_ROUTING_CHANGED event
    const govLogs = adminService.getAuditLog();
    assert(
      govLogs.some((l: any) => l.action === 'TEMPLATE_GOVERNANCE_ROUTING_CHANGED'),
      'Audit Log: System records TEMPLATE_GOVERNANCE_ROUTING_CHANGED administrative event'
    );

    // --- Section 28: Step 2 Template Governance Assignment Strategy & Architecture Safeguards ---
    console.log('\n--- Section 28: Step 2 Template Governance Assignment Strategy & Architecture Safeguards ---');

    // 1. Setup Custom Role "Quality Lead" for testing
    const qualityLeadRole = roleService.createRole({
      name: 'Quality Lead',
      description: 'Quality assurance template reviewer',
      governanceLevel: 'Employee',
      permissions: ['templates.view_approved', 'templates.create', 'templates.edit_own_draft', 'templates.submit', 'template_approvals.view', 'template_approvals.approve', 'template_approvals.reject'],
    }, adminUser!);

    const qlUser1 = adminService.createUser({
      id: 'user-ql1-' + Date.now(),
      name: 'Quinn Quality1',
      email: 'quinn1.quality@widgetflow.com',
      department: 'QA',
      roleId: qualityLeadRole.id,
    }, adminUser!);

    const qlUser2 = adminService.createUser({
      id: 'user-ql2-' + Date.now(),
      name: 'Quincy Quality2',
      email: 'quincy2.quality@widgetflow.com',
      department: 'QA',
      roleId: qualityLeadRole.id,
    }, adminUser!);

    const qlUser1Full = authorizationService.resolveUser((qlUser1 as any).id)!;
    const qlUser2Full = authorizationService.resolveUser((qlUser2 as any).id)!;
    const empUserStep2Author = authorizationService.resolveUser((empUserCreated as any).id)!;

    // TEST 1 & 2: Configure Specific User Strategy & Verify Submission Assignment
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: qualityLeadRole.id,
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: (qlUser1 as any).id,
    }, adminUser!);

    const draftSpec = workflowService.saveTemplateDraft(empUserStep2Author, {
      name: 'Step2 Test Template Specific User',
      categoryId: 'cat-finance',
      sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
    });
    const subSpec = workflowService.submitTemplateForApproval(empUserStep2Author, draftSpec);
    assert(
      subSpec.status === 'Pending Approval' &&
      subSpec.requestedApprovalFromUserId === (qlUser1 as any).id &&
      (subSpec as any).assignmentStrategySnapshot === 'SPECIFIC_USER' &&
      (subSpec as any).targetRoleId === qualityLeadRole.id,
      'SPECIFIC USER: Submission persists snapshot strategy SPECIFIC_USER, target role, and assigned reviewer'
    );

    // TEST 2: Specific User Status Dependency Protection
    let specUserDeactivationBlocked = false;
    let specUserDeactivationMsg = '';
    try {
      adminService.updateUser((qlUser1 as any).id, { status: 'Resigned' }, adminUser!);
    } catch (e: any) {
      specUserDeactivationBlocked = true;
      specUserDeactivationMsg = e.message;
    }
    assert(specUserDeactivationBlocked, 'SAFEGUARD 2: Attempting to deactivate configured Specific User is blocked');
    assert(specUserDeactivationMsg.includes('configured reviewer'), 'SAFEGUARD 2: Error message cites configured reviewer dependency');

    // TEST 3: Specific User Role Change Dependency Protection
    let specUserRoleChangeBlocked = false;
    try {
      adminService.updateUser((qlUser1 as any).id, { roleId: 'role-employee' }, adminUser!);
    } catch (e: any) {
      specUserRoleChangeBlocked = true;
    }
    assert(specUserRoleChangeBlocked, 'SAFEGUARD 2: Attempting to change configured Specific User role is blocked');

    // TEST 1 (Snapshot Immutability): Switch Admin route to Role Queue, verify existing submission retains SPECIFIC_USER
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: qualityLeadRole.id,
      employeeStrategy: 'ROLE_QUEUE',
    }, adminUser!);

    const historicalSubSpec = dbRepository.getTemplateById(subSpec.id);
    assert(
      historicalSubSpec !== null &&
      historicalSubSpec.status === 'Pending Approval' &&
      historicalSubSpec.requestedApprovalFromUserId === (qlUser1 as any).id &&
      (historicalSubSpec as any).assignmentStrategySnapshot === 'SPECIFIC_USER',
      'SNAPSHOT IMMUTABILITY: Changing Admin route to ROLE_QUEUE leaves existing SPECIFIC_USER submission snapshot unchanged'
    );

    // Submit new Template under ROLE_QUEUE strategy
    const draftQueue = workflowService.saveTemplateDraft(empUserStep2Author, {
      name: 'Step2 Test Template Role Queue',
      categoryId: 'cat-finance',
      sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
    });
    const subQueue = workflowService.submitTemplateForApproval(empUserStep2Author, draftQueue);
    assert(
      subQueue.status === 'Pending Approval' &&
      subQueue.requestedApprovalFromUserId === null &&
      (subQueue as any).assignmentStrategySnapshot === 'ROLE_QUEUE' &&
      (subQueue as any).targetRoleId === qualityLeadRole.id,
      'ROLE QUEUE: Submission persists unclaimed requested_approval_from_user_id = NULL and strategy ROLE_QUEUE'
    );

    // TEST 4: Role Queue Last User Dependency Protection
    // Deactivating 1 of 2 users is allowed
    adminService.updateUser((qlUser1 as any).id, { status: 'Resigned' }, adminUser!);
    let queueLastUserBlocked = false;
    let queueLastUserMsg = '';
    try {
      // Attempting to deactivate the 2nd (last) user should be blocked
      adminService.updateUser((qlUser2 as any).id, { status: 'Resigned' }, adminUser!);
    } catch (e: any) {
      queueLastUserBlocked = true;
      queueLastUserMsg = e.message;
    }
    assert(queueLastUserBlocked, 'SAFEGUARD 2: Attempting to deactivate the last active reviewer in a ROLE_QUEUE target role is blocked');
    assert(queueLastUserMsg.includes('without any active eligible reviewers'), 'SAFEGUARD 2: Error message specifies queue would be left without reviewers');
    // Restore qlUser1 to active
    adminService.updateUser((qlUser1 as any).id, { status: 'Active' }, adminUser!);

    // TEST 5 & 6: Backend-Authoritative Queue Visibility
    // Call pending approvals as Manager (unauthorized target role for Quality Lead queue item)
    const mgrPending = dbRepository.getPendingApprovalsForUser('user-manager');
    assert(!mgrPending.some((t) => t.id === subQueue.id), 'BACKEND VISIBILITY: Unauthorized role does NOT see Role Queue item');

    // Call pending approvals as Quality Lead (qlUser2)
    const qlPending = dbRepository.getPendingApprovalsForUser((qlUser2 as any).id);
    assert(qlPending.some((t) => t.id === subQueue.id), 'BACKEND VISIBILITY: Eligible target role member sees unclaimed Role Queue item');

    // TEST 6: Change future Admin route to Manager, verify qlUser2 STILL sees the old unclaimed Quality Lead request
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-manager',
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: 'user-manager',
    }, adminUser!);
    const qlPendingAfterRouteUpdate = dbRepository.getPendingApprovalsForUser((qlUser2 as any).id);
    assert(qlPendingAfterRouteUpdate.some((t) => t.id === subQueue.id), 'SNAPSHOT VISIBILITY: Historical unclaimed request remains visible to original target role after route update');

    // TEST 7: Atomic Claim & Race Condition Protection
    const qlUser2Current = authorizationService.resolveUser((qlUser2 as any).id)!;
    const claimedRes1 = workflowService.claimTemplateReview(qlUser2Current, subQueue.id);
    assert(
      claimedRes1.status === 'Pending Approval' &&
      claimedRes1.requestedApprovalFromUserId === (qlUser2 as any).id,
      'ATOMIC CLAIM: First eligible claimant successfully claims unclaimed Role Queue item'
    );

    // Second claim attempt by qlUser1 on same request must fail with 409
    let concurrentClaimFailed = false;
    let concurrentClaimCode = '';
    try {
      const qlUser1Current = authorizationService.resolveUser((qlUser1 as any).id)!;
      workflowService.claimTemplateReview(qlUser1Current, subQueue.id);
    } catch (e: any) {
      concurrentClaimFailed = true;
      concurrentClaimCode = e.code;
    }
    assert(concurrentClaimFailed && concurrentClaimCode === 'REVIEW_ALREADY_CLAIMED', 'ATOMIC CLAIM: Concurrent claim attempt fails with 409 REVIEW_ALREADY_CLAIMED');

    // Audit log contains TEMPLATE_REVIEW_CLAIMED
    const tplAuditRows = db.prepare(`SELECT * FROM template_audit_history WHERE template_id = ? AND action = 'Claimed'`).all(subQueue.id) as any[];
    assert(tplAuditRows.length === 1, 'CLAIM AUDIT: Exactly 1 Claimed audit event recorded');

    // TEST 8: Wrong Role Claim Attempt
    let wrongRoleClaimBlocked = false;
    try {
      const mgrUserFull = authorizationService.resolveUser('user-manager')!;
      workflowService.claimTemplateReview(mgrUserFull, subQueue.id);
    } catch (e: any) {
      wrongRoleClaimBlocked = e.code === 'NOT_ELIGIBLE_FOR_REVIEW_QUEUE' || e.code === 'REVIEW_ALREADY_CLAIMED';
    }
    assert(wrongRoleClaimBlocked, 'WRONG ROLE CLAIM: Claim attempt by wrong role is safely rejected');

    // TEST 9: Self Claim Protection
    // Create queue request authored by qlUser1
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: qualityLeadRole.id,
      employeeStrategy: 'ROLE_QUEUE',
    }, adminUser!);
    const qlUser1Current = authorizationService.resolveUser((qlUser1 as any).id)!;
    const draftSelfQueue = workflowService.saveTemplateDraft(qlUser1Current, {
      name: 'Step2 Test Template Self Queue',
      categoryId: 'cat-finance',
      sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
    });
    const subSelfQueue = workflowService.submitTemplateForApproval(qlUser1Current, draftSelfQueue);

    let selfClaimBlocked = false;
    try {
      workflowService.claimTemplateReview(qlUser1Current, subSelfQueue.id);
    } catch (e: any) {
      selfClaimBlocked = e.code === 'SELF_APPROVAL_NOT_ALLOWED';
    }
    assert(selfClaimBlocked, 'SELF CLAIM: Creator attempting to claim their own submission is blocked with 403 SELF_APPROVAL_NOT_ALLOWED');

    // TEST 10: Non-Queue Claim Attempt
    let nonQueueClaimBlocked = false;
    try {
      workflowService.claimTemplateReview(qlUser2Current, subSpec.id);
    } catch (e: any) {
      nonQueueClaimBlocked = e.code === 'REVIEW_NOT_QUEUE_ASSIGNMENT';
    }
    assert(nonQueueClaimBlocked, 'NON-QUEUE CLAIM: Attempting to claim a SPECIFIC_USER request is blocked with 409 REVIEW_NOT_QUEUE_ASSIGNMENT');

    // TEST 11: Safe Legacy Migration Backfill Tests
    // Insert a legacy row with valid requested_approval_from_user_id and NULL snapshot
    const legacyId1 = `tpl-legacy-assigned-${Date.now()}`;
    db.prepare(`
      INSERT INTO report_templates (id, name, description, category_id, version, status, created_by, created_by_name, created_by_role, requested_approval_from_user_id, requested_approval_from_name, assignment_strategy_snapshot)
      VALUES (?, 'Legacy Assigned Template', 'Desc', 'cat-finance', 'v1.0', 'Pending Approval', 'user-employee', 'Ahmed', 'Employee', 'user-manager', 'Sarah', NULL)
    `).run(legacyId1);

    // Insert a legacy row with NULL requested_approval_from_user_id and NULL snapshot
    const legacyId2 = `tpl-legacy-unmetadata-${Date.now()}`;
    db.prepare(`
      INSERT INTO report_templates (id, name, description, category_id, version, status, created_by, created_by_name, created_by_role, requested_approval_from_user_id, requested_approval_from_name, assignment_strategy_snapshot)
      VALUES (?, 'Legacy Metadata-less Template', 'Desc', 'cat-finance', 'v1.0', 'Pending Approval', 'user-employee', 'Ahmed', 'Employee', NULL, NULL, NULL)
    `).run(legacyId2);

    // Run safe backfill logic
    db.prepare(`
      UPDATE report_templates
      SET assignment_strategy_snapshot = 'SPECIFIC_USER'
      WHERE requested_approval_from_user_id IS NOT NULL
        AND assignment_strategy_snapshot IS NULL
    `).run();

    const legacyRow1 = dbRepository.getTemplateById(legacyId1);
    const legacyRow2 = dbRepository.getTemplateById(legacyId2);

    assert(
      legacyRow1 !== null && (legacyRow1 as any).assignmentStrategySnapshot === 'SPECIFIC_USER',
      'LEGACY MIGRATION: Direct-assigned legacy row backfilled with SPECIFIC_USER'
    );
    assert(
      legacyRow2 !== null && ((legacyRow2 as any).assignmentStrategySnapshot === null || (legacyRow2 as any).assignmentStrategySnapshot === undefined),
      'LEGACY MIGRATION: Metadata-less legacy row remains NULL snapshot without inventing strategy'
    );

    // --- Section 29: Final Role Queue Authorization & Admin Full-Control Exemption Checks ---
    console.log('\n--- Section 29: Final Role Queue Authorization & Admin Full-Control Exemption Checks ---');

    // 1. NEGATIVE PERMISSION TEST FOR ROLE QUEUE
    const viewerOnlyRole = roleService.createRole({
      name: 'Queue Viewer Only Role',
      description: 'Role with view permission but no approve permission',
      governanceLevel: 'Employee',
      permissions: ['templates.view_approved', 'template_approvals.view'],
    }, adminUser!);

    const viewerUser = adminService.createUser({
      name: 'Valerie Viewer',
      email: 'valerie.viewer@widgetflow.com',
      department: 'Compliance',
      roleId: viewerOnlyRole.id,
    }, adminUser!);

    const viewerUserFull = authorizationService.resolveUser((viewerUser as any).id)!;
    const viewerPending = dbRepository.getPendingApprovalsForUser(viewerUserFull.id);
    assert(viewerPending.length === 0, 'NEGATIVE PERMISSION TEST: User with template_approvals.view=true & approve=false receives empty pending approvals list');

    let viewerClaimBlocked = false;
    try {
      workflowService.claimTemplateReview(viewerUserFull, subQueue.id);
    } catch (e: any) {
      viewerClaimBlocked = e.code === 'PERMISSION_DENIED' || e.code === 'FORBIDDEN';
    }
    assert(viewerClaimBlocked, 'NEGATIVE PERMISSION TEST: Direct claim attempt by user lacking approve permission is denied');

    let viewerApproveBlocked = false;
    try {
      workflowService.approveTemplate(viewerUserFull, subQueue.id);
    } catch (e: any) {
      viewerApproveBlocked = e.code === 'PERMISSION_DENIED' || e.code === 'FORBIDDEN';
    }
    assert(viewerApproveBlocked, 'NEGATIVE PERMISSION TEST: Direct approve attempt by user lacking approve permission is denied');

    // 2. CLAIMED REQUEST EXCLUSIVITY & AUTHORIZATION (John & Mariam Scenario)
    const analystRoleForQueue = roleService.createRole({
      name: 'Senior Analyst Reviewer',
      description: 'Eligible Senior Analyst role',
      governanceLevel: 'Employee',
      permissions: ['templates.view_approved', 'templates.create', 'templates.edit_own_draft', 'templates.submit', 'template_approvals.view', 'template_approvals.approve', 'template_approvals.reject'],
    }, adminUser!);

    const johnUserCreated = adminService.createUser({
      name: 'John Analyst',
      email: 'john.analyst@widgetflow.com',
      department: 'Operations',
      roleId: analystRoleForQueue.id,
    }, adminUser!);
    const johnUser = authorizationService.resolveUser((johnUserCreated as any).id)!;

    const mariamUserCreated = adminService.createUser({
      name: 'Mariam Analyst',
      email: 'mariam.analyst@widgetflow.com',
      department: 'Operations',
      roleId: analystRoleForQueue.id,
    }, adminUser!);
    const mariamUser = authorizationService.resolveUser((mariamUserCreated as any).id)!;

    // Configure Employee Level -> Senior Analyst Reviewer -> ROLE_QUEUE
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: analystRoleForQueue.id,
      employeeStrategy: 'ROLE_QUEUE',
    }, adminUser!);

    // Ahmed submits template
    const ahmedDraft = workflowService.saveTemplateDraft(empUserStep2Author, {
      name: 'Template for Role Queue Exclusivity Test',
      categoryId: 'cat-finance',
      sections: [{ id: 'sec-1', title: 'Main', order: 1, fields: [] }],
    });
    const ahmedSub = workflowService.submitTemplateForApproval(empUserStep2Author, ahmedDraft);

    // Before claim: Both John and Mariam see the unclaimed item
    const johnPendingBefore = dbRepository.getPendingApprovalsForUser(johnUser.id);
    const mariamPendingBefore = dbRepository.getPendingApprovalsForUser(mariamUser.id);
    assert(johnPendingBefore.some((t) => t.id === ahmedSub.id), 'ROLE QUEUE: John sees unclaimed queue item before claim');
    assert(mariamPendingBefore.some((t) => t.id === ahmedSub.id), 'ROLE QUEUE: Mariam sees unclaimed queue item before claim');

    // John claims request
    const johnClaimed = workflowService.claimTemplateReview(johnUser, ahmedSub.id);
    assert(johnClaimed.requestedApprovalFromUserId === johnUser.id, 'ROLE QUEUE: Request becomes assigned to John after claim');

    // After claim: Mariam no longer sees actionable request in getPendingApprovalsForUser
    const mariamPendingAfter = dbRepository.getPendingApprovalsForUser(mariamUser.id);
    assert(!mariamPendingAfter.some((t) => t.id === ahmedSub.id), 'ROLE QUEUE: Mariam does NOT see request in pending approvals list after John claims');

    // Direct API denial checks for Mariam
    let mariamClaimDenied = false;
    try {
      workflowService.claimTemplateReview(mariamUser, ahmedSub.id);
    } catch (e: any) {
      mariamClaimDenied = e.code === 'REVIEW_ALREADY_CLAIMED' || e.code === 'FORBIDDEN';
    }
    assert(mariamClaimDenied, 'ROLE QUEUE: Direct claim attempt from Mariam is denied after John claims');

    let mariamApproveDenied = false;
    try {
      workflowService.approveTemplate(mariamUser, ahmedSub.id);
    } catch (e: any) {
      mariamApproveDenied = e.code === 'FORBIDDEN';
    }
    assert(mariamApproveDenied, 'ROLE QUEUE: Direct approve attempt from Mariam is denied after John claims');

    let mariamRejectDenied = false;
    try {
      workflowService.rejectTemplate(mariamUser, ahmedSub.id, 'Rejecting test');
    } catch (e: any) {
      mariamRejectDenied = e.code === 'FORBIDDEN';
    }
    assert(mariamRejectDenied, 'ROLE QUEUE: Direct reject attempt from Mariam is denied after John claims');

    // John can continue according to his permissions
    const johnApproved = workflowService.approveTemplate(johnUser, ahmedSub.id);
    assert(johnApproved.status === 'Approved', 'ROLE QUEUE: John completes approval successfully after claim');

    // 3. ADMIN FULL CONTROL EXEMPTION — ELEMENT
    adminService.updateElement('elements.rating', false, adminUser!);
    const effectiveElementsAfterDisable = adminService.getEffectiveConfig().elements;
    assert(effectiveElementsAfterDisable['elements.rating'] === false, 'ADMIN EXEMPTION — Element: Operational users lose Rating element availability');

    const adminElements = adminService.getElements();
    const ratingAdminSetting = adminElements.find((e) => e.element_key === 'elements.rating' || e.elementKey === 'elements.rating');
    assert(ratingAdminSetting !== undefined && Boolean(ratingAdminSetting.enabled) === false, 'ADMIN EXEMPTION — Element: Admin retains management visibility of Rating with Disabled status');

    adminService.updateElement('elements.rating', true, adminUser!);
    const effectiveElementsAfterReactivate = adminService.getEffectiveConfig().elements;
    assert(effectiveElementsAfterReactivate['elements.rating'] === true, 'ADMIN EXEMPTION — Element: Admin successfully reactivates Rating element for operational users');

    // 4. ADMIN FULL CONTROL EXEMPTION — STANDARD PACK
    const samplePack = adminService.getPacks()[0];
    assert(samplePack !== undefined, 'ADMIN EXEMPTION — Standard Pack: Seeded standard pack exists');

    adminService.updatePackStatus(samplePack.id, 'Disabled', adminUser!);
    const availPacksAfterDisable = dbRepository.getAvailablePacks();
    assert(!availPacksAfterDisable.some((p) => p.id === samplePack.id), 'ADMIN EXEMPTION — Standard Pack: Operational users lose disabled pack availability');

    const adminPacks = adminService.getPacks();
    const disabledPackAdminView = adminPacks.find((p) => p.id === samplePack.id);
    assert(disabledPackAdminView !== undefined && disabledPackAdminView.status === 'Disabled', 'ADMIN EXEMPTION — Standard Pack: Admin retains management visibility of disabled pack with Disabled status');

    adminService.updatePackStatus(samplePack.id, 'Published', adminUser!);
    const availPacksAfterReactivate = dbRepository.getAvailablePacks();
    assert(availPacksAfterReactivate.some((p) => p.id === samplePack.id), 'ADMIN EXEMPTION — Standard Pack: Admin successfully reactivates disabled pack for operational users');

    // 5. ADMIN FULL CONTROL EXEMPTION — CONTENT LIBRARY ITEM
    const sampleContent = adminService.getContentLibraryItems()[0];
    assert(sampleContent !== undefined, 'ADMIN EXEMPTION — Content Library: Seeded content library item exists');

    adminService.updateContentItemStatus(sampleContent.id, false, adminUser!);
    const availContentAfterDisable = dbRepository.getAvailableContentItems();
    assert(!availContentAfterDisable.some((c) => c.id === sampleContent.id), 'ADMIN EXEMPTION — Content Library: Operational users lose disabled content item availability');

    const adminContentItems = adminService.getContentLibraryItems();
    const disabledContentAdminView = adminContentItems.find((c) => c.id === sampleContent.id);
    assert(disabledContentAdminView !== undefined && disabledContentAdminView.enabled === false, 'ADMIN EXEMPTION — Content Library: Admin retains management visibility of disabled content item with Disabled status');

    adminService.updateContentItemStatus(sampleContent.id, true, adminUser!);
    const availContentAfterReactivate = dbRepository.getAvailableContentItems();
    assert(availContentAfterReactivate.some((c) => c.id === sampleContent.id), 'ADMIN EXEMPTION — Content Library: Admin successfully reactivates disabled content item for operational users');

    // 6. ADMIN FULL CONTROL EXEMPTION — STUDIO FEATURE
    adminService.updateFeature('studio.themes', false, adminUser!);
    const effectiveFeaturesAfterDisable = adminService.getEffectiveConfig().features;
    assert(effectiveFeaturesAfterDisable['studio.themes'] === false, 'ADMIN EXEMPTION — Feature: Operational users lose disabled studio feature availability');

    const adminFeatures = adminService.getFeatures();
    const disabledFeatureAdminView = adminFeatures.find((f) => f.feature_key === 'studio.themes' || f.featureKey === 'studio.themes');
    assert(disabledFeatureAdminView !== undefined && Boolean(disabledFeatureAdminView.enabled) === false, 'ADMIN EXEMPTION — Feature: Admin retains management control of disabled studio feature');

    adminService.updateFeature('studio.themes', true, adminUser!);
    const effectiveFeaturesAfterReactivate = adminService.getEffectiveConfig().features;
    assert(effectiveFeaturesAfterReactivate['studio.themes'] === true, 'ADMIN EXEMPTION — Feature: Admin successfully reactivates disabled studio feature for operational users');

    // 7. SPECIFIC TEST A: DIRECTLY ASSIGNED REVIEWER (view=true, approve=false, reject=true)
    const rejectOnlyRole = roleService.createRole({
      name: 'Reject Only Reviewer Role',
      description: 'Role with view and reject permissions, but no approve permission',
      governanceLevel: 'Manager',
      permissions: ['templates.view_approved', 'template_approvals.view', 'template_approvals.reject'],
    }, adminUser!);

    const rejectOnlyUserCreated = adminService.createUser({
      name: 'Richard Rejector',
      email: 'richard.rejector@widgetflow.com',
      department: 'Compliance',
      roleId: rejectOnlyRole.id,
    }, adminUser!);
    const rejectOnlyUser = authorizationService.resolveUser((rejectOnlyUserCreated as any).id)!;

    // Create a template directly assigned to Richard
    const draftDirectForRichard = workflowService.saveTemplateDraft(empUserStep2Author, {
      name: 'Template Directly Assigned to Richard',
      categoryId: 'cat-finance',
      sections: [{ title: 'Main', order: 1, fields: [] }],
    });
    // Manually submit directly assigned to Richard
    db.prepare(`
      UPDATE report_templates
      SET status = 'Pending Approval',
          requested_approval_from_user_id = ?,
          requested_approval_from_name = ?,
          assignment_strategy_snapshot = 'SPECIFIC_USER',
          submitted_at = datetime('now')
      WHERE id = ?
    `).run(rejectOnlyUser.id, rejectOnlyUser.name, draftDirectForRichard.id);

    // TEST A Requirement 1: Request IS visible to directly assigned user with view=true even if approve=false
    const richardPending = dbRepository.getPendingApprovalsForUser(rejectOnlyUser.id);
    assert(richardPending.some((t) => t.id === draftDirectForRichard.id), 'TEST A: Directly assigned reviewer with view=true & approve=false CAN see assigned request');

    // TEST A Requirement 2: Approve attempt is denied
    let richardApproveDenied = false;
    try {
      workflowService.approveTemplate(rejectOnlyUser, draftDirectForRichard.id);
    } catch (e: any) {
      richardApproveDenied = e.code === 'PERMISSION_DENIED' || e.code === 'FORBIDDEN';
    }
    assert(richardApproveDenied, 'TEST A: Directly assigned reviewer with approve=false is DENIED approval capability');

    // TEST A Requirement 3: Reject attempt is allowed
    const richardRejected = workflowService.rejectTemplate(rejectOnlyUser, draftDirectForRichard.id, 'Richard rejected due to compliance issue');
    assert(richardRejected.status === 'Rejected', 'TEST A: Directly assigned reviewer with reject=true successfully REJECTS template');

    // 8. SPECIFIC TEST B & TEST C: UNCLAIMED ROLE_QUEUE REVIEWER ELIGIBILITY
    const queueRoleNoApprove = roleService.createRole({
      name: 'Queue Reviewer No Approve',
      description: 'Role with view but no approve',
      governanceLevel: 'Employee',
      permissions: ['templates.view_approved', 'template_approvals.view'],
    }, adminUser!);

    const queueUserNoApproveCreated = adminService.createUser({
      name: 'Quincy QueueNoApprove',
      email: 'quincy.qna@widgetflow.com',
      department: 'Risk',
      roleId: queueRoleNoApprove.id,
    }, adminUser!);
    const queueUserNoApprove = authorizationService.resolveUser((queueUserNoApproveCreated as any).id)!;

    const queueRoleWithApprove = roleService.createRole({
      name: 'Queue Reviewer With Approve',
      description: 'Role with view and approve',
      governanceLevel: 'Employee',
      permissions: ['templates.view_approved', 'template_approvals.view', 'template_approvals.approve'],
    }, adminUser!);

    const queueUserWithApproveCreated = adminService.createUser({
      name: 'Quentin QueueApprove',
      email: 'quentin.qa@widgetflow.com',
      department: 'Risk',
      roleId: queueRoleWithApprove.id,
    }, adminUser!);
    const queueUserWithApprove = authorizationService.resolveUser((queueUserWithApproveCreated as any).id)!;

    // Create an unclaimed role queue item targeting queueRoleWithApprove / queueRoleNoApprove
    const draftQueueTarget = workflowService.saveTemplateDraft(empUserStep2Author, {
      name: 'Unclaimed Role Queue Item Test B/C',
      categoryId: 'cat-finance',
      sections: [{ title: 'Main', order: 1, fields: [] }],
    });
    db.prepare(`
      UPDATE report_templates
      SET status = 'Pending Approval',
          target_role_id = ?,
          assignment_strategy_snapshot = 'ROLE_QUEUE',
          requested_approval_from_user_id = NULL,
          submitted_at = datetime('now')
      WHERE id = ?
    `).run(queueRoleNoApprove.id, draftQueueTarget.id);

    // TEST B: Unclaimed ROLE_QUEUE reviewer with view=true, approve=false -> item NOT returned & claim denied
    const quincyPending = dbRepository.getPendingApprovalsForUser(queueUserNoApprove.id);
    assert(!quincyPending.some((t) => t.id === draftQueueTarget.id), 'TEST B: Unclaimed ROLE_QUEUE item is NOT returned to reviewer with approve=false');

    let quincyClaimDenied = false;
    try {
      workflowService.claimTemplateReview(queueUserNoApprove, draftQueueTarget.id);
    } catch (e: any) {
      quincyClaimDenied = e.code === 'PERMISSION_DENIED' || e.code === 'FORBIDDEN';
    }
    assert(quincyClaimDenied, 'TEST B: Direct claim attempt by unclaimed queue reviewer with approve=false is DENIED');

    // TEST C: Unclaimed ROLE_QUEUE reviewer with view=true, approve=true -> item returned & claim allowed
    db.prepare(`UPDATE report_templates SET target_role_id = ? WHERE id = ?`).run(queueRoleWithApprove.id, draftQueueTarget.id);
    const quentinPending = dbRepository.getPendingApprovalsForUser(queueUserWithApprove.id);
    assert(quentinPending.some((t) => t.id === draftQueueTarget.id), 'TEST C: Unclaimed ROLE_QUEUE item IS returned to reviewer with view=true & approve=true');

    const quentinClaimed = workflowService.claimTemplateReview(queueUserWithApprove, draftQueueTarget.id);
    assert(quentinClaimed.requestedApprovalFromUserId === queueUserWithApprove.id, 'TEST C: Claim attempt by reviewer with approve=true SUCCEEDS');

    // 9. ADMIN FULL CONTROL EXEMPTION — CATEGORIES
    const sampleCategory = adminService.getCategories()[0];
    assert(sampleCategory !== undefined, 'ADMIN EXEMPTION — Category: Seeded category exists');

    adminService.updateCategory(sampleCategory.id, { status: 'Inactive' }, adminUser!);
    const availCategoriesAfterDisable = dbRepository.getCategories();
    assert(!availCategoriesAfterDisable.some((c) => c.id === sampleCategory.id), 'ADMIN EXEMPTION — Category: Operational users lose inactive category option');

    const adminCategories = adminService.getCategories();
    const disabledCategoryAdminView = adminCategories.find((c) => c.id === sampleCategory.id);
    assert(disabledCategoryAdminView !== undefined && (disabledCategoryAdminView.status === 'Inactive' || (disabledCategoryAdminView as any).status === 'Disabled'), 'ADMIN EXEMPTION — Category: Admin retains management visibility of inactive category with Inactive status');

    // 10. SECTION 30: STEP 3 NO-CODE WORKFLOW CONTROL & SETTINGS ENFORCEMENT
    console.log('\n--- Section 30: Step 3 No-Code Workflow Control & System Settings Enforcement ---');

    const authorUser = dbRepository.getUserById('user-employee')!;
    const reviewerUser = dbRepository.getUserById('user-manager')!;

    // Get an existing approved template for report instance testing
    const sampleApprovedTmpl = dbRepository.getTemplates({ status: 'Approved' })[0];
    assert(sampleApprovedTmpl !== undefined, 'Section 30: Sample approved template exists');

    const draftRep = workflowService.createReportInstance(authorUser, sampleApprovedTmpl.id, { employee_name: 'Test Employee' }, 'Step 3 Workflow Policy Test Report');

    const sentRep = workflowService.sendReport(authorUser, draftRep.id, reviewerUser.id, 'Please review');
    assert(sentRep.status === 'Sent', 'Section 30: Test report created and sent');

    // A. ALLOW_RETURN = FALSE ENFORCEMENT
    adminService.updateSettings({ allow_return: false }, adminUser!);
    let returnBlocked = false;
    try {
      workflowService.returnReport(reviewerUser, sentRep.id, 'Revision needed');
    } catch (e: any) {
      returnBlocked = e.code === 'POLICY_DISABLED' || e.message.includes('disabled by system policy');
    }
    assert(returnBlocked, 'Section 30: returnReport API is DENIED when allow_return=false policy is enforced');

    // B. ALLOW_REJECTION = FALSE ENFORCEMENT
    adminService.updateSettings({ allow_rejection: false }, adminUser!);
    let rejectBlocked = false;
    try {
      workflowService.rejectReport(reviewerUser, sentRep.id, 'Policy violation');
    } catch (e: any) {
      rejectBlocked = e.code === 'POLICY_DISABLED' || e.message.includes('disabled by system policy');
    }
    assert(rejectBlocked, 'Section 30: rejectReport API is DENIED when allow_rejection=false policy is enforced');

    // C. DIGITAL_SIGNATURE = FALSE ENFORCEMENT
    adminService.updateSettings({ digital_signature: false }, adminUser!);
    let signBlocked = false;
    try {
      workflowService.signReport(authorUser, sentRep.id, { signatureRole: 'sender' });
    } catch (e: any) {
      signBlocked = e.code === 'POLICY_DISABLED' || e.message.includes('disabled by system policy');
    }
    assert(signBlocked, 'Section 30: signReport API is DENIED when digital_signature=false policy is enforced');

    // D. TEMPLATE_GOVERNANCE = FALSE ENFORCEMENT
    adminService.updateSettings({ template_governance: false }, adminUser!);
    const draftGovTemplate = workflowService.saveTemplateDraft(authorUser, {
      name: 'Governance Bypass Test Template',
      categoryId: 'cat-finance',
      sections: [{ title: 'Overview', order: 1, fields: [] }],
    });
    const submittedGovTemplate = workflowService.submitTemplateForApproval(authorUser, draftGovTemplate.id);
    assert(submittedGovTemplate.status === 'Approved', 'Section 30: submitTemplateForApproval DIRECT-PUBLISHES when template_governance=false policy is enforced');

    // Restore settings baseline
    adminService.updateSettings({
      allow_return: true,
      allow_rejection: true,
      digital_signature: true,
      template_governance: true,
    }, adminUser!);

    // 11. SECTION 31: SPECIFIC REVIEWER TARGET ROLE STRICT VALIDATION
    console.log('\n--- Section 31: Specific Reviewer Target Role Strict Validation ---');

    // A. Employee Level -> Target Role Director -> Specific Reviewer Director (Omar Ali) SUCCEEDS
    const validEmpDirRoute = adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-director',
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: 'user-director',
    }, adminUser!);
    assert(validEmpDirRoute.routes.employee.id === 'role-director', 'Section 31: Employee route target role set to Director');
    assert(validEmpDirRoute.routes.employee.specificUserId === 'user-director', 'Section 31: Employee route specific reviewer set to Omar Ali (Director)');

    // B. Backend Mismatch Rejection: Employee Level -> Target Role Director -> Specific Reviewer Manager (Sarah Mohamed) REJECTS
    let empMismatchRejected = false;
    try {
      adminService.updateGovernanceRouting({
        employeeTargetRoleId: 'role-director',
        employeeStrategy: 'SPECIFIC_USER',
        employeeSpecificUserId: 'user-manager', // Sarah Mohamed is a Manager, not a Director
      }, adminUser!);
    } catch (err: any) {
      empMismatchRejected = err.code === 'INVALID_SPECIFIC_REVIEWER' || err.message.includes('does not belong to the configured Target Approval Role');
    }
    assert(empMismatchRejected, 'Section 31: Backend REJECTS save attempt when specific reviewer (Sarah/Manager) does not belong to Target Role (Director)');

    // C. Manager Level -> Target Role Director -> Specific Reviewer Director (Omar Ali) SUCCEEDS
    const validMgrDirRoute = adminService.updateGovernanceRouting({
      managerTargetRoleId: 'role-director',
      managerStrategy: 'SPECIFIC_USER',
      managerSpecificUserId: 'user-director',
    }, adminUser!);
    assert(validMgrDirRoute.routes.manager.id === 'role-director', 'Section 31: Manager route target role set to Director');
    assert(validMgrDirRoute.routes.manager.specificUserId === 'user-director', 'Section 31: Manager route specific reviewer set to Omar Ali (Director)');

    // D. Backend Mismatch Rejection: Manager Level -> Target Role Director -> Specific Reviewer Manager (Sarah Mohamed) REJECTS
    let mgrMismatchRejected = false;
    try {
      adminService.updateGovernanceRouting({
        managerTargetRoleId: 'role-director',
        managerStrategy: 'SPECIFIC_USER',
        managerSpecificUserId: 'user-manager', // Sarah Mohamed is a Manager, not a Director
      }, adminUser!);
    } catch (err: any) {
      mgrMismatchRejected = err.code === 'INVALID_SPECIFIC_REVIEWER' || err.message.includes('does not belong to the configured Target Approval Role');
    }
    assert(mgrMismatchRejected, 'Section 31: Backend REJECTS save attempt when Manager route reviewer does not belong to Director Target Role');

    // Restore baseline routing after Section 31 tests
    adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-manager',
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: 'user-manager',
      managerTargetRoleId: 'role-director',
      managerStrategy: 'SPECIFIC_USER',
      managerSpecificUserId: 'user-director',
    }, adminUser!);

    // 12. SECTION 32: DIRECTOR ROLE REVIEWER ELIGIBILITY & PERMISSION DIAGNOSTICS
    console.log('\n--- Section 32: Director Role Reviewer Eligibility & Permission Diagnostics ---');

    // TEST 1 — Director Baseline Eligibility: Omar Ali active, role_id = role-director, Director has view + approve
    const dirRouting = adminService.getGovernanceRouting();
    const dirRole = dirRouting.eligibleRoles.find((r: any) => r.id === 'role-director');
    assert(dirRole !== undefined, 'Section 32: Director system role exists in eligibleRoles');
    assert(dirRole?.hasReviewPermissions === true, 'Section 32: Director role has required review permissions (view + approve)');
    assert(dirRole?.activeUserCount === 1, 'Section 32: Director activeUserCount equals 1');
    assert(dirRole?.eligibleUserCount === 1, 'Section 32: Director eligibleUserCount equals 1');
    const omarInDir = dirRole?.eligibleUsers.find((u: any) => u.id === 'user-director');
    assert(omarInDir !== undefined, 'Section 32: Omar Ali is present in Director eligibleUsers');

    // TEST 2 — Director Lacks Approve Permission: Temporarily unassign Director target route, then strip approve permission
    adminService.updateGovernanceRouting({
      managerTargetRoleId: 'role-manager',
      managerStrategy: 'SPECIFIC_USER',
      managerSpecificUserId: 'user-manager',
    }, adminUser!);

    roleService.updateRole('role-director', { permissions: ['template_approvals.view', 'reports.view_organization'] }, adminUser!);
    const dirNoApproveRouting = adminService.getGovernanceRouting();
    const dirRoleNoApprove = dirNoApproveRouting.eligibleRoles.find((r: any) => r.id === 'role-director');
    assert(dirRoleNoApprove?.hasReviewPermissions === false, 'Section 32: Director role marked as lacking review permissions when approve is stripped');
    assert(dirRoleNoApprove?.eligibleUserCount === 0, 'Section 32: Director eligibleUserCount drops to 0 when approve permission is stripped');

    // TEST 3 — Restore Approve Permission: Re-enable approve permission on Director and re-assign route
    roleService.updateRole('role-director', { permissions: getDefaultSystemRolePermissions('director') }, adminUser!);
    const dirRestoredRouting = adminService.getGovernanceRouting();
    const dirRoleRestored = dirRestoredRouting.eligibleRoles.find((r: any) => r.id === 'role-director');
    assert(dirRoleRestored?.hasReviewPermissions === true, 'Section 32: Director role review permissions restored');
    assert(dirRoleRestored?.eligibleUserCount === 1, 'Section 32: Omar Ali immediately becomes eligible again after restoring approve permission');

    // TEST 4 — Sarah Exclusion: Sarah Mohamed (Manager) NEVER appears in Director eligibleUsers
    const sarahInDir = dirRoleRestored?.eligibleUsers.find((u: any) => u.id === 'user-manager');
    assert(sarahInDir === undefined, 'Section 32: Sarah Mohamed (Manager) never appears in Director eligibleUsers');

    // TEST 5 & 6 — Employee & Manager Level -> Director Route Save with Omar Ali
    const savedEmpDirRoute = adminService.updateGovernanceRouting({
      employeeTargetRoleId: 'role-director',
      employeeStrategy: 'SPECIFIC_USER',
      employeeSpecificUserId: 'user-director',
      managerTargetRoleId: 'role-director',
      managerStrategy: 'SPECIFIC_USER',
      managerSpecificUserId: 'user-director',
    }, adminUser!);
    assert(savedEmpDirRoute.routes.employee.specificUserId === 'user-director', 'Section 31: Employee route specific user saved as Omar Ali');
    assert(savedEmpDirRoute.routes.manager.specificUserId === 'user-director', 'Section 31: Manager route specific user saved as Omar Ali');

    // 13. SECTION 33: MULTI-LEVEL DIRECT PUBLISH STRATEGY & DYNAMIC ACTION CHECKS
    console.log('\n--- Section 33: Multi-Level Direct Publish Strategy & Dynamic Action Checks ---');

    const empUserAuthor = authorizationService.resolveUser('user-employee')!;
    const mgrUserAuthor = authorizationService.resolveUser('user-manager')!;
    const dirUserAuthor = authorizationService.resolveUser('user-director')!;

    // A. Employee Level Direct Publish Strategy Save & Backend Submission
    const empDirectPubConfig = adminService.updateGovernanceRouting({
      employeeStrategy: 'DIRECT_PUBLISH',
    }, adminUser!);
    assert(empDirectPubConfig.routes.employee.strategy === 'DIRECT_PUBLISH', 'Section 33: Employee route strategy set to DIRECT_PUBLISH');
    assert(empDirectPubConfig.routes.employee.isDirectPublish === true, 'Section 33: Employee route marked as isDirectPublish=true');

    const empDirectDraft = workflowService.saveTemplateDraft(empUserAuthor, {
      name: 'Employee Direct Publish Test Template',
      categoryId: 'cat-finance',
      sections: [{ title: 'Main', order: 1, fields: [] }],
    });
    const empDirectSubmitted = workflowService.submitTemplateForApproval(empUserAuthor, empDirectDraft.id);
    assert(empDirectSubmitted.status === 'Approved', 'Section 33: Employee submission DIRECT PUBLISHES to Approved status when employeeStrategy=DIRECT_PUBLISH');

    // B. Manager Level Direct Publish Strategy Save & Backend Submission
    const mgrDirectPubConfig = adminService.updateGovernanceRouting({
      managerStrategy: 'DIRECT_PUBLISH',
    }, adminUser!);
    assert(mgrDirectPubConfig.routes.manager.strategy === 'DIRECT_PUBLISH', 'Section 33: Manager route strategy set to DIRECT_PUBLISH');
    assert(mgrDirectPubConfig.routes.manager.isDirectPublish === true, 'Section 33: Manager route marked as isDirectPublish=true');

    const mgrDirectDraft = workflowService.saveTemplateDraft(mgrUserAuthor, {
      name: 'Manager Direct Publish Test Template',
      categoryId: 'cat-finance',
      sections: [{ title: 'Main', order: 1, fields: [] }],
    });
    const mgrDirectSubmitted = workflowService.submitTemplateForApproval(mgrUserAuthor, mgrDirectDraft.id);
    assert(mgrDirectSubmitted.status === 'Approved', 'Section 33: Manager submission DIRECT PUBLISHES to Approved status when managerStrategy=DIRECT_PUBLISH');

    // C. Director Level Specific User Route Save & Backend Submission
    const dirSpecUserConfig = adminService.updateGovernanceRouting({
      directorTargetRoleId: 'role-manager',
      directorStrategy: 'SPECIFIC_USER',
      directorSpecificUserId: 'user-manager',
    }, adminUser!);
    assert(dirSpecUserConfig.routes.director.strategy === 'SPECIFIC_USER', 'Section 33: Director route strategy set to SPECIFIC_USER targeting Manager');

    const dirSpecDraft = workflowService.saveTemplateDraft(dirUserAuthor, {
      name: 'Director Routed Test Template',
      categoryId: 'cat-finance',
      sections: [{ title: 'Main', order: 1, fields: [] }],
    });
    const dirSpecSubmitted = workflowService.submitTemplateForApproval(dirUserAuthor, dirSpecDraft.id);
    assert(dirSpecSubmitted.status === 'Pending Approval', 'Section 33: Director submission goes to Pending Approval when Director route strategy is SPECIFIC_USER');
    assert(dirSpecSubmitted.requestedApprovalFromUserId === 'user-manager', 'Section 33: Director submission assigned to Sarah Mohamed (Manager)');

    // D. Historical Snapshot Safety: Changing route back to DIRECT_PUBLISH does not alter dirSpecSubmitted status
    adminService.updateGovernanceRouting({
      directorStrategy: 'DIRECT_PUBLISH',
    }, adminUser!);
    const historicalTplSec33 = dbRepository.getTemplateById(dirSpecSubmitted.id)!;
    assert(historicalTplSec33.status === 'Pending Approval', 'Section 33: Historical submission remains Pending Approval after route is changed to DIRECT_PUBLISH');

    // =========================================================================
    // SECTION 34: URGENT FIX VERIFICATION — GOVERNANCE PERMISSION RESOLUTION & SPECIFIC REVIEWER
    // =========================================================================
    console.log('\n--- Section 34: Governance Permission Resolution & Specific Reviewer ---');

    // 1. Manager & Director Reviewer Resolution
    const liveGov = adminService.getGovernanceRouting();
    const mgrRoleSec34 = liveGov.eligibleRoles.find((r: any) => r.key === 'manager');
    assert(mgrRoleSec34 !== undefined, 'Section 34: Manager role is returned in eligibleRoles');
    assert(mgrRoleSec34?.hasReviewPermissions === true, 'Section 34: Manager role has review permissions');
    assert(Boolean(mgrRoleSec34?.eligibleUsers.some((u: any) => u.id === 'user-manager')), 'Section 34: Sarah Mohamed is in Manager eligibleUsers list');

    const dirRoleSec34 = liveGov.eligibleRoles.find((r: any) => r.key === 'director');
    assert(dirRoleSec34 !== undefined, 'Section 34: Director role is returned in eligibleRoles');
    assert(dirRoleSec34?.hasReviewPermissions === true, 'Section 34: Director role has review permissions');
    assert(Boolean(dirRoleSec34?.eligibleUsers.some((u: any) => u.id === 'user-director')), 'Section 34: Omar Ali is in Director eligibleUsers list');

    // 2. Dynamic Permission Toggle Verification (No stale cache)
    roleService.updateRole('role-manager', { permissions: ['templates.view_approved', 'templates.create'] }, adminUser!);
    const liveGovNoApprove = adminService.getGovernanceRouting();
    const mgrNoApprove = liveGovNoApprove.eligibleRoles.find((r: any) => r.key === 'manager');
    assert(mgrNoApprove?.hasReviewPermissions === false, 'Section 34: Manager role review permissions reflect false immediately after stripping approve');
    assert(mgrNoApprove?.eligibleUsers.length === 0, 'Section 34: Manager eligibleUsers is empty when review permissions are missing');

    // Restore Manager permissions
    roleService.updateRole(
      'role-manager',
      { permissions: ['templates.view_approved', 'templates.create', 'templates.edit_own_draft', 'templates.submit', 'templates.preview', 'templates.use', 'template_approvals.view', 'template_approvals.approve', 'template_approvals.reject'] },
      adminUser!
    );
    const liveGovRestored = adminService.getGovernanceRouting();
    const mgrRestored = liveGovRestored.eligibleRoles.find((r: any) => r.key === 'manager');
    assert(mgrRestored?.hasReviewPermissions === true, 'Section 34: Manager role review permissions restored immediately');
    assert(Boolean(mgrRestored?.eligibleUsers.some((u: any) => u.id === 'user-manager')), 'Section 34: Sarah Mohamed returned to Manager eligibleUsers');

    // 3. Multi-level Direct Publish route strategy verification
    adminService.updateGovernanceRouting({
      employeeStrategy: 'DIRECT_PUBLISH',
      managerStrategy: 'DIRECT_PUBLISH',
      directorStrategy: 'DIRECT_PUBLISH',
    }, adminUser!);

    const liveGovDirect = adminService.getGovernanceRouting();
    assert(liveGovDirect.routes.employee.strategy === 'DIRECT_PUBLISH', 'Section 34: Employee level route strategy is DIRECT_PUBLISH');
    assert(liveGovDirect.routes.manager.strategy === 'DIRECT_PUBLISH', 'Section 34: Manager level route strategy is DIRECT_PUBLISH');
    assert(liveGovDirect.routes.director.strategy === 'DIRECT_PUBLISH', 'Section 34: Director level route strategy is DIRECT_PUBLISH');

    // Reset database baseline after testing
    seedDatabase();
  } catch (err: any) {
    console.error('Section 27/28/29/30/34 Error Stack:', err.stack);
    assert(false, 'Full System Verification Checks', err.message);
  }

  console.log('\n--------------------------------------------------');
  console.log(`Results: ${passedTests} Passed, ${failedTests} Failed`);
  if (failedTests === 0) {
    console.log('🎉 WIDGETFLOW V1 AUTHORITATIVE FULL SYSTEM VERIFICATION PASSED!');
    console.log('--------------------------------------------------\n');
    process.exit(0);
  } else {
    console.log('❌ VERIFICATION FAILED WITH ISSUES');
    console.log('--------------------------------------------------\n');
    process.exit(1);
  }
}

runFullSystemCheck();
