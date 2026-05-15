export const ROLE_VALUES = Object.freeze([
  'super_admin',
  'admin',
  'lead_manager',
  'sales_head',
  'support_staff',
  'user',
]);

export const ADMIN_ROLES = Object.freeze(['admin', 'super_admin']);

export const normalizeRole = (role) => String(role || '').trim().toLowerCase();

export const isSuperAdmin = (roleOrUser) => normalizeRole(roleOrUser?.role || roleOrUser) === 'super_admin';

export const isAdminRole = (roleOrUser) => ADMIN_ROLES.includes(normalizeRole(roleOrUser?.role || roleOrUser));

export const isValidRole = (role) => ROLE_VALUES.includes(normalizeRole(role));
