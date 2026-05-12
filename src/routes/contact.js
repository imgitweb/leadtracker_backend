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
import { protect  } from '../middleware/auth.js';

const router = express.Router();



router.route('/')
  .get(protect, getLeads)
  .post(protect, createLead);

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
