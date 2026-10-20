import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getConfig } from './config.js';
import { ApiError, invalid } from './errors.js';

// Evidence files live in a private Supabase Storage bucket owned by the company. The browser never gets a
// storage key. It gets a short lived signed upload URL for one path that starts with the user's own id.

export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

function matchesContentType(type, bytes) {
  if (type === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).every((value, index) =>
      value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index],
    );
  }
  if (type === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === 'image/webp') {
    return (
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
    );
  }
  if (type === 'application/pdf') {
    return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
  }
  return false;
}

let clientOverride; // tests only
export function setStorageClientForTests(client) {
  clientOverride = client;
}

function storage() {
  if (clientOverride) return clientOverride.storage;
  const cfg = getConfig();
  if (!cfg.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError(503, 'STORAGE_NOT_CONFIGURED', 'File uploads are not set up on this server');
  }
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage;
}

const bucket = () => getConfig().EVIDENCE_BUCKET;

export async function createUploadUrl(userId, filename) {
  const safeName = filename
    .normalize('NFKD')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(-80) || 'file';
  const path = `${userId}/${randomUUID()}-${safeName}`;
  const { data, error } = await storage().from(bucket()).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    console.error(JSON.stringify({ level: 'error', message: 'createSignedUploadUrl failed', error: error?.message }));
    throw new ApiError(502, 'STORAGE_ERROR', 'The file storage service could not prepare an upload');
  }
  // Supabase signed upload URLs last two hours.
  return { upload_url: data.signedUrl, storage_path: data.path ?? path, expires_in: 7200 };
}

// A person may only attach files they uploaded themselves.
export function assertOwnPath(userId, storagePath) {
  if (!storagePath.startsWith(`${userId}/`) || storagePath.includes('..')) {
    throw invalid('storage_path does not belong to you', { fields: [{ path: 'evidence.storage_path', message: 'Not your file' }] }, 'EVIDENCE_FILE_NOT_YOURS');
  }
}

// Confirms the uploaded object exists before evidence points at it.
export async function assertFileExists(storagePath) {
  const separator = storagePath.lastIndexOf('/');
  const directory = storagePath.slice(0, separator);
  const filename = storagePath.slice(separator + 1);
  const { data, error } = await storage().from(bucket()).list(directory, { search: filename, limit: 2 });
  if (error) throw new ApiError(502, 'STORAGE_ERROR', 'The file storage service could not be reached');
  const file = data?.find((entry) => entry.name === filename);
  if (!file) {
    throw invalid('The file was not uploaded', { fields: [{ path: 'evidence.storage_path', message: 'No file at this path' }] }, 'EVIDENCE_FILE_MISSING');
  }
  if (!file.metadata || typeof file.metadata.size !== 'number' || typeof file.metadata.mimetype !== 'string') {
    throw new ApiError(502, 'STORAGE_METADATA_UNAVAILABLE', 'The file storage service could not verify the uploaded file');
  }
  if (file.metadata.size < 1 || file.metadata.size > MAX_EVIDENCE_BYTES) {
    throw invalid('The uploaded file exceeds the allowed size', { max_bytes: MAX_EVIDENCE_BYTES }, 'EVIDENCE_FILE_TOO_LARGE');
  }
  if (!EVIDENCE_CONTENT_TYPES.includes(file.metadata.mimetype)) {
    throw invalid('The uploaded file type is not allowed', undefined, 'EVIDENCE_FILE_TYPE_NOT_ALLOWED');
  }
  const { data: body, error: downloadError } = await storage().from(bucket()).download(storagePath);
  if (downloadError || !body) {
    throw new ApiError(502, 'STORAGE_ERROR', 'The uploaded file could not be verified');
  }
  const bytes = new Uint8Array(await body.arrayBuffer());
  if (bytes.length !== file.metadata.size || !matchesContentType(file.metadata.mimetype, bytes)) {
    throw invalid('The uploaded file content does not match its declared type', undefined, 'EVIDENCE_FILE_TYPE_NOT_ALLOWED');
  }
}
