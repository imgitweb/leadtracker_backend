import { sendWelcomeEmail } from "./emailService.js";
import User from '../models/User.js';
import Company from '../models/Company.js';
import { generateToken, generateRefreshToken } from '../utils/jwt.js';
import AuditLog from '../models/AuditLog.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CompanyModuleService } from './CompanyModuleService.js';
import CompanyModule from '../models/CompanyModule.js';
import { OtpService } from './OtpService.js';


export class AuthService {
  // Helper to check duplicate email across casing
  static async checkExistingEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    return await User.findOne({
      $or: [
        { email: normalized },
        { email: new RegExp('^' + normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') },
      ],
    });
  }

  // Helper to check duplicate phone across any formatting
  static async checkExistingPhone(phone) {
    if (!phone) return null;
    const cleanDigits = String(phone).replace(/\D/g, '');
    if (cleanDigits.length < 7) return null;
    const last10 = cleanDigits.slice(-10);

    const variants = [
      cleanDigits,
      last10,
      `+91${last10}`,
      `91${last10}`,
      `0${last10}`,
      `+${cleanDigits}`,
    ];

    return await User.findOne({
      $or: [
        { phone: { $in: variants } },
        { phone: new RegExp(`${last10}$`) },
      ],
    });
  }

  // Auto Signup: Creates company, user, module access, logs in and returns session tokens
  static async autoSignup(data) {
    const {
      fullName,
      businessName,
      email,
      phone,
      solutions = [],
      emailOtp,
      phoneOtp,
      password,
    } = data;

    if (!fullName || !fullName.trim()) {
      throw new Error('Full Name is required');
    }
    if (!email || !email.trim()) {
      throw new Error('Email address is required');
    }
    if (!phone || !phone.trim()) {
      throw new Error('WhatsApp number is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const cleanPhone = String(phone).replace(/\D/g, '');

    // Prevent duplicate email registration
    const existingEmailUser = await this.checkExistingEmail(normalizedEmail);
    if (existingEmailUser) {
      throw new Error('This email address is already registered. Please sign in instead.');
    }

    // Prevent duplicate mobile number registration
    if (cleanPhone) {
      const existingPhoneUser = await this.checkExistingPhone(cleanPhone);
      if (existingPhoneUser) {
        throw new Error('This mobile number is already registered. Please sign in instead.');
      }
    }

    // Verify OTP only if not already verified in Step 3
    const alreadyVerified = await OtpService.isVerified(normalizedEmail);
    if (!alreadyVerified && (emailOtp || phoneOtp)) {
      await OtpService.verifyOtp({
        email: normalizedEmail,
        phone: cleanPhone,
        emailOtp,
        phoneOtp,
      });
    }

    // Determine unique company name
    const rawCompanyName = (businessName && businessName.trim()) || `${fullName.trim()}'s Business`;
    let companyName = rawCompanyName;
    let existingCompany = await Company.findOne({ name: companyName });
    let counter = 1;
    while (existingCompany) {
      companyName = `${rawCompanyName} ${counter++}`;
      existingCompany = await Company.findOne({ name: companyName });
    }

    // Create company with dynamic trial and save selected solutions
    const trialDays = 15;
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const company = new Company({
      name: companyName,
      owner: null,
      plan: 'enterprise',
      isTrial: true,
      trialDays,
      solutions: solutions || [],
      planStartDate: now,
      planEndDate: trialEndDate,
      trialExpiresAt: trialEndDate,
    });

    // Auto-generate a secure password if not provided, or use custom user password
    const userPassword = password && password.trim().length >= 6
      ? password.trim()
      : crypto.randomBytes(8).toString('hex') + 'A1!';

    const hasSol = (keys) => !solutions || solutions.length === 0 || keys.some((k) => solutions.includes(k));
    const hasWa = hasSol(['whatsapp']);
    const hasMeta = hasSol(['meta', 'facebook', 'instagram']);
    const hasCalling = hasSol(['calling', 'calling_agent']);
    const hasEmail = hasSol(['email', 'bulk_email']);

    const userInstance = new User({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      selectedSolutions: solutions || [],
      password: userPassword,
      company: company._id,
      role: 'admin',
      moduleAccess: {
        whatsapp: hasWa,
        facebook: hasMeta,
        instagram: hasMeta,
        calling_agent: hasCalling,
        bulk_email: hasEmail,
        communication_hub: true,
        leads: true,
        analytics: true,
        ai_integration: true,
      },
      lastLogin: new Date(),
    });

    company.owner = userInstance._id;
    company.members.push(userInstance._id);

    await userInstance.save();
    await company.save();
    await CompanyModuleService.ensureCompanyModules(company._id, userInstance._id);

    // Save selected solutions to CompanyModule
    if (Array.isArray(solutions) && solutions.length > 0) {
      const solutionKeyMap = {
        whatsapp: ['whatsapp_leads', 'inbox', 'ai_integration'],
        meta: ['facebook_leads', 'instagram_leads', 'ai_integration'],
        facebook: ['facebook_leads', 'ai_integration'],
        instagram: ['instagram_leads', 'ai_integration'],
        calling: ['calling_agent'],
        calling_agent: ['calling_agent'],
        email: ['bulk_email'],
        bulk_email: ['bulk_email'],
        crm: ['leads', 'analytics'],
        leads: ['leads'],
        ai: ['ai_integration'],
        ai_integration: ['ai_integration'],
      };

      const enabledSet = new Set(['leads', 'analytics', 'settings', 'profile', 'users', 'company_settings', 'integrations']);
      solutions.forEach((sol) => {
        const keys = solutionKeyMap[sol] || [sol];
        keys.forEach((k) => enabledSet.add(k));
      });

      const companyModule = await CompanyModule.findOne({ company: company._id });
      if (companyModule && companyModule.modules) {
        companyModule.modules = companyModule.modules.map((m) => ({
          key: m.key,
          enabled: enabledSet.has(m.key),
        }));
        companyModule.syncedAt = new Date();
        companyModule.syncedBy = userInstance._id;
        await companyModule.save();
      }
    }

    const token = generateToken(userInstance._id);
    const refreshToken = generateRefreshToken(userInstance._id);

    await AuditLog.create({
      user: userInstance._id,
      company: company._id,
      action: 'user_created',
      status: 'success',
      details: {
        businessName: company.name,
        phone: cleanPhone,
        solutions,
      },
    });

    // Send professional Welcome Email & WhatsApp message asynchronously
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    sendWelcomeEmail({
      email: normalizedEmail,
      fullName: userInstance.fullName,
      companyName: company.name,
      solutions,
      trialDays,
      loginUrl,
    }).catch((e) => console.error('Welcome email sending error:', e.message));

    OtpService.sendWhatsAppWelcomeMessage({
      phone: cleanPhone,
      fullName: userInstance.fullName,
      companyName: company.name,
      solutions,
      trialDays,
    }).catch((e) => console.error('Welcome WhatsApp sending error:', e.message));

    return {
      user: userInstance.toJSON(),
      token,
      refreshToken,
      company,
      isExistingUser: false,
    };
  }

  // Register user
  static async register(userData) {
    const { fullName, email, phone, password, confirmPassword, companyName, solutions = [] } = userData;

    // Validate passwords match
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      throw new Error('Email is required');
    }

    // Check if user already exists by email
    const userExists = await this.checkExistingEmail(normalizedEmail);
    if (userExists) {
      throw new Error('This email address is already registered. Please sign in instead.');
    }

    // Check if phone already exists
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : null;
    if (cleanPhone) {
      const phoneExists = await this.checkExistingPhone(cleanPhone);
      if (phoneExists) {
        throw new Error('This mobile number is already registered. Please sign in instead.');
      }
    }

    // Determine unique company name
    const finalCompanyName = (companyName && companyName.trim()) || `${fullName.trim()}'s Workspace`;
    let uniqueCompanyName = finalCompanyName;
    let existingCompany = await Company.findOne({ name: uniqueCompanyName });
    let counter = 1;
    while (existingCompany) {
      uniqueCompanyName = `${finalCompanyName} ${counter++}`;
      existingCompany = await Company.findOne({ name: uniqueCompanyName });
    }

    // Create company with dynamic trial configured by SuperAdmin
    const trialDays = 15;
    const now = new Date();
    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const company = new Company({
      name: uniqueCompanyName,
      owner: null,
      plan: 'enterprise',
      isTrial: true,
      trialDays,
      solutions: solutions || [],
      planStartDate: now,
      planEndDate: trialEndDate,
      trialExpiresAt: trialEndDate,
    });

    const hasRegSol = (keys) => !solutions || solutions.length === 0 || keys.some((k) => solutions.includes(k));
    const hasRegWa = hasRegSol(['whatsapp']);
    const hasRegMeta = hasRegSol(['meta', 'facebook', 'instagram']);
    const hasRegCalling = hasRegSol(['calling', 'calling_agent']);
    const hasRegEmail = hasRegSol(['email', 'bulk_email']);

    // Create admin user
    const user = new User({
      fullName: fullName.trim(),
      email: normalizedEmail,
      phone: cleanPhone,
      selectedSolutions: solutions || [],
      password,
      company: company._id,
      role: 'admin', // First user is admin
      moduleAccess: {
        whatsapp: hasRegWa,
        facebook: hasRegMeta,
        instagram: hasRegMeta,
        calling_agent: hasRegCalling,
        bulk_email: hasRegEmail,
        communication_hub: true,
        leads: true,
        analytics: true,
        ai_integration: true,
      },
      lastLogin: new Date(),
    });

    // Set company owner
    company.owner = user._id;
    company.members.push(user._id);

    await user.save();
    await company.save();

    // Save what user chose in CompanyModule!
    await CompanyModuleService.ensureCompanyModules(company._id, user._id);

    if (Array.isArray(solutions) && solutions.length > 0) {
      const solutionKeyMap = {
        whatsapp: ['whatsapp_leads', 'inbox', 'ai_integration'],
        meta: ['facebook_leads', 'instagram_leads', 'ai_integration'],
        facebook: ['facebook_leads', 'ai_integration'],
        instagram: ['instagram_leads', 'ai_integration'],
        calling: ['calling_agent'],
        calling_agent: ['calling_agent'],
        email: ['bulk_email'],
        bulk_email: ['bulk_email'],
        crm: ['leads', 'analytics'],
        leads: ['leads'],
        ai: ['ai_integration'],
        ai_integration: ['ai_integration'],
      };

      const enabledSet = new Set(['leads', 'analytics', 'settings', 'profile', 'users', 'company_settings', 'integrations']);
      solutions.forEach((sol) => {
        const keys = solutionKeyMap[sol] || [sol];
        keys.forEach((k) => enabledSet.add(k));
      });

      const companyModule = await CompanyModule.findOne({ company: company._id });
      if (companyModule && companyModule.modules) {
        companyModule.modules = companyModule.modules.map((m) => ({
          key: m.key,
          enabled: enabledSet.has(m.key),
        }));
        companyModule.syncedAt = new Date();
        companyModule.syncedBy = user._id;
        await companyModule.save();
      }
    }

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Create audit log
    await AuditLog.create({
      user: user._id,
      company: company._id,
      action: 'user_created',
      status: 'success',
      details: {
        phone: cleanPhone,
        solutions,
      },
    });

    // Send professional Welcome Email & WhatsApp message asynchronously
    const loginUrlReg = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/login`;
    sendWelcomeEmail({
      email: normalizedEmail,
      fullName: user.fullName,
      companyName: company.name,
      solutions,
      trialDays: company.trialDays || 15,
      loginUrl: loginUrlReg,
    }).catch((e) => console.error('Welcome email sending error:', e.message));

    OtpService.sendWhatsAppWelcomeMessage({
      phone: cleanPhone,
      fullName: user.fullName,
      companyName: company.name,
      solutions,
      trialDays: company.trialDays || 15,
    }).catch((e) => console.error('Welcome WhatsApp sending error:', e.message));

    return {
      user: user.toJSON(),
      token,
      refreshToken,
      company,
    };
  }

  // Login user (supports Email OR Mobile Number)
  static async login(identifier, password) {
    // Validate identifier and password
    if (!identifier || !password) {
      throw new Error('Please provide email or mobile number and password');
    }

    const cleanInput = String(identifier).trim();
    const cleanDigits = cleanInput.replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);
    const isEmail = cleanInput.includes('@');

    const escapeRegex = (text) => String(text || '').replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    let user = null;

    if (isEmail) {
      const safeEmailRegex = new RegExp(`^\\s*${escapeRegex(cleanInput)}\\s*$`, 'i');
      user = await User.findOne({
        $or: [
          { email: cleanInput.toLowerCase() },
          { email: safeEmailRegex },
        ],
      }).select('+password').populate('company');
    } else if (last10 && last10.length >= 10) {
      const phoneVariants = [
        cleanDigits,
        last10,
        `+91${last10}`,
        `91${last10}`,
        `+${cleanDigits}`,
        `0${last10}`,
      ];

      // Retrieve all accounts matching this phone number (handles multiple users with same phone)
      const phoneCandidates = await User.find({
        $or: [
          { phone: { $in: phoneVariants } },
          { phone: new RegExp(`${last10}\\s*$`) },
        ],
      }).select('+password').populate('company');

      // Test password against each matching account
      for (const candidate of phoneCandidates) {
        if (candidate.password) {
          const isMatch = await candidate.matchPassword(password);
          if (isMatch) {
            user = candidate;
            break;
          }
        }
      }

      // If none matched, pick first candidate so standard mismatch error triggers
      if (!user && phoneCandidates.length > 0) {
        user = phoneCandidates[0];
      }
    }

    // Universal fallback: try both email and phone matches
    if (!user) {
      const safeEmailRegex = new RegExp(`^\\s*${escapeRegex(cleanInput)}\\s*$`, 'i');
      const conditions = [
        { email: cleanInput.toLowerCase() },
        { email: safeEmailRegex },
      ];
      if (last10 && last10.length >= 7) {
        conditions.push(
          { phone: cleanDigits },
          { phone: last10 },
          { phone: `+91${last10}` },
          { phone: `91${last10}` },
          { phone: new RegExp(`${last10}\\s*$`) }
        );
      }
      const candidates = await User.find({ $or: conditions }).select('+password').populate('company');
      for (const candidate of candidates) {
        if (candidate.password) {
          const isMatch = await candidate.matchPassword(password);
          if (isMatch) {
            user = candidate;
            break;
          }
        }
      }
      if (!user && candidates.length > 0) {
        user = candidates[0];
      }
    }

    if (!user) {
      console.warn('AuthService.login: user not found for identifier:', identifier);
      throw new Error('Invalid email/mobile number or password');
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);
    console.log(`AuthService.login: identifier=${identifier}, matched=${isMatch}`);

    if (!isMatch) {
      console.warn('AuthService.login: password mismatch for:', identifier);
      throw new Error('Invalid email/mobile number or password');
    }

    // Check if user is active
    if (user.status && user.status !== 'active') {
      throw new Error(`Account is ${user.status}. Please contact your administrator.`);
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Create audit log
    await AuditLog.create({
      user: user._id,
      company: user.company?._id || user.company,
      action: 'user_login',
      status: 'success',
    });

    return {
      user: user.toJSON(),
      token,
      refreshToken,
    };
  }

  // Refresh token
  static async refreshToken(token) {
    if (!token) {
      throw new Error('Refresh token not provided');
    }

    try {
      const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      const user = await User.findById(decoded.id).populate('company');

      if (!user) {
        throw new Error('User not found');
      }

      const newToken = generateToken(user._id);
      return { token: newToken };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Logout (handled on client side with token removal, but we can create audit log)
  static async logout(userId, companyId) {
    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'user_logout',
      status: 'success',
    });

    return { message: 'Logged out successfully' };
  }
    // Forgot password - generate reset token and send email
  static async forgotPassword(email) {
    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists for security
      throw new Error('If an account with that email exists, you will receive a password reset link');
    }

    // Generate password reset token
    const resetToken = user.getPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // In production, you would send an email here with:
    // Reset link: http://frontend-url/reset-password?token=${resetToken}
    // For now, we'll just return success (you should implement email sending)
    console.log(`Password reset token for ${email}: ${resetToken}`);

    // Create audit log
    await AuditLog.create({
      user: user._id,
      company: user.company,
      action: 'password_reset_requested',
      status: 'success',
    });

    return {
      message: 'Password reset link sent to email',
      // In dev, return token for testing
      ...(process.env.NODE_ENV === 'development' && { token: resetToken }),
    };
  }

  // Reset password using token
  static async resetPassword(token, newPassword) {
    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpire: { $gt: Date.now() },
    });

    if (!user) {
      throw new Error('Invalid or expired password reset token');
    }

    // Set new password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save();

    // Create audit log
    await AuditLog.create({
      user: user._id,
      company: user.company,
      action: 'password_reset_completed',
      status: 'success',
    });

    // Generate new tokens
    const newToken = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    return {
      user: user.toJSON(),
      token: newToken,
      refreshToken,
    };
  }

}

