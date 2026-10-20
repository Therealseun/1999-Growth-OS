import { query, withTransaction } from './db.js';
import { getConfig } from './config.js';
import { authAdminClient } from './supabase.js';

export async function seedInitialAdmin() {
  let phase = 'loading configuration';
  try {
    const { ADMIN_EMAIL, ADMIN_PASSWORD } = getConfig();
    if (!ADMIN_EMAIL && !ADMIN_PASSWORD) return false;

    const email = ADMIN_EMAIL.toLowerCase();
    phase = 'checking for the initial administrator in PostgreSQL';
    const existingProfile = await query(
      'select id from profiles where lower(email) = $1',
      [email],
    );
    const activeAdmins = await query(
      "select id from profiles where role = 'ADMIN' and status = 'ACTIVE'",
    );

    if (activeAdmins.rows.some((admin) => admin.id !== existingProfile.rows[0]?.id)) {
      throw new Error('An active administrator already exists; refusing to seed a different account');
    }

    if (!existingProfile.rows[0]) {
      phase = 'creating the initial administrator through Supabase Auth';
      const { data, error } = await authAdminClient().auth.admin.createUser({
        email,
        password: ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { name: email.slice(0, email.indexOf('@')) },
      });

      if (error) {
        phase = 'checking whether Supabase Auth created the initial administrator in PostgreSQL';
        const profile = await query(
          'select id from profiles where lower(email) = $1',
          [email],
        );
        if (!profile.rows[0]) {
          throw new Error(`Could not create initial administrator account: ${error.message}`);
        }
      } else if (!data.user) {
        throw new Error('Supabase did not return the created administrator account');
      }
    }

    phase = 'promoting the initial administrator in PostgreSQL';
    await withTransaction(null, async (client) => {
      await client.query('lock table profiles in share row exclusive mode');
      const { rows: [profile] } = await client.query(
        'select id, role, status from profiles where lower(email) = $1 for update',
        [email],
      );
      if (!profile) {
        throw new Error('The administrator profile was not created by Supabase Auth');
      }

      const { rows: [activeAdmin] } = await client.query(
        "select id from profiles where role = 'ADMIN' and status = 'ACTIVE' limit 1",
      );
      if (activeAdmin && activeAdmin.id !== profile.id) {
        throw new Error('An active administrator already exists; refusing to seed a different account');
      }

      if (profile.role !== 'ADMIN' || profile.status !== 'ACTIVE') {
        await client.query(
          `update profiles
           set role = 'ADMIN', status = 'ACTIVE', approved_by = id,
               approved_at = now(), updated_at = now()
           where id = $1`,
          [profile.id],
        );
      }
    });

    return true;
  } catch (err) {
    throw new Error(`${phase}: ${err.message}`, { cause: err });
  }
}
