import type { Request, Response } from 'express';
import type { SecurityConfig } from '../config/securityConfig.js';

export function readCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(pair.slice(separator + 1).trim());
  }
  return undefined;
}

export function setSessionCookie(res: Response, config: SecurityConfig, token: string, expiresAt: Date) {
  res.cookie(config.sessionCookie.name, token, {
    httpOnly: true, secure: config.sessionCookie.secure, sameSite: config.sessionCookie.sameSite,
    path: '/', expires: expiresAt, maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearSessionCookie(res: Response, config: SecurityConfig) {
  res.clearCookie(config.sessionCookie.name, {
    httpOnly: true, secure: config.sessionCookie.secure, sameSite: config.sessionCookie.sameSite, path: '/',
  });
}
