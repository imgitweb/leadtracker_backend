import express from "express";
import {
  getFacebookPosts,
  getFbConversations,
  getFbMessages,
  sendFbMessage,
  updateFbConversationName,
  clearFbMessages,
  toggleFbConversationAI
} from "../../controllers/meta/facebookDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// 1. Get posts for a specific Facebook Page
router.get("/:pageId/posts", protect, getFacebookPosts);

// 2. Get all conversations for a specific Facebook Page
router.get("/:pageId/conversations", protect, getFbConversations);

// 3. Get all messages for a specific conversation
// example route definition
router.get("/:pageId/conversations/:conversationId/messages", getFbMessages);

// 4. Send a message to a customer from the Facebook Page
router.post("/:pageId/messages", protect, sendFbMessage);

router.put('/:pageId/conversations/:conversationId', updateFbConversationName);


router.delete('/:pageId/conversations/:conversationId/messages', clearFbMessages);

router.post("/:pageId/conversations/:conversationId/toggle-ai", protect, toggleFbConversationAI);

export default router;