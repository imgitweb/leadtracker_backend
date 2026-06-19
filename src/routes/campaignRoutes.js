import express from "express";

import {
  createCampaign,
  getCampaigns,
  startCampaign,
  callStatusWebhook,
  getCallingLeads,
} from "../controllers/campaignController.js";


const router = express.Router();

// Create Campaign
router.post("/create", createCampaign);

// Get All Campaigns
router.get("/", getCampaigns);

// Start Campaign
router.post("/:campaignId/start", startCampaign);

// Twilio Status Callback
router.post("/call-status", callStatusWebhook);

// Get Calling Leads
router.get("/calling-lead", getCallingLeads);

export default router;