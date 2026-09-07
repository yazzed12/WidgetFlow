import { ApiError } from './responses.ts';

const MAX_BODY_BYTES = 32_768;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredSize = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredSize) && declaredSize > MAX_BODY_BYTES) {
    throw new ApiError(400, 'INVALID_INPUT', 'The request body is too large.');
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new ApiError(400, 'INVALID_INPUT', 'The request body is too large.');
  }
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('shape');
    return value as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'INVALID_INPUT', 'A JSON object is required.');
  }
}

export function requiredString(
  body: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximumLength) {
    throw new ApiError(400, 'INVALID_INPUT', `${key} is invalid.`);
  }
  return value;
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string | undefined {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > maximumLength) {
    throw new ApiError(400, 'INVALID_INPUT', `${key} is invalid.`);
  }
  return value.trim();
}

export function uuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a UUID.`);
  }
  return value.toLowerCase();
}

export function optionalUuid(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return uuid(value, fieldName);
}

export function email(value: unknown): string {
  if (typeof value !== 'string' || value.length > 320 || !EMAIL_PATTERN.test(value.trim())) {
    throw new ApiError(400, 'INVALID_INPUT', 'email is invalid.');
  }
  return value.trim().toLowerCase();
}

// Deliberately matches the existing WidgetFlow policy: 12-128 characters,
// preserves meaningful whitespace exactly, and rejects an all-whitespace value.
export function password(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 12 ||
    value.length > 128 ||
    value.trim().length === 0
  ) {
    throw new ApiError(400, 'INVALID_INPUT', 'Password must be between 12 and 128 characters.');
  }
  return value;
}

export function status(value: unknown): 'Active' | 'Inactive' | 'Resigned' | 'Terminated' {
  if (!['Active', 'Inactive', 'Resigned', 'Terminated'].includes(String(value))) {
    throw new ApiError(400, 'INVALID_INPUT', 'status is invalid.');
  }
  return value as 'Active' | 'Inactive' | 'Resigned' | 'Terminated';
}
