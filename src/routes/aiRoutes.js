import express from 'express';
import { setupAIAutoReply,getStartupData,saveStartupData,toggleAIStatus } from '../controllers/aiController.js';
import { protect } from '../middleware/auth.js'; // Aapka auth middleware
const router = express.Router();

router.use(protect);
// Route to setup AI data and enable it
router.post('/setup', setupAIAutoReply);
router.get('/startup-data', getStartupData);
router.post('/startup-data', saveStartupData);
router.post('/toggle', toggleAIStatus);

export default router;