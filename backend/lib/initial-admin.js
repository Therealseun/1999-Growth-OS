import { query, withTransaction } from './db.js';
import { getConfig } from './config.js';
import { authAdminClient } from './supabase.js';

async function seedRoleAccount(role, email, password, { syncPassword = false, departmentId } = {}) {
  const accountType = role === 'ADMIN' ? 'administrator' : 'manager';
  let phase = 'loading configuration';
  try {
    const normalizedEmail = email.toLowerCase();
    phase = `checking for the initial ${accountType} in PostgreSQL`;
    const existingProfile = await query(
      'select id from profiles where lower(email) = $1',
      [normalizedEmail],
    );

    if (role === 'ADMIN') {
      const activeAdmins = await query(
        "select id from profiles where role = 'ADMIN' and status = 'ACTIVE'",
      );
      if (activeAdmins.rows.some((admin) => admin.id !== existingProfile.rows[0]?.id)) {
        throw new Error('An active administrator already exists; refusing to seed a different account');
      }
    }

    if (!existingProfile.rows[0]) {
      phase = `creating the initial ${accountType} through Supabase Auth`;
      const { data, error } = await authAdminClient().auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { name: normalizedEmail.slice(0, normalizedEmail.indexOf('@')) },
      });

      if (error) {
        phase = `checking whether Supabase Auth created the initial ${accountType} in PostgreSQL`;
        const profile = await query(
          'select id from profiles where lower(email) = $1',
          [normalizedEmail],
        );
        if (!profile.rows[0]) {
          throw new Error(`Could not create initial ${accountType} account: ${error.message}`);
        }
      } else if (!data.user) {
        throw new Error(`Supabase did not return the created ${accountType} account`);
      }
    }

    phase = `promoting the initial ${accountType} in PostgreSQL`;
    const accountId = await withTransaction(null, async (client) => {
      await client.query('lock table profiles in share row exclusive mode');
      const { rows: [profile] } = await client.query(
        'select id, role, status, department_id from profiles where lower(email) = $1 for update',
        [normalizedEmail],
      );
      if (!profile) {
        throw new Error(`The ${accountType} profile was not created by Supabase Auth`);
      }

      if (role === 'ADMIN') {
        const { rows: [activeAdmin] } = await client.query(
          "select id from profiles where role = 'ADMIN' and status = 'ACTIVE' limit 1",
        );
        if (activeAdmin && activeAdmin.id !== profile.id) {
          throw new Error('An active administrator already exists; refusing to seed a different account');
        }
      } else if (profile.role === 'ADMIN') {
        throw new Error('The configured manager account is already an administrator; refusing to demote it');
      }

      if (role === 'MANAGER') {
        const { rows: [department] } = await client.query(
          'select id from departments where id = $1',
          [departmentId],
        );
        if (!department) {
          throw new Error('The configured manager department does not exist');
        }
      }

      if (profile.role !== role || profile.status !== 'ACTIVE'
          || (role === 'MANAGER' && profile.department_id !== departmentId)) {
        if (role === 'MANAGER') {
          await client.query(
            `update profiles
             set role = $2, status = 'ACTIVE', department_id = $3, approved_by = id,
                 approved_at = now(), updated_at = now()
             where id = $1`,
            [profile.id, role, departmentId],
          );
        } else {
          await client.query(
            `update profiles
             set role = $2, status = 'ACTIVE', approved_by = id,
                 approved_at = now(), updated_at = now()
             where id = $1`,
            [profile.id, role],
          );
        }
      }
      return profile.id;
    });

    if (syncPassword) {
      phase = `synchronizing the initial ${accountType} password in Supabase Auth`;
      const { error } = await authAdminClient().auth.admin.updateUserById(accountId, {
        password,
      });
      if (error) {
        throw new Error(`Could not update initial ${accountType} password: ${error.message}`);
      }
    }

    return accountId;
  } catch (err) {
    throw new Error(`${phase}: ${err.message}`, { cause: err });
  }
}

export async function seedInitialAdmin(options = {}) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = getConfig();
  if (!ADMIN_EMAIL && !ADMIN_PASSWORD) return false;
  await seedRoleAccount('ADMIN', ADMIN_EMAIL, ADMIN_PASSWORD, options);
  return true;
}

export async function seedInitialAccounts(options = {}) {
  const {
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    MANAGER_EMAIL,
    MANAGER_PASSWORD,
    MANAGER_DEPARTMENT_ID,
  } = getConfig();
  if (!ADMIN_EMAIL && !ADMIN_PASSWORD && !MANAGER_EMAIL && !MANAGER_PASSWORD) return false;

  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    await seedRoleAccount('ADMIN', ADMIN_EMAIL, ADMIN_PASSWORD, options);
  }
  if (MANAGER_EMAIL && MANAGER_PASSWORD) {
    await seedRoleAccount('MANAGER', MANAGER_EMAIL, MANAGER_PASSWORD, {
      ...options,
      departmentId: MANAGER_DEPARTMENT_ID,
    });
  }
  return true;
}
