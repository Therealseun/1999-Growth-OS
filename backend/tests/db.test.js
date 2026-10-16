import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { query, withTransaction } from '@/lib/db';
import { mapDbError } from '@/lib/errors';
import { createUser, resetData, shutdown } from './helpers.js';

beforeEach(resetData);
afterAll(shutdown);

describe('withTransaction', () =>
  it('records the acting user in the audit log', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await withTransaction(admin.id, (db) => db.query("insert into departments (name) values ('Schools desk')"));
    const { rows } = await query("select actor_id, action from audit_log where entity_type = 'departments'");
    expect(rows).toEqual([{ actor_id: admin.id, action: 'INSERT' }]);
  });

  it('rolls everything back when the callback throws', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await expect(
      withTransaction(admin.id, async (db) => {
        await db.query("insert into departments (name) values ('Ghost')");
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    const { rows } = await query("select 1 from departments where name = 'Ghost'");
    expect(rows).toHaveLength(0);
    const audit = await query("select 1 from audit_log where entity_type = 'departments'");
    expect(audit.rows).toHaveLength(0);
  });

  it('does not leak the actor to the next user of a pooled connection', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    await withTransaction(admin.id, (db) => db.query('select 1'));
    for (let i = 0; i < 6; i += 1) {
      const { rows } = await query("select nullif(current_setting('app.actor', true), '') as actor");
      expect(rows[0].actor).toBeNull();
    }
  });

  it('keeps concurrent transactions apart', async () => {
    const a = await createUser({ role: 'ADMIN' });
    const b = await createUser({ role: 'ADMIN' });
    await Promise.all([
      withTransaction(a.id, (db) => db.query("insert into departments (name) values ('A desk')")),
      withTransaction(b.id, (db) => db.query("insert into departments (name) values ('B desk')")),
    ]);
    const { rows } = await query(
      "select after ->> 'name' as name, actor_id from audit_log where entity_type = 'departments' order by name",
    );
    expect(rows).toEqual([
      { name: 'A desk', actor_id: a.id },
      { name: 'B desk', actor_id: b.id },
    ]);
  });

  it('refuses an actor that is not a uuid', async () => {
    await expect(withTransaction("x'; drop table profiles; --", async () => {})).rejects.toThrow(/uuid/);
  });

  it('works with no actor for system jobs', async () => {
    await withTransaction(null, (db) => db.query("insert into departments (name) values ('System')"));
    const { rows } = await query("select actor_id from audit_log where entity_type = 'departments'");
    expect(rows).toEqual([{ actor_id: null }]);
  });
});

describe('database rules reach the API as clean errors', () => {
  it('a duplicate becomes DUPLICATE (409)', async () => {
    await query("insert into departments (name) values ('Same')");
    const err = await query("insert into departments (name) values ('Same')").catch((e) => e);
    expect(mapDbError(err)).toMatchObject({ status: 409, code: 'DUPLICATE' });
  });

  it('an invalid uuid becomes INVALID_VALUE (422)', async () => {
    const err = await query('select * from profiles where id = $1', ['nope']).catch((e) => e);
    expect(mapDbError(err)).toMatchObject({ status: 422, code: 'INVALID_VALUE' });
  });

  it('the audit log cannot be deleted', async () => {
    await query("insert into departments (name) values ('x')");
    const err = await query('delete from audit_log').catch((e) => e);
    expect(mapDbError(err)).toMatchObject({ status: 409, code: 'RECORD_IMMUTABLE' });
  });

  it('a completed task is locked', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    const dept = (await query("insert into departments (name) values ('d') returning id")).rows[0].id;
    const campaign = (
      await query(
        "insert into campaigns (name, niche, offer, location, objective, department_id, created_by) values ('c','n','o','l','ob',$1,$2) returning id",
        [dept, admin.id],
      )
    ).rows[0].id;
    const prospect = (
      await query("insert into prospects (campaign_id, sift_id, organisation) values ($1,'s1','Org') returning id", [campaign])
    ).rows[0].id;
    await query(
      "insert into email_tasks (campaign_id, prospect_id, subject, body, status, sent_at) values ($1,$2,'s','b','SENT',now())",
      [campaign, prospect],
    );
    const err = await query("update email_tasks set subject = 'changed'").catch((e) => e);
    expect(mapDbError(err)).toMatchObject({ status: 409, code: 'TASK_LOCKED' });
  });
});
