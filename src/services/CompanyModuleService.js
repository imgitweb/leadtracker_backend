import mongoose from 'mongoose';
import Company from '../models/Company.js';
import CompanyModule from '../models/CompanyModule.js';
import SystemModule from '../models/SystemModule.js';
import AuditLog from '../models/AuditLog.js';

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value).toLowerCase() === 'true';
};

const normalizePayload = (payload) => {
  if (Array.isArray(payload)) {
    return payload.reduce((acc, item) => {
      if (item?.key) acc[item.key] = normalizeBoolean(item.enabled);
      return acc;
    }, {});
  }

  if (payload && typeof payload === 'object') {
    return Object.entries(payload).reduce((acc, [key, value]) => {
      acc[key] = normalizeBoolean(value);
      return acc;
    }, {});
  }

  return {};
};

export class CompanyModuleService {
  static async getSystemModules() {
    return await SystemModule.find().sort({ createdAt: 1 }).lean();
  }

  static async ensureCompanyModules(companyId, syncedBy = null) {
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      throw new Error('Invalid companyId');
    }

    const company = await Company.findById(companyId).select('_id');
    if (!company) {
      throw new Error('Company not found');
    }

    const systemModules = await this.getSystemModules();
    let record = await CompanyModule.findOne({ company: companyId });

    if (!record) {
      const defaultModules = systemModules.map((module) => ({
        key: module.key,
        enabled: module.defaultEnabled !== false,
      }));

      record = await CompanyModule.create({
        company: companyId,
        modules: defaultModules,
        syncedBy,
      });
      return record;
    }

    // Merge with defaults
    const existingMap = new Map(record.modules.map((module) => [module.key, module]));
    record.modules = systemModules.map((definition) => ({
      key: definition.key,
      enabled: typeof existingMap.get(definition.key)?.enabled === 'boolean'
        ? existingMap.get(definition.key).enabled
        : definition.defaultEnabled !== false,
    }));

    record.syncedAt = new Date();
    record.syncedBy = syncedBy;
    await record.save();
    return record;
  }

  static async syncAllCompanies(syncedBy = null) {
    const companies = await Company.find({}, '_id').lean();
    const systemModules = await this.getSystemModules();

    for (const company of companies) {
      await this.ensureCompanyModules(company._id, syncedBy);
    }

    return {
      syncedCompanies: companies.length,
      moduleCount: systemModules.length,
    };
  }

  static async getCompanyModules(companyId) {
    const record = await this.ensureCompanyModules(companyId);
    return record.toObject();
  }

  static async updateCompanyModules(companyId, adminUserId, modulesPayload) {
    const record = await this.ensureCompanyModules(companyId, adminUserId);
    const systemModules = await this.getSystemModules();
    const payload = normalizePayload(modulesPayload);

    record.modules = systemModules.map((definition) => ({
      key: definition.key,
      enabled: Object.prototype.hasOwnProperty.call(payload, definition.key)
        ? payload[definition.key]
        : (record.modules.find((module) => module.key === definition.key)?.enabled ?? definition.defaultEnabled !== false),
    }));
    record.syncedAt = new Date();
    record.syncedBy = adminUserId;
    await record.save();

    await AuditLog.create({
      user: adminUserId,
      company: companyId,
      action: 'company_settings_updated',
      resource: 'CompanyModule',
      resourceId: record._id,
      changes: { after: { modules: record.modules } },
      status: 'success',
      description: 'Company module access updated by super admin',
    });

    return record.toObject();
  }
}
