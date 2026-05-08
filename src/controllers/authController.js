import { AuthService } from '../services/AuthService.js';
import { sendResponse, sendError } from '../utils/helpers.js';

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
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Please provide email and password');
    }

    const result = await AuthService.login(email, password);

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
