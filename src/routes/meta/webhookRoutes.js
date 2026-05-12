import express from "express";
import { verifyWebhook, handleWebhookEvent } from "../../controllers/meta/webhookController.js";

const router = express.Router();

// Meta webhook verification ke liye (GET)
router.get("/", verifyWebhook);

// Meta se aane wale naye messages ke liye (POST)
router.post("/", handleWebhookEvent);

export default router;