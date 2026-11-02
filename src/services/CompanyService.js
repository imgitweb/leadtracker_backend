import CompanyModule from '../models/CompanyModule.js';
import { PLANS } from '../config/plans.js';
import Company from '../models/Company.js';
import User from '../models/User.js';
import Lead from '../models/Lead.js';
import ApiKey from '../models/ApiKey.js';
import AuditLog from '../models/AuditLog.js';
import { generateApiKey } from '../utils/jwt.js';
import crypto from 'crypto';

export class CompanyService {
  // Get company details
  static async getCompany(companyId) {
    const company = await Company.findById(companyId)
      .populate('owner');

    if (!company) {
      throw new Error('Company not found');
    }

    const membersCount = await User.countDocuments({ company: companyId });
    const leadsCount = await Lead.countDocuments({ companyId: companyId });
    
    // Ensure trial and subscription dates are 100% harmonized
    if (company.isTrial) {
      if (!company.trialExpiresAt) {
        company.trialDays = company.trialDays || 15;
        company.trialExpiresAt = new Date(new Date(company.createdAt || Date.now()).getTime() + company.trialDays * 24 * 60 * 60 * 1000);
        company.planEndDate = company.trialExpiresAt;
        await company.save();
      }
    } else {
      if (!company.planEndDate) {
        company.planEndDate = new Date(new Date(company.planStartDate || Date.now()).getTime() + 30 * 24 * 60 * 60 * 1000);
        await company.save();
      }
    }

    // Add counts to object
    const companyObj = company.toObject();
    companyObj.membersCount = membersCount;
    companyObj.leadsCount = leadsCount;
    companyObj.trialDays = company.trialDays || 15;
    companyObj.trialExpiresAt = company.trialExpiresAt;
    companyObj.planEndDate = company.planEndDate;

    return companyObj;
  }

  // Update company settings
  static async updateCompany(companyId, updateData, userId) {
    const company = await Company.findById(companyId);

    if (!company) {
      throw new Error('Company not found');
    }

    // Update fields
    if (updateData.name) company.name = updateData.name;
    if (updateData.website) company.website = updateData.website;
    if (updateData.industry) company.industry = updateData.industry;
    if (updateData.description) company.description = updateData.description;
    if (updateData.plan) company.plan = updateData.plan;

    await company.save(); // This triggers the pre-save hook to sync limits

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'company_settings_updated',
      status: 'success',
    });

    return company;
  }

  // Upgrade company subscription plan
  static async upgradePlan(companyId, plan, userId) {
    const company = await Company.findById(companyId);

    if (!company) {
      throw new Error('Company not found');
    }

    company.plan = plan;
    company.isTrial = false;
    company.planStartDate = new Date();
    company.planEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days active subscription
    
    // Auto-expand solutions based on upgraded plan
    const planConfig = PLANS[plan];
    if (planConfig && planConfig.solutionsIncluded) {
      const existingSolutions = new Set(company.solutions || []);
      planConfig.solutionsIncluded.forEach((s) => existingSolutions.add(s));
      company.solutions = Array.from(existingSolutions);
    }
    
    await company.save();

    // Sync CompanyModule permissions for the upgraded plan
    try {
      const companyModule = await CompanyModule.findOne({ company: company._id });
      if (companyModule && companyModule.modules) {
        // Base keys always available on paid plans
        const enabledKeys = new Set([
          'leads', 'analytics', 'settings', 'profile', 'users', 'company_settings', 'integrations'
        ]);
        if (company.solutions.includes('whatsapp')) {
          enabledKeys.add('whatsapp_leads');
          enabledKeys.add('inbox');
          enabledKeys.add('ai_integration');
        }
        if (company.solutions.includes('meta') || company.solutions.includes('facebook')) {
          enabledKeys.add('facebook_leads');
          enabledKeys.add('ai_integration');
        }
        if (company.solutions.includes('meta') || company.solutions.includes('instagram')) {
          enabledKeys.add('instagram_leads');
          enabledKeys.add('ai_integration');
        }
        if (company.solutions.includes('calling') || company.solutions.includes('calling_agent')) {
          enabledKeys.add('calling_agent');
        }
        if (company.solutions.includes('email') || company.solutions.includes('bulk_email')) {
          enabledKeys.add('bulk_email');
        }
        if (company.solutions.includes('ai') || company.solutions.includes('ai_integration')) {
          enabledKeys.add('ai_integration');
        }

        companyModule.modules = companyModule.modules.map((m) => ({
          key: m.key,
          enabled: enabledKeys.has(m.key),
        }));
        companyModule.syncedAt = new Date();
        companyModule.syncedBy = userId;
        await companyModule.save();
      }
    } catch (modErr) {
      console.error('Failed to sync CompanyModule on plan upgrade:', modErr);
    }

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'company_plan_upgraded',
      status: 'success',
      details: { plan },
    });

    return company;
  }

  // Generate API Key
  static async generateApiKey(companyId, userId, keyData) {
    const { name, description, permissions, expiresAt } = keyData;

    const key = generateApiKey();
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');

    const apiKey = new ApiKey({
      key,
      keyHash,
      name,
      description,
      user: userId,
      company: companyId,
      permissions: permissions || ['read'],
      expiresAt: expiresAt || null,
    });

    await apiKey.save();

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'api_key_generated',
      resourceId: apiKey._id,
      status: 'success',
    });

    // Return the key (only shown once)
    return {
      id: apiKey._id,
      key, // Only show key once
      name: apiKey.name,
      createdAt: apiKey.createdAt,
    };
  }

  // Get API Keys
  static async getApiKeys(companyId, page = 1, limit = 10) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const apiKeys = await ApiKey.find({ company: companyId })
      .select('-keyHash') // Don't return hash
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ApiKey.countDocuments({ company: companyId });

    return {
      apiKeys,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  // Regenerate API Key
  static async regenerateApiKey(companyId, userId, keyId) {
    const apiKey = await ApiKey.findById(keyId);

    if (!apiKey) {
      throw new Error('API Key not found');
    }

    // Generate new key
    const newKey = generateApiKey();
    apiKey.key = newKey;
    apiKey.keyHash = crypto.createHash('sha256').update(newKey).digest('hex');

    await apiKey.save();

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'api_key_regenerated',
      resourceId: keyId,
      status: 'success',
    });

    return {
      id: apiKey._id,
      key: newKey,
      name: apiKey.name,
    };
  }

  // Delete API Key
  static async deleteApiKey(companyId, userId, keyId) {
    const apiKey = await ApiKey.findByIdAndDelete(keyId);

    if (!apiKey) {
      throw new Error('API Key not found');
    }

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'api_key_deleted',
      resourceId: keyId,
      status: 'success',
    });

    return { message: 'API Key deleted successfully' };
  }

  // Get audit logs
  static async getAuditLogs(companyId, page = 1, limit = 20, filter = {}) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { company: companyId, ...filter };

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user');

    const total = await AuditLog.countDocuments(query);

    return {
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }
}
