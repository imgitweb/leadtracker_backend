import express from 'express';
import { createLead } from '../controllers/leadController.js';
import { protect, apiKeyProtect } from '../middleware/auth.js';

const router = express.Router();

// Helper to allow either JWT or API Key (same behavior as contact route)
const protectOrApiKey = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const hasApiKeyHeader = !!req.headers['x-api-key'];
  const hasApiKeyAuthScheme = typeof authHeader === 'string' && authHeader.startsWith('ApiKey ');

  try {
    const hasAuth = !!authHeader;
    console.log(`[protectOrApiKey:/api/lead] x-api-key present: ${hasApiKeyHeader}, Authorization present: ${hasAuth}`);
  } catch (err) {
    console.log('[protectOrApiKey:/api/lead] headers inspect error', err.message);
  }

  if (hasApiKeyHeader || hasApiKeyAuthScheme) {
    return apiKeyProtect(req, res, next);
  }

  return protect(req, res, next);
};

// POST /api/lead/add-new -> Create a lead (API-focused endpoint)
router.post('/add-new', protectOrApiKey, createLead);

export default router;
