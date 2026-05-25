import express from "express";
import { 
  redirectToInstagram, 
  handleInstagramCallback, 
  refreshInstagramToken, 
  getInstagramStatus 
} from "../../controllers/meta/instagramAuthController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// 1. Initial Login Route (Protected with JWT)
router.get("/login", protect, redirectToInstagram);

// 2. Callback Route (Meta redirect karega yahan, isme JWT NAHI lagana hai)
router.post("/callback", protect, handleInstagramCallback);

// 3. Refresh Token Route (Manual refresh ke liye, Protected)
router.post("/refresh-token", protect, refreshInstagramToken);

// 4. Get Status (🔥 FIX: Uncommented this so frontend can fetch accounts)
router.get("/status", protect, getInstagramStatus);

export default router;