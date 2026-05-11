import express from 'express';
import {
  getLeads,
  createLead,
  getLeadDetails,
  updateLead,
  deleteLead,
  addRemark,
  updateLeadStatus,
  updateLeadPriority,
  addFollowUp,
  assignLead
} from '../controllers/leadController.js';
import { protect, apiKeyProtect } from '../middleware/auth.js';

const router = express.Router();

// Helper to allow either JWT or API Key
const protectOrApiKey = (req, res, next) => {
  // Debug: log header presence to diagnose missing API key issues
  try {
    const hasXApiKey = !!req.headers['x-api-key'];
    const hasAuth = !!(req.headers.authorization || req.headers.Authorization);
    console.log(`[protectOrApiKey] x-api-key present: ${hasXApiKey}, Authorization present: ${hasAuth}`);
  } catch (err) {
    console.log('[protectOrApiKey] headers inspect error', err.message);
  }

  if (req.headers['x-api-key'] || (req.headers.authorization && typeof req.headers.authorization === 'string' && (req.headers.authorization.startsWith('ApiKey ') || req.headers.authorization.startsWith('Bearer ')))) {
    return apiKeyProtect(req, res, next);
  }
  return protect(req, res, next);
};

router.route('/')
  .get(protect, getLeads)
  .post(protectOrApiKey, createLead);

// All subsequent routes require JWT protection
router.use(protect);

router.route('/:id')
  .get(getLeadDetails)
  .patch(updateLead)
  .delete(deleteLead);

router.route('/:id/remark')
  .post(addRemark);

router.route('/:id/status')
  .patch(updateLeadStatus);

router.route('/:id/priority')
  .patch(updateLeadPriority);

router.route('/:id/followup')
  .post(addFollowUp);

router.route('/:id/assign')
  .post(assignLead);

export default router;
