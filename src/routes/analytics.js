import express from 'express';
import { getCompanyAnalytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// All analytics routes require authentication and are company-scoped via req.user.company
router.get('/', protect, getCompanyAnalytics);

export default router;
