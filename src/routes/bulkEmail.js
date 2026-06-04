import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireModuleAccess } from '../middleware/moduleAccess.js';
import {
  createCampaign,
  createTemplate,
  deleteTemplate,
  dispatchDueCampaigns,
  getContacts,
  getDashboard,
  listCampaigns,
  listTemplates,
  saveSettings,
  sendCampaign,
  updateTemplate,
  deleteCampaign,
} from '../controllers/bulkEmailController.js';

const router = express.Router();

router.use(protect);
router.use(requireModuleAccess('bulk_email'));

router.get('/dashboard', getDashboard);
router.get('/contacts', getContacts);
router.put('/settings', saveSettings);
router.get('/templates', listTemplates);
router.post('/templates', createTemplate);
router.patch('/templates/:templateId', updateTemplate);
router.delete('/templates/:templateId', deleteTemplate);
router.get('/campaigns', listCampaigns);
router.post('/campaigns', createCampaign);
router.delete('/campaigns/:campaignId', deleteCampaign);
router.post('/campaigns/:campaignId/send', sendCampaign);
router.post('/dispatch-due', dispatchDueCampaigns);

export default router;