import express from "express";
import { 
  getWaConversations, 
  getWaMessages, 
  sendWaMessage, 
  toggleWaConversationAI,
  createWhatsAppTemplate // 🟢 Naya controller import kiya
} from "../../controllers/meta/whatsappDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// Chat Management Routes
router.get("/:phoneId/conversations", protect, getWaConversations);
router.get("/:phoneId/conversations/:convId/messages", protect, getWaMessages);
router.post("/:phoneId/messages", protect, sendWaMessage);
router.post("/:phoneId/conversations/:convId/toggle-ai", protect, toggleWaConversationAI);

// Template Management Routes
// 🟢 Naya route templates banane ke liye
router.post("/templates/create", protect, createWhatsAppTemplate);


export default router;