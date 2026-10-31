import express from "express";
import { syncAdAccounts, getSavedAdAccounts } from "../../controllers/meta/metaAdsAuthController.js";
import { syncMetaLeads, getMetaLeadsStats } from "../../controllers/meta/metaLeadSyncController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// Fetch from Meta and Save to DB automatically
router.post("/sync", protect, syncAdAccounts);

router.get("/saved-accounts", protect, getSavedAdAccounts);

// 🎯 Direct Facebook Ads Lead Sync to CRM
router.post("/sync-leads", protect, syncMetaLeads);
router.get("/leads-stats", protect, getMetaLeadsStats);

export default router;