import express from 'express';
import {
  getCompany,
  updateCompany,
  generateApiKey,
  getApiKeys,
  regenerateApiKey,
  deleteApiKey,
  getAuditLogs,
  getCompanyModules,
} from '../controllers/companyController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/', getCompany);
router.get('/modules', getCompanyModules);
router.put('/', authorize('admin', 'super_admin'), updateCompany);

// API Keys
router.post('/api-keys', authorize('admin', 'super_admin'), generateApiKey);
router.get('/api-keys', getApiKeys);
router.put('/api-keys/:keyId', authorize('admin', 'super_admin'), regenerateApiKey);
router.delete('/api-keys/:keyId', authorize('admin', 'super_admin'), deleteApiKey);

// Audit logs
router.get('/audit-logs', authorize('admin', 'super_admin'), getAuditLogs);

export default router;
