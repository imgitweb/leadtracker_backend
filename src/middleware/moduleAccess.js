import { CompanyModuleService } from '../services/CompanyModuleService.js';

const MODULE_KEY_MAP = {
  bulk_email: 'bulk_email',
  integrations: 'communication_hub',
  communication_hub: 'communication_hub',
  calling_agent: 'calling_agent',
  whatsapp_leads: 'whatsapp',
  whatsapp: 'whatsapp',
  instagram_leads: 'instagram',
  instagram: 'instagram',
  facebook_leads: 'facebook',
  facebook: 'facebook',
  leads: 'leads',
  analytics: 'analytics',
  ai_integration: 'ai_integration',
};

const MODULE_TO_COMPANY_MAP = {
  communication_hub: 'integrations',
  integrations: 'integrations',
  whatsapp: 'whatsapp_leads',
  whatsapp_leads: 'whatsapp_leads',
  instagram: 'instagram_leads',
  instagram_leads: 'instagram_leads',
  facebook: 'facebook_leads',
  facebook_leads: 'facebook_leads',
  calling_agent: 'calling_agent',
  bulk_email: 'bulk_email',
  leads: 'leads',
  analytics: 'analytics',
  ai_integration: 'ai_integration',
};

export const requireModuleAccess = (moduleKey) => async (req, res, next) => {
  try {
    if (req.user?.role === 'super_admin') {
      return next();
    }

    if (req.user?.company?._id) {
      const record = await CompanyModuleService.getCompanyModules(req.user.company._id);
      const companyKey = MODULE_TO_COMPANY_MAP[moduleKey] || moduleKey;
      const allowed = record.modules.find((module) => module.key === companyKey);

      if (allowed && allowed.enabled === false) {
        return res.status(403).json({
          success: false,
          message: `Module '${moduleKey}' is disabled for your company`,
        });
      }
    }

    // Company admins have access to all enabled company modules
    if (req.user?.role === 'admin') {
      return next();
    }

    // For team members (user, lead_manager, sales_head, support_staff), verify user-level moduleAccess
    if (req.user?.moduleAccess) {
      const userKey = MODULE_KEY_MAP[moduleKey] || moduleKey;
      if (req.user.moduleAccess[userKey] === false) {
        return res.status(403).json({
          success: false,
          message: `You do not have permission to access the '${moduleKey}' module. Contact your administrator.`,
        });
      }
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

