import crypto from 'crypto';
import { db } from '../db/database.js';
import { dbRepository } from '../repositories/dbRepository.js';
import { AppError } from '../middleware/errorHandler.js';
import { validateDynamicTemplateSchema } from './componentRegistry.js';
import { evaluateTemplateRulesAndCalculations } from '../../src/shared/template-rules/index.js';
import { dynamicWorkflowService } from './dynamicWorkflowService.js';
import { normalizeTemplateIdentityName } from '../../src/shared/templateUtils.js';
import type { ServerUser } from '../types/index.js';
import { adminService } from './adminService.js';
import { authorizationService } from './authorizationService.js';
import fs from 'fs';

function extractTemplateComponents(template: any): any[] {
  if (!template) return [];
  const list: any[] = [];
  if (Array.isArray(template.components)) list.push(...template.components);
  if (Array.isArray(template.dynamicSections)) {
    template.dynamicSections.forEach((sec: any) => {
      if (Array.isArray(sec?.components)) list.push(...sec.components);
    });
  }
  if (Array.isArray(template.fields)) list.push(...template.fields);
  return list;
}

export const workflowService = {
  // 1. Save or Update Template Draft / Submission
  saveTemplateDraft(user: ServerUser, payload: any) {
    const { id, name, description, tags, sections, dynamicSections, fields, components } = payload;
    const templateId = id || `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const existing = db.prepare(`SELECT id, status, category_id, name, description, created_by FROM report_templates WHERE id = ?`).get(templateId) as any;
    user = authorizationService.requirePermission(user, existing ? 'templates.edit_own_draft' : 'templates.create');
    if (existing && existing.created_by !== user.id) throw new AppError('Only the template author can edit this draft.', 403, 'FORBIDDEN');
    const targetCategoryId = payload.categoryId || payload.category || existing?.category_id || 'cat-finance';

    const category = db.prepare(`SELECT id, name FROM report_template_categories WHERE id = ? OR name = ?`).get(targetCategoryId, targetCategoryId) as any;
    const resolvedCategoryId = category?.id || 'cat-finance';

    const tplName = name || existing?.name || 'New Template';
    const tplDesc = description !== undefined ? description : existing?.description || '';
    const status = 'Draft';
    const rulesList = payload.rules || payload.rules_json;
    const calculationsList = payload.calculations || payload.calculations_json;
    const rulesJson = Array.isArray(rulesList) ? JSON.stringify(rulesList) : typeof rulesList === 'string' ? rulesList : null;
    const calculationsJson = Array.isArray(calculationsList) ? JSON.stringify(calculationsList) : typeof calculationsList === 'string' ? calculationsList : null;
    const themeJson = payload.theme ? (typeof payload.theme === 'string' ? payload.theme : JSON.stringify(payload.theme)) : null;

    const transaction = db.transaction(() => {
      if (existing) {
        if (existing.status === 'Approved') {
          throw new AppError(
            'Approved templates are immutable and cannot be overwritten directly. Please create a new template version.',
            400,
            'LOCKED'
          );
        }

        db.prepare(`
          UPDATE report_templates
          SET name = ?, description = ?, category_id = ?, rules_json = ?, calculations_json = ?, theme_json = ?, updated_at = ?
          WHERE id = ?
        `).run(tplName, tplDesc, resolvedCategoryId, rulesJson, calculationsJson, themeJson, now, templateId);
      } else {
        db.prepare(`
          INSERT INTO report_templates (
            id, name, description, category_id, version, status,
            created_by, created_by_name, created_by_role, rules_json, calculations_json, theme_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'v1.0', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(templateId, tplName, tplDesc, resolvedCategoryId, status, user.id, user.name, user.role, rulesJson, calculationsJson, themeJson, now, now);

        db.prepare(`
          INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
          VALUES (?, ?, ?, ?, ?, 'Created', 'Created report template draft.', ?)
        `).run(`aud-t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, templateId, tplName, user.name, user.role, now);
      }

      // Re-insert tags
      db.prepare(`DELETE FROM report_template_tags WHERE template_id = ?`).run(templateId);
      if (Array.isArray(tags)) {
        const insTag = db.prepare(`INSERT INTO report_template_tags (id, template_id, tag) VALUES (?, ?, ?)`);
        tags.forEach((tag: string, idx: number) => insTag.run(`tag-${templateId}-${idx}`, templateId, tag));
      }

      // Determine sections list & components list
      let finalSections: string[] = [];
      if (Array.isArray(sections)) {
        finalSections = sections;
      } else if (Array.isArray(dynamicSections)) {
        finalSections = dynamicSections.map((s: any) => s.title || s.name);
      } else {
        finalSections = ['General Information'];
      }

      let finalComponents: any[] = [];
      if (Array.isArray(components) && components.length > 0) {
        finalComponents = components;
      } else if (Array.isArray(dynamicSections) && dynamicSections.length > 0) {
        finalComponents = dynamicSections.flatMap((s: any) => s.components || []);
      } else if (Array.isArray(fields) && fields.length > 0) {
        finalComponents = fields;
      }

      // Clean existing sections & fields
      db.prepare(`DELETE FROM report_template_fields WHERE template_id = ?`).run(templateId);
      db.prepare(`DELETE FROM report_template_sections WHERE template_id = ?`).run(templateId);

      const insSec = db.prepare(`INSERT INTO report_template_sections (id, template_id, name, display_order) VALUES (?, ?, ?, ?)`);
      const secMap = new Map<string, string>();
      finalSections.forEach((secItem: any, idx: number) => {
        const sName = typeof secItem === 'string' ? secItem : secItem?.title || secItem?.name || `Section ${idx + 1}`;
        const secId = typeof secItem === 'object' && secItem?.id ? secItem.id : `sec-${templateId}-${idx}`;
        insSec.run(secId, templateId, sName, idx);
        secMap.set(sName, secId);
      });

      if (finalComponents.length > 0) {
        const insFld = db.prepare(`
          INSERT INTO report_template_fields (
            id, template_id, section_id, section_name, field_key, label, field_type,
            required, placeholder, description, default_value, layout_width,
            validation_rules_json, options_json, display_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        finalComponents.forEach((f: any, idx: number) => {
          const rawSecName = f.section || finalSections[0] || 'General Information';
          const secName = typeof rawSecName === 'string' ? rawSecName : rawSecName?.title || rawSecName?.name || 'General Information';
          const secId = secMap.get(secName) || null;
          const fieldKey = f.key || f.id || `field_${idx + 1}`;
          const layoutWidth = f.layoutWidth || (f.layout && f.layout.width) || 'full';
          const configExtension = {
            ...(f.validation || {}),
            columns: f.columns,
            minRows: f.minRows,
            maxRows: f.maxRows,
            allowAddRow: f.allowAddRow,
            allowDeleteRow: f.allowDeleteRow,
            allowReorderRows: f.allowReorderRows,
            showRowNumbers: f.showRowNumbers,
            showFooter: f.showFooter,
            aggregates: f.aggregates,
            tableConfig: f.tableConfig,
            repeatingGroupConfig: f.repeatingGroupConfig,
            signatureConfig: f.signatureConfig,
            ratingConfig: f.ratingConfig,
            acknowledgementConfig: f.acknowledgementConfig,
            fileConfig: f.fileConfig,
            headingConfig: f.headingConfig,
            paragraphConfig: f.paragraphConfig,
            dividerConfig: f.dividerConfig,
            spacerConfig: f.spacerConfig,
            imageConfig: f.imageConfig,
            infoBoxConfig: f.infoBoxConfig,
            nestedComponents: f.nestedComponents,
            kpiConfig: f.kpiConfig,
            size: f.size,
            alignment: f.alignment,
            stylePreset: f.stylePreset,
            assetId: f.assetId,
            assetUrl: f.assetUrl,
            caption: f.caption,
            altText: f.altText,
          };
          const valJson = JSON.stringify(configExtension);
          const optJson = f.options ? JSON.stringify(f.options) : null;

          const fieldDbId = `${templateId}-${f.id || idx}`;

          insFld.run(
            fieldDbId,
            templateId,
            secId,
            secName,
            fieldKey,
            f.label || fieldKey,
            f.type || 'text',
            f.required ? 1 : 0,
            f.placeholder || null,
            f.description || null,
            f.defaultValue !== undefined ? String(f.defaultValue) : null,
            layoutWidth,
            valJson,
            optJson,
            f.order !== undefined ? f.order : idx
          );
        });
      }
    });

    transaction();
    return dbRepository.getTemplateById(templateId);
  },

  // 2. Submit Template For Approval
  submitTemplateForApproval(user: ServerUser, payload: any, draftId?: string) {
    user = authorizationService.requirePermission(user, 'templates.submit');
    if (user.governanceLevel === 'None') throw new AppError('This role has no Template Governance Level and cannot submit templates.', 403, 'GOVERNANCE_LEVEL_REQUIRED');
    const now = new Date().toISOString();
    const targetId = draftId || payload?.id;
    const existing = targetId ? dbRepository.getTemplateById(targetId) : null;
    const fullSchema = existing ? { ...existing, ...payload } : payload;

    const savedTemplate = this.saveTemplateDraft(user, { ...fullSchema, id: targetId });
    if (!savedTemplate) throw new AppError('Template save failed.', 400);

    const settings = adminService.getEffectiveConfig().settings;
    if (settings['template_governance'] === false || settings['workflow.template_governance'] === false) {
      // Governance policy disabled: publish directly
      db.prepare(`UPDATE report_templates SET status = 'Approved', updated_at = datetime('now') WHERE id = ?`).run(savedTemplate.id);
      db.prepare(`
        INSERT OR REPLACE INTO report_template_versions (id, template_id, version, schema_snapshot_json, created_by, created_at, published_at, status)
        VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'Approved')
      `).run(
        `ver-${savedTemplate.id}-${savedTemplate.version || 'v1.0'}`,
        savedTemplate.id,
        savedTemplate.version || 'v1.0',
        JSON.stringify(savedTemplate),
        user.id
      );
      return dbRepository.getTemplateById(savedTemplate.id);
    }

    const routingConfig = adminService.getGovernanceRouting().routes;
    const targetRoute = user.governanceLevel === 'Employee'
      ? routingConfig.employee
      : user.governanceLevel === 'Manager'
      ? routingConfig.manager
      : routingConfig.director;

    let targetStatus: 'Pending Approval' | 'Approved' = 'Pending Approval';
    let targetApproverId: string | null = null;
    let targetApproverName: string | null = null;
    let targetRoleId: string | null = null;
    let strategySnapshot: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH' = 'SPECIFIC_USER';

    if (targetRoute.isDirectPublish || targetRoute.id === 'DIRECT_PUBLISH') {
      targetStatus = 'Approved';
      strategySnapshot = 'DIRECT_PUBLISH';
      targetRoleId = 'DIRECT_PUBLISH';
    } else {
      targetRoleId = targetRoute.id;
      strategySnapshot = targetRoute.strategy as 'SPECIFIC_USER' | 'ROLE_QUEUE';

      if (!targetRoute.isRouteValid) {
        throw new AppError(
          targetRoute.statusMessage || `The configured approval route for '${targetRoute.name}' is currently invalid or has no active eligible reviewers.`,
          400,
          'CONFIGURED_REVIEWER_INVALID'
        );
      }

      if (strategySnapshot === 'SPECIFIC_USER') {
        const specUser = targetRoute.eligibleUsers.find((u: any) => u.id === targetRoute.specificUserId);
        if (!specUser) {
          throw new AppError(
            `The configured reviewer for '${targetRoute.name}' is no longer active or eligible. Admin configuration required.`,
            400,
            'CONFIGURED_REVIEWER_INVALID'
          );
        }
        targetApproverId = specUser.id;
        targetApproverName = specUser.name;
      } else if (strategySnapshot === 'ROLE_QUEUE') {
        if (targetRoute.eligibleUserCount === 0) {
          throw new AppError(
            `No active eligible users are available in the configured target role queue '${targetRoute.name}'.`,
            400,
            'NO_ACTIVE_APPROVER'
          );
        }
        targetApproverId = null;
        targetApproverName = null;
      }
    }

    const validation = validateDynamicTemplateSchema(savedTemplate);
    if (!validation.valid) {
      throw new AppError(
        `Template schema validation failed: ${validation.errors.map((e) => e.message).join(' ')}`,
        400,
        'INVALID_TEMPLATE_SCHEMA'
      );
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE report_templates
        SET status = ?, requested_approval_from_user_id = ?, requested_approval_from_name = ?, target_role_id = ?, assignment_strategy_snapshot = ?, submitted_at = ?, updated_at = ?
        WHERE id = ?
      `).run(targetStatus, targetApproverId, targetApproverName, targetRoleId, strategySnapshot, now, now, savedTemplate.id);

      if (targetStatus === 'Approved') {
        const hydrated = dbRepository.getTemplateById(savedTemplate.id);
        if (hydrated) {
          const snapshotJson = JSON.stringify(hydrated);
          const versionId = `ver-${savedTemplate.id}-${hydrated.version || 'v1.0'}`;
          db.prepare(`
            INSERT OR REPLACE INTO report_template_versions (id, template_id, version, schema_snapshot_json, created_by, created_at, published_at, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved')
          `).run(versionId, savedTemplate.id, hydrated.version || 'v1.0', snapshotJson, user.id, now, now);
        }
        this.processApprovedTemplateReplacement(savedTemplate.id);
      }

      db.prepare(`
        INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `aud-t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        savedTemplate.id,
        savedTemplate.name,
        user.name,
        user.role,
        targetStatus === 'Approved' ? 'Published' : 'Submitted',
        targetStatus === 'Approved'
          ? 'Published template directly to firm library.'
          : `Submitted report template for review by ${targetApproverName}.`,
        now
      );

      if (targetStatus === 'Pending Approval' && targetApproverId) {
        db.prepare(`
          INSERT INTO notifications (id, recipient_user_id, type, title, message, related_template_id, is_read, created_at)
          VALUES (?, ?, 'approval_required', 'New Template Submitted for Approval', ?, ?, 0, ?)
        `).run(
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          targetApproverId,
          `${user.name} submitted "${savedTemplate.name}" report template for your approval.`,
          savedTemplate.id,
          now
        );
      }
    });

    transaction();
    return dbRepository.getTemplateById(savedTemplate.id);
  },

  // 3. Approve Template
  approveTemplate(user: ServerUser, templateId: string) {
    user = authorizationService.requirePermission(user, 'template_approvals.approve');
    const template = dbRepository.getTemplateById(templateId);
    if (!template) throw new AppError('Template not found.', 404, 'NOT_FOUND');

    if (template.status !== 'Pending Approval') {
      throw new AppError('This template is no longer awaiting approval.', 400, 'INVALID_STATUS');
    }

    if (template.requestedApprovalFromUserId !== user.id) {
      throw new AppError('You are not authorized to approve this template request.', 403, 'FORBIDDEN');
    }

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE report_templates
        SET status = 'Approved', updated_at = ?
        WHERE id = ?
      `).run(now, templateId);

      const hydrated = dbRepository.getTemplateById(templateId);
      if (hydrated) {
        const snapshotJson = JSON.stringify(hydrated);
        const versionId = `ver-${templateId}-${hydrated.version || 'v1.0'}`;
        db.prepare(`
          INSERT OR REPLACE INTO report_template_versions (id, template_id, version, schema_snapshot_json, created_by, created_at, published_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved')
        `).run(versionId, templateId, hydrated.version || 'v1.0', snapshotJson, user.id, now, now);
      }

      this.processApprovedTemplateReplacement(templateId);

      db.prepare(`
        INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, ?, 'Approved', 'Approved and published report template firm-wide.', ?)
      `).run(`aud-t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, templateId, template.name, user.name, user.role, now);

      db.prepare(`
        INSERT INTO notifications (id, recipient_user_id, type, title, message, related_template_id, is_read, created_at)
        VALUES (?, ?, 'template_approved', 'Report Template Approved!', ?, ?, 0, ?)
      `).run(
        `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        template.createdById,
        `${user.name} approved your report template "${template.name}". It is now available firm-wide.`,
        templateId,
        now
      );
    });

    transaction();
    return dbRepository.getTemplateById(templateId);
  },

  processApprovedTemplateReplacement(approvedTemplateId: string) {
    const approvedT = dbRepository.getTemplateById(approvedTemplateId);
    if (!approvedT) return;

    const normName = normalizeTemplateIdentityName(approvedT.name);
    const categoryId = approvedT.categoryId;

    const candidates = db.prepare(`
      SELECT id, name FROM report_templates
      WHERE category_id = ? AND status = 'Approved' AND id != ?
    `).all(categoryId, approvedTemplateId) as any[];

    const supersededTemplates = candidates.filter(
      (c) => normalizeTemplateIdentityName(c.name) === normName
    );

    if (supersededTemplates.length === 0) return;

    const now = new Date().toISOString();

    for (const oldT of supersededTemplates) {
      db.prepare(`
        UPDATE report_templates
        SET status = 'Archived', updated_at = ?
        WHERE id = ?
      `).run(now, oldT.id);

      db.prepare(`
        INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, 'System', 'System', 'Archived', ?, ?)
      `).run(
        `aud-t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        oldT.id,
        oldT.name,
        `Template superseded by newly approved template "${approvedT.name}" (${approvedT.id}).`,
        now
      );

      // Safe storage cleanup
      try {
        const unusedAssets = db.prepare(`
          SELECT id, file_path FROM template_assets
          WHERE template_id = ? AND id NOT IN (
            SELECT asset_reference FROM user_signature_profiles WHERE asset_reference IS NOT NULL
          )
        `).all(oldT.id) as any[];

        for (const asset of unusedAssets) {
          if (asset.file_path && fs.existsSync(asset.file_path)) {
            try {
              fs.unlinkSync(asset.file_path);
            } catch {}
          }
          db.prepare(`DELETE FROM template_assets WHERE id = ?`).run(asset.id);
        }
      } catch {}
    }
  },

  // Atomic Claim Template Review
  claimTemplateReview(actorUser: any, templateId: string) {
    const user = authorizationService.resolveUser(typeof actorUser === 'string' ? actorUser : actorUser?.id);
    if (!user || !user.status || user.status !== 'Active') {
      throw new AppError('Active user credentials required to claim template reviews.', 401, 'UNAUTHORIZED');
    }

    if (!authorizationService.hasPermission(user, 'template_approvals.view') || !authorizationService.hasPermission(user, 'template_approvals.approve')) {
      throw new AppError('You do not have permission to claim template reviews.', 403, 'PERMISSION_DENIED');
    }

    const templateRow = db.prepare(`SELECT * FROM report_templates WHERE id = ?`).get(templateId) as any;
    if (!templateRow) {
      throw new AppError('Template request not found.', 404, 'NOT_FOUND');
    }

    // Safeguard 4 & Safeguard 3 Checks
    if (templateRow.created_by === user.id) {
      throw new AppError('Creators cannot claim their own template submissions.', 403, 'SELF_APPROVAL_NOT_ALLOWED');
    }
    if (templateRow.status !== 'Pending Approval') {
      throw new AppError('This request is no longer pending approval.', 409, 'INVALID_TEMPLATE_STATE');
    }
    if (templateRow.assignment_strategy_snapshot !== 'ROLE_QUEUE') {
      throw new AppError('This request is not a role queue assignment.', 409, 'REVIEW_NOT_QUEUE_ASSIGNMENT');
    }
    if (templateRow.requested_approval_from_user_id !== null) {
      throw new AppError('This review has already been claimed by another reviewer.', 409, 'REVIEW_ALREADY_CLAIMED');
    }
    if (templateRow.target_role_id !== user.roleId) {
      throw new AppError('Your current role is not eligible for this review queue.', 403, 'NOT_ELIGIBLE_FOR_REVIEW_QUEUE');
    }

    const now = new Date().toISOString();

    // SAFEGUARD 4: Atomic conditional UPDATE in SQLite
    const result = db.prepare(`
      UPDATE report_templates
      SET requested_approval_from_user_id = ?,
          requested_approval_from_name = ?,
          claimed_at = ?,
          updated_at = ?
      WHERE id = ?
        AND assignment_strategy_snapshot = 'ROLE_QUEUE'
        AND target_role_id = ?
        AND requested_approval_from_user_id IS NULL
        AND status = 'Pending Approval'
        AND created_by != ?
    `).run(user.id, user.name, now, now, templateId, user.roleId, user.id);

    if (result.changes === 0) {
      const current = db.prepare(`SELECT * FROM report_templates WHERE id = ?`).get(templateId) as any;
      if (!current) throw new AppError('Template request not found.', 404, 'NOT_FOUND');
      if (current.requested_approval_from_user_id !== null) {
        throw new AppError('This review has already been claimed by another reviewer.', 409, 'REVIEW_ALREADY_CLAIMED');
      }
      if (current.target_role_id !== user.roleId) {
        throw new AppError('Your current role is not eligible for this review queue.', 403, 'NOT_ELIGIBLE_FOR_REVIEW_QUEUE');
      }
      if (current.created_by === user.id) {
        throw new AppError('Creators cannot claim their own template submissions.', 403, 'SELF_APPROVAL_NOT_ALLOWED');
      }
      throw new AppError('Unable to claim template review.', 409, 'CLAIM_FAILED');
    }

    // Log TEMPLATE_REVIEW_CLAIMED audit event ONLY after successful atomic claim
    db.prepare(`
      INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
      VALUES (?, ?, ?, ?, ?, 'Claimed', ?, ?)
    `).run(
      `aud-t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      templateId,
      templateRow.name,
      user.name,
      user.role,
      `Claimed template review from Target Role Queue (${user.role}).`,
      now
    );

    return dbRepository.getTemplateById(templateId)!;
  },

  // 4. Reject Template
  rejectTemplate(user: ServerUser, templateId: string, reason: string) {
    user = authorizationService.requirePermission(user, 'template_approvals.reject');
    if (!reason || !reason.trim()) {
      throw new AppError('Please provide a reason for rejecting the template.', 400, 'REASON_REQUIRED');
    }

    const template = dbRepository.getTemplateById(templateId);
    if (!template) throw new AppError('Template not found.', 404, 'NOT_FOUND');

    if (template.status !== 'Pending Approval') {
      throw new AppError('This template is no longer awaiting approval.', 400, 'INVALID_STATUS');
    }

    if (template.requestedApprovalFromUserId !== user.id) {
      throw new AppError('You are not authorized to reject this template request.', 403, 'FORBIDDEN');
    }

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE report_templates
        SET status = 'Rejected', rejection_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(reason, now, templateId);

      db.prepare(`
        INSERT INTO template_audit_history (id, template_id, template_name, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, ?, 'Rejected', ?, ?)
      `).run(`aud-t-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, templateId, template.name, user.name, user.role, `Rejected template. Reason: "${reason}"`, now);

      db.prepare(`
        INSERT INTO notifications (id, recipient_user_id, type, title, message, related_template_id, is_read, created_at)
        VALUES (?, ?, 'template_rejected', 'Report Template Revision Requested', ?, ?, 0, ?)
      `).run(
        `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        template.createdById,
        `${user.name} requested changes on your template "${template.name}". Reason: ${reason}`,
        templateId,
        now
      );
    });

    transaction();
    return dbRepository.getTemplateById(templateId);
  },

  // 5. Instantiate Report Instance from Template
  createReportInstance(user: ServerUser, templateId: string, initialData?: Record<string, any>, initialTitle?: string) {
    user = authorizationService.requirePermission(user, 'reports.create');
    const template = dbRepository.getTemplateById(templateId);
    if (!template) throw new AppError('Template not found.', 404, 'NOT_FOUND');
    if (template.status !== 'Approved') {
      throw new AppError('Only approved report templates can be used to generate reports.', 400, 'NOT_APPROVED');
    }

    const now = new Date().toISOString();
    const reportId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const category = db.prepare(`SELECT name FROM report_template_categories WHERE id = ?`).get(template.categoryId) as any;
    const categoryName = category?.name || 'General';
    const defaultTitle = `${user.name} - ${template.name} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const reportTitle = (initialTitle && initialTitle.trim()) || defaultTitle;

    const versionRow = db.prepare(`
      SELECT id, version FROM report_template_versions
      WHERE template_id = ? AND version = ?
    `).get(template.id, template.version || 'v1.0') as any;

    let versionId = versionRow?.id;
    if (!versionId) {
      versionId = `ver-${template.id}-${template.version || 'v1.0'}`;
      const snapshotJson = JSON.stringify(template);
      db.prepare(`
        INSERT OR IGNORE INTO report_template_versions (id, template_id, version, schema_snapshot_json, created_by, created_at, published_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Approved')
      `).run(versionId, template.id, template.version || 'v1.0', snapshotJson, user.id, now, now);
    }

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO reports (
          id, template_id, template_version_id, template_name, template_version, title, category_id, category_name,
          created_by, created_by_name, created_by_role, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?)
      `).run(
        reportId,
        template.id,
        versionId,
        template.name,
        template.version || 'v1.0',
        reportTitle,
        template.categoryId,
        categoryName,
        user.id,
        user.name,
        user.role,
        now,
        now
      );

      db.prepare(`
        INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, 'Created', 'Created report instance from approved template.', ?)
      `).run(`aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, reportId, user.name, user.role, now);

      if (initialData && typeof initialData === 'object' && Object.keys(initialData).length > 0) {
        const dbTemplateFields = db.prepare(`
          SELECT id, field_key FROM report_template_fields
          WHERE template_id = ?
        `).all(template.id) as any[];

        const fieldByIdMap = new Map<string, any>();
        const fieldByKeyMap = new Map<string, any>();
        dbTemplateFields.forEach((f: any) => {
          fieldByIdMap.set(f.id, f);
          if (f.field_key) fieldByKeyMap.set(f.field_key, f);

          let cur = f.id;
          while (cur.includes('-')) {
            cur = cur.substring(cur.indexOf('-') + 1);
            fieldByIdMap.set(cur, f);
          }
        });

        const canonicalValuesMap = new Map<string, any>();
        for (const [key, val] of Object.entries(initialData)) {
          const targetField = fieldByIdMap.get(key) || fieldByKeyMap.get(key);
          if (!targetField) continue;
          const fieldDbId = targetField.id;
          if (canonicalValuesMap.has(fieldDbId)) continue;
          canonicalValuesMap.set(fieldDbId, val);
        }

        const upsertVal = db.prepare(`
          INSERT INTO report_field_values (id, report_id, template_field_id, value_text, value_number)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(report_id, template_field_id)
          DO UPDATE SET
            value_text = excluded.value_text,
            value_number = excluded.value_number
        `);

        for (const [fieldDbId, val] of canonicalValuesMap.entries()) {
          const isEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
          if (!isEmpty) {
            const isNum = typeof val === 'number';
            const valStr = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
            upsertVal.run(
              `val-${reportId}-${fieldDbId}`,
              reportId,
              fieldDbId,
              isNum ? null : valStr,
              isNum ? Number(val) : null
            );
          }
        }
      }
    });

    transaction();
    return dbRepository.getReportById(reportId);
  },

  // 6. Update Report Instance
  updateReportInstance(user: ServerUser, reportId: string, payload: any) {
    user = authorizationService.requirePermission(user, payload?.markAsCompleted ? 'reports.complete' : 'reports.edit_draft');
    const { data, title, markAsCompleted } = payload;
    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    if (report.createdById !== user.id) {
      throw new AppError('You are not authorized to edit this report.', 403, 'FORBIDDEN');
    }

    if (report.status === 'Signed') {
      throw new AppError('This report has already been digitally signed and locked.', 400, 'LOCKED');
    }

    const template = (report as any).templateSnapshot || dbRepository.getTemplateById(report.templateId);
    const evalResult = evaluateTemplateRulesAndCalculations(template, data || {});

    // Merge calculated values into data payload
    const mergedData = { ...(data || {}), ...evalResult.calculatedValues };

    const fieldsToValidate = template?.components || template?.fields || [];
    if (markAsCompleted && fieldsToValidate.length > 0) {
      const missingFields = fieldsToValidate.filter((f: any) => {
        if (f.type === 'heading' || f.type === 'paragraph' || f.type === 'divider' || f.type === 'spacer') return false;
        const fieldKey = f.key || f.id;
        const compState = evalResult.componentStates[fieldKey] || evalResult.componentStates[f.id] || { visible: true, required: Boolean(f.required) };
        if (!compState.visible || !compState.required) return false;
        const val = mergedData[fieldKey] !== undefined ? mergedData[fieldKey] : mergedData[f.id];
        return val === undefined || val === null || String(val).trim() === '';
      });

      if (missingFields.length > 0) {
        throw new AppError(
          `Please fill all required fields before completing: ${missingFields.map((f: any) => f.label || f.key || f.id).join(', ')}`,
          400,
          'REQUIRED_FIELDS_MISSING'
        );
      }
    }

    const now = new Date().toISOString();
    const newStatus = markAsCompleted ? 'Completed' : report.status === 'Returned' ? 'Completed' : report.status;
    const updatedTitle = title || report.title;

    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE reports
        SET title = ?, status = ?, updated_at = ?
        WHERE id = ?
      `).run(updatedTitle, newStatus, now, reportId);

      if (data && typeof data === 'object') {
        const dbTemplateFields = db.prepare(`
          SELECT id, field_key FROM report_template_fields
          WHERE template_id = ?
        `).all(report.templateId) as any[];

        const fieldByIdMap = new Map<string, any>();
        const fieldByKeyMap = new Map<string, any>();
        dbTemplateFields.forEach((f: any) => {
          fieldByIdMap.set(f.id, f);
          if (f.field_key) fieldByKeyMap.set(f.field_key, f);

          let cur = f.id;
          while (cur.includes('-')) {
            cur = cur.substring(cur.indexOf('-') + 1);
            fieldByIdMap.set(cur, f);
          }
        });

        const canonicalValuesMap = new Map<string, any>();

        for (const [key, val] of Object.entries(mergedData)) {
          const targetField = fieldByIdMap.get(key) || fieldByKeyMap.get(key);
          if (!targetField) continue;
          const fieldDbId = targetField.id;

          if (canonicalValuesMap.has(fieldDbId)) {
            const existingVal = canonicalValuesMap.get(fieldDbId);
            const normExisting = typeof existingVal === 'object' && existingVal !== null ? JSON.stringify(existingVal) : String(existingVal ?? '');
            const normNew = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');

            if (normExisting !== normNew) {
              const displayKey = targetField.field_key || targetField.id;
              throw new AppError(
                `Duplicate value submitted for field ${displayKey}.`,
                400,
                'DUPLICATE_FIELD_VALUE'
              );
            }
            continue;
          }

          canonicalValuesMap.set(fieldDbId, val);
        }

        const upsertVal = db.prepare(`
          INSERT INTO report_field_values (id, report_id, template_field_id, value_text, value_number)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(report_id, template_field_id)
          DO UPDATE SET
            value_text = excluded.value_text,
            value_number = excluded.value_number
        `);

        for (const [fieldDbId, val] of canonicalValuesMap.entries()) {
          const isEmpty = val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
          if (isEmpty) {
            db.prepare(`DELETE FROM report_field_values WHERE report_id = ? AND template_field_id = ?`).run(reportId, fieldDbId);
          } else {
            const isNum = typeof val === 'number';
            const valStr = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
            upsertVal.run(
              `val-${reportId}-${fieldDbId}`,
              reportId,
              fieldDbId,
              isNum ? null : valStr,
              isNum ? Number(val) : null
            );
          }
        }
      }

      db.prepare(`
        INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        reportId,
        user.name,
        user.role,
        markAsCompleted ? 'Completed' : 'Draft Saved',
        markAsCompleted ? 'Validated required fields and marked report completed.' : 'Saved draft report updates.',
        now
      );
    });

    transaction();
    return dbRepository.getReportById(reportId);
  },

  // 7. Send Report to Recipient
  sendReport(user: ServerUser, reportId: string, recipientUserId: string, senderNote?: string, senderSignaturePayload?: any) {
    user = authorizationService.requirePermission(user, 'reports.send');
    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    if (report.createdById !== user.id) {
      throw new AppError('Only the report author can send this report for review.', 403, 'FORBIDDEN');
    }

    if (recipientUserId === user.id) {
      throw new AppError('You cannot send a report to yourself.', 400, 'SELF_SEND_FORBIDDEN');
    }

    if (report.status !== 'Draft' && report.status !== 'Completed' && report.status !== 'Returned' && report.status !== 'Sent') {
      throw new AppError('Only draft or completed reports can be sent for review.', 400, 'INVALID_STATUS');
    }

    const recipient = dbRepository.getUserById(recipientUserId) as any;
    if (!recipient) throw new AppError('Target recipient not found.', 404, 'NOT_FOUND');
    if ((recipient.status || 'Active') !== 'Active') {
      throw new AppError('This user is not available for new workflow assignments.', 400, 'RECIPIENT_UNAVAILABLE');
    }

    // Inspect immutable template version snapshot or template definition
    const template = (report as any).templateSnapshot || dbRepository.getTemplateById(report.templateId);
    const components: any[] = extractTemplateComponents(template);
    const senderSigComps = components.filter((c: any) => c.type === 'signature' && (c.signatureConfig?.signatureRole || c.signatureRole || '').toLowerCase() === 'sender');

    const hasSenderSigRequirement = senderSigComps.length > 0;
    const existingActiveSenderSig = (report.activeSignatures || []).find((s: any) => s.signatureRole === 'sender');
    if (hasSenderSigRequirement && !existingActiveSenderSig) {
      authorizationService.requirePermission(user, 'reports.sign');
    }

    const now = new Date().toISOString();

    const transaction = db.transaction(() => {
      // If Sender Signature is required AND no active Sender signature exists:
      if (hasSenderSigRequirement && !existingActiveSenderSig) {
        const sigProfile = dbRepository.getUserSignatureProfile(user.id);
        if (!sigProfile && !senderSignaturePayload) {
          throw new AppError('You need to create your signature before signing and sending this report.', 400, 'SIGNATURE_PROFILE_REQUIRED');
        }

        const signatureMethod = senderSignaturePayload?.signatureMethod || sigProfile?.method || 'typed';
        const typedName = senderSignaturePayload?.typedName || sigProfile?.typedName || user.name;
        const signatureDataUrl = senderSignaturePayload?.signatureDataUrl || sigProfile?.drawingReference || sigProfile?.assetReference || null;
        const confirmationStatement = senderSignaturePayload?.confirmationStatement || 'By continuing, I confirm that I reviewed this report and intend to sign and send it.';

        const canonicalContent = JSON.stringify({
          reportId: report.id,
          templateId: report.templateId,
          templateVersion: report.templateVersion || 'v1.0',
          title: report.title,
          data: report.data || {},
          signatureRole: 'sender',
          signerUserId: user.id,
          signerName: user.name,
          signerRole: user.role,
        });
        const signedContentHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');
        const verificationId = `SIG-WF-2026-${Math.floor(10000 + Math.random() * 90000)}-${Math.random().toString(36).substring(2, 6)}`;

        senderSigComps.forEach((comp: any, idx: number) => {
          dbRepository.addReportSignatureRecord({
            id: `sigrec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
            reportId,
            componentId: comp.id,
            componentKey: comp.key,
            signedByUserId: user.id,
            signedByName: user.name,
            signedByRole: user.role,
            signatureRole: 'sender',
            signatureMethod,
            typedName,
            signatureDataUrl,
            verificationId: `SIG-WF-2026-${Math.floor(10000 + Math.random() * 90000)}-${Math.random().toString(36).substring(2, 6)}`,
            confirmationStatement,
            signedContentHash,
            signedAt: now,
          });
        });

        db.prepare(`
          INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
          VALUES (?, ?, ?, ?, 'Signed & Sent', ?, ?)
        `).run(
          `aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          reportId,
          user.name,
          user.role,
          `Signed & Sent report to ${recipient.name} for review. Verification ID: ${verificationId}`,
          now
        );
      } else {
        db.prepare(`
          INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
          VALUES (?, ?, ?, ?, 'Sent', ?, ?)
        `).run(
          `aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          reportId,
          user.name,
          user.role,
          `Sent report to ${recipient.name} for review & signature.`,
          now
        );
      }

      db.prepare(`
        UPDATE reports
        SET status = 'Sent', sent_to_user_id = ?, sent_to_name = ?, sent_at = ?, sender_note = ?, updated_at = ?
        WHERE id = ?
      `).run(recipient.id, recipient.name, now, senderNote || null, now, reportId);

      db.prepare(`
        INSERT INTO notifications (id, recipient_user_id, type, title, message, related_report_id, is_read, created_at)
        VALUES (?, ?, 'report_received', 'Report Awaiting Your Review', ?, ?, 0, ?)
      `).run(
        `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        recipient.id,
        `${user.name} sent report "${report.title}" for your review & digital sign-off.`,
        reportId,
        now
      );

      const activeWf = dynamicWorkflowService.getActiveWorkflowForTemplate(report.templateId);
      if (activeWf) {
        dynamicWorkflowService.startWorkflowInstance(user, reportId, report.templateId, recipientUserId);
      }
    });

    transaction();
    return dbRepository.getReportById(reportId);
  },

  // 8. Reject Report
  rejectReport(user: ServerUser, reportId: string, reason: string) {
    user = authorizationService.requirePermission(user, 'reports.reject');
    const settings = adminService.getEffectiveConfig().settings;
    if (settings['allow_rejection'] === false || settings['workflow.report_rejection'] === false) {
      throw new AppError('Report rejection is currently disabled by system policy.', 403, 'POLICY_DISABLED');
    }

    if (!reason || !reason.trim()) {
      throw new AppError('A rejection reason is mandatory.', 400, 'REASON_REQUIRED');
    }

    const wfInstance = db.prepare(`SELECT id FROM workflow_instances WHERE report_id = ? AND status IN ('In Progress', 'Returned')`).get(reportId);
    if (wfInstance) {
      return dynamicWorkflowService.executeWorkflowTaskAction(user, reportId, 'Reject', reason);
    }

    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    if (report.sentToId !== user.id) {
      throw new AppError('Only the assigned reviewer can reject this report.', 403, 'FORBIDDEN');
    }

    if (report.createdById === user.id) {
      throw new AppError('Report authors cannot reject their own reports.', 403, 'FORBIDDEN');
    }

    if (report.status !== 'Sent') {
      throw new AppError('Only sent reports awaiting review can be rejected.', 400, 'INVALID_STATUS');
    }

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      db.prepare(`
        UPDATE reports
        SET status = 'Rejected', rejection_reason = ?, rejected_at = ?, updated_at = ?
        WHERE id = ?
      `).run(reason.trim(), now, now, reportId);

      db.prepare(`
        INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, 'Rejected', ?, ?)
      `).run(`aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, reportId, user.name, user.role, reason.trim(), now);

      db.prepare(`
        INSERT INTO notifications (id, recipient_user_id, type, title, message, related_report_id, is_read, created_at)
        VALUES (?, ?, 'report_rejected', 'Report rejected', ?, ?, 0, ?)
      `).run(
        `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        report.createdById,
        `${user.name} rejected "${report.title}". Review the rejection reason.`,
        reportId,
        now
      );
    });

    transaction();
    return dbRepository.getReportById(reportId);
  },

  // 9. Return Report For Changes
  returnReport(user: ServerUser, reportId: string, reason: string) {
    user = authorizationService.requirePermission(user, 'reports.return');
    const settings = adminService.getEffectiveConfig().settings;
    if (settings['allow_return'] === false || settings['workflow.return_for_changes'] === false) {
      throw new AppError('Return for changes is currently disabled by system policy.', 403, 'POLICY_DISABLED');
    }

    if (!reason || !reason.trim()) {
      throw new AppError('Please provide revision instructions when returning a report.', 400, 'REASON_REQUIRED');
    }

    const wfInstance = db.prepare(`SELECT id FROM workflow_instances WHERE report_id = ? AND status IN ('In Progress', 'Returned')`).get(reportId);
    if (wfInstance) {
      dbRepository.supersedeReportSignatures(reportId);
      return dynamicWorkflowService.executeWorkflowTaskAction(user, reportId, 'Return for Changes', reason);
    }

    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    if (report.sentToId !== user.id) {
      throw new AppError('Only the assigned reviewer can return this report.', 403, 'FORBIDDEN');
    }

    if (report.status !== 'Sent') {
      throw new AppError('Only sent reports awaiting review can be returned.', 400, 'INVALID_STATUS');
    }

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      // Mark existing active signatures as superseded when returned for changes
      dbRepository.supersedeReportSignatures(reportId);

      db.prepare(`
        UPDATE reports
        SET status = 'Returned', return_reason = ?, returned_at = ?, updated_at = ?
        WHERE id = ?
      `).run(reason, now, now, reportId);

      db.prepare(`
        INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, 'Returned', ?, ?)
      `).run(`aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, reportId, user.name, user.role, `Returned report for revisions. Feedback: "${reason}"`, now);

      db.prepare(`
        INSERT INTO notifications (id, recipient_user_id, type, title, message, related_report_id, is_read, created_at)
        VALUES (?, ?, 'report_returned', 'Report Returned for Changes', ?, ?, 0, ?)
      `).run(
        `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        report.createdById,
        `${user.name} requested changes on report "${report.title}". Reason: ${reason}`,
        reportId,
        now
      );
    });

    transaction();
    return dbRepository.getReportById(reportId);
  },

  // 9. Sign Report Digitally
  signReport(user: ServerUser, reportId: string, payload: any = {}) {
    user = authorizationService.requirePermission(user, 'reports.sign');
    const settings = adminService.getEffectiveConfig().settings;
    if (settings['digital_signature'] === false || settings['workflow.digital_signature'] === false) {
      throw new AppError('Digital signatures are currently disabled by system policy.', 403, 'POLICY_DISABLED');
    }

    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    if (report.status === 'Signed') {
      throw new AppError('This report has already been signed and locked.', 400, 'LOCKED');
    }

    const signatureRole: 'sender' | 'receiver' = payload?.signatureRole || (report.createdById === user.id ? 'sender' : 'receiver');

    // Access Control & Role Verification
    if (signatureRole === 'sender') {
      if (report.createdById !== user.id) {
        throw new AppError('Only the report author can sign as Sender.', 403, 'FORBIDDEN');
      }
    } else {
      // Receiver Signature
      if (report.sentToId !== user.id && report.createdById === user.id) {
        throw new AppError('Report authors are not permitted to digitally sign as Reviewer/Receiver on their own reports.', 403, 'SELF_SIGN_FORBIDDEN');
      }

      // Receiver Signing Gate: Verify required active Sender Signature exists if template requires it
      const template = (report as any).templateSnapshot || dbRepository.getTemplateById(report.templateId);
      const components: any[] = extractTemplateComponents(template);
      const hasSenderSigRequirement = components.some((c: any) => c.type === 'signature' && (c.signatureConfig?.signatureRole || c.signatureRole || '').toLowerCase() === 'sender');

      if (hasSenderSigRequirement) {
        const activeSenderSig = (report.activeSignatures || []).find((s: any) => s.signatureRole === 'sender');
        if (!activeSenderSig) {
          throw new AppError('Sender signature is required before this report can be signed.', 403, 'SENDER_SIGNATURE_REQUIRED');
        }
      }
    }

    // Replay / Double-Click Protection: Re-use existing active signature if already recorded
    const existingActiveSig = db.prepare(`
      SELECT id FROM report_signature_audit
      WHERE report_id = ? AND signature_role = ? AND is_active = 1
    `).get(reportId, signatureRole);

    if (existingActiveSig) {
      return dbRepository.getReportById(reportId);
    }

    // Get signer's signature profile
    const sigProfile = dbRepository.getUserSignatureProfile(user.id);
    const signatureMethod: 'uploaded' | 'drawn' | 'typed' = payload?.signatureMethod || sigProfile?.method || 'typed';
    const typedName = payload?.typedName || sigProfile?.typedName || user.name;
    const signatureDataUrl = payload?.signatureDataUrl || sigProfile?.drawingReference || sigProfile?.assetReference || null;
    const confirmationStatement = payload?.confirmationStatement || (signatureRole === 'sender'
      ? 'I confirm that the information in this report is complete and accurate.'
      : 'I confirm that I reviewed this report and approve/sign this business record.');

    // Compute deterministic SHA-256 canonical content hash
    const canonicalContent = JSON.stringify({
      reportId: report.id,
      templateId: report.templateId,
      templateVersion: report.templateVersion,
      title: report.title,
      data: report.data || {},
    });
    const signedContentHash = crypto.createHash('sha256').update(canonicalContent).digest('hex');
    const verificationId = `SIG-WF-2026-${Math.floor(10000 + Math.random() * 90000)}-${Math.random().toString(36).substring(2, 6)}`;

    const wfInstance = db.prepare(`SELECT id FROM workflow_instances WHERE report_id = ? AND status IN ('In Progress', 'Returned')`).get(reportId);

    const now = new Date().toISOString();
    const transaction = db.transaction(() => {
      dbRepository.addReportSignatureRecord({
        id: `sigrec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        reportId,
        componentId: payload?.componentId,
        componentKey: payload?.componentKey,
        signedByUserId: user.id,
        signedByName: user.name,
        signedByRole: user.role,
        signatureRole,
        signatureMethod,
        typedName,
        signatureDataUrl,
        verificationId,
        confirmationStatement,
        signedContentHash,
        signedAt: now,
      });

      if (signatureRole === 'sender' && report.status === 'Draft') {
        db.prepare(`
          UPDATE reports
          SET status = 'Completed', updated_at = ?
          WHERE id = ?
        `).run(now, reportId);
      } else if (signatureRole === 'receiver' || !wfInstance) {
        db.prepare(`
          UPDATE reports
          SET status = 'Signed', updated_at = ?
          WHERE id = ?
        `).run(now, reportId);
      }

      db.prepare(`
        INSERT INTO report_audit_history (id, report_id, person_name, role, action, comment, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `aud-r-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        reportId,
        user.name,
        user.role,
        signatureRole === 'sender' ? 'Signed (Sender)' : 'Signed (Receiver)',
        `Applied ${signatureRole} report signature (${signatureMethod}) with verification ID ${verificationId}.`,
        now
      );

      if (signatureRole === 'receiver' && report.createdById !== user.id) {
        db.prepare(`
          INSERT INTO notifications (id, recipient_user_id, type, title, message, related_report_id, is_read, created_at)
          VALUES (?, ?, 'report_signed', 'Report Digitally Signed!', ?, ?, 0, ?)
        `).run(
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          report.createdById,
          `${user.name} signed report "${report.title}". Verification ID: ${verificationId}`,
          reportId,
          now
        );
      }
    });

    transaction();

    if (wfInstance && signatureRole === 'receiver') {
      return dynamicWorkflowService.executeWorkflowTaskAction(user, reportId, 'Sign', 'Signed document digitally', verificationId);
    }

    return dbRepository.getReportById(reportId);
  },

  // 10. Add Template Comment
  addTemplateComment(user: ServerUser, templateId: string, message: string) {
    user = authorizationService.requirePermission(user, 'template_approvals.comment');
    if (!message || !message.trim()) {
      throw new AppError('Comment message cannot be empty.', 400, 'MESSAGE_REQUIRED');
    }

    const template = dbRepository.getTemplateById(templateId);
    if (!template) throw new AppError('Template not found.', 404, 'NOT_FOUND');

    const now = new Date().toISOString();
    const cmtId = `cmt-${Date.now()}`;

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO template_comments (id, template_id, user_id, user_name, user_role, user_avatar, message, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cmtId, templateId, user.id, user.name, user.role, user.name.split(' ').map((n: string) => n[0]).join(''), message, now);

      const recipientId = template.createdById === user.id ? template.requestedApprovalFromUserId : template.createdById;
      if (recipientId && recipientId !== user.id) {
        db.prepare(`
          INSERT INTO notifications (id, recipient_user_id, type, title, message, related_template_id, is_read, created_at)
          VALUES (?, ?, 'comment_added', 'New Template Request Comment', ?, ?, 0, ?)
        `).run(
          `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          recipientId,
          `${user.name} commented on template "${template.name}": "${message}"`,
          templateId,
          now
        );
      }
    });

    transaction();
    return dbRepository.getTemplateComments(templateId);
  },

  // 11. Add Report Comment
  addReportComment(user: ServerUser, reportId: string, message: string) {
    user = authorizationService.requirePermission(user, 'reports.comment');
    if (!message || !message.trim()) {
      throw new AppError('Comment message cannot be empty.', 400, 'MESSAGE_REQUIRED');
    }

    const report = dbRepository.getReportById(reportId);
    if (!report) throw new AppError('Report not found.', 404, 'NOT_FOUND');

    const now = new Date().toISOString();
    const cmtId = `rcmt-${Date.now()}`;

    const transaction = db.transaction(() => {
      db.prepare(`
        INSERT INTO report_comments (id, report_id, user_id, user_name, user_role, user_avatar, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(cmtId, reportId, user.id, user.name, user.role, user.name.split(' ').map((n: string) => n[0]).join(''), message, now);

      const recipientId = report.createdById === user.id ? report.sentToId : report.createdById;
      if (recipientId && recipientId !== user.id) {
        db.prepare(`
          INSERT INTO notifications (id, recipient_user_id, type, title, message, related_report_id, is_read, created_at)
          VALUES (?, ?, 'comment_added', 'New Report Discussion Comment', ?, ?, 0, ?)
        `).run(
          `notif-${Date.now()}`,
          recipientId,
          `${user.name} commented on report "${report.title}": "${message}"`,
          reportId,
          now
        );
      }
    });

    transaction();
    return dbRepository.getReportComments(reportId);
  },

  // 12. Create New Template Version
  createNewTemplateVersion(user: ServerUser, templateId: string) {
    user = authorizationService.requirePermission(user, 'templates.create');
    const template = dbRepository.getTemplateById(templateId);
    if (!template) throw new AppError('Template not found.', 404, 'NOT_FOUND');

    const currentVerStr = template.version || 'v1.0';
    const match = currentVerStr.match(/v?(\d+)\.(\d+)/);
    let newVerStr = 'v1.1';
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10) + 1;
      newVerStr = `v${major}.${minor}`;
    }

    const newTemplateId = `tpl-${Date.now()}`;
    const now = new Date().toISOString();

    const newDraftPayload = {
      ...template,
      id: newTemplateId,
      name: template.name,
      version: newVerStr,
      status: 'Draft',
      createdById: user.id,
      createdByName: user.name,
      createdByRole: user.role,
      requestedApprovalFromUserId: null,
      requestedApprovalFromName: null,
      submittedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };

    return this.saveTemplateDraft(user, newDraftPayload);
  },
};
