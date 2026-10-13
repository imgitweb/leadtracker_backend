import User from '../models/User.js';
import Company from '../models/Company.js';
import fs from 'fs';
import path from 'path';
import AuditLog from '../models/AuditLog.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class UserService {
  // Get user profile
  static async getProfile(userId) {
    const user = await User.findById(userId)
      .populate('company')
      .populate('teams');

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  // Update user profile
  static async updateProfile(userId, companyId, updateData) {
    const { fullName, phone, bio } = updateData;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        fullName: fullName || undefined,
        phone: phone || undefined,
        bio: bio || undefined,
      },
      { new: true, runValidators: true }
    ).populate('company');

    if (!user) {
      throw new Error('User not found');
    }

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'profile_updated',
      status: 'success',
    });

    return user;
  }

  // Change password
  static async changePassword(userId, companyId, oldPassword, newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw new Error('User not found');
    }

    // Verify old password
    const isMatch = await user.matchPassword(oldPassword);

    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'password_changed',
      status: 'success',
    });

    return { message: 'Password updated successfully' };
  }

  // Upload avatar
  static async uploadAvatar(userId, companyId, file) {
    if (!file) {
      throw new Error('No file provided');
    }

    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Delete old avatar if exists
    if (user.avatar) {
      const oldAvatarPath = path.join(__dirname, '../../', user.avatar);
      fs.unlink(oldAvatarPath, (err) => {
        if (err) console.error('Error deleting old avatar:', err);
      });
    }

    // Update user with new avatar
    user.avatar = `/uploads/avatars/${file.filename}`;
    await user.save();

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'avatar_uploaded',
      status: 'success',
    });

    return {
      avatar: user.avatar,
      message: 'Avatar uploaded successfully',
    };
  }

  // Get all users in company
  static async getCompanyUsers(companyId, page = 1, limit = 10) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find({ company: companyId })
      .select('-password')
      .skip(skip)
      .limit(parseInt(limit))
      

    const total = await User.countDocuments({ company: companyId });

    return {
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    };
  }

  // Delete user
  static async deleteUser(userId, companyId) {
    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Create audit log
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'user_deleted',
      status: 'success',
    });

    return { message: 'User deleted successfully' };
  }

  // Create a new user in the company (admin only)
  static async createCompanyUser(companyId, adminUserId, { fullName, email, password, role, moduleAccess }) {
    // Validate required fields
    if (!fullName || !email || !password) {
      throw new Error('Full name, email, and password are required');
    }

    const validRoles = ['admin', 'lead_manager', 'sales_head', 'support_staff', 'user'];
    const assignedRole = validRoles.includes(role) ? role : 'user';

    // Check if email already exists
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      throw new Error('A user with this email already exists');
    }

    // Verify the company exists
    const company = await Company.findById(companyId);
    if (!company) {
      throw new Error('Company not found');
    }

    // Check plan limits
    const currentUsersCount = await User.countDocuments({ company: companyId });
    if (currentUsersCount >= company.maxUsers) {
      throw new Error(`Plan limit reached: Your current plan only allows up to ${company.maxUsers} users. Please upgrade your plan.`);
    }

    // Prepare default or customized moduleAccess
    const defaultModuleAccess = {
      whatsapp: true,
      instagram: true,
      facebook: true,
      calling_agent: true,
      bulk_email: true,
      communication_hub: true,
      leads: true,
      analytics: true,
      ai_integration: true,
    };

    const finalModuleAccess = moduleAccess && typeof moduleAccess === 'object'
      ? { ...defaultModuleAccess, ...moduleAccess }
      : defaultModuleAccess;

    // Create the user
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: assignedRole,
      company: companyId,
      status: 'active',
      moduleAccess: finalModuleAccess,
    });

    // Audit log
    await AuditLog.create({
      user: adminUserId,
      company: companyId,
      action: 'user_created',
      status: 'success',
    });

    // Return without password
    const userObj = user.toJSON();
    return userObj;
  }

  // Update user module access (admin only)
  static async updateUserModuleAccess(targetUserId, companyId, adminUserId, moduleAccessPayload) {
    if (!moduleAccessPayload || typeof moduleAccessPayload !== 'object') {
      throw new Error('Invalid module access payload');
    }

    const user = await User.findOne({ _id: targetUserId, company: companyId });
    if (!user) {
      throw new Error('User not found in your company');
    }

    const currentAccess = user.moduleAccess ? (user.moduleAccess.toObject ? user.moduleAccess.toObject() : user.moduleAccess) : {};
    
    // Merge new values (convert truthy / falsy booleans safely)
    const allowedKeys = [
      'whatsapp',
      'instagram',
      'facebook',
      'calling_agent',
      'bulk_email',
      'communication_hub',
      'leads',
      'analytics',
      'ai_integration',
    ];

    const updatedAccess = { ...currentAccess };
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(moduleAccessPayload, key)) {
        updatedAccess[key] = Boolean(moduleAccessPayload[key]);
      } else if (typeof updatedAccess[key] !== 'boolean') {
        updatedAccess[key] = true;
      }
    }

    user.moduleAccess = updatedAccess;
    await user.save();

    await AuditLog.create({
      user: adminUserId,
      company: companyId,
      action: 'user_module_access_updated',
      status: 'success',
      changes: { after: { moduleAccess: updatedAccess } },
      description: `Updated module permissions for ${user.fullName || user.email}`,
    });

    return user;
  }

  // Update user role (admin only)
  static async updateUserRole(targetUserId, companyId, adminUserId, role) {
    const validRoles = ['admin', 'lead_manager', 'sales_head', 'support_staff', 'user'];
    if (!validRoles.includes(role)) {
      throw new Error('Invalid role');
    }

    const user = await User.findOne({ _id: targetUserId, company: companyId });
    if (!user) {
      throw new Error('User not found in your company');
    }

    user.role = role;
    await user.save();

    await AuditLog.create({
      user: adminUserId,
      company: companyId,
      action: 'user_role_updated',
      status: 'success',
    });

    return user;
  }

  // Update user status (admin only)
  static async updateUserStatus(targetUserId, companyId, adminUserId, status) {
    const validStatuses = ['active', 'inactive', 'suspended'];
    if (!validStatuses.includes(status)) {
      throw new Error('Invalid status');
    }

    if (targetUserId.toString() === adminUserId.toString()) {
      throw new Error('You cannot change your own status');
    }

    const user = await User.findOne({ _id: targetUserId, company: companyId });
    if (!user) {
      throw new Error('User not found in your company');
    }

    user.status = status;
    await user.save();

    let action = 'user_status_updated';
    if (status === 'suspended') action = 'user_suspended';
    else if (status === 'active') action = 'user_activated';

    await AuditLog.create({
      user: adminUserId,
      company: companyId,
      action,
      status: 'success',
      details: { newStatus: status, targetUserId }
    });

    return user;
  }
}
