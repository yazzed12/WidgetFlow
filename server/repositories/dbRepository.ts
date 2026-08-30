import { db } from '../db/database.js';
import { adminService } from '../services/adminService.js';
import { normalizeTableComponent } from '../../src/shared/table-v2/index.js';
import { authorizationService } from '../services/authorizationService.js';

export const dbRepository = {
  // Users
  getUsers(options?: { activeOnly?: boolean }) {
    const ids = db.prepare(`
      SELECT u.id FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      ${options?.activeOnly ? "WHERE COALESCE(u.status, 'Active') = 'Active' AND COALESCE(r.is_active, 1) = 1" : ''}
      ORDER BY u.name
    `).all() as Array<{ id: string }>;
    return ids.map(({ id }) => authorizationService.resolveUser(id)).filter(Boolean);
  },

  getUserById(id: string) {
    return authorizationService.resolveUser(id);
  },

  // Categories
  getCategories() {
    const categories = db.prepare(`SELECT id, name, description, status FROM report_template_categories WHERE status = 'Active' OR status IS NULL`).all() as any[];
    return categories.map((cat) => {
      const templateCount = db.prepare(`
        SELECT COUNT(*) as count FROM report_templates WHERE category_id = ? AND status = 'Approved'
      `).get(cat.id) as { count: number };
      return { ...cat, templateCount: templateCount.count };
    });
  },

  // Templates
  getTemplates(filter?: { status?: string; categoryId?: string; search?: string }) {
    let sql = `
      SELECT t.id, t.name, t.description, t.category_id as categoryId, t.version, t.status,
             t.created_by as createdById, t.created_by_name as createdByName, t.created_by_role as createdByRole,
             t.requested_approval_from_user_id as requestedApprovalFromUserId,
             t.requested_approval_from_name as requestedApprovalFromName,
             t.target_role_id as targetRoleId,
             t.assignment_strategy_snapshot as assignmentStrategySnapshot,
             t.claimed_at as claimedAt,
             t.submitted_at as submittedAt, t.rejection_reason as rejectionReason,
             t.rules_json as rules_json, t.calculations_json as calculations_json,
             t.created_at as createdAt, t.updated_at as updatedAt
      FROM report_templates t
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.status) {
      sql += ` AND t.status = ?`;
      params.push(filter.status);
    }
    if (filter?.categoryId) {
      sql += ` AND t.category_id = ?`;
      params.push(filter.categoryId);
    }
    if (filter?.search) {
      sql += ` AND (t.name LIKE ? OR t.description LIKE ?)`;
      params.push(`%${filter.search}%`, `%${filter.search}%`);
    }

    sql += ` ORDER BY t.updated_at DESC`;

    const templates = db.prepare(sql).all(...params) as any[];

    return templates.map((t) => this.hydrateTemplate(t));
  },

  getTemplateById(id: string) {
    const t = db.prepare(`
      SELECT t.id, t.name, t.description, t.category_id as categoryId, t.version, t.status,
             t.created_by as createdById, t.created_by_name as createdByName, t.created_by_role as createdByRole,
             t.requested_approval_from_user_id as requestedApprovalFromUserId,
             t.requested_approval_from_name as requestedApprovalFromName,
             t.target_role_id as targetRoleId,
             t.assignment_strategy_snapshot as assignmentStrategySnapshot,
             t.claimed_at as claimedAt,
             t.submitted_at as submittedAt, t.rejection_reason as rejectionReason,
             t.rules_json as rules_json, t.calculations_json as calculations_json, t.theme_json as theme_json,
             t.created_at as createdAt, t.updated_at as updatedAt
      FROM report_templates t
      WHERE t.id = ?
    `).get(id) as any;

    if (!t) return null;
    return this.hydrateTemplate(t);
  },

  hydrateTemplate(t: any) {
    const tags = (db.prepare(`SELECT tag FROM report_template_tags WHERE template_id = ?`).all(t.id) as any[]).map((r) => r.tag);

    const dbSections = db.prepare(`
      SELECT id, name, display_order FROM report_template_sections WHERE template_id = ? ORDER BY display_order ASC
    `).all(t.id) as any[];

    const sectionNames = dbSections.map((r) => r.name);

    const fields = db.prepare(`
      SELECT id, template_id, section_id, section_name as section, field_key as key, label, field_type as type,
             required, placeholder, description, default_value as defaultValue,
             layout_width as layoutWidth, validation_rules_json as validationJson,
             options_json as optionsJson, display_order as displayOrder
      FROM report_template_fields
      WHERE template_id = ?
      ORDER BY display_order ASC
    `).all(t.id) as any[];

    const hydratedFields = fields.map((f, idx) => {
      const fieldKey = f.key || f.id;
      const options = f.optionsJson ? JSON.parse(f.optionsJson) : undefined;
      const valExt = f.validationJson ? JSON.parse(f.validationJson) : {};
      const width = (f.layoutWidth || 'full') as 'full' | 'half' | 'third';

      const rawComp = {
        id: f.id,
        key: fieldKey,
        label: f.label,
        type: f.type,
        required: Boolean(f.required),
        placeholder: f.placeholder || undefined,
        description: f.description || undefined,
        defaultValue: f.defaultValue || undefined,
        options,
        section: f.section || 'General',
        layoutWidth: width,
        layout: { width },
        order: f.displayOrder ?? idx,
        ...valExt,
      };

      if (rawComp.type === 'table') {
        return normalizeTableComponent(rawComp);
      }

      return rawComp;
    });

    // Group components into dynamicSections
    const sectionMap = new Map<string, any>();
    if (dbSections.length > 0) {
      dbSections.forEach((s, idx) => {
        sectionMap.set(s.name, {
          id: s.id || `sec-${idx}`,
          title: s.name,
          order: s.display_order ?? idx,
          components: [],
        });
      });
    }

    hydratedFields.forEach((comp) => {
      const secName = comp.section || 'General';
      if (!sectionMap.has(secName)) {
        sectionMap.set(secName, {
          id: `sec-${sectionMap.size}`,
          title: secName,
          order: sectionMap.size,
          components: [],
        });
      }
      sectionMap.get(secName).components.push(comp);
    });

    const dynamicSections = Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);

    let rules: any[] = [];
    let calculations: any[] = [];
    let theme: any = undefined;
    try {
      rules = t.rules_json ? JSON.parse(t.rules_json) : [];
    } catch {}
    try {
      calculations = t.calculations_json ? JSON.parse(t.calculations_json) : [];
    } catch {}
    try {
      theme = t.theme_json ? JSON.parse(t.theme_json) : undefined;
    } catch {}

    return {
      ...t,
      tags,
      theme,
      sections: sectionNames.length > 0 ? sectionNames : ['General'],
      dynamicSections,
      fields: hydratedFields,
      components: hydratedFields,
      rules,
      calculations,
    };
  },

  getPendingApprovalsForUser(userId: string) {
    const user = authorizationService.resolveUser(userId);
    if (!user || !user.status || user.status !== 'Active') {
      return [];
    }
    if (!authorizationService.hasPermission(user, 'template_approvals.view')) {
      return [];
    }

    const hasApprovePermission = authorizationService.hasPermission(user, 'template_approvals.approve');

    let sql = `
      SELECT t.id, t.name, t.description, t.category_id as categoryId, t.version, t.status,
             t.created_by as createdById, t.created_by_name as createdByName, t.created_by_role as createdByRole,
             t.requested_approval_from_user_id as requestedApprovalFromUserId,
             t.requested_approval_from_name as requestedApprovalFromName,
             t.target_role_id as targetRoleId,
             t.assignment_strategy_snapshot as assignmentStrategySnapshot,
             t.claimed_at as claimedAt,
             t.submitted_at as submittedAt, t.rejection_reason as rejectionReason,
             t.created_at as createdAt, t.updated_at as updatedAt
      FROM report_templates t
      WHERE t.status = 'Pending Approval'
        AND (
          t.requested_approval_from_user_id = ?
    `;

    const params: any[] = [userId];

    if (hasApprovePermission) {
      sql += `
          OR (
            t.assignment_strategy_snapshot = 'ROLE_QUEUE'
            AND t.requested_approval_from_user_id IS NULL
            AND t.target_role_id = ?
            AND t.created_by != ?
          )
      `;
      params.push(user.roleId, userId);
    }

    sql += `
        )
      ORDER BY t.updated_at DESC
    `;

    const templates = db.prepare(sql).all(...params) as any[];

    return templates.map((t) => this.hydrateTemplate(t));
  },

  // Reports
  getReports(filter?: { mine?: boolean; received?: boolean; status?: string }, userId?: string) {
    let sql = `
      SELECT r.id, r.template_id as templateId, r.template_name as templateName, r.template_version as templateVersion, r.title,
             r.category_id as categoryId, r.category_name as categoryName,
             r.created_by as createdById, r.created_by_name as createdByName, r.created_by_role as createdByRole,
             r.status, r.sent_to_user_id as sentToId, r.sent_to_name as sentToName,
             r.sent_at as sentAt, r.sender_note as senderNote, r.return_reason as returnReason,
             r.returned_at as returnedAt, r.rejection_reason as rejectionReason, r.rejected_at as rejectedAt,
             r.created_at as createdAt, r.updated_at as updatedAt
      FROM reports r
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filter?.mine && userId) {
      sql += ` AND r.created_by = ?`;
      params.push(userId);
    } else if (filter?.received && userId) {
      sql += ` AND r.sent_to_user_id = ?`;
      params.push(userId);
    } else if (userId) {
      // Accessible reports
      const canViewOrganization = authorizationService.hasPermission(userId, 'reports.view_organization');
      if (!canViewOrganization) {
        sql += ` AND (r.created_by = ? OR r.sent_to_user_id = ?)`;
        params.push(userId, userId);
      }
    }

    if (filter?.status) {
      sql += ` AND r.status = ?`;
      params.push(filter.status);
    }

    sql += ` ORDER BY r.updated_at DESC`;

    const reports = db.prepare(sql).all(...params) as any[];
    return reports.map((r) => this.hydrateReport(r));
  },

  getReportById(id: string) {
    const r = db.prepare(`
      SELECT r.id, r.template_id as templateId, r.template_name as templateName, r.template_version as templateVersion, r.title,
             r.category_id as categoryId, r.category_name as categoryName,
             r.created_by as createdById, r.created_by_name as createdByName, r.created_by_role as createdByRole,
             r.status, r.sent_to_user_id as sentToId, r.sent_to_name as sentToName,
             r.sent_at as sentAt, r.sender_note as senderNote, r.return_reason as returnReason,
             r.returned_at as returnedAt, r.rejection_reason as rejectionReason, r.rejected_at as rejectedAt,
             r.created_at as createdAt, r.updated_at as updatedAt
      FROM reports r
      WHERE r.id = ?
    `).get(id) as any;

    if (!r) return null;
    return this.hydrateReport(r);
  },

  hydrateReport(r: any) {
    // Field values map
    const values = db.prepare(`
      SELECT rfv.template_field_id, rfv.value_text, rfv.value_number, rtf.field_key
      FROM report_field_values rfv
      LEFT JOIN report_template_fields rtf ON rtf.id = rfv.template_field_id
      WHERE rfv.report_id = ?
    `).all(r.id) as any[];

    const data: Record<string, any> = {};
    values.forEach((v) => {
      let val = v.value_number !== null ? v.value_number : v.value_text !== null ? v.value_text : '';
      if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
        try {
          val = JSON.parse(val);
        } catch {}
      }
      data[v.template_field_id] = val;
      if (v.field_key) {
        data[v.field_key] = val;
      }
      let cur = v.template_field_id;
      while (cur && cur.includes('-')) {
        cur = cur.substring(cur.indexOf('-') + 1);
        data[cur] = val;
      }
    });

    // Report Signatures
    let auditSignatures: any[] = [];
    try {
      auditSignatures = db.prepare(`
        SELECT id, report_id as reportId, component_id as componentId, component_key as componentKey,
               signed_by_user_id as signedByUserId, signed_by_name as signedByName, signed_by_role as signedByRole,
               signature_role as signatureRole, signature_method as signatureMethod, typed_name as typedName,
               signature_data_url as signatureDataUrl, verification_id as verificationId,
               confirmation_statement as confirmationStatement, signed_content_hash as signedContentHash,
               is_active as isActive, signed_at as signedAt
        FROM report_signature_audit
        WHERE report_id = ?
        ORDER BY signed_at ASC
      `).all(r.id) as any[];
    } catch {}

    const sig = db.prepare(`
      SELECT id, report_id as reportId, signed_by_user_id as signedByUserId,
             signed_by_name as signedByName, signed_by_role as signedByRole,
             verification_id as verificationId, signed_at as signedAt
      FROM digital_signatures
      WHERE report_id = ?
    `).get(r.id) as any;

    // Audit History
    const auditHistory = db.prepare(`
      SELECT id, report_id as reportId, person_name as personName, role, action, comment, timestamp
      FROM report_audit_history
      WHERE report_id = ?
      ORDER BY timestamp ASC
    `).all(r.id) as any[];

    let templateSnapshot: any = null;
    if (r.template_version_id || r.templateId) {
      const verRow = r.template_version_id
        ? (db.prepare(`SELECT schema_snapshot_json FROM report_template_versions WHERE id = ?`).get(r.template_version_id) as any)
        : (db.prepare(`SELECT schema_snapshot_json FROM report_template_versions WHERE template_id = ? AND version = ?`).get(r.templateId, r.templateVersion || 'v1.0') as any);
      if (verRow?.schema_snapshot_json) {
        try {
          templateSnapshot = JSON.parse(verRow.schema_snapshot_json);
        } catch {}
      }
    }

    const activeSignatures = this.getReportSignatureRecords(r.id, true);
    const signatureHistory = this.getReportSignatureRecords(r.id, false);

    return {
      ...r,
      data,
      values: data,
      templateSnapshot,
      signature: sig || undefined,
      activeSignatures,
      signatureHistory,
      auditHistory,
    };
  },

  // User Signature Profiles
  getUserSignatureProfile(userId: string) {
    const row = db.prepare(`
      SELECT id, user_id as userId, method, asset_reference as assetReference,
             drawing_reference as drawingReference, typed_name as typedName,
             created_at as createdAt, updated_at as updatedAt, is_active as isActive
      FROM user_signature_profiles
      WHERE user_id = ? AND is_active = 1
    `).get(userId) as any;
    if (!row) return null;
    return { ...row, isActive: Boolean(row.isActive) };
  },

  saveUserSignatureProfile(userId: string, data: { method: 'uploaded' | 'drawn' | 'typed'; assetReference?: string; drawingReference?: string; typedName?: string }) {
    const existing = db.prepare(`SELECT id FROM user_signature_profiles WHERE user_id = ?`).get(userId) as any;
    const now = new Date().toISOString();
    if (existing) {
      db.prepare(`
        UPDATE user_signature_profiles
        SET method = ?, asset_reference = ?, drawing_reference = ?, typed_name = ?, updated_at = ?
        WHERE user_id = ?
      `).run(data.method, data.assetReference || null, data.drawingReference || null, data.typedName || null, now, userId);
    } else {
      const id = `sigprof-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      db.prepare(`
        INSERT INTO user_signature_profiles (id, user_id, method, asset_reference, drawing_reference, typed_name, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(id, userId, data.method, data.assetReference || null, data.drawingReference || null, data.typedName || null, now, now);
    }
    return this.getUserSignatureProfile(userId);
  },

  // Report Signature Audit
  getReportSignatureRecords(reportId: string, activeOnly = false) {
    let sql = `
      SELECT id, report_id as reportId, component_id as componentId, component_key as componentKey,
             signed_by_user_id as signedByUserId, signed_by_name as signedByName, signed_by_role as signedByRole,
             signature_role as signatureRole, signature_method as signatureMethod, typed_name as typedName,
             signature_data_url as signatureDataUrl, verification_id as verificationId,
             confirmation_statement as confirmationStatement, signed_content_hash as signedContentHash,
             is_active as isActive, signed_at as signedAt
      FROM report_signature_audit
      WHERE report_id = ?
    `;
    if (activeOnly) {
      sql += ` AND is_active = 1`;
    }
    sql += ` ORDER BY signed_at ASC`;
    const rows = db.prepare(sql).all(reportId) as any[];
    return rows.map((r) => ({ ...r, isActive: Boolean(r.isActive) }));
  },

  addReportSignatureRecord(record: {
    id: string;
    reportId: string;
    componentId?: string;
    componentKey?: string;
    signedByUserId: string;
    signedByName: string;
    signedByRole: string;
    signatureRole: 'sender' | 'receiver';
    signatureMethod: 'uploaded' | 'drawn' | 'typed';
    typedName?: string;
    signatureDataUrl?: string;
    verificationId: string;
    confirmationStatement?: string;
    signedContentHash?: string;
    signedAt: string;
  }) {
    db.prepare(`
      INSERT INTO report_signature_audit (
        id, report_id, component_id, component_key, signed_by_user_id, signed_by_name,
        signed_by_role, signature_role, signature_method, typed_name, signature_data_url,
        verification_id, confirmation_statement, signed_content_hash, is_active, signed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      record.id,
      record.reportId,
      record.componentId || null,
      record.componentKey || null,
      record.signedByUserId,
      record.signedByName,
      record.signedByRole,
      record.signatureRole,
      record.signatureMethod,
      record.typedName || null,
      record.signatureDataUrl || null,
      record.verificationId,
      record.confirmationStatement || null,
      record.signedContentHash || null,
      record.signedAt
    );
    return record;
  },

  supersedeReportSignatures(reportId: string) {
    db.prepare(`UPDATE report_signature_audit SET is_active = 0 WHERE report_id = ? AND is_active = 1`).run(reportId);
  },

  // Notifications
  getNotificationsForUser(userId: string) {
    return db.prepare(`
      SELECT id, recipient_user_id as userId, type, title, message,
             related_template_id as relatedEntityId, related_report_id as relatedReportId,
             is_read as read, created_at as timestamp
      FROM notifications
      WHERE recipient_user_id = ?
      ORDER BY created_at DESC
    `).all(userId).map((n: any) => ({ ...n, read: Boolean(n.read) }));
  },

  // Comments
  getTemplateComments(templateId: string) {
    return db.prepare(`
      SELECT id, template_id as templateId, user_id as userId, user_name as userName,
             user_role as userRole, user_avatar as userAvatar, message, timestamp
      FROM template_comments
      WHERE template_id = ?
      ORDER BY timestamp ASC
    `).all(templateId);
  },

  getReportComments(reportId: string) {
    return db.prepare(`
      SELECT id, report_id as reportId, user_id as userId, user_name as userName,
             user_role as role, user_avatar as userAvatar, message, created_at as createdAt
      FROM report_comments
      WHERE report_id = ?
      ORDER BY created_at ASC
    `).all(reportId);
  },

  getWorkflows() {
    const rows = db.prepare(`SELECT * FROM workflow_definitions ORDER BY updated_at DESC`).all() as any[];
    return rows.map((r) => ({
      ...JSON.parse(r.definition_json),
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  // Content Packs
  getContentPacks(userId?: string) {
    let sql = `SELECT * FROM content_packs WHERE source_type = 'system'`;
    const params: any[] = [];
    if (userId) {
      sql += ` OR owner_user_id = ?`;
      params.push(userId);
    }
    sql += ` ORDER BY source_type DESC, name ASC`;
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      id: r.id,
      ownerUserId: r.owner_user_id,
      sourceType: r.source_type,
      name: r.name,
      normalizedName: r.normalized_name,
      category: r.category,
      description: r.description,
      iconName: r.icon_name,
      sections: JSON.parse(r.schema_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  },

  getContentPackById(id: string) {
    const r = db.prepare(`SELECT * FROM content_packs WHERE id = ?`).get(id) as any;
    if (!r) return null;
    return {
      id: r.id,
      ownerUserId: r.owner_user_id,
      sourceType: r.source_type,
      name: r.name,
      normalizedName: r.normalized_name,
      category: r.category,
      description: r.description,
      iconName: r.icon_name,
      sections: JSON.parse(r.schema_json),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  },

  createContentPack(pack: any) {
    const now = new Date().toISOString();
    const id = pack.id || `pack-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const normName = pack.normalizedName || pack.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const schemaJson = JSON.stringify(pack.sections || []);

    db.prepare(`
      INSERT INTO content_packs (id, owner_user_id, source_type, name, normalized_name, category, description, icon_name, schema_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      pack.ownerUserId || null,
      pack.sourceType || 'user',
      pack.name,
      normName,
      pack.category || 'General',
      pack.description || '',
      pack.iconName || 'Package',
      schemaJson,
      now,
      now
    );

    return this.getContentPackById(id);
  },

  updateContentPack(id: string, userId: string, updates: any) {
    const existing = this.getContentPackById(id);
    if (!existing) return null;
    if (existing.sourceType === 'system' || existing.ownerUserId !== userId) {
      throw new Error('Unauthorized or system pack edit');
    }

    const now = new Date().toISOString();
    const newName = updates.name !== undefined ? updates.name : existing.name;
    const normName = newName.trim().toLowerCase().replace(/\s+/g, ' ');
    const category = updates.category !== undefined ? updates.category : existing.category;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const schemaJson = updates.sections ? JSON.stringify(updates.sections) : JSON.stringify(existing.sections);

    db.prepare(`
      UPDATE content_packs
      SET name = ?, normalized_name = ?, category = ?, description = ?, schema_json = ?, updated_at = ?
      WHERE id = ? AND owner_user_id = ?
    `).run(newName, normName, category, description, schemaJson, now, id, userId);

    return this.getContentPackById(id);
  },

  deleteContentPack(id: string, userId: string) {
    const existing = this.getContentPackById(id);
    if (!existing) return false;
    if (existing.sourceType === 'system' || existing.ownerUserId !== userId) {
      return false;
    }
    db.prepare(`DELETE FROM content_packs WHERE id = ? AND owner_user_id = ?`).run(id, userId);
    return true;
  },

  addComponentToPack(packId: string, userId: string, sectionId: string | null, newSectionName: string | null, componentDef: any) {
    const existing = this.getContentPackById(packId);
    if (!existing) {
      throw new Error('Content Pack not found.');
    }
    if (existing.sourceType === 'system') {
      throw new Error('Unauthorized: Built-in system Content Packs cannot be modified.');
    }
    if (existing.ownerUserId !== userId) {
      throw new Error('Unauthorized: You do not own this Content Pack.');
    }

    const sections: any[] = Array.isArray(existing.sections) ? existing.sections : [];

    // Collect all existing keys in the pack for unique key generation
    const existingKeys = new Set<string>();
    sections.forEach((sec) => {
      (sec.components || []).forEach((c: any) => {
        if (c.key) existingKeys.add(c.key.toLowerCase());
        if (Array.isArray(c.nestedComponents)) {
          c.nestedComponents.forEach((nc: any) => {
            if (nc.key) existingKeys.add(nc.key.toLowerCase());
          });
        }
      });
    });

    // Find or create target section
    let targetSection: any = null;
    if (sectionId) {
      targetSection = sections.find((s) => s.id === sectionId);
    }

    if (!targetSection && newSectionName && newSectionName.trim()) {
      targetSection = {
        id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: newSectionName.trim(),
        description: '',
        order: sections.length,
        components: [],
      };
      sections.push(targetSection);
    }

    if (!targetSection) {
      if (sections.length > 0) {
        targetSection = sections[0];
      } else {
        targetSection = {
          id: `sec-${Date.now()}-0`,
          title: 'Main Content',
          description: '',
          order: 0,
          components: [],
        };
        sections.push(targetSection);
      }
    }

    // Generate unique component ID & key
    const newCompId = `fld-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let proposedKey = componentDef.key || componentDef.type || 'field';
    proposedKey = proposedKey.toLowerCase().trim().replace(/[^a-z0-9\s_]/g, '').replace(/\s+/g, '_');
    if (!proposedKey) proposedKey = 'field';

    let finalKey = proposedKey;
    if (existingKeys.has(finalKey)) {
      let counter = 2;
      while (existingKeys.has(`${proposedKey}_${counter}`)) {
        counter++;
      }
      finalKey = `${proposedKey}_${counter}`;
    }

    // Create normalized reusable component object
    const newComponent: any = {
      ...JSON.parse(JSON.stringify(componentDef)),
      id: newCompId,
      key: finalKey,
      label: componentDef.label || proposedKey.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
    };

    // Ensure default table columns if table component
    if (newComponent.type === 'table' && (!newComponent.tableConfig || !Array.isArray(newComponent.tableConfig.columns))) {
      newComponent.tableConfig = {
        columns: [
          { key: 'col_desc', label: 'Item / Description', type: 'text', width: '40%' },
          { key: 'col_qty', label: 'Quantity', type: 'number', width: '30%' },
          { key: 'col_unit_cost', label: 'Unit Cost ($)', type: 'currency', width: '30%' },
        ],
        aggregates: [],
        allowAddRows: true,
      };
    }

    // Ensure signatureConfig if signature component
    if (newComponent.type === 'signature') {
      newComponent.signatureConfig = {
        signatureRole: componentDef.signatureConfig?.signatureRole || 'sender',
        required: componentDef.signatureConfig?.required !== false,
      };
    }

    if (!Array.isArray(targetSection.components)) {
      targetSection.components = [];
    }
    targetSection.components.push(newComponent);

    return this.updateContentPack(packId, userId, { sections });
  },

  // User-facing Packs & Content Library
  getAvailablePacks() {
    return adminService.getPacks({ status: 'Published' });
  },

  getAvailableContentItems() {
    return adminService.getContentLibraryItems({ enabledOnly: true });
  },
};
