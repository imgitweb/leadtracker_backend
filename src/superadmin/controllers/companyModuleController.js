import { CompanyModuleService } from '../../services/CompanyModuleService.js';
import SystemModule from '../../models/SystemModule.js';
import { sendResponse, sendError } from '../../utils/helpers.js';

export const getGlobalModules = async (req, res) => {
  try {
    const modules = await SystemModule.find().sort({ createdAt: 1 }).lean();
    sendResponse(res, 200, true, 'Modules fetched successfully', {
      modules,
    });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const createGlobalModule = async (req, res) => {
  try {
    const { key, label, description, defaultEnabled, group } = req.body;
    
    // Check if key exists
    const exists = await SystemModule.findOne({ key: key.toLowerCase() });
    if (exists) {
      return sendError(res, 400, 'A module with this key already exists');
    }

    const newModule = await SystemModule.create({
      key: key.toLowerCase(),
      label,
      description,
      defaultEnabled,
      group: group || 'General',
    });

    sendResponse(res, 201, true, 'Module created successfully', { module: newModule });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateGlobalModule = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (updates.key) {
      updates.key = updates.key.toLowerCase();
      const exists = await SystemModule.findOne({ key: updates.key, _id: { $ne: id } });
      if (exists) {
        return sendError(res, 400, 'A module with this key already exists');
      }
    }

    const updatedModule = await SystemModule.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!updatedModule) {
      return sendError(res, 404, 'Module not found');
    }

    sendResponse(res, 200, true, 'Module updated successfully', { module: updatedModule });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const deleteGlobalModule = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedModule = await SystemModule.findByIdAndDelete(id);
    
    if (!deletedModule) {
      return sendError(res, 404, 'Module not found');
    }

    sendResponse(res, 200, true, 'Module deleted successfully');
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const getCompanyModules = async (req, res) => {
  try {
    const modules = await CompanyModuleService.getCompanyModules(req.params.companyId);
    sendResponse(res, 200, true, 'Company modules fetched successfully', { modules });
  } catch (error) {
    sendError(res, 404, error.message, error);
  }
};

export const updateCompanyModules = async (req, res) => {
  try {
    const { modules } = req.body;
    const updated = await CompanyModuleService.updateCompanyModules(req.params.companyId, req.user._id, modules);
    sendResponse(res, 200, true, 'Company modules updated successfully', { modules: updated });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const syncAllModules = async (req, res) => {
  try {
    const result = await CompanyModuleService.syncAllCompanies(req.user._id);
    sendResponse(res, 200, true, 'Company modules synced successfully', result);
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};
