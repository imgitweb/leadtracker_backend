import express from "express";
import { getWaConversations, getWaMessages, sendWaMessage,toggleWaConversationAI } from "../../controllers/meta/whatsappDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();
router.get("/:phoneId/conversations", protect, getWaConversations);
router.get("/:phoneId/conversations/:convId/messages", protect, getWaMessages);
router.post("/:phoneId/messages", protect, sendWaMessage);
router.post("/:phoneId/conversations/:convId/toggle-ai", protect, toggleWaConversationAI);

export default router;