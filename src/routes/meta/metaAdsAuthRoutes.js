import express from "express";
import { syncAdAccounts ,getSavedAdAccounts } from "../../controllers/meta/metaAdsAuthController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// Fetch from Meta and Save to DB automatically
router.post("/sync", protect, syncAdAccounts);

router.get("/saved-accounts", protect, getSavedAdAccounts);


export default router;