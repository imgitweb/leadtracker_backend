import { AuthService } from '../services/AuthService.js';
import { OtpService } from '../services/OtpService.js';
import { sendResponse, sendError } from '../utils/helpers.js';
import User from '../models/User.js';

const escapeRegex = (text) => String(text || '').replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

export const checkUserExists = async (req, res, next) => {
  try {
    const { email, phone } = req.body;
    const normalizedEmail = (email || '').toLowerCase().trim();
    const cleanDigits = String(phone || '').replace(/\D/g, '');
    const last10 = cleanDigits.slice(-10);

    if (normalizedEmail) {
      const safeEmailRegex = new RegExp(`^\\s*${escapeRegex(normalizedEmail)}\\s*$`, 'i');
      const emailUser = await User.findOne({
        $or: [
          { email: normalizedEmail },
          { email: safeEmailRegex },
        ],
      }).lean();

      if (emailUser) {
        return sendResponse(res, 200, true, 'Account already exists', {
          exists: true,
          field: 'email',
          message: 'Account already exists with this email address. Please sign in.',
        });
      }
    }

    if (last10 && last10.length >= 10) {
      const phoneVariants = [
        cleanDigits,
        last10,
        `+91${last10}`,
        `91${last10}`,
        `+${cleanDigits}`,
        `0${last10}`,
      ];
      const phoneUser = await User.findOne({
        $or: [
          { phone: { $in: phoneVariants } },
          { phone: new RegExp(`${last10}\\s*$`) },
        ],
      }).lean();

      if (phoneUser) {
        return sendResponse(res, 200, true, 'Account already exists', {
          exists: true,
          field: 'phone',
          message: 'Account already exists with this mobile number. Please sign in.',
        });
      }
    }

    return sendResponse(res, 200, true, 'Available', { exists: false });
  } catch (error) {
    console.error('Error in checkUserExists:', error);
    sendError(res, 500, error.message, error);
  }
};

export const sendOtp = async (req, res, next) => {
  try {
    const { email, phone } = req.body;
    const result = await OtpService.sendOtp({ email, phone });
    sendResponse(res, 200, true, result.message, result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const verifyOtp = async (req, res, next) => {
  try {
    const { email, phone, emailOtp, phoneOtp } = req.body;
    const result = await OtpService.verifyOtp({ email, phone, emailOtp, phoneOtp });
    sendResponse(res, 200, true, result.message, result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const autoSignup = async (req, res, next) => {
  try {
    const result = await AuthService.autoSignup(req.body);

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    sendResponse(res, result.isExistingUser ? 200 : 201, true, result.isExistingUser ? 'Welcome back! Logged in successfully' : 'Account created successfully', {
      user: result.user,
      token: result.token,
      company: result.company,
      isExistingUser: result.isExistingUser,
    });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const register = async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body);

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    sendResponse(res, 201, true, 'User registered successfully', {
      user: result.user,
      token: result.token,
      company: result.company,
    });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, 400, 'Please provide an email address');
    }

    const result = await AuthService.forgotPassword(email);

    sendResponse(res, 200, true, 'Password reset email sent successfully', {
      message: 'Check your email for password reset link',
    });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const token = req.params?.token || req.body?.token;
    const { newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || !confirmPassword) {
      return sendError(res, 400, 'Please provide all required fields');
    }

    if (newPassword !== confirmPassword) {
      return sendError(res, 400, 'Passwords do not match');
    }

    const result = await AuthService.resetPassword(token, newPassword);

    sendResponse(res, 200, true, 'Password reset successfully', {
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, phone, identifier, password } = req.body;
    const loginIdentifier = (identifier || email || phone || '').trim();

    console.log('Login attempt:', loginIdentifier);
    console.log('Request body:', req.body);

    if (!loginIdentifier || !password) {
      return sendError(res, 400, 'Please provide email or mobile number and password');
    }

    const result = await AuthService.login(loginIdentifier, password);

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    sendResponse(res, 200, true, 'Login successful', {
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const logout = async (req, res, next) => {
  try {
    if (req.user && req.user.company) {
      await AuthService.logout(req.user._id, req.user.company._id);
    }

    res.clearCookie('token');
    res.clearCookie('refreshToken');

    sendResponse(res, 200, true, 'Logged out successfully');
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const result = await AuthService.refreshToken(refreshToken);

    res.cookie('token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendResponse(res, 200, true, 'Token refreshed', {
      token: result.token,
    });
  } catch (error) {
    sendError(res, 401, error.message, error);
  }
};

export const getCurrentUser = async (req, res, next) => {
  try {
    sendResponse(res, 200, true, 'User fetched successfully', {
      user: req.user,
    });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

