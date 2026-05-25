import express from "express";
import {
  getFacebookPosts,
  publishFacebookPost,          // 👈 Naya Import
  getFbPostComments,            // 👈 Naya Import
  replyToFbComment,             // 👈 Naya Import
  deleteFbComment,              // 👈 Naya Import
  getFbConversations,
  getFbMessages,
  sendFbMessage,
  updateFbConversationName,
  clearFbMessages,
  toggleFbConversationAI
} from "../../controllers/meta/facebookDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// =======================
// 📸 POSTS & COMMENTS
// =======================
router.get("/:pageId/posts", protect, getFacebookPosts);
router.post("/:pageId/posts", protect, publishFacebookPost); // Publish Post

router.get("/:pageId/posts/:postId/comments", protect, getFbPostComments); // Fetch Comments
router.post("/:pageId/comments/:commentId/reply", protect, replyToFbComment); // Reply Comment
router.delete("/:pageId/comments/:commentId", protect, deleteFbComment); // Delete Comment

// =======================
// 💬 MESSAGES & INBOX
// =======================
router.get("/:pageId/conversations", protect, getFbConversations);
router.get("/:pageId/conversations/:conversationId/messages", protect, getFbMessages);
router.post("/:pageId/messages", protect, sendFbMessage);

// Added 'protect' middleware here for security
router.put('/:pageId/conversations/:conversationId', protect, updateFbConversationName);
router.delete('/:pageId/conversations/:conversationId/messages', protect, clearFbMessages);
router.post("/:pageId/conversations/:conversationId/toggle-ai", protect, toggleFbConversationAI);

export default router;