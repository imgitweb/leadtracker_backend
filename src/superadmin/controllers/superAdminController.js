import { SuperAdminService } from '../services/superAdminService.js';
import { sendResponse, sendError } from '../../utils/helpers.js';

export const getOverview = async (req, res) => {
  try {
    const overview = await SuperAdminService.getOverview();
    sendResponse(res, 200, true, 'Super admin overview fetched successfully', overview);
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const getPlans = async (req, res) => {
  try {
    const plans = SuperAdminService.getPlans();
    sendResponse(res, 200, true, 'Plans fetched successfully', { plans });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const getUsers = async (req, res) => {
  try {
    const { page, limit, search, role, status, companyId } = req.query;
    const result = await SuperAdminService.listUsers({ page, limit, search, role, status, companyId });
    sendResponse(res, 200, true, 'Users fetched successfully', result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getUser = async (req, res) => {
  try {
    const user = await SuperAdminService.getUser(req.params.userId);
    sendResponse(res, 200, true, 'User fetched successfully', { user });
  } catch (error) {
    sendError(res, 404, error.message, error);
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const user = await SuperAdminService.updateUserRole(req.params.userId, req.user._id, role);
    sendResponse(res, 200, true, 'Role updated successfully', { user });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const user = await SuperAdminService.updateUserStatus(req.params.userId, req.user._id, status);
    sendResponse(res, 200, true, 'Status updated successfully', { user });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const deleteUser = async (req, res) => {
  try {
    const result = await SuperAdminService.deleteUser(req.params.userId, req.user._id);
    sendResponse(res, 200, true, result.message);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getCompanies = async (req, res) => {
  try {
    const { page, limit, search, plan, isActive } = req.query;
    const result = await SuperAdminService.listCompanies({ page, limit, search, plan, isActive });
    sendResponse(res, 200, true, 'Companies fetched successfully', result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const createCompany = async (req, res) => {
  try {
    const newCompany = await SuperAdminService.createCompany(req.body, req.user._id);
    sendResponse(res, 201, true, 'Company created successfully', { company: newCompany });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getCompany = async (req, res) => {
  try {
    const company = await SuperAdminService.getCompany(req.params.companyId);
    sendResponse(res, 200, true, 'Company fetched successfully', { company });
  } catch (error) {
    sendError(res, 404, error.message, error);
  }
};

export const updateCompany = async (req, res) => {
  try {
    const company = await SuperAdminService.updateCompany(req.params.companyId, req.user._id, req.body);
    sendResponse(res, 200, true, 'Company updated successfully', { company });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateCompanyPlan = async (req, res) => {
  try {
    const { plan } = req.body;
    const company = await SuperAdminService.updateCompanyPlan(req.params.companyId, req.user._id, plan);
    sendResponse(res, 200, true, 'Company plan updated successfully', { company });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateCompanyStatus = async (req, res) => {
  try {
    const { isActive } = req.body;
    const company = await SuperAdminService.updateCompanyStatus(req.params.companyId, req.user._id, isActive);
    sendResponse(res, 200, true, 'Company status updated successfully', { company });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const deleteCompany = async (req, res) => {
  try {
    const result = await SuperAdminService.deleteCompany(req.params.companyId, req.user._id);
    sendResponse(res, 200, true, result.message);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const syncCompanyLimits = async (req, res) => {
  try {
    const company = await SuperAdminService.syncCompanyLimits(req.params.companyId, req.user._id);
    sendResponse(res, 200, true, 'Company limits synced successfully', { company });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const { page, limit, action, status, userId, companyId } = req.query;
    const result = await SuperAdminService.listAuditLogs({ page, limit, action, status, userId, companyId });
    sendResponse(res, 200, true, 'Audit logs fetched successfully', result);
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getCompanyDetails = async (req, res) => {

  try {
    console.log('Fetching details for company ID:', req.params.companyId);
    const result = await SuperAdminService.getCompanyDetails(req.params.companyId);
    sendResponse(res, 200, true, 'Company details fetched successfully', result);
  } catch (error) {
    sendError(res, 404, error.message, error);
  }
};
