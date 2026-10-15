import express from "express";
import {
  getAnalyticsOverview,
  getCampaignAnalytics,
  getSentimentDistribution,
} from "../controllers/callingAnalyticsController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/overview", getAnalyticsOverview);
router.get("/campaigns/:id", getCampaignAnalytics);
router.get("/sentiment", getSentimentDistribution);

export default router;
