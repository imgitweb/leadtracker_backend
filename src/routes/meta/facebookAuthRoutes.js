import express from "express";
import { 
  redirectToFacebook, 
  handleFacebookCallback, 
  getFacebookStatus, 
  unlinkFacebookAccount 
} from "../../controllers/meta/facebookAuthController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// 1. Initial Login Route (Protected with JWT)
router.get("/login", protect, redirectToFacebook);

// 2. Callback Route (Meta redirects here after login, NO JWT because it's from Meta)
router.get("/callback", handleFacebookCallback);

// 3. Get Linked Accounts Status (Protected)
router.get("/status", protect, getFacebookStatus);

// 4. Unlink a specific Facebook Page (Protected)
router.delete("/unlink/:page_id", protect, unlinkFacebookAccount);

export default router;