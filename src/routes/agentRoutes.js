import express from "express";
import twilio from "twilio";

import {
  testElevenLabsVoice,
  handleIncomingCall,
} from "../controllers/agentController.js";

const router = express.Router();

// Health check
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Agent route working",
  });
});

// Incoming Call Webhook
router.get("/incoming-call", handleIncomingCall);
router.post("/incoming-call", handleIncomingCall);

// Test ElevenLabs Voice
router.post("/test-voice", testElevenLabsVoice);

// Test outbound call to your mobile
router.get("/make-call", async (req, res) => {
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const serverUrl = (process.env.SERVER_URL || "")
      .replace("https://", "")
      .replace("http://", "")
      .replace(/\/$/, "");

    const call = await client.calls.create({
      to: process.env.MY_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `https://${serverUrl}/api/agent/incoming-call`,
      method: "POST",
    });

    res.json({
      success: true,
      message: "Test call started successfully",
      sid: call.sid,
      status: call.status,
    });
  } catch (error) {
    console.error("Call Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Test call failed",
      error: error.message,
    });
  }
});

// Campaign outbound call helper API
router.post("/campaign-call", async (req, res) => {
  try {
    const { phone, leadId, campaignId, prompt } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const serverUrl = (process.env.SERVER_URL || "")
      .replace("https://", "")
      .replace("http://", "")
      .replace(/\/$/, "");

    const encodedPrompt = encodeURIComponent(prompt || "");

    const call = await client.calls.create({
      to: phone,
      from: process.env.TWILIO_PHONE_NUMBER,
      url: `https://${serverUrl}/api/agent/incoming-call?leadId=${leadId || ""}&campaignId=${campaignId || ""}&prompt=${encodedPrompt}`,
      method: "POST",
      statusCallback: `https://${serverUrl}/api/campaigns/call-status`,
      statusCallbackMethod: "POST",
      statusCallbackEvent: [
        "initiated",
        "ringing",
        "answered",
        "completed",
      ],
    });

    res.json({
      success: true,
      message: "Campaign call started successfully",
      sid: call.sid,
      status: call.status,
    });
  } catch (error) {
    console.error("Campaign Call Error:", error.message);

    res.status(500).json({
      success: false,
      message: "Campaign call failed",
      error: error.message,
    });
  }
});

export default router;