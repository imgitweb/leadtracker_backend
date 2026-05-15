import mongoose from 'mongoose';
import User from '../../models/User.js';
import Company from '../../models/Company.js';
import Lead from '../../models/Lead.js';
import AuditLog from '../../models/AuditLog.js';
import { PLANS } from '../../config/plans.js';
import { generateToken, generateRefreshToken } from '../../utils/jwt.js';
import { isValidRole, normalizeRole } from '../utils/roles.js';
import { CompanyModuleService } from '../../services/CompanyModuleService.js';

const getPaging = (page = 1, limit = 20) => {
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
};

const buildSearchRegex = (value) => new RegExp(String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value).toLowerCase() === 'true';
};

const getCompanyCounts = async (companyIds) => {
  const ids = Array.from(new Set(companyIds.map((id) => String(id))));
  const [memberCounts, leadCounts] = await Promise.all([
    User.aggregate([
      { $match: { company: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$company', count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { companyId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } } },
      { $group: { _id: '$companyId', count: { $sum: 1 } } },
    ]),
  ]);

  const membersMap = new Map(memberCounts.map((item) => [String(item._id), item.count]));
  const leadsMap = new Map(leadCounts.map((item) => [String(item._id), item.count]));

  return { membersMap, leadsMap };
};

export class SuperAdminService {
  static async bootstrapSuperAdmin(seedData) {
    console.log('Bootstrapping super admin with data:', seedData);
    const fullName = String(seedData.fullName || seedData.name || '').trim();
    const email = String(seedData.email || '').trim().toLowerCase();
    const password = String(seedData.password || '');
    const companyName = String(seedData.companyName || 'Cinfy Platform').trim();
    const requestedPlan = normalizeRole(seedData.plan || 'enterprise') || 'enterprise';
    const plan = PLANS[requestedPlan] ? requestedPlan : 'enterprise';

    if (!fullName || !email || !password) {
      throw new Error('Super admin seed requires fullName, email, and password');
    }

    if (!isValidRole('super_admin')) {
      throw new Error('Invalid super admin role configuration');
    }

    let company = await Company.findOne({ name: companyName });
    let user = await User.findOne({ email });

    if (user && company) {
      user.fullName = fullName;
      user.password = password;
      user.markModified('password'); // Manually mark password as modified
      user.role = 'super_admin';
      user.status = 'active';
      user.company = company._id;
      await user.save();

      company.owner = user._id;
      if (!company.members.some((memberId) => String(memberId) === String(user._id))) {
        company.members.push(user._id);
      }
      company.plan = plan;
      await company.save();
      await CompanyModuleService.ensureCompanyModules(company._id, user._id);
    } else if (user && !company) {
      // This case is tricky. The user exists, but the target company name doesn't.
      // However, the error indicates a company with the name *does* exist.
      // We should re-fetch the company to be safe and link it.
      const existingCompany = await Company.findOne({ name: companyName });
      if (!existingCompany) {
        throw new Error(`Seeder error: User ${email} exists but company ${companyName} does not, and could not be created.`);
      }
      company = existingCompany;

      user.fullName = fullName;
      user.password = password;
      user.markModified('password');
      user.role = 'super_admin';
      user.status = 'active';
      user.company = company._id;
      await user.save();

      // Ensure user is a member of the company
      if (!company.members.some((memberId) => String(memberId) === String(user._id))) {
        company.members.push(user._id);
        await company.save();
      }

      await CompanyModuleService.ensureCompanyModules(company._id, user._id);
    } else {
      const userId = new mongoose.Types.ObjectId();
      const companyId = new mongoose.Types.ObjectId();

      company = new Company({
        _id: companyId,
        name: companyName,
        owner: userId,
        members: [userId],
        plan,
        industry: seedData.industry || 'other',
        website: seedData.website || null,
        description: seedData.description || 'Platform workspace for global super admin operations.',
        isActive: true,
      });

      user = new User({
        _id: userId,
        fullName,
        email,
        password,
        role: 'super_admin',
        status: 'active',
        company: companyId,
        phone: seedData.phone || null,
        bio: seedData.bio || null,
      });

      await user.save();
      await company.save();
      await CompanyModuleService.ensureCompanyModules(company._id, user._id);
    }

    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    return {
      user: user.toJSON(),
      company: company.toObject(),
      token,
      refreshToken,
    };
  }

  static async getOverview() {
    const [totalUsers, totalCompanies, activeCompanies, inactiveCompanies, superAdmins, activeUsers, recentAuditLogs, planBreakdown] = await Promise.all([
      User.countDocuments({}),
      Company.countDocuments({}),
      Company.countDocuments({ isActive: true }),
      Company.countDocuments({ isActive: false }),
      User.countDocuments({ role: 'super_admin' }),
      User.countDocuments({ status: 'active' }),
      AuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user company')
        .lean(),
      Company.aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      totals: {
        users: totalUsers,
        companies: totalCompanies,
        activeCompanies,
        inactiveCompanies,
        superAdmins,
        activeUsers,
      },
      planBreakdown: planBreakdown.map((item) => ({ plan: item._id, count: item.count })),
      recentAuditLogs,
      plans: this.getPlans(),
    };
  }

  static getPlans() {
    return Object.entries(PLANS).map(([key, value]) => ({
      key,
      name: value.name,
      maxUsers: value.maxUsers,
      maxLeads: value.maxLeads,
    }));
  }

  static async listUsers({ page = 1, limit = 20, search, role, status, companyId } = {}) {
    const { skip, limit: pageLimit, page: safePage } = getPaging(page, limit);
    const query = {};

    if (search) {
      const regex = buildSearchRegex(search);
      query.$or = [
        { fullName: regex },
        { email: regex },
      ];
    }

    if (role && normalizeRole(role) !== 'all') {
      query.role = normalizeRole(role);
    }

    if (status && normalizeRole(status) !== 'all') {
      query.status = normalizeRole(status);
    }

    if (companyId) {
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new Error('Invalid companyId');
      }
      query.company = companyId;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .populate('company', 'name plan isActive owner')
        .lean(),
      User.countDocuments(query),
    ]);

    return {
      users,
      pagination: {
        total,
        page: safePage,
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit),
      },
    };
  }

  static async getUser(userId) {
    const user = await User.findById(userId).populate('company', 'name plan isActive owner').lean();
    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  static async updateUserRole(userId, adminUserId, role) {
    const normalizedRole = normalizeRole(role);
    if (!isValidRole(normalizedRole)) {
      throw new Error('Invalid role');
    }

    if (String(userId) === String(adminUserId)) {
      throw new Error('You cannot change your own role');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.role === 'super_admin' && normalizedRole !== 'super_admin') {
      const superAdminCount = await User.countDocuments({ role: 'super_admin' });
      if (superAdminCount <= 1) {
        throw new Error('At least one super admin must remain active');
      }
    }

    user.role = normalizedRole;
    await user.save();

    await AuditLog.create({
      user: adminUserId,
      company: user.company,
      action: 'user_role_updated',
      resource: 'User',
      resourceId: user._id,
      changes: { after: { role: normalizedRole } },
      status: 'success',
      description: `Role updated to ${normalizedRole}`,
    });

    return user.toJSON();
  }

  static async updateUserStatus(userId, adminUserId, status) {
    const normalizedStatus = normalizeRole(status);
    const validStatuses = ['active', 'inactive', 'suspended'];

    if (!validStatuses.includes(normalizedStatus)) {
      throw new Error('Invalid status');
    }

    if (String(userId) === String(adminUserId)) {
      throw new Error('You cannot change your own status');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    user.status = normalizedStatus;
    await user.save();

    await AuditLog.create({
      user: adminUserId,
      company: user.company,
      action: 'user_status_updated',
      resource: 'User',
      resourceId: user._id,
      changes: { after: { status: normalizedStatus } },
      status: 'success',
      description: `Status updated to ${normalizedStatus}`,
    });

    return user.toJSON();
  }

  static async deleteUser(userId, adminUserId) {
    if (String(userId) === String(adminUserId)) {
      throw new Error('You cannot delete your own account');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const company = await Company.findById(user.company);
    if (company && String(company.owner) === String(user._id)) {
      throw new Error('Cannot delete the company owner. Reassign ownership first.');
    }

    if (user.role === 'super_admin') {
      const superAdminCount = await User.countDocuments({ role: 'super_admin' });
      if (superAdminCount <= 1) {
        throw new Error('At least one super admin must remain active');
      }
    }

    if (company) {
      await Company.updateOne({ _id: company._id }, { $pull: { members: user._id } });
    }

    await User.deleteOne({ _id: userId });

    await AuditLog.create({
      user: adminUserId,
      company: user.company,
      action: 'user_deleted',
      resource: 'User',
      resourceId: user._id,
      status: 'success',
      description: 'User deleted by super admin',
    });

    return { message: 'User deleted successfully' };
  }

  static async listCompanies({ page = 1, limit = 20, search, plan, isActive } = {}) {
    const { skip, limit: pageLimit, page: safePage } = getPaging(page, limit);
    const query = {};

    if (search) {
      query.name = buildSearchRegex(search);
    }

    if (plan && normalizeRole(plan) !== 'all') {
      query.plan = normalizeRole(plan);
    }

    if (typeof isActive !== 'undefined' && isActive !== null && isActive !== '') {
      query.isActive = String(isActive) === 'true';
    }

    const [companies, total] = await Promise.all([
      Company.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .populate('owner', 'fullName email role status avatar')
        .lean(),
      Company.countDocuments(query),
    ]);

    const companyIds = companies.map((company) => company._id);
    const { membersMap, leadsMap } = await getCompanyCounts(companyIds);

    const items = companies.map((company) => ({
      ...company,
      membersCount: membersMap.get(String(company._id)) || 0,
      leadsCount: leadsMap.get(String(company._id)) || 0,
    }));

    return {
      companies: items,
      pagination: {
        total,
        page: safePage,
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit),
      },
    };
  }

  static async createCompany(companyData, adminUserId) {
    const {
      companyName,
      ownerFullName,
      ownerEmail,
      ownerPassword,
      plan = 'free',
      modules: initialModules,
    } = companyData;

    if (!companyName || !ownerFullName || !ownerEmail || !ownerPassword) {
      throw new Error('Company name, owner details (full name, email, password) are required.');
    }

    const normalizedPlan = normalizeRole(plan);
    if (!PLANS[normalizedPlan]) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) {
      throw new Error(`Company with name "${companyName}" already exists.`);
    }

    const existingUser = await User.findOne({ email: ownerEmail });
    if (existingUser) {
      throw new Error(`User with email "${ownerEmail}" already exists.`);
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const ownerId = new mongoose.Types.ObjectId();
      const companyId = new mongoose.Types.ObjectId();

      const company = new Company({
        _id: companyId,
        name: companyName,
        owner: ownerId,
        members: [ownerId],
        plan: normalizedPlan,
        isActive: companyData.isActive !== undefined ? companyData.isActive : true,
      });

      const owner = new User({
        _id: ownerId,
        fullName: ownerFullName,
        email: ownerEmail,
        password: ownerPassword,
        role: 'admin', // Company owner is an admin by default
        status: 'active',
        company: companyId,
      });

      await company.save({ session });
      await owner.save({ session });

      // Ensure modules are created, then apply initial configuration
      const companyModuleDoc = await CompanyModuleService.ensureCompanyModules(companyId, ownerId, session);

      if (initialModules && Array.isArray(initialModules)) {
        await CompanyModuleService.updateCompanyModules(companyId, adminUserId, initialModules, session);
      }

      await AuditLog.create(
        [
          {
            user: adminUserId,
            company: companyId,
            action: 'company_created',
            resource: 'Company',
            resourceId: companyId,
            changes: { after: company.toObject() },
            status: 'success',
            description: `Company "${companyName}" created by super admin.`,
          },
        ],
        { session }
      );

      await session.commitTransaction();

      const newCompany = await this.getCompany(companyId);

      return newCompany;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  static async getCompany(companyId) {
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      throw new Error('Invalid companyId');
    }

    const company = await Company.findById(companyId).populate('owner', 'fullName email role status avatar').lean();
    if (!company) {
      throw new Error('Company not found');
    }

    const [membersCount, leadsCount] = await Promise.all([
      User.countDocuments({ company: company._id }),
      Lead.countDocuments({ companyId: company._id }),
    ]);

    return {
      ...company,
      membersCount,
      leadsCount,
    };
  }

  static async updateCompany(companyId, adminUserId, updateData) {
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const before = company.toObject();

    if (updateData.name) company.name = String(updateData.name).trim();
    if (updateData.website !== undefined) company.website = updateData.website || null;
    if (updateData.industry) company.industry = updateData.industry;
    if (updateData.description !== undefined) company.description = updateData.description || null;
    if (updateData.plan) {
      const normalizedPlan = normalizeRole(updateData.plan);
      if (!PLANS[normalizedPlan]) {
        throw new Error('Invalid plan');
      }
      company.plan = normalizedPlan;
    }
    if (typeof updateData.isActive !== 'undefined') company.isActive = parseBoolean(updateData.isActive);
    if (updateData.settings && typeof updateData.settings === 'object') {
      company.settings = {
        ...company.settings,
        ...updateData.settings,
      };
    }

    await company.save();

    await AuditLog.create({
      user: adminUserId,
      company: company._id,
      action: 'company_settings_updated',
      resource: 'Company',
      resourceId: company._id,
      changes: { before, after: company.toObject() },
      status: 'success',
      description: 'Company updated by super admin',
    });

    return company.toObject();
  }

  static async updateCompanyPlan(companyId, adminUserId, plan) {
    const normalizedPlan = normalizeRole(plan);
    if (!PLANS[normalizedPlan]) {
      throw new Error('Invalid plan');
    }

    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    company.plan = normalizedPlan;
    await company.save();

    await AuditLog.create({
      user: adminUserId,
      company: company._id,
      action: 'company_plan_changed',
      resource: 'Company',
      resourceId: company._id,
      changes: { after: { plan: normalizedPlan, maxUsers: company.maxUsers, maxLeads: company.maxLeads } },
      status: 'success',
      description: `Company plan updated to ${normalizedPlan}`,
    });

    return company.toObject();
  }

  static async updateCompanyStatus(companyId, adminUserId, isActive) {
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    company.isActive = parseBoolean(isActive);
    await company.save();

    await AuditLog.create({
      user: adminUserId,
      company: company._id,
      action: company.isActive ? 'company_plan_reactivated' : 'company_plan_cancelled',
      resource: 'Company',
      resourceId: company._id,
      changes: { after: { isActive: company.isActive } },
      status: 'success',
      description: company.isActive ? 'Company activated by super admin' : 'Company deactivated by super admin',
    });

    return company.toObject();
  }

  static async syncCompanyLimits(companyId, adminUserId) {
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    const planLimits = PLANS[company.plan] || PLANS.free;
    company.maxUsers = planLimits.maxUsers;
    company.maxLeads = planLimits.maxLeads;
    await company.save();

    await AuditLog.create({
      user: adminUserId,
      company: company._id,
      action: 'company_settings_updated',
      resource: 'Company',
      resourceId: company._id,
      changes: { after: { maxUsers: company.maxUsers, maxLeads: company.maxLeads } },
      status: 'success',
      description: 'Company limits synced from plan configuration',
    });

    return company.toObject();
  }

  static async getCompanyDetails(companyId) {
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      throw new Error('Invalid companyId');
    }

    const company = await Company.findById(companyId)
      .populate('owner', 'fullName email role status avatar phone')
      .lean();

    if (!company) {
      throw new Error('Company not found');
    }

    const companyObjectId = new mongoose.Types.ObjectId(companyId);

    const [
      members,
      leads,
      leadStatusBreakdown,
      recentAuditLogs,
      totalMembersCount,
      totalLeadsCount,
    ] = await Promise.all([
      // All members of this company
      User.find({ company: companyObjectId })
        .sort({ createdAt: -1 })
        .select('fullName email role status avatar phone lastLogin createdAt')
        .lean(),

      // Recent 50 leads
      Lead.find({ companyId: companyObjectId })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate('createdBy', 'fullName email')
        .populate('assignedTo', 'fullName email')
        .lean(),

      // Lead status breakdown
      Lead.aggregate([
        { $match: { companyId: companyObjectId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Recent audit logs for this company
      AuditLog.find({ company: companyObjectId })
        .sort({ createdAt: -1 })
        .limit(15)
        .populate('user', 'fullName email role')
        .lean(),

      // Total counts
      User.countDocuments({ company: companyObjectId }),
      Lead.countDocuments({ companyId: companyObjectId }),
    ]);

    // Build status map
    const statusMap = {};
    for (const item of leadStatusBreakdown) {
      statusMap[item._id] = item.count;
    }

    return {
      company: {
        ...company,
        membersCount: totalMembersCount,
        leadsCount: totalLeadsCount,
      },
      members,
      leads,
      leadStatusBreakdown: {
        New: statusMap['New'] || 0,
        Contacted: statusMap['Contacted'] || 0,
        Qualified: statusMap['Qualified'] || 0,
        Converted: statusMap['Converted'] || 0,
        Lost: statusMap['Lost'] || 0,
      },
      recentAuditLogs,
    };
  }

  static async listAuditLogs({ page = 1, limit = 20, action, status, userId, companyId } = {}) {
    const { skip, limit: pageLimit, page: safePage } = getPaging(page, limit);
    const query = {};

    if (action) query.action = action;
    if (status) query.status = status;
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error('Invalid userId');
      }
      query.user = userId;
    }
    if (companyId) {
      if (!mongoose.Types.ObjectId.isValid(companyId)) {
        throw new Error('Invalid companyId');
      }
      query.company = companyId;
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .populate('user', 'fullName email role')
        .populate('company', 'name plan isActive')
        .lean(),
      AuditLog.countDocuments(query),
    ]);

    return {
      logs,
      pagination: {
        total,
        page: safePage,
        limit: pageLimit,
        pages: Math.ceil(total / pageLimit),
      },
    };
  }
}
