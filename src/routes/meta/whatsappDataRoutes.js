import express from "express";
import multer from "multer"; 
import { protect } from "../../middleware/auth.js";

// Tumhare existing controllers
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
  updateWaConversationName,
  updateTemplatePurpose,
  deleteWhatsAppTemplate,
  subscribeWabaApp
} from "../../controllers/meta/whatsappDataController.js";



const router = express.Router();

// Initialize multer (stores files in memory buffer, perfect for sending to Meta API)
const upload = multer(); 


// ==========================================
// 1. Account & Webhook Management
// ==========================================
router.post("/subscribe/:accountId", protect, subscribeWabaApp);


// ==========================================
// 2. Chat & Conversation Management
// ==========================================
router.get("/:phoneId/conversations", protect, getWaConversations);
router.get("/:phoneId/conversations/:convId/messages", protect, getWaMessages);
router.post("/:phoneId/messages", protect, sendWaMessage);
router.post("/:phoneId/conversations/:convId/toggle-ai", protect, toggleWaConversationAI);
router.put("/:phoneId/conversations/:convId/name", protect, updateWaConversationName);


// ==========================================
// 3. Template Management Routes
// ==========================================
// Multer is used here for uploading template media (images/videos/documents)
router.post('/templates/create', protect, upload.single('media'), createWhatsAppTemplate);
router.get("/:phoneId/templates", protect, getWaTemplates);
router.post("/:phoneId/templates/sync", protect, syncWaTemplates);
router.get("/:phoneId/templates/:templateId/refresh", protect, refreshTemplateStatus);
router.post("/:phoneId/templates/bulk-send", protect, sendBulkWaTemplate);
router.get("/:phoneId/templates/:templateId/analytics", protect, getWaTemplateAnalytics);
router.put('/templates/:templateId/purpose', protect, updateTemplatePurpose);
router.delete('/:phoneId/templates/:id', protect, deleteWhatsAppTemplate);


// ==========================================
// 4. Insights & Analytics
// ==========================================
router.get("/:phoneId/insights", protect, getWaAccountInsights);


// ==========================================
// 5. Business Profile Management
// ==========================================
router.get("/:phoneId/profile", protect, getWaProfileDetails);
router.post("/:phoneId/profile/update", protect, updateWaProfileDetails);

// Multer is used here for profile picture uploads
router.post("/:phoneId/profile/photo", protect, upload.single("file"), updateWaProfilePhoto);


export default router;