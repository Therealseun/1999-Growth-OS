import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closePool } from '@/lib/db';
import { resetConfigForTests } from '@/lib/config';
import { createUser, request, resetData, shutdown, signToken } from './helpers.js';

// Supabase Auth is replaced by a controllable fake. Everything else is real.
const fake = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn(), refreshSession: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ authClient: () => ({ auth: fake }) }));

const { GET: health } = await import('@/routes/health/route.js');
const { GET: me } = await import('@/routes/auth/me/route.js');
const { POST: signup } = await import('@/routes/auth/signup/route.js');
const { POST: login } = await import('@/routes/auth/login/route.js');
const { POST: refresh } = await import('@/routes/auth/refresh/route.js');

beforeEach(async () => {
  vi.clearAllMocks();
  await resetData();
});
afterAll(shutdown);

const post = (path, body) => request(path, { method: 'POST', body });
const code = async (res) => (await res.json()).error?.code;

describe('GET /api/health', () => {
  it('reports a migrated database', async () => {
    const res = await health(request('/api/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, database: true, schema: true, timezone: 'Africa/Lagos' });
  });

  it('answers 503 without leaking details when the database is unreachable', async () => {
    const original = process.env.DATABASE_URL;
    await closePool();
    process.env.DATABASE_URL = 'postgres://postgres@127.0.0.1:1/nope';
    resetConfigForTests();
    const res = await health(request('/api/health'));
    process.env.DATABASE_URL = original;
    resetConfigForTests();
    await closePool();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ ok: false, database: false });
    expect(JSON.stringify(body)).not.toContain('127.0.0.1');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the profile of an active user', async () => {
    const u = await createUser({ role: 'MANAGER', name: 'Ada' });
    const res = await me(request('/api/auth/me', { token: await signToken(u.id) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: u.id, name: 'Ada', role: 'MANAGER', status: 'ACTIVE' });
  });
  it('401 without a token, 403 ACCOUNT_PENDING for a pending account', async () => {
    expect((await me(request('/api/auth/me'))).status).toBe(401);
    const p = await createUser({ status: 'PENDING' });
    const res = await me(request('/api/auth/me', { token: await signToken(p.id) }));
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('ACCOUNT_PENDING');
  });
});

describe('POST /api/auth/signup', () => {
  const valid = { name: '  Sarah ', email: 'Sarah@Example.com ', password: 'longenough1' };

  it('creates a pending employee account and forwards only name, email and password', async () => {
    fake.signUp.mockResolvedValue({ data: {}, error: null });
    const res = await signup(post('/api/auth/signup', { ...valid, role: 'ADMIN', status: 'ACTIVE' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      name: 'Sarah',
      email: 'sarah@example.com',
      role: 'EMPLOYEE',
      status: 'PENDING',
      department_id: null,
      message: 'Account created. An Admin must approve it before you can log in.',
    });
    expect(fake.signUp).toHaveBeenCalledWith({
      email: 'sarah@example.com',
      password: 'longenough1',
      options: { data: { name: 'Sarah' } },
    });
  });

  it('gives the same answer when the email is already registered', async () => {
    fake.signUp.mockResolvedValueOnce({ data: {}, error: null });
    const first = await (await signup(post('/api/auth/signup', valid))).json();
    fake.signUp.mockResolvedValueOnce({ data: {}, error: { code: 'user_already_exists', status: 422, message: 'exists' } });
    const res = await signup(post('/api/auth/signup', valid));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(first);
  });

  it('validates input and maps provider errors', async () => {
    expect((await signup(post('/api/auth/signup', { ...valid, email: 'nope' }))).status).toBe(422);
    expect((await signup(post('/api/auth/signup', { ...valid, password: 'short' }))).status).toBe(422);
    expect(fake.signUp).not.toHaveBeenCalled();

    fake.signUp.mockResolvedValue({ data: {}, error: { code: 'weak_password', status: 422, message: 'Password is too weak' } });
    expect(await code(await signup(post('/api/auth/signup', valid)))).toBe('WEAK_PASSWORD');
    fake.signUp.mockResolvedValue({ data: {}, error: { status: 429, message: 'slow down' } });
    expect((await signup(post('/api/auth/signup', valid))).status).toBe(429);
    fake.signUp.mockResolvedValue({ data: {}, error: { status: 400, code: 'unexpected_failure', message: 'Database error saving new user' } });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await signup(post('/api/auth/signup', valid));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: { code: 'AUTH_PROVIDER_ERROR', message: 'The sign-up service could not complete the request' },
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"event":"supabase_signup_failed"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"code":"unexpected_failure"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"message":"Database error saving new user"'));
    warn.mockRestore();
  });
});

describe('POST /api/auth/login', () => {
  const creds = { email: 'a@b.com', password: 'pw' };
  const session = (id) => ({ data: { user: { id }, session: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 } }, error: null });

  it('returns tokens and the profile for an active account', async () => {
    const u = await createUser({ role: 'EMPLOYEE' });
    fake.signInWithPassword.mockResolvedValue(session(u.id));
    const res = await login(post('/api/auth/login', creds));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, profile: { id: u.id, role: 'EMPLOYEE' } });
  });

  it('gives a pending account 403 and no token', async () => {
    const u = await createUser({ status: 'PENDING' });
    fake.signInWithPassword.mockResolvedValue(session(u.id));
    const res = await login(post('/api/auth/login', creds));
    const text = await res.text();
    expect(res.status).toBe(403);
    expect(text).toContain('ACCOUNT_PENDING');
    expect(text).not.toContain('AT');
  });

  it('gives wrong credentials one generic 401, and maps rate limits and outages', async () => {
    fake.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' } });
    const res = await login(post('/api/auth/login', creds));
    expect(res.status).toBe(401);
    expect(await code(res)).toBe('INVALID_CREDENTIALS');
    fake.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 429, message: 'x' } });
    expect((await login(post('/api/auth/login', creds))).status).toBe(429);
    fake.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 503, message: 'x' } });
    expect((await login(post('/api/auth/login', creds))).status).toBe(502);
  });
});

describe('POST /api/auth/refresh', () => {
  it('renews a session for an active account', async () => {
    const u = await createUser();
    fake.refreshSession.mockResolvedValue({ data: { user: { id: u.id }, session: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 } }, error: null });
    const res = await refresh(post('/api/auth/refresh', { refresh_token: 'RT' }));
    expect(res.status).toBe(200);
    expect((await res.json()).access_token).toBe('AT2');
  });

  it('refuses an invalid refresh token and a disabled account', async () => {
    fake.refreshSession.mockResolvedValue({ data: {}, error: { status: 400, message: 'bad' } });
    const bad = await refresh(post('/api/auth/refresh', { refresh_token: 'RT' }));
    expect(bad.status).toBe(401);
    expect(await code(bad)).toBe('INVALID_REFRESH_TOKEN');

    const u = await createUser({ status: 'DISABLED' });
    fake.refreshSession.mockResolvedValue({ data: { user: { id: u.id }, session: { access_token: 'x', refresh_token: 'y', expires_in: 1 } }, error: null });
    const disabled = await refresh(post('/api/auth/refresh', { refresh_token: 'RT' }));
    expect(disabled.status).toBe(403);
    expect(await code(disabled)).toBe('ACCOUNT_DISABLED');
  });
});
