import { describe, expect, it, vi } from 'vitest';
import { ApiError, conflict, errorResponse, mapDbError, notFound } from '@/lib/errors';
import { assertCanSeeDepartment, assertCanSeeEmployee, canSeeEmployee, requireRole } from '@/lib/guard';

describe('mapDbError', () => {
  it('maps the locked task trigger to TASK_LOCKED', () => {
    const e = mapDbError({ code: '42501', message: 'completed task abc is locked' });
    expect([e.status, e.code]).toEqual([409, 'TASK_LOCKED']);
  });
  it('maps append-only tables to RECORD_IMMUTABLE', () => {
    const e = mapDbError({ code: '42501', message: 'daily_workloads is append-only (UPDATE not allowed)' });
    expect([e.status, e.code]).toEqual([409, 'RECORD_IMMUTABLE']);
  });
  it('maps unique, foreign key, check and not-null violations', () => {
    expect(mapDbError({ code: '23505', constraint: 'x' })).toMatchObject({ status: 409, code: 'DUPLICATE' });
    expect(mapDbError({ code: '23503' })).toMatchObject({ status: 422, code: 'REFERENCE_NOT_FOUND' });
    expect(mapDbError({ code: '23514' })).toMatchObject({ status: 422, code: 'CONSTRAINT_VIOLATED' });
    expect(mapDbError({ code: '23502', column: 'name' })).toMatchObject({ status: 422, code: 'MISSING_FIELD' });
    expect(mapDbError({ code: '22P02' })).toMatchObject({ status: 422, code: 'INVALID_VALUE' });
  });
  it('returns null for errors it does not know', () => {
    expect(mapDbError(new Error('boom'))).toBeNull();
    expect(mapDbError({ code: 'XX000' })).toBeNull();
  });
});

describe('errorResponse', () => {
  it('uses the standard error shape and sends the request id', async () => {
    const res = errorResponse(conflict('Nope', 'SOME_CODE', { a: 1 }), 'req-1');
    expect(res.status).toBe(409);
    expect(res.headers.get('x-request-id')).toBe('req-1');
    expect(await res.json()).toEqual({ error: { code: 'SOME_CODE', message: 'Nope', details: { a: 1 } } });
  });
  it('hides the cause of unexpected errors and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = errorResponse(new Error('password=hunter2 leaked'), 'req-2');
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.error.message).toContain('req-2');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

const admin = { id: 'a', role: 'ADMIN', department_id: null };
const managerA = { id: 'm', role: 'MANAGER', department_id: 'dept-a' };
const employeeA = { id: 'e', role: 'EMPLOYEE', department_id: 'dept-a' };

describe('guard', () => {
  it('requireRole allows listed roles only', () => {
    expect(() => requireRole(admin, ['ADMIN'])).not.toThrow();
    expect(() => requireRole(employeeA, ['ADMIN', 'MANAGER'])).toThrowError(ApiError);
    try {
      requireRole(employeeA, ['ADMIN']);
    } catch (e) {
      expect([e.status, e.code]).toEqual([403, 'ROLE_NOT_ALLOWED']);
    }
  });
  it('department access: admin all, manager own, employee none', () => {
    expect(() => assertCanSeeDepartment(admin, 'dept-b')).not.toThrow();
    expect(() => assertCanSeeDepartment(managerA, 'dept-a')).not.toThrow();
    expect(() => assertCanSeeDepartment(managerA, 'dept-b')).toThrowError(ApiError);
    expect(() => assertCanSeeDepartment(employeeA, 'dept-a')).toThrowError(ApiError);
  });
  it('out of scope answers 404 so existence is not revealed', () => {
    try {
      assertCanSeeDepartment(managerA, 'dept-b');
    } catch (e) {
      expect(e.status).toBe(notFound().status);
    }
  });
  it('employee access: self, same department manager, admin', () => {
    expect(canSeeEmployee(employeeA, { id: 'e', department_id: 'dept-a' })).toBe(true);
    expect(canSeeEmployee(employeeA, { id: 'other', department_id: 'dept-a' })).toBe(false);
    expect(canSeeEmployee(managerA, { id: 'other', department_id: 'dept-a' })).toBe(true);
    expect(canSeeEmployee(managerA, { id: 'other', department_id: 'dept-b' })).toBe(false);
    expect(canSeeEmployee(admin, { id: 'other', department_id: 'dept-b' })).toBe(true);
    expect(() => assertCanSeeEmployee(managerA, { id: 'x', department_id: 'dept-b' })).toThrowError(ApiError);
  });
  it('a manager with no department sees nobody', () => {
    const lost = { id: 'm2', role: 'MANAGER', department_id: null };
    expect(canSeeEmployee(lost, { id: 'x', department_id: null })).toBe(false);
  });
});
