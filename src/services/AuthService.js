import User from '../models/User.js';
import Company from '../models/Company.js';
import { generateToken, generateRefreshToken } from '../utils/jwt.js';
import AuditLog from '../models/AuditLog.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';


export class AuthService {
  // Register user
  static async register(userData) {
    const { fullName, email, password, confirmPassword, companyName } = userData;

    // Validate passwords match
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match');
    }

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      throw new Error('Email already in use');

    }

    // Create company
    const company = new Company({
      name: companyName,
      owner: null, // Will be set after user creation
    });

    // Create user
    const user = new User({
      fullName,
      email,
      password,
      company: company._id,
      role: 'admin', // First user is admin
    });

    // Set company owner
    company.owner = user._id;
    company.members.push(user._id);
    user.lastLogin = new Date();


    await user.save();
    await company.save();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Create audit log
    await AuditLog.create({
      user: user._id,
      company: company._id,
      action: 'user_created',
      status: 'success',
    });

    return {
      user: user.toJSON(),
      token,
      refreshToken,
      company,
    };
  }

  // Login user
  static async login(email, password) {
    // Validate email and password
    if (!email || !password) {
      throw new Error('Please provide email and password');
    }

    // Check for user (include password field)
    const user = await User.findOne({ email }).select('+password').populate('company');

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (user.status !== 'active') {
      throw new Error(`Account is ${user.status || 'inactive'}. Please contact your administrator.`);
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
      company: user.company._id,
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

