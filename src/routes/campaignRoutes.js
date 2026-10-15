import express from "express";
import {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  previewContacts,
  deleteCampaign,
} from "../controllers/campaignController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

/* ─── OLD EXOTEL CALLING AGENT ROUTES (COMMENTED OUT) ───
// router.get("/api/Campaigns/calling-lead", getCallingLeads);
// router.post("/api/campaigns/create", createCampaign);
// router.post("/api/campaigns/:id/start", startCampaign);
// router.post("/api/campaigns/:id/pause", pauseCampaign);
──────────────────────────────────────────────────────── */

// Protect all routes with JWT auth
router.use(protect);

// Standard REST Endpoints for /api/campaigns
router.post("/preview", previewContacts);
router.post("/", createCampaign);
router.get("/", getCampaigns);
router.get("/:id", getCampaignById);
router.patch("/:id", updateCampaign);
router.delete("/:id", deleteCampaign);

// Campaign Lifecycle Actions
router.post("/:id/start", startCampaign);
router.post("/:id/pause", pauseCampaign);
router.post("/:id/resume", resumeCampaign);
router.post("/:id/cancel", cancelCampaign);

export default router;