import { Router } from 'express';
import { db } from '../db/database.js';
import { AppError } from '../middleware/errorHandler.js';
import fs from 'fs';
import path from 'path';
import { authorizationService } from '../services/authorizationService.js';
import { resourceAccessService } from '../services/resourceAccessService.js';
import { createClient } from '@supabase/supabase-js';

export const assetRouter = Router();

async function canonicalReportIdsForAsset(assetId: string, authorization?: string): Promise<string[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!authorization || !/^Bearer\s+.+$/i.test(authorization) || !url || !key) return [];
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data, error } = await client
    .from('report_values')
    .select('report_id')
    .filter('value->>attachmentId', 'eq', assetId);
  if (error || !data?.length) return [];
  const ids = [...new Set(data.map((row) => row.report_id))];
  const { data: accessibleReports, error: accessError } = await client
    .from('reports')
    .select('id')
    .in('id', ids);
  if (accessError) return [];
  return (accessibleReports || []).map((row) => row.id);
}

const UPLOADS_DIR = path.join(process.cwd(), 'server', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export function verifySignatureImageBinary(buffer: Buffer, mimeType?: string): { valid: boolean; format?: string; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty signature file data.' };
  }
  if (buffer.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'Signature file size exceeds maximum limit of 5MB.' };
  }

  // Reject SVG, XML, HTML, script tags
  const headStr = buffer.slice(0, 512).toString('utf8', 0, Math.min(512, buffer.length)).toLowerCase();
  if (headStr.includes('<svg') || headStr.includes('<?xml') || headStr.includes('<html') || headStr.includes('<script')) {
    return { valid: false, error: 'Vector SVG, HTML, and script contents are strictly forbidden for signature images.' };
  }

  // PNG magic bytes: \x89PNG\r\n\x1a\n
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    // Dimension check for PNG if header is present
    if (buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      if (width < 100 || height < 30 || width > 3000 || height > 1500) {
        return { valid: false, error: `Signature image dimensions (${width}x${height}) out of bounds (Min 100x30, Max 3000x1500).` };
      }
    }
    return { valid: true, format: 'image/png' };
  }

  // JPEG magic bytes: \xFF\xD8\xFF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, format: 'image/jpeg' };
  }

  // WebP magic bytes: RIFF....WEBP
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { valid: true, format: 'image/webp' };
  }

  return {
    valid: false,
    error: 'Binary image signature mismatch. File is not a genuine PNG, JPEG, or WebP image.',
  };
}

// Signature Upload API Endpoint (Strict Binary Verification + Attestation)
assetRouter.post('/signature-upload', (req, res, next) => {
  try {
    authorizationService.requirePermission((req as any).user, 'signature_profile.use');
    const { filename, mimeType, base64Data, attestationAccepted } = req.body || {};

    if (!attestationAccepted) {
      throw new AppError('Explicit user attestation required: You must confirm that this image represents your own signature.', 400, 'ATTESTATION_REQUIRED');
    }

    if (!base64Data) {
      throw new AppError('No signature image data provided.', 400);
    }

    const cleanBase64 = String(base64Data).replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const verifyRes = verifySignatureImageBinary(buffer, mimeType);
    if (!verifyRes.valid) {
      throw new AppError(verifyRes.error || 'Invalid signature image file.', 400, 'INVALID_SIGNATURE_IMAGE');
    }

    const assetId = `sigasset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const ext = verifyRes.format === 'image/png' ? 'png' : verifyRes.format === 'image/jpeg' ? 'jpg' : 'webp';
    const diskFilename = `${assetId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, diskFilename);

    fs.writeFileSync(filePath, buffer);

    db.prepare(`
      INSERT INTO template_assets (id, filename, mime_type, size_bytes, storage_path, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(assetId, filename || diskFilename, verifyRes.format, buffer.length, filePath, (req as any).user!.id);

    res.json({
      success: true,
      data: {
        id: assetId,
        filename: filename || diskFilename,
        mimeType: verifyRes.format,
        url: `/api/assets/${assetId}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

function handleGeneralAssetUpload(requiredPermissions: Parameters<typeof authorizationService.requireAnyPermission>[1]) {
  return (req: any, res: any, next: any) => {
  try {
    if (process.env.NODE_ENV !== 'production') console.info('[AUTH TRACE SERVER]', {
      assetPermissionCheck: true,
      reqUserIdPresent: Boolean(req.user?.id),
      reqUserRoleKey: req.user?.roleKey,
      reqUserPermissionCount: Array.isArray(req.user?.permissions) ? req.user.permissions.length : 0,
      reqUserHasReportsCreate: Array.isArray(req.user?.permissions) && req.user.permissions.includes('reports.create'),
      reqUserHasReportsEditDraft: Array.isArray(req.user?.permissions) && req.user.permissions.includes('reports.edit_draft'),
      requiredPermissions,
    });
    authorizationService.requireAnyPermission(req.user, requiredPermissions);
    const { filename, mimeType, base64Data } = req.body;

    if (!base64Data) {
      throw new AppError('No asset data provided.', 400);
    }

    const allowedMimeTypes = [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/msword',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ];
    const targetMime = mimeType || 'application/octet-stream';

    if (!allowedMimeTypes.includes(targetMime)) {
      throw new AppError(
        'Unsupported file format. Allowed formats: PDF, DOCX, XLSX, TXT, CSV, PNG, JPEG, WebP (SVG and executable scripts disabled for security).',
        400
      );
    }

    const assetId = `asset-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    let ext = 'bin';
    if (targetMime.includes('pdf')) ext = 'pdf';
    else if (targetMime === 'application/msword') ext = 'doc';
    else if (targetMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') ext = 'docx';
    else if (targetMime.includes('sheet')) ext = 'xlsx';
    else if (targetMime.includes('png')) ext = 'png';
    else if (targetMime.includes('jpeg') || targetMime.includes('jpg')) ext = 'jpg';
    else if (targetMime.includes('webp')) ext = 'webp';
    else if (targetMime.includes('csv')) ext = 'csv';
    else if (targetMime.includes('text')) ext = 'txt';

    const diskFilename = `${assetId}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, diskFilename);

    // Strip base64 prefix if present
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 10 * 1024 * 1024) {
      throw new AppError('File size exceeds maximum limit of 10MB.', 400);
    }

    fs.writeFileSync(filePath, buffer);

    db.prepare(`
      INSERT INTO template_assets (id, filename, mime_type, size_bytes, storage_path, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(assetId, filename || diskFilename, targetMime, buffer.length, filePath, (req as any).user!.id);

    res.json({
      success: true,
      data: {
        id: assetId,
        filename: filename || diskFilename,
        mimeType: targetMime,
        url: `/api/assets/${assetId}`,
      },
    });
  } catch (err) {
    next(err);
  }
  };
}

// Report attachment upload: report permissions remain unchanged.
assetRouter.post('/upload', handleGeneralAssetUpload(['reports.create', 'reports.edit_draft']));

// Template image/logo upload: use template workflow permissions.
assetRouter.post('/template-upload', handleGeneralAssetUpload(['templates.create', 'templates.edit_draft']));

// Stream Stored Asset API Endpoint
assetRouter.get('/:id', async (req, res, next) => {
  try {
    const assetId = req.params.id;
    const asset = db.prepare(`SELECT * FROM template_assets WHERE id = ?`).get(assetId) as any;

    if (!asset) {
      throw new AppError('Asset record not found.', 404, 'ASSET_NOT_FOUND');
    }

    // Access control for private signature assets
    const isSignatureAsset = asset.id.startsWith('sigasset-') || asset.filename.includes('sigasset');
    if (isSignatureAsset) {
      const callerId = (req as any).user?.id;
      if (!callerId) {
        throw new AppError('Authentication required to view private signature assets.', 401, 'UNAUTHORIZED');
      }

      if (asset.created_by !== callerId && asset.created_by !== 'system') {
        const reportParticipant = db.prepare(`
          SELECT COUNT(*) as count FROM report_signature_audit s
          JOIN reports r ON s.report_id = r.id
          WHERE (s.signature_data_url LIKE ? OR s.signature_data_url LIKE ?)
            AND (r.created_by = ? OR r.sent_to_user_id = ?)
        `).get(`%${assetId}%`, `%${asset.filename}%`, callerId, callerId) as any;

        const canViewOrganization = authorizationService.hasPermission(callerId, 'reports.view_organization');

        if ((!reportParticipant || reportParticipant.count === 0) && !canViewOrganization) {
          throw new AppError('Forbidden: Access to private user signature asset denied.', 403, 'FORBIDDEN');
        }
      }
    } else {
      const caller = (req as any).user;
      if (!caller) throw new AppError('Authentication required to view report attachments.', 401, 'UNAUTHORIZED');
      const linkedReports = db.prepare(`
        SELECT DISTINCT r.id, r.created_by as createdById, r.sent_to_user_id as sentToId
        FROM reports r
        JOIN report_field_values rfv ON rfv.report_id = r.id
        WHERE rfv.value_text LIKE ?
      `).all(`%${assetId}%`) as any[];
      const canonicalReportIds = await canonicalReportIdsForAsset(assetId, req.headers.authorization);
      const isAssetCreator = asset.created_by === caller.id;
      const canView = isAssetCreator || linkedReports.some((report) => resourceAccessService.canAccessReport(caller, report)) || canonicalReportIds.length > 0;
      if (!canView) throw new AppError('Forbidden: Access to report attachment denied.', 403, 'FORBIDDEN');
    }

    const resolvedPath = path.resolve(asset.storage_path);
    if (!resolvedPath.startsWith(UPLOADS_DIR) || !fs.existsSync(resolvedPath)) {
      throw new AppError('Asset file not found or unauthorized path.', 404);
    }

    res.setHeader('Content-Type', asset.mime_type);
    fs.createReadStream(resolvedPath).pipe(res);
  } catch (err) {
    next(err);
  }
});
