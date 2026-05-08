import { UserService } from '../services/UserService.js';
import User from '../models/User.js';
import { sendResponse, sendError, getPagination } from '../utils/helpers.js';

export const getProfile = async (req, res, next) => {
  try {
    const user = await UserService.getProfile(req.user._id);
    sendResponse(res, 200, true, 'Profile fetched successfully', { user });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const user = await UserService.updateProfile(
      req.user._id,
      req.user.company._id,
      req.body
    );
    sendResponse(res, 200, true, 'Profile updated successfully', { user });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;

    const result = await UserService.changePassword(
      req.user._id,
      req.user.company._id,
      oldPassword,
      newPassword,
      confirmPassword
    );

    sendResponse(res, 200, true, result.message);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'No file provided');
    }

    const result = await UserService.uploadAvatar(
      req.user._id,
      req.user.company._id,
      req.file
    );

    sendResponse(res, 200, true, result.message, { avatar: result.avatar });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getCompanyUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const result = await UserService.getCompanyUsers(req.user.company._id, page, limit);

    sendResponse(res, 200, true, 'Users fetched successfully', result);
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const result = await UserService.deleteUser(
      req.params.userId,
      req.user.company._id
    );

    const userCount = await User.countDocuments({ company: req.user.company._id });
    sendResponse(res, 200, true, result.message, { userCount });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { fullName, email, password, role } = req.body;
    const user = await UserService.createCompanyUser(
      req.user.company._id,
      req.user._id,
      { fullName, email, password, role }
    );
    const userCount = await User.countDocuments({ company: req.user.company._id });
    sendResponse(res, 201, true, 'User created successfully', { user, userCount });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const user = await UserService.updateUserRole(
      req.params.userId,
      req.user.company._id,
      req.user._id,
      role
    );
    sendResponse(res, 200, true, 'Role updated successfully', { user });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const user = await UserService.updateUserStatus(
      req.params.userId,
      req.user.company._id,
      req.user._id,
      status
    );
    const userCount = await User.countDocuments({ company: req.user.company._id });
    sendResponse(res, 200, true, 'Status updated successfully', { user, userCount });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};
