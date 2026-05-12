import express from "express";
import { verifyWaWebhook, handleWaWebhook } from "../../controllers/meta/whatsappWebhookController.js";
const router = express.Router();
router.get("/", verifyWaWebhook);
router.post("/", handleWaWebhook);
export default router;