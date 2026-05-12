import express from 'express';
import { createLead } from '../controllers/leadController.js';
import { protect, apiKeyProtect } from '../middleware/auth.js';

const router = express.Router();

// Helper to allow either JWT or API Key (same behavior as contact route)
const protectOrApiKey = (req, res, next) => {
  try {
    const hasXApiKey = !!req.headers['x-api-key'];
    const hasAuth = !!(req.headers.authorization || req.headers.Authorization);
    console.log(`[protectOrApiKey:/api/lead] x-api-key present: ${hasXApiKey}, Authorization present: ${hasAuth}`);
  } catch (err) {
    console.log('[protectOrApiKey:/api/lead] headers inspect error', err.message);
  }

  if (req.headers['x-api-key'] || (req.headers.authorization && typeof req.headers.authorization === 'string' && (req.headers.authorization.startsWith('ApiKey ') || req.headers.authorization.startsWith('Bearer ')))) {
    return apiKeyProtect(req, res, next);
  }
  return protect(req, res, next);
};

// POST /api/lead/add-new -> Create a lead (API-focused endpoint)
router.post('/add-new', protectOrApiKey, createLead);

export default router;
