import { Router } from 'express';
import { adminService } from '../services/adminService.js';
import { AppError } from '../middleware/errorHandler.js';
import { authorizationService } from '../services/authorizationService.js';
import { roleService } from '../services/roleService.js';

export const adminRouter = Router();

// Middleware: Require Admin Role for Admin Routes
function requireAdminRole(req: any, res: any, next: any) {
  if (!req.user || !authorizationService.isProtectedAdmin(req.user)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin authorization required to access platform management resources.',
      },
    });
  }
  next();
}

// 1. GET /api/system/config (Public for all authenticated demo users)
adminRouter.get('/system/config', (req, res) => {
  const config = adminService.getEffectiveConfig();
  res.json({ success: true, data: config });
});

// Admin-Protected Routes Below
adminRouter.use('/admin', requireAdminRole);

// GET /api/admin/config
adminRouter.get('/admin/config', (req, res) => {
  const config = adminService.getEffectiveConfig();
  res.json({ success: true, data: config });
});

// GET /api/admin/features
adminRouter.get('/admin/features', (req, res) => {
  const features = adminService.getFeatures();
  res.json({ success: true, data: features });
});

// PATCH /api/admin/features/:featureKey
adminRouter.patch('/admin/features/:featureKey', (req: any, res) => {
  const { enabled } = req.body || {};
  if (enabled === undefined) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '"enabled" boolean state required.' } });
  }
  const featureKey = req.params.featureKey;
  const updated = adminService.updateFeature(featureKey, Boolean(enabled), req.user);
  res.json({ success: true, data: updated });
});

// GET /api/admin/elements
adminRouter.get('/admin/elements', (req, res) => {
  const elements = adminService.getElements();
  res.json({ success: true, data: elements });
});

// PATCH /api/admin/elements/:elementKey
adminRouter.patch('/admin/elements/:elementKey', (req: any, res) => {
  const { enabled } = req.body || {};
  if (enabled === undefined) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: '"enabled" boolean state required.' } });
  }
  const elementKey = req.params.elementKey;
  const updated = adminService.updateElement(elementKey, Boolean(enabled), req.user);
  res.json({ success: true, data: updated });
});

// GET /api/admin/users
adminRouter.get('/admin/users', (req, res) => {
  const users = adminService.getUsers();
  res.json({ success: true, data: users });
});

// POST /api/admin/users
adminRouter.post('/admin/users', (req: any, res) => {
  const { name, email, role, roleId, department } = req.body || {};
  const newUser = adminService.createUser({ name, email, role, roleId, department }, req.user);
  res.json({ success: true, data: newUser });
});

// PATCH /api/admin/users/:id/status
adminRouter.patch('/admin/users/:id/status', (req: any, res) => {
  const { status } = req.body || {};
  if (!status || !['Active', 'Inactive', 'Resigned', 'Terminated'].includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid account status.' } });
  }
  const updated = adminService.updateUserStatus(req.params.id, status, req.user);
  res.json({ success: true, data: updated });
});

// PATCH /api/admin/users/:id — Admin-only role, status and directory updates
adminRouter.patch('/admin/users/:id', (req: any, res) => {
  const { name, email, department, role, roleId, status } = req.body || {};
  const updated = adminService.updateUser(req.params.id, { name, email, department, role, roleId, status }, req.user);
  res.json({ success: true, data: updated });
});

// Organizational Roles & Permissions
adminRouter.get('/admin/roles', (_req, res) => {
  res.json({ success: true, data: roleService.getRoles() });
});

adminRouter.get('/admin/roles-assignable', (_req, res) => {
  res.json({ success: true, data: roleService.getAssignableRoles() });
});

adminRouter.post('/admin/roles', (req: any, res) => {
  res.json({ success: true, data: roleService.createRole(req.body || {}, req.user) });
});

adminRouter.put('/admin/roles/:id', (req: any, res) => {
  res.json({ success: true, data: roleService.updateRole(req.params.id, req.body || {}, req.user) });
});

adminRouter.post('/admin/roles/:id/duplicate', (req: any, res) => {
  res.json({ success: true, data: roleService.duplicateRole(req.params.id, req.body?.name, req.user) });
});

adminRouter.post('/admin/roles/:id/restore-defaults', (req: any, res) => {
  res.json({ success: true, data: roleService.restoreDefaultRolePermissions(req.params.id, req.user) });
});

// Governance Routing Endpoints
adminRouter.get('/admin/governance-routing', (_req, res) => {
  res.json({ success: true, data: adminService.getGovernanceRouting() });
});

adminRouter.put('/admin/governance-routing', (req: any, res) => {
  res.json({ success: true, data: adminService.updateGovernanceRouting(req.body || {}, req.user) });
});

// GET /api/admin/categories
adminRouter.get('/admin/categories', (req, res) => {
  const categories = adminService.getCategories();
  res.json({ success: true, data: categories });
});

// POST /api/admin/categories
adminRouter.post('/admin/categories', (req: any, res) => {
  const { name, description } = req.body || {};
  const newCat = adminService.createCategory({ name, description }, req.user);
  res.json({ success: true, data: newCat });
});

// PATCH /api/admin/categories/:id
adminRouter.patch('/admin/categories/:id', (req: any, res) => {
  const { name, description, status } = req.body || {};
  const updated = adminService.updateCategory(req.params.id, { name, description, status }, req.user);
  res.json({ success: true, data: updated });
});

// GET /api/admin/audit
adminRouter.get('/admin/audit', (req, res) => {
  const audit = adminService.getAuditLog();
  res.json({ success: true, data: audit });
});

// PATCH /api/admin/settings
adminRouter.patch('/admin/settings', (req: any, res) => {
  const settings = req.body || {};
  const updated = adminService.updateSettings(settings, req.user);
  res.json({ success: true, data: updated });
});

// Admin Pack Management Routes
adminRouter.get('/admin/packs', (req, res) => {
  const packs = adminService.getPacks();
  res.json({ success: true, data: packs });
});

adminRouter.get('/admin/packs/:id', (req, res) => {
  const pack = adminService.getPackById(req.params.id);
  if (!pack) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pack not found' } });
  res.json({ success: true, data: pack });
});

adminRouter.post('/admin/packs', (req: any, res) => {
  try {
    const { name, description, categoryId, status, items, structure } = req.body || {};
    const newPack = adminService.createPack({ name, description, categoryId, status, items, structure }, req.user);
    res.json({ success: true, data: newPack });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

adminRouter.put('/admin/packs/:id', (req: any, res) => {
  try {
    const { name, description, categoryId, status, items, structure } = req.body || {};
    const updated = adminService.updatePack(req.params.id, { name, description, categoryId, status, items, structure }, req.user);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

adminRouter.post('/admin/packs/:id/publish', (req: any, res) => {
  const published = adminService.publishPack(req.params.id, req.user);
  res.json({ success: true, data: published });
});

adminRouter.patch('/admin/packs/:id/status', (req: any, res) => {
  const { status } = req.body || {};
  if (!status || !['Draft', 'Published', 'Disabled'].includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Status must be Draft, Published, or Disabled.' } });
  }
  const updated = adminService.updatePackStatus(req.params.id, status, req.user);
  res.json({ success: true, data: updated });
});

// Admin Content Library Management Routes
adminRouter.get('/admin/content-library', (req, res) => {
  const items = adminService.getContentLibraryItems();
  res.json({ success: true, data: items });
});

adminRouter.post('/admin/content-library', (req: any, res) => {
  const { name, description, category, contentType, contentValue } = req.body || {};
  const newItem = adminService.createContentItem({ name, description, category, contentType, contentValue }, req.user);
  res.json({ success: true, data: newItem });
});

adminRouter.put('/admin/content-library/:id', (req: any, res) => {
  const { name, description, category, contentType, contentValue, enabled } = req.body || {};
  const updated = adminService.updateContentItem(req.params.id, { name, description, category, contentType, contentValue, enabled }, req.user);
  res.json({ success: true, data: updated });
});

adminRouter.patch('/admin/content-library/:id/status', (req: any, res) => {
  const { enabled } = req.body || {};
  if (enabled === undefined) {
    return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Boolean enabled field required.' } });
  }
  const updated = adminService.updateContentItemStatus(req.params.id, Boolean(enabled), req.user);
  res.json({ success: true, data: updated });
});
