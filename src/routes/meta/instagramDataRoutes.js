import express from "express";
import { 
  getInstagramPosts, 
  getConversations, 
  getMessages, 
  sendMessage,
  toggleIgConversationAI
} from "../../controllers/meta/instagramDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

router.get("/:accountId/posts", protect, getInstagramPosts);
router.get("/:accountId/conversations", protect, getConversations);
router.get("/:accountId/conversations/:conversationId/messages", protect, getMessages);
router.post("/:accountId/messages", protect, sendMessage);
router.post("/:accountId/conversations/:conversationId/toggle-ai", protect, toggleIgConversationAI);

export default router;