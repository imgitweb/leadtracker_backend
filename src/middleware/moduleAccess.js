import { CompanyModuleService } from '../services/CompanyModuleService.js';

export const requireModuleAccess = (moduleKey) => async (req, res, next) => {
  try {
    if (req.user?.role === 'super_admin') {
      return next();
    }

    const record = await CompanyModuleService.getCompanyModules(req.user.company._id);
    const allowed = record.modules.find((module) => module.key === moduleKey);

    if (!allowed?.enabled) {
      return res.status(403).json({
        success: false,
        message: `Module '${moduleKey}' is disabled for your company`,
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to validate module access',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
