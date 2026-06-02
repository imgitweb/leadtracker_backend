import { sendError, sendResponse } from '../utils/helpers.js';
import { KnowledgeRepositoryService } from '../services/KnowledgeRepositoryService.js';

export const getTree = async (req, res) => {
  try {
    const result = await KnowledgeRepositoryService.getTree(req.user.company._id, req.user._id);
    return sendResponse(res, 200, true, 'Knowledge repository fetched successfully', result);
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch knowledge repository', error);
  }
};

export const createFolder = async (req, res) => {
  try {
    const folder = await KnowledgeRepositoryService.createFolder(req.user.company._id, req.user._id, req.body);
    return sendResponse(res, 201, true, 'Folder created successfully', { folder });
  } catch (error) {
    return sendError(res, 400, error.message, error);
  }
};

export const createDocument = async (req, res) => {
  try {
    const document = await KnowledgeRepositoryService.createDocument(
      req.user.company._id,
      req.user._id,
      req.body,
      req.file || null,
    );
    return sendResponse(res, 201, true, 'Document created successfully', { document });
  } catch (error) {
    return sendError(res, 400, error.message, error);
  }
};

export const updateItem = async (req, res) => {
  try {
    const item = await KnowledgeRepositoryService.updateItem(
      req.user.company._id,
      req.user._id,
      req.params.id,
      req.body,
    );
    return sendResponse(res, 200, true, 'Knowledge item updated successfully', { item });
  } catch (error) {
    return sendError(res, 400, error.message, error);
  }
};

export const deleteItem = async (req, res) => {
  try {
    const result = await KnowledgeRepositoryService.deleteItem(req.user.company._id, req.user._id, req.params.id);
    return sendResponse(res, 200, true, result.message);
  } catch (error) {
    return sendError(res, 400, error.message, error);
  }
};

export default {
  getTree,
  createFolder,
  createDocument,
  updateItem,
  deleteItem,
};