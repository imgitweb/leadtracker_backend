import express from 'express';
import { protect } from '../../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import {
  getGlobalModules,
  createGlobalModule,
  updateGlobalModule,
  deleteGlobalModule,
  getCompanyModules,
  updateCompanyModules,
  syncAllModules,
} from '../controllers/companyModuleController.js';

const router = express.Router();

router.use(protect, requireSuperAdmin);

// Global Modules CRUD
router.get('/', getGlobalModules);
router.post('/', createGlobalModule);
router.put('/:id', updateGlobalModule);
router.delete('/:id', deleteGlobalModule);

// Sync and Company Assignments
router.post('/sync', syncAllModules);
router.get('/companies/:companyId', getCompanyModules);
router.patch('/companies/:companyId', updateCompanyModules);

export default router;
