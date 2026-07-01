import express from "express";
import {
  getCampaigns,
  getCallingLeads,
  createCampaign,
  startCampaign,
  pauseCampaign,
} from "../controllers/campaignController.js";

const router = express.Router();


router.get("/api/campaigns", getCampaigns);
router.get("/api/Campaigns/calling-lead", getCallingLeads);

router.post("/api/campaigns/create", createCampaign);
router.post("/api/campaigns/:id/start", startCampaign);
router.post("/api/campaigns/:id/pause", pauseCampaign);

export default router;