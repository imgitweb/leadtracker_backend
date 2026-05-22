import express from "express";
import multer from "multer"; // 🟢 Added multer import
import { 
  getWaConversations, 
  getWaMessages, 
  sendWaMessage, 
  toggleWaConversationAI,
  createWhatsAppTemplate,
  refreshTemplateStatus,
  syncWaTemplates,
  getWaTemplates,
  sendBulkWaTemplate,
  getWaTemplateAnalytics,
  getWaAccountInsights,
  getWaProfileDetails,
  updateWaProfileDetails,
  updateWaProfilePhoto,
  updateWaConversationName
} from "../../controllers/meta/whatsappDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// 🟢 Initialize multer (stores files in memory buffer, perfect for sending to Meta API)
const upload = multer(); 

// Chat Management Routes
router.get("/:phoneId/conversations", protect, getWaConversations);
router.get("/:phoneId/conversations/:convId/messages", protect, getWaMessages);
router.post("/:phoneId/messages", protect, sendWaMessage);
router.post("/:phoneId/conversations/:convId/toggle-ai", protect, toggleWaConversationAI);
router.put("/:phoneId/conversations/:convId/name", protect, updateWaConversationName);

// Template Management Routes
router.post("/templates/create", protect, createWhatsAppTemplate);
router.get("/:phoneId/templates", protect, getWaTemplates);
router.post("/:phoneId/templates/sync", protect, syncWaTemplates);
router.get("/:phoneId/templates/:templateId/refresh", protect, refreshTemplateStatus);
router.post("/:phoneId/templates/bulk-send", protect, sendBulkWaTemplate);
router.get("/:phoneId/templates/:templateId/analytics", protect, getWaTemplateAnalytics);

// Insights Route
router.get("/:phoneId/insights", protect, getWaAccountInsights);

// Profile Management Routes
router.get("/:phoneId/profile", protect, getWaProfileDetails);
router.post("/:phoneId/profile/update", protect, updateWaProfileDetails);
// 🟢 Ab upload variable yahan properly kaam karega
router.post("/:phoneId/profile/photo", protect, upload.single("file"), updateWaProfilePhoto);

export default router;