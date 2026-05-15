import { isSuperAdmin, normalizeRole } from '../utils/roles.js';

export const requireSuperAdmin = (req, res, next) => {
  const role = normalizeRole(req.user?.role);

  if (!isSuperAdmin(role)) {
    return res.status(403).json({
      success: false,
      message: `User role '${req.user?.role || 'guest'}' is not authorized to access super admin routes`,
    });
  }

  next();
};
