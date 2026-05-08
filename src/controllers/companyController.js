import { CompanyService } from '../services/CompanyService.js';
import { sendResponse, sendError } from '../utils/helpers.js';

export const getCompany = async (req, res, next) => {
  try {
    const company = await CompanyService.getCompany(req.user.company._id);

    sendResponse(res, 200, true, 'Company fetched successfully', { company });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    const company = await CompanyService.updateCompany(
      req.user.company._id,
      req.body,
      req.user._id
    );

    sendResponse(res, 200, true, 'Company updated successfully', { company });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const generateApiKey = async (req, res, next) => {
  try {
    const result = await CompanyService.generateApiKey(
      req.user.company._id,
      req.user._id,
      req.body
    );

    sendResponse(res, 201, true, 'API key generated successfully', result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getApiKeys = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const result = await CompanyService.getApiKeys(req.user.company._id, page, limit);

    sendResponse(res, 200, true, 'API keys fetched successfully', result);
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const regenerateApiKey = async (req, res, next) => {
  try {
    const result = await CompanyService.regenerateApiKey(
      req.user.company._id,
      req.user._id,
      req.params.keyId
    );

    sendResponse(res, 200, true, 'API key regenerated successfully', result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const deleteApiKey = async (req, res, next) => {
  try {
    const result = await CompanyService.deleteApiKey(
      req.user.company._id,
      req.user._id,
      req.params.keyId
    );

    sendResponse(res, 200, true, result.message);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getAuditLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, action, user } = req.query;

    const filter = {};
    if (action) filter.action = action;
    if (user) filter.user = user;

    const result = await CompanyService.getAuditLogs(
      req.user.company._id,
      page,
      limit,
      filter
    );

    sendResponse(res, 200, true, 'Audit logs fetched successfully', result);
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};
