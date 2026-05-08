import Form from '../models/Form.js';
import AuditLog from '../models/AuditLog.js';
import { sendResponse, sendError } from '../utils/helpers.js';

// Get all forms for a company
export const getForms = async (req, res) => {
  try {
    const forms = await Form.find({ companyId: req.user.company._id }).sort({ createdAt: -1 });
    sendResponse(res, 200, true, 'Forms fetched successfully', { forms });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};

// Create a new form
export const createForm = async (req, res) => {
  try {
    const form = await Form.create({
      ...req.body,
      companyId: req.user.company._id
    });

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'form_created',
      status: 'success',
      details: { formId: form._id, name: form.name }
    });

    sendResponse(res, 201, true, 'Form created successfully', { form });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};

// Update form
export const updateForm = async (req, res) => {
  try {
    const form = await Form.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!form) return sendError(res, 404, 'Form not found');

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'form_updated',
      status: 'success',
      details: { formId: form._id, name: form.name }
    });

    sendResponse(res, 200, true, 'Form updated successfully', { form });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};

// Delete form
export const deleteForm = async (req, res) => {
  try {
    const form = await Form.findOneAndDelete({ _id: req.params.id, companyId: req.user.company._id });
    if (!form) return sendError(res, 404, 'Form not found');

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'form_deleted',
      status: 'success',
      details: { formId: form._id, name: form.name }
    });

    sendResponse(res, 200, true, 'Form deleted successfully');
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
