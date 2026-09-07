import type { RequestHandler } from 'express';
import type { SecurityConfig } from '../config/securityConfig.js';
import { demoUserMiddleware } from './demoUser.js';
import { createSessionIdentityMiddleware } from './sessionIdentity.js';

export function createIdentityMiddleware(config: SecurityConfig): RequestHandler {
  return config.demoIdentityEnabled ? demoUserMiddleware : createSessionIdentityMiddleware(config);
}
