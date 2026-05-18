import express from 'express';
import { processChat } from '../controllers/chatController.js';

const router = express.Router();

// Route: /api/chat
router.post('/', processChat);

export default router;