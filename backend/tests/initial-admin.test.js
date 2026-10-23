import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  clientQuery: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  query: fake.query,
  withTransaction: fake.transaction,
}));
vi.mock('@/lib/config', () => ({
  getConfig: () => ({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'configured-password' }),
}));
vi.mock('@/lib/supabase', () => ({
  authAdminClient: () => ({ auth: { admin: { updateUserById: fake.updateUserById } } }),
}));

const { seedInitialAdmin } = await import('@/lib/initial-admin');

beforeEach(() => {
  vi.clearAllMocks();
  fake.query
    .mockResolvedValueOnce({ rows: [{ id: 'admin-id' }] })
    .mockResolvedValueOnce({ rows: [] });
  fake.clientQuery
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ id: 'admin-id', role: 'ADMIN', status: 'ACTIVE' }] })
    .mockResolvedValueOnce({ rows: [] });
  fake.transaction.mockImplementation((_transaction, callback) => callback({ query: fake.clientQuery }));
  fake.updateUserById.mockResolvedValue({ error: null });
});

describe('seedInitialAdmin', () => {
  it('does not reset the password during normal server startup', async () => {
    await expect(seedInitialAdmin()).resolves.toBe(true);
    expect(fake.updateUserById).not.toHaveBeenCalled();
  });

  it('syncs the configured password when explicitly requested', async () => {
    await expect(seedInitialAdmin({ syncPassword: true })).resolves.toBe(true);
    expect(fake.updateUserById).toHaveBeenCalledWith('admin-id', {
      password: 'configured-password',
    });
  });

  it('surfaces password update failures', async () => {
    fake.updateUserById.mockResolvedValue({ error: { message: 'provider unavailable' } });
    await expect(seedInitialAdmin({ syncPassword: true })).rejects.toThrow(
      'synchronizing the initial administrator password in Supabase Auth: Could not update initial administrator password: provider unavailable',
    );
  });
});
