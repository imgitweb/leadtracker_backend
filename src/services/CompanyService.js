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
    
    // Add counts to object
    const companyObj = company.toObject();
    companyObj.membersCount = membersCount;
    companyObj.leadsCount = leadsCount;

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
