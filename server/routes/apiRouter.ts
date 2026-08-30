import { Router } from 'express';
import { dbRepository } from '../repositories/dbRepository.js';
import { templateRouter } from './templateRoutes.js';
import { reportRouter } from './reportRoutes.js';
import { assetRouter } from './assetRoutes.js';
import { workflowRoutes } from './workflowRoutes.js';
import { intakeRoutes } from './intakeRoutes.js';
import { notificationController, demoController } from '../controllers/notificationController.js';

import { adminRouter } from './adminRoutes.js';
import { authorizationService } from '../services/authorizationService.js';
import { adminService } from '../services/adminService.js';

export const apiRouter = Router();

// Health
apiRouter.get('/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

apiRouter.get('/authorization/me', (req: any, res) => {
  res.json({ success: true, data: authorizationService.resolveUser(req.user!.id) });
});

apiRouter.get('/governance-routing', (_req: any, res) => {
  res.json({ success: true, data: adminService.getGovernanceRouting() });
});

// Admin & System Settings
apiRouter.use('/', adminRouter);

// Assets
apiRouter.use('/assets', assetRouter);

// Users
apiRouter.get('/users', (req, res) => {
  res.json({ success: true, data: dbRepository.getUsers({ activeOnly: true }) });
});

apiRouter.get('/users/:id', (req, res) => {
  const user = dbRepository.getUserById(req.params.id);
  if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
  res.json({ success: true, data: user });
});

// User Signature Profiles (Server-enforced Ownership)
apiRouter.get('/user/signature-profile', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'signature_profile.use');
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  const profile = dbRepository.getUserSignatureProfile(userId);
  res.json({ success: true, data: profile });
});

apiRouter.post('/user/signature-profile', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'signature_profile.use');
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  const { method, assetReference, drawingReference, typedName } = req.body || {};
  if (!method || !['uploaded', 'drawn', 'typed'].includes(method)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_METHOD', message: 'Signature method must be uploaded, drawn, or typed.' } });
  }
  const updated = dbRepository.saveUserSignatureProfile(userId, { method, assetReference, drawingReference, typedName });
  res.json({ success: true, data: updated });
});

// Categories
apiRouter.get('/categories', (req, res) => {
  res.json({ success: true, data: dbRepository.getCategories() });
});

// Templates & Template Approvals
apiRouter.use('/templates', templateRouter);
apiRouter.get('/template-approvals', (req, res, next) => {
  req.url = '/approvals';
  templateRouter(req, res, next);
});

// Workflows
apiRouter.use('/', workflowRoutes);

// Intake (Import & AI)
apiRouter.use('/', intakeRoutes);

// Reports
apiRouter.use('/reports', reportRouter);

// Notifications
apiRouter.get('/notifications', notificationController.getNotifications);
apiRouter.patch('/notifications/:id/read', notificationController.markRead);
apiRouter.post('/notifications/read-all', notificationController.markAllRead);

// Content Packs (Content Library)
apiRouter.get('/content-packs', (req: any, res) => {
  authorizationService.requireAnyPermission(req.user!, ['studio.content.use', 'studio.my_packs.create']);
  const userId = req.user?.id;
  const packs = dbRepository.getContentPacks(userId);
  res.json({ success: true, data: packs });
});

apiRouter.post('/content-packs', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.my_packs.create');
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  const packData = req.body || {};
  if (!packData.name || !packData.name.trim()) {
    return res.status(400).json({ success: false, error: { code: 'NAME_REQUIRED', message: 'Pack name is required.' } });
  }
  const created = dbRepository.createContentPack({
    ...packData,
    ownerUserId: userId,
    sourceType: 'user',
  });
  res.json({ success: true, data: created });
});

apiRouter.put('/content-packs/:id', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.my_packs.create');
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  try {
    const updated = dbRepository.updateContentPack(req.params.id, userId, req.body || {});
    if (!updated) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pack not found' } });
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: err.message } });
  }
});

apiRouter.delete('/content-packs/:id', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.my_packs.create');
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  const deleted = dbRepository.deleteContentPack(req.params.id, userId);
  if (!deleted) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'System packs cannot be deleted or pack not owned by user.' } });
  }
  res.json({ success: true, message: 'Content Pack deleted' });
});

apiRouter.post('/content-packs/:packId/components', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.my_packs.create');
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  try {
    const { sectionId, newSectionName, componentDef } = req.body || {};
    if (!componentDef) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_COMPONENT', message: 'Component definition required' } });
    }
    const updated = dbRepository.addComponentToPack(req.params.packId, userId, sectionId || null, newSectionName || null, componentDef);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    const isAuth = err.message.includes('Unauthorized') || err.message.includes('system') || err.message.includes('own');
    res.status(isAuth ? 403 : 400).json({ success: false, error: { code: isAuth ? 'FORBIDDEN' : 'BAD_REQUEST', message: err.message } });
  }
});

// User-facing Packs (Building Blocks)
apiRouter.get('/packs', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.standard_packs.use');
  const packs = dbRepository.getAvailablePacks();
  res.json({ success: true, data: packs });
});

apiRouter.get('/packs/:id', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.standard_packs.use');
  const packs = dbRepository.getAvailablePacks();
  const pack = packs.find((p) => p.id === req.params.id);
  if (!pack) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pack not found or unavailable' } });
  res.json({ success: true, data: pack });
});

// User-facing Content Library
apiRouter.get('/content-library', (req: any, res) => {
  authorizationService.requirePermission(req.user!, 'studio.content.use');
  const items = dbRepository.getAvailableContentItems();
  res.json({ success: true, data: items });
});

// Demo Reset
apiRouter.post('/demo/reset', demoController.resetDemo);
