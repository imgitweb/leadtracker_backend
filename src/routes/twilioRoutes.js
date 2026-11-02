import express from "express";
import {
  handleVoiceWebhook,
  handleProcessSpeech,
  handleCallStatus,
  handleRecordingStatus,
} from "../controllers/twilioController.js";
import { getTwilioConfig } from "../config/twilio.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Parse urlencoded bodies for Twilio webhooks
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// Twilio webhook endpoints (Called by Twilio servers)
router.post("/voice", handleVoiceWebhook);
router.post("/process-speech", handleProcessSpeech);
router.post("/call-status", handleCallStatus);
router.post("/recording-status", handleRecordingStatus);

// Frontend configuration check endpoint
router.get("/config", protect, async (req, res) => {
  try {
    const config = await getTwilioConfig();
    res.json({
      success: true,
      data: config,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
