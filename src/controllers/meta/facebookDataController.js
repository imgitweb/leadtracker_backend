import axios from "axios";
import FacebookAccount from "../../models/FacebookAccount.js";
import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";
import FacebookComment from "../../models/FacebookComment.js"; 
import AutoReplyRule from "../../models/AutoReplyRule.js";

// ==========================================
// 📤 LOCAL IMAGE UPLOAD CONTROLLER
// ==========================================
export const uploadImage = (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image file provided" });
    const filename = req.file.filename;
    const baseUrl = "https://crm.cinfy.co";
    res.status(200).json({ success: true, imageUrl: `${baseUrl}/uploads/${filename}` });
  } catch (error) {
    res.status(500).json({ error: "Image upload failed on local server" });
  }
};

// ==========================================
// 📸 POSTS MANAGEMENT
// ==========================================
export const publishFacebookPost = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { imageUrl, message, scheduledTime } = req.body; 
    
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });
    if (!account || !account.page_id) return res.status(403).json({ error: "Action not allowed." });

    let endpoint = `https://graph.facebook.com/v25.0/${account.page_id}/feed`; 
    let payload = { access_token: account.access_token };
    
    if (message) payload.message = message; 

    if (scheduledTime) {
      const unixTime = Math.floor(new Date(scheduledTime).getTime() / 1000);
      payload.published = false; 
      payload.scheduled_publish_time = unixTime;
    }

    if (imageUrl) {
      endpoint = `https://graph.facebook.com/v25.0/${account.page_id}/photos`;
      payload.url = imageUrl;
    }

    const publishRes = await axios.post(endpoint, null, { params: payload });
    res.status(200).json({ success: true, message: "Post published!", postId: publishRes.data.post_id || publishRes.data.id });
  } catch (error) {
    res.status(500).json({ error: "Failed to publish", details: error.response?.data?.error?.message });
  }
};

export const getFacebookPosts = async (req, res) => {
  try {
    const { pageId } = req.params;
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });
    if (!account) return res.status(404).json({ error: "Account not found" });
    if (!account.page_id) return res.status(200).json({ posts: [], message: "Cannot fetch personal profile posts." });

    const response = await axios.get(`https://graph.facebook.com/v25.0/${account.page_id}/posts`, {
      params: { fields: "id,message,full_picture,permalink_url,created_time", access_token: account.access_token }
    });
    res.status(200).json({ posts: response.data.data || [] });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
};

export const deleteFacebookPost = async (req, res) => {
  try {
    const { pageId, postId } = req.params;
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });
    if (!account || !account.page_id) return res.status(403).json({ error: "Not allowed." });

    await axios.delete(`https://graph.facebook.com/v25.0/${postId}`, { params: { access_token: account.access_token } });
    res.status(200).json({ success: true, message: "Post deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete post" });
  }
};

// ==========================================
// 💬 COMMENTS MANAGEMENT (SYNC & SMART SAVE)
// ==========================================
export const getFbPostComments = async (req, res) => {
  try {
    const { pageId, postId } = req.params;
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });

    if (!account || !account.page_id) return res.status(200).json({ success: true, comments: [] });

    // 1. Meta API se Live Comments lao
    const response = await axios.get(`https://graph.facebook.com/v25.0/${postId}/comments`, {
      params: {
        fields: "id,message,created_time,from,comments{id,message,created_time,from}",
        access_token: account.access_token,
        filter: "stream", 
        summary: true
      }
    });

    const metaComments = response.data.data || [];
    
    // Track saare active IDs jo Meta ne bheje
    const activeMetaCommentIds = [];

    // Pehle se ki gayi chats nikal lo taaki naam match kar sakein
    const existingChats = await FacebookConversation.find({ page_id: account.page_id });
    const chatNameMap = {};
    existingChats.forEach(chat => {
      if (chat.customer_psid && chat.customer_name) chatNameMap[chat.customer_psid] = chat.customer_name;
    });

    // Smart Function to determine sender name
    const getSenderName = (fromObj, commentId) => {
      if (fromObj && fromObj.name) return fromObj.name; // Jo Meta ne diya
      if (fromObj && fromObj.id && chatNameMap[fromObj.id]) return chatNameMap[fromObj.id]; // Chat se nikala
      return `FB User_${commentId.slice(-4)}`; // Fallback
    };

    // 2. Save Live Comments to Database
    for (const comment of metaComments) {
      activeMetaCommentIds.push(comment.id);
      
      // 🚀 FIXED: model mein `text` field hai, `message` nahi
      await FacebookComment.findOneAndUpdate(
        { comment_id: comment.id },
        {
          fb_page_id: account.page_id,
          fb_post_id: postId,
          sender_name: getSenderName(comment.from, comment.id),
          sender_id: comment.from?.id || null,
          text: comment.message || "", // 👈 FIXED HERE
          timestamp: new Date(comment.created_time),
          is_hidden: false
        },
        { returnDocument: 'after', upsert: true }
      );

      // Replies Handle
      if (comment.comments && comment.comments.data) {
        for (const reply of comment.comments.data) {
          activeMetaCommentIds.push(reply.id);
          await FacebookComment.findOneAndUpdate(
            { comment_id: reply.id },
            {
              fb_page_id: account.page_id,
              fb_post_id: postId,
              parent_id: comment.id,
              sender_name: getSenderName(reply.from, reply.id),
              sender_id: reply.from?.id || null,
              text: reply.message || "", // 👈 FIXED HERE
              timestamp: new Date(reply.created_time),
              is_hidden: false
            },
            { returnDocument: 'after', upsert: true }
          );
        }
      }
    }

    // 3. Jo comments Meta se delete ho chuke hain, unhe DB me flag karo
    await FacebookComment.updateMany(
      { fb_post_id: postId, comment_id: { $nin: activeMetaCommentIds } },
      { $set: { is_hidden: true } } // Hum delete nahi karte, sirf flag karte hain ki FB pe deleted hai
    );

    // 4. Send updated list to frontend
    const dbComments = await FacebookComment.find({ fb_post_id: postId }).sort({ timestamp: -1 });
    res.status(200).json({ success: true, comments: dbComments });
  } catch (error) {
    console.error("Error fetching FB comments:", error);
    res.status(500).json({ error: "Failed to fetch Facebook comments" });
  }
};

export const replyToFbComment = async (req, res) => {
  try {
    const { pageId, commentId } = req.params;
    const { message, postId } = req.body;
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });
    
    if (!account || !account.page_id) return res.status(403).json({ error: "Not allowed" });

    const response = await axios.post(`https://graph.facebook.com/v25.0/${commentId}/comments`, null, { 
      params: { message, access_token: account.access_token } 
    });

    const newReply = new FacebookComment({
      fb_page_id: account.page_id, fb_post_id: postId, comment_id: response.data.id,
      parent_id: commentId, sender_name: account.page_name, text: message, timestamp: new Date() // 👈 FIXED TEXT
    });
    await newReply.save();
    res.status(200).json({ success: true, reply: newReply });
  } catch (error) {
    res.status(500).json({ error: "Failed to reply to comment" });
  }
};

export const deleteFbComment = async (req, res) => {
  try {
    const { pageId, commentId } = req.params;
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });
    if (!account || !account.page_id) return res.status(403).json({ error: "Not allowed" });

    // Try deleting from Meta. If it's already deleted on Meta, it will throw an error.
    try {
      await axios.delete(`https://graph.facebook.com/v25.0/${commentId}`, { params: { access_token: account.access_token } });
    } catch (metaErr) {
      console.log("Comment might already be deleted from Meta. Proceeding to delete from DB.");
    }

    // Hard delete from our database
    await FacebookComment.findOneAndDelete({ comment_id: commentId });
    res.status(200).json({ success: true, message: "Deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete" });
  }
};

// ==========================================
// 🤖 AUTO-REPLY MANAGEMENT FOR POSTS
// ==========================================
export const getAutoReplyRule = async (req, res) => {
  try {
    const { pageId, postId } = req.params;
    const rule = await AutoReplyRule.findOne({ platform: 'facebook', account_id: pageId, post_id: postId });
    res.status(200).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rule" });
  }
};

export const saveAutoReplyRule = async (req, res) => {
  try {
    const { pageId, postId } = req.params;
    const { is_enabled, reply_text } = req.body;
    const rule = await AutoReplyRule.findOneAndUpdate(
      { platform: 'facebook', account_id: pageId, post_id: postId },
      { is_enabled, reply_text: reply_text || "" },
      { returnDocument: 'after', upsert: true }
    );
    res.status(200).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Failed to save rule" });
  }
};

// ==========================================
// ✉️ MESSAGES & INBOX MANAGEMENT
// ==========================================
export const getFbConversations = async (req, res) => {
  try {
    const conversations = await FacebookConversation.find({ page_id: req.params.pageId }).sort({ last_message_time: -1 });
    res.status(200).json({ conversations });
  } catch (error) { res.status(500).json({ error: "Failed to fetch conversations" }); }
};

export const getFbMessages = async (req, res) => {
  try {
    const messages = await FacebookMessage.find({ conversation_id: req.params.conversationId }).sort({ createdAt: 1 });
    res.status(200).json({ messages });
  } catch (error) { res.status(500).json({ error: "Failed to fetch messages" }); }
};

export const sendFbMessage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { customer_psid, text, conversationId } = req.body;
    const account = await FacebookAccount.findOne({ $or: [{ page_id: pageId }, { id: pageId }] });
    
    await axios.post(`https://graph.facebook.com/v25.0/${account.page_id}/messages`, 
      { recipient: { id: customer_psid }, message: { text: text } }, { params: { access_token: account.access_token } }
    );

    const newMessage = new FacebookMessage({ conversation_id: conversationId, sender_id: account.page_id, receiver_id: customer_psid, text, is_from_me: true });
    await newMessage.save();
    await FacebookConversation.findByIdAndUpdate(conversationId, { last_message: text, last_message_time: new Date() });
    res.status(200).json({ message: newMessage });
  } catch (error) { res.status(500).json({ error: "Failed to send message" }); }
};

export const updateFbConversationName = async (req, res) => {
  try {
    const updatedConversation = await FacebookConversation.findByIdAndUpdate(req.params.conversationId, { customer_name: req.body.customer_name }, { returnDocument: 'after' });
    res.status(200).json({ conversation: updatedConversation });
  } catch (error) { res.status(500).json({ error: "Failed to update name" }); }
};

export const clearFbMessages = async (req, res) => {
  try {
    await FacebookMessage.deleteMany({ conversation_id: req.params.conversationId });
    await FacebookConversation.findByIdAndUpdate(req.params.conversationId, { last_message: "Chat cleared", last_message_time: new Date() });
    res.status(200).json({ message: "Cleared" });
  } catch (error) { res.status(500).json({ error: "Failed to clear" }); }
};

export const toggleFbConversationAI = async (req, res) => {
  try {
    const updatedConversation = await FacebookConversation.findByIdAndUpdate(req.params.conversationId, { ai_enabled: req.body.isEnabled }, { returnDocument: 'after' });
    res.status(200).json({ success: true, ai_enabled: updatedConversation.ai_enabled });
  } catch (error) { res.status(500).json({ error: "Failed to toggle AI" }); }
};