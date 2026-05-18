import express from "express";
import { handleWhatsAppCallback, getWhatsAppStatus, unlinkWhatsAppAccount } from "../../controllers/meta/whatsappAuthController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();
router.post("/callback",protect, handleWhatsAppCallback); // Note: POST request via frontend API
router.get("/status", protect, getWhatsAppStatus);
router.delete("/unlink/:phone_number_id", protect, unlinkWhatsAppAccount);

export default router;