import express from 'express';
import { protect } from '../../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import {
  getOverview,
  getPlans,
  getUsers,
  getUser,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getCompanies,
  createCompany,
  getCompany,
  getCompanyDetails,
  updateCompany,
  updateCompanyPlan,
  updateCompanyStatus,
  deleteCompany,
  syncCompanyLimits,
  getAuditLogs,
} from '../controllers/superAdminController.js';
import moduleRoutes from './moduleRoutes.js';

const router = express.Router();

router.use(protect, requireSuperAdmin);

router.get('/overview', getOverview);
router.get('/plans', getPlans);

router.get('/users', getUsers);
router.get('/users/:userId', getUser);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/status', updateUserStatus);
router.delete('/users/:userId', deleteUser);

router.get('/companies', getCompanies);
router.post('/companies', createCompany);
router.get('/companies/:companyId', getCompany);
router.get('/companies/:companyId/details', getCompanyDetails);
router.patch('/companies/:companyId', updateCompany);
router.patch('/companies/:companyId/plan', updateCompanyPlan);
router.patch('/companies/:companyId/status', updateCompanyStatus);
router.delete('/companies/:companyId', deleteCompany);
router.post('/companies/:companyId/sync-limits', syncCompanyLimits);

router.get('/audit-logs', getAuditLogs);
router.use('/modules', moduleRoutes);

export default router;
