import express from "express";
import multer from "multer";
import {
  createFullCampaign,
  getLinkedPages,
  updateCampaignStatus,
  modifyCampaign,
  deleteCampaign,
  getPagePosts,
  getAllCampaigns,
  syncWithMeta,
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
  getAdInsights,
} from "../../controllers/meta/metaAdsetsComtroller.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.get("/", protect, getAllCampaigns);
router.get("/sync", protect, syncWithMeta);
router.get("/pages", protect, getLinkedPages);
router.post("/create", protect, upload.single("media"), createFullCampaign);

router.get("/posts/:pageId", protect, getPagePosts);
router.post("/status", protect, updateCampaignStatus);
router.post("/modify", protect, modifyCampaign);
router.delete("/:campaignId", protect, deleteCampaign);
router.get("/ad-sets", protect, getCampaignAdSets);
router.post("/ad-sets/create", protect, createAdSet);
router.post("/ad-sets/status", protect, updateAdSetStatus); 
router.delete("/ad-sets/:adSetId", protect, deleteAdSet); 
router.get("/get-ads", protect, getAdSetAds);
router.post("/ads/create", protect, createAd);
router.post("/ads/status", protect, updateAdStatus);
router.delete("/ads/:adId", protect, deleteAd);
router.get("/ads/insights", protect, getAdInsights);

export default router;
