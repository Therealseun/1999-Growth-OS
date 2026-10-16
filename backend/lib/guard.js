import { forbidden, notFound } from './errors.js';

// Authorisation helpers. Roles: ADMIN sees everything, MANAGER sees their own department,
// EMPLOYEE sees their own work. Anything outside a caller's scope answers 404, not 403,
// so the API does not reveal that the record exists.

export const isAdmin = (profile) => profile.role === 'ADMIN';

export function requireRole(profile, roles) {
  if (!roles.includes(profile.role)) {
    throw forbidden('Your role cannot do this', 'ROLE_NOT_ALLOWED');
  }
}

export function canSeeDepartment(profile, departmentId) {
  if (isAdmin(profile)) return true;
  return profile.role === 'MANAGER' && profile.department_id != null && profile.department_id === departmentId;
}

export function assertCanSeeDepartment(profile, departmentId) {
  if (!canSeeDepartment(profile, departmentId)) throw notFound();
}

// target: { id, department_id } of the employee whose data is being requested.
export function canSeeEmployee(profile, target) {
  if (isAdmin(profile)) return true;
  if (profile.id === target.id) return true;
  return canSeeDepartment(profile, target.department_id);
}

export function assertCanSeeEmployee(profile, target) {
  if (!canSeeEmployee(profile, target)) throw notFound();
}
