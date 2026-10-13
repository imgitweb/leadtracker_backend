import User from '../models/User.js';

// Response helper
export const sendResponse = (res, statusCode, success, message, data = null) => {
  return res.status(statusCode).json({
    success,
    message,
    ...(data && { data }),
  });
};

// Error response helper
export const sendError = (res, statusCode, message, error = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && error && { error: error.message }),
  });
};

// Pagination helper
export const getPagination = (page = 1, limit = 10) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  return { skip, limit: parseInt(limit) };
};

// Get all User IDs belonging to the same company as the given user
export const getCompanyUserIds = async (user) => {
  if (!user) return [];
  const companyId = user.company?._id || user.company;
  if (!companyId) return [user._id];

  try {
    const companyUsers = await User.find({ company: companyId }, '_id').lean();
    if (!companyUsers.length) return [user._id];
    return companyUsers.map((u) => u._id);
  } catch (err) {
    console.error('Error in getCompanyUserIds:', err);
    return [user._id];
  }
};
