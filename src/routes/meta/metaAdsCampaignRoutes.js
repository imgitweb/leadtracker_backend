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
import { 
  getAdSetAds, 
  getCampaignAdSets,
  createAdSet,
  createAd,
  updateAdSetStatus,
  deleteAdSet,
  updateAdStatus,
  deleteAd,
  getAdInsights
} from "../../controllers/meta/metaAdsetsComtroller.js";

const router = express.Router();

// ==========================================
// CAMPAIGN ROUTES
// ==========================================
router.get("/", protect, getAllCampaigns);
router.get("/pages", protect, getLinkedPages);
router.post("/create", protect, createFullCampaign);
router.get("/posts/:pageId", protect, getPagePosts);
router.post("/status", protect, updateCampaignStatus); // PAUSE, ACTIVE, ARCHIVED
router.post("/modify", protect, modifyCampaign); // Changing budget/objective
router.delete("/:campaignId", protect, deleteCampaign); // Delete Campaign

// ==========================================
// AD-SETS ROUTES
// ==========================================
router.get("/ad-sets", protect, getCampaignAdSets);
router.post("/ad-sets/create", protect, createAdSet);
router.post("/ad-sets/status", protect, updateAdSetStatus); // PAUSE, ACTIVE, ARCHIVED
router.delete("/ad-sets/:adSetId", protect, deleteAdSet); // Delete Ad Set

// ==========================================
// ADS ROUTES
// ==========================================
router.get("/get-ads", protect, getAdSetAds);
router.post("/ads/create", protect, createAd);
router.post("/ads/status", protect, updateAdStatus); // PAUSE, ACTIVE, ARCHIVED
router.delete("/ads/:adId", protect, deleteAd); // Delete Ad
router.get('/ads/insights', protect, getAdInsights);

export default router;