import axios from "axios";
import FacebookAccount from "../../models/FacebookAccount.js";
import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";
import FacebookComment from "../../models/FacebookComment.js"; 

// ==========================================
// 📸 POSTS MANAGEMENT
// ==========================================

export const getFacebookPosts = async (req, res) => {
  try {
    const { pageId } = req.params;
    
    // Find account by either page_id (Business Page) or id (Personal Profile)
    const account = await FacebookAccount.findOne({ 
      $or: [{ page_id: pageId }, { id: pageId }]
    });

    if (!account) return res.status(404).json({ error: "Account not found" });

    // Meta API restricts fetching posts from Personal Profiles without special review
    if (!account.page_id) {
      return res.status(200).json({ posts: [], message: "Cannot fetch posts for personal profiles." });
    }

    // Use v19.0 and /posts endpoint for best results
    const response = await axios.get(`https://graph.facebook.com/v19.0/${account.page_id}/posts`, {
      params: { 
        fields: "id,message,full_picture,permalink_url,created_time", 
        access_token: account.access_token 
      }
    });

    res.status(200).json({ posts: response.data.data || [] });
  } catch (error) {
    console.error("Fetch Posts Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch posts" });
  }
};

export const publishFacebookPost = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { imageUrl, message } = req.body; 
    
    const account = await FacebookAccount.findOne({ 
      $or: [{ page_id: pageId }, { id: pageId }] 
    });

    if (!account) return res.status(404).json({ error: "Account not found" });
    if (!account.page_id) return res.status(403).json({ error: "Cannot publish to personal profiles." });

    let endpoint = `https://graph.facebook.com/v19.0/${account.page_id}/feed`; 
    let payload = { message, access_token: account.access_token };

    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v19.0/${account.page_id}/photos`;
      payload.url = imageUrl;
    }

    const publishRes = await axios.post(endpoint, null, { params: payload });

    res.status(200).json({ 
      success: true, 
      message: "Post published successfully to Facebook!", 
      postId: publishRes.data.id 
    });
  } catch (error) {
    console.error("FB Publish Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to publish Facebook post" });
  }
};

// ==========================================
// 💬 COMMENTS MANAGEMENT
// ==========================================

export const getFbPostComments = async (req, res) => {
  try {
    const { pageId, postId } = req.params;
    const account = await FacebookAccount.findOne({ 
      $or: [{ page_id: pageId }, { id: pageId }] 
    });

    if (!account) return res.status(404).json({ error: "Account not found" });
    if (!account.page_id) return res.status(200).json({ success: true, comments: [] });

    const response = await axios.get(`https://graph.facebook.com/v19.0/${postId}/comments`, {
      params: {
        fields: "id,message,created_time,from,comments{id,message,created_time,from}",
        access_token: account.access_token
      }
    });

    const metaComments = response.data.data || [];
    const savedComments = [];

    for (const comment of metaComments) {
      const savedComment = await FacebookComment.findOneAndUpdate(
        { comment_id: comment.id },
        {
          fb_page_id: account.page_id,
          fb_post_id: postId,
          sender_name: comment.from?.name || "Unknown User",
          sender_id: comment.from?.id || null,
          message: comment.message,
          timestamp: new Date(comment.created_time)
        },
        { new: true, upsert: true }
      );
      savedComments.push(savedComment);

      if (comment.comments && comment.comments.data) {
        for (const reply of comment.comments.data) {
          await FacebookComment.findOneAndUpdate(
            { comment_id: reply.id },
            {
              fb_page_id: account.page_id,
              fb_post_id: postId,
              parent_id: comment.id,
              sender_name: reply.from?.name || "Unknown User",
              sender_id: reply.from?.id || null,
              message: reply.message,
              timestamp: new Date(reply.created_time)
            },
            { upsert: true }
          );
        }
      }
    }

    const dbComments = await FacebookComment.find({ fb_post_id: postId }).sort({ timestamp: -1 });
    res.status(200).json({ success: true, comments: dbComments });
  } catch (error) {
    console.error("Error fetching FB comments:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch Facebook comments" });
  }
};

export const replyToFbComment = async (req, res) => {
  try {
    const { pageId, commentId } = req.params;
    const { message, postId } = req.body;

    const account = await FacebookAccount.findOne({ 
      $or: [{ page_id: pageId }, { id: pageId }] 
    });
    
    if (!account || !account.page_id) return res.status(403).json({ error: "Action not allowed" });

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${commentId}/comments`,
      null,
      { params: { message, access_token: account.access_token } }
    );

    const newReply = new FacebookComment({
      fb_page_id: account.page_id,
      fb_post_id: postId,
      comment_id: response.data.id,
      parent_id: commentId,
      sender_name: account.page_name, 
      message: message,
      timestamp: new Date()
    });
    await newReply.save();

    res.status(200).json({ success: true, reply: newReply });
  } catch (error) {
    console.error("Error replying to FB comment:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to reply to comment" });
  }
};

export const deleteFbComment = async (req, res) => {
  try {
    const { pageId, commentId } = req.params;
    const account = await FacebookAccount.findOne({ 
      $or: [{ page_id: pageId }, { id: pageId }] 
    });

    if (!account || !account.page_id) return res.status(403).json({ error: "Action not allowed" });

    await axios.delete(`https://graph.facebook.com/v19.0/${commentId}`, {
      params: { access_token: account.access_token }
    });

    await FacebookComment.findOneAndDelete({ comment_id: commentId });
    res.status(200).json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete comment" });
  }
};

// ==========================================
// ✉️ MESSAGES & INBOX MANAGEMENT
// ==========================================

export const getFbConversations = async (req, res) => {
  try {
    // Only fetch conversations for Business Pages
    const conversations = await FacebookConversation.find({ page_id: req.params.pageId }).sort({ last_message_time: -1 });
    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const getFbMessages = async (req, res) => {
  try {
    const conversationId = req.params.convId || req.params.conversationId || req.params.id;
    if (!conversationId) return res.status(400).json({ error: "Conversation ID is missing" });

    const messages = await FacebookMessage.find({ conversation_id: conversationId }).sort({ createdAt: 1 });
    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const sendFbMessage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { customer_psid, text, conversationId } = req.body;

    const account = await FacebookAccount.findOne({ 
      $or: [{ page_id: pageId }, { id: pageId }] 
    });
    
    if (!account || !account.page_id) return res.status(403).json({ error: "Cannot send messages from personal profiles." });

    await axios.post(
      `https://graph.facebook.com/v19.0/${account.page_id}/messages`,
      { recipient: { id: customer_psid }, message: { text: text } },
      { params: { access_token: account.access_token } }
    );

    const newMessage = new FacebookMessage({
      conversation_id: conversationId, sender_id: account.page_id, receiver_id: customer_psid, text, is_from_me: true
    });
    await newMessage.save();

    await FacebookConversation.findByIdAndUpdate(conversationId, { last_message: text, last_message_time: new Date() });
    res.status(200).json({ message: newMessage });
  } catch (error) {
    console.error("Message Send Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const updateFbConversationName = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { customer_name } = req.body;

    if (!customer_name) return res.status(400).json({ error: "Customer name is required" });

    const updatedConversation = await FacebookConversation.findByIdAndUpdate(
      conversationId, { customer_name: customer_name }, { new: true } 
    );
    if (!updatedConversation) return res.status(404).json({ error: "Conversation not found" });

    res.status(200).json({ message: "Name updated successfully", conversation: updatedConversation });
  } catch (error) {
    res.status(500).json({ error: "Failed to update conversation name" });
  }
};

export const clearFbMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    await FacebookMessage.deleteMany({ conversation_id: conversationId });
    await FacebookConversation.findByIdAndUpdate(
      conversationId, { last_message: "Chat cleared", last_message_time: new Date() }
    );
    res.status(200).json({ message: "Chat cleared successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear chat messages" });
  }
};

export const toggleFbConversationAI = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { isEnabled } = req.body; 

    if (typeof isEnabled !== 'boolean') return res.status(400).json({ error: "isEnabled must be a boolean" });

    const updatedConversation = await FacebookConversation.findByIdAndUpdate(
      conversationId, { ai_enabled: isEnabled }, { new: true } 
    );
    if (!updatedConversation) return res.status(404).json({ error: "Conversation not found" });

    res.status(200).json({ 
      success: true, 
      message: `AI auto-reply is now ${isEnabled ? 'ON' : 'OFF'} for this chat.`,
      ai_enabled: updatedConversation.ai_enabled 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle AI settings" });
  }
};