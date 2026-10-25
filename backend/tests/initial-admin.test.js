import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  clientQuery: vi.fn(),
  updateUserById: vi.fn(),
  createUser: vi.fn(),
  config: {},
}));

vi.mock('@/lib/db', () => ({
  query: fake.query,
  withTransaction: fake.transaction,
}));
vi.mock('@/lib/config', () => ({
  getConfig: () => fake.config,
}));
vi.mock('@/lib/supabase', () => ({
  authAdminClient: () => ({
    auth: { admin: { createUser: fake.createUser, updateUserById: fake.updateUserById } },
  }),
}));

const { seedInitialAccounts, seedInitialAdmin } = await import('@/lib/initial-admin');

beforeEach(() => {
  vi.clearAllMocks();
  fake.config = { ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'configured-password' };
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
});

describe('seedInitialAccounts', () => {
  it('creates and activates the configured manager without changing the administrator', async () => {
    fake.config = {
      ADMIN_EMAIL: 'admin@example.com',
      ADMIN_PASSWORD: 'configured-password',
      MANAGER_EMAIL: 'manager@example.com',
      MANAGER_PASSWORD: 'manager-password',
      MANAGER_DEPARTMENT_ID: 'department-id',
    };
    fake.query
      .mockReset()
      .mockResolvedValueOnce({ rows: [{ id: 'admin-id' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'manager-id' }] });
    fake.clientQuery
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'admin-id', role: 'ADMIN', status: 'ACTIVE' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'manager-id', role: 'EMPLOYEE', status: 'PENDING', department_id: null,
      }] })
      .mockResolvedValueOnce({ rows: [{ id: 'department-id' }] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(seedInitialAccounts()).resolves.toBe(true);
    expect(fake.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("set role = $2, status = 'ACTIVE'"),
      ['manager-id', 'MANAGER', 'department-id'],
    );
  });

  it('creates a missing manager through Supabase Auth', async () => {
    fake.config = {
      MANAGER_EMAIL: 'manager@example.com',
      MANAGER_PASSWORD: 'manager-password',
      MANAGER_DEPARTMENT_ID: 'department-id',
    };
    fake.query.mockReset().mockResolvedValueOnce({ rows: [] });
    fake.clientQuery
      .mockReset()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: 'manager-id', role: 'EMPLOYEE', status: 'PENDING', department_id: null,
      }] })
      .mockResolvedValueOnce({ rows: [{ id: 'department-id' }] })
      .mockResolvedValueOnce({ rows: [] });
    fake.createUser.mockResolvedValue({ data: { user: { id: 'manager-id' } }, error: null });

    await expect(seedInitialAccounts()).resolves.toBe(true);
    expect(fake.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'manager@example.com',
      password: 'manager-password',
      email_confirm: true,
    }));
    expect(fake.clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("set role = $2, status = 'ACTIVE'"),
      ['manager-id', 'MANAGER', 'department-id'],
    );
  });
});

it('surfaces password update failures', async () => {
  fake.updateUserById.mockResolvedValue({ error: { message: 'provider unavailable' } });
  await expect(seedInitialAdmin({ syncPassword: true })).rejects.toThrow(
    'synchronizing the initial administrator password in Supabase Auth: Could not update initial administrator password: provider unavailable',
  );
});
