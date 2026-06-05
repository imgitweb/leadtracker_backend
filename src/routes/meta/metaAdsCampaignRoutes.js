import express from "express";
import {
  createFullCampaign,
  getLinkedPages,
  updateCampaignStatus,
  modifyCampaign,
  deleteCampaign,
  getPagePosts,
  getAllCampaigns,
} from "../../controllers/meta/metaAdsCampaignController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

router.get("/", protect, getAllCampaigns);
// Fetch Pages for Dropdown
router.get("/pages", protect, getLinkedPages);

// Create Campaign
router.post("/create", protect, createFullCampaign);

router.get("/posts/:pageId", protect, getPagePosts);
router.post("/status", protect, updateCampaignStatus); // For PAUSE, ACTIVE, ARCHIVED
router.post("/modify", protect, modifyCampaign); // For changing budget/objective
router.delete("/:campaignId", protect, deleteCampaign); // For Permane

export default router;
