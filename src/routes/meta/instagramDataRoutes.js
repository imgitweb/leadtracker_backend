import express from "express";
import { 
  getInstagramPosts,
  publishInstagramPost,         // 👈 New route to publish
  deleteInstagramPost,          // 👈 🚀 New route to DELETE POST
  getPostComments,              
  replyToComment,               
  deleteComment,                
  getConversations, 
  getMessages, 
  sendMessage,
  toggleIgConversationAI,
  getAutoReplyRule,
  saveAutoReplyRule,
} from "../../controllers/meta/instagramDataController.js";
import { protect } from "../../middleware/auth.js";

const router = express.Router();

// 📸 Posts Management
router.get("/:accountId/posts", protect, getInstagramPosts);
router.post("/:accountId/posts", protect, publishInstagramPost); 
router.delete("/:accountId/posts/:postId", protect, deleteInstagramPost); // 🚀 Deleted API route

// 💬 Comments Management
router.get("/:accountId/posts/:postId/comments", protect, getPostComments);
router.post("/:accountId/comments/:commentId/reply", protect, replyToComment);
router.delete("/:accountId/comments/:commentId", protect, deleteComment);

// ✉️ Inbox Management
router.get("/:accountId/conversations", protect, getConversations);
router.get("/:accountId/conversations/:conversationId/messages", protect, getMessages);
router.post("/:accountId/messages", protect, sendMessage);
router.post("/:accountId/conversations/:conversationId/toggle-ai", protect, toggleIgConversationAI);

// 🤖 Auto-Reply Rules
router.get("/:accountId/posts/:postId/auto-reply", protect, getAutoReplyRule);
router.post("/:accountId/posts/:postId/auto-reply", protect, saveAutoReplyRule);

export default router;