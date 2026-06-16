import express from "express";
import {
  getFacebookPosts,
  publishFacebookPost,
  deleteFacebookPost,  // 👈 NAYA IMPORT ADD KAREIN
  getFbPostComments,
  replyToFbComment,
  deleteFbComment,
  getFbConversations,
  getFbMessages,
  sendFbMessage,
  updateFbConversationName,
  clearFbMessages,
  toggleFbConversationAI,
  uploadImage,
  getAutoReplyRule,
  saveAutoReplyRule
} from "../../controllers/meta/facebookDataController.js";
import { protect } from "../../middleware/auth.js";
import { upload } from "../../middleware/uploadMiddleware.js";

const router = express.Router();

router.post("/upload", protect, upload.single("file"), uploadImage);

// =======================
// 📸 POSTS & COMMENTS
// =======================
router.get("/:pageId/posts", protect, getFacebookPosts);
router.post("/:pageId/posts", protect, publishFacebookPost); 
router.delete("/:pageId/posts/:postId", protect, deleteFacebookPost); // 👈 YEH NAYI DELETE ROUTE ADD KAREIN

router.get("/:pageId/posts/:postId/comments", protect, getFbPostComments);
router.post("/:pageId/comments/:commentId/reply", protect, replyToFbComment);
router.delete("/:pageId/comments/:commentId", protect, deleteFbComment);

// =======================
// 🤖 AUTO REPLY RULES 
// =======================
router.get("/:pageId/posts/:postId/auto-reply", protect, getAutoReplyRule);
router.post("/:pageId/posts/:postId/auto-reply", protect, saveAutoReplyRule);

// =======================
// 💬 MESSAGES & INBOX
// =======================
router.get("/:pageId/conversations", protect, getFbConversations);
router.get("/:pageId/conversations/:conversationId/messages", protect, getFbMessages);
router.post("/:pageId/messages", protect, sendFbMessage);
router.put('/:pageId/conversations/:conversationId', protect, updateFbConversationName);
router.delete('/:pageId/conversations/:conversationId/messages', protect, clearFbMessages);
router.post("/:pageId/conversations/:conversationId/toggle-ai", protect, toggleFbConversationAI);

export default router;