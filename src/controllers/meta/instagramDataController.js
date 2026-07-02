import axios from "axios";
import InstagramAccount from "../../models/InstagramAccount.js";
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import Comment from "../../models/InstagramComment.js"; 
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js";
import AutoReplyRule from "../../models/AutoReplyRule.js";

// ==========================================
// 📸 POSTS MANAGEMENT
// ==========================================

export const getInstagramPosts = async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    
    if (!account) return res.status(404).json({ error: "Account not found" });

    const response = await axios.get(`https://graph.facebook.com/v25.0/${accountId}/media`, {
      params: {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count",
        access_token: account.access_token
      }
    });

    res.status(200).json({ success: true, posts: response.data.data });
  } catch (error) {
    console.error("Error fetching posts:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch Instagram posts" });
  }
};


export const publishInstagramPost = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { imageUrl, caption, mediaType = "IMAGE" } = req.body; 

    if (!imageUrl) {
      return res.status(400).json({ error: "Image URL is required to create a post." });
    }

    if (imageUrl.includes('drive.google.com') || imageUrl.includes('dropbox.com/s/')) {
      return res.status(400).json({ 
        error: "Invalid Image Source", 
        details: "Google Drive or Dropbox share links are not supported by Meta. Please use a direct public image URL (ending in .jpg, .png, etc.)." 
      });
    }

    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    console.log(`Step 1: Creating Meta Media Container with URL: ${imageUrl}`);
    const containerRes = await axios.post(
      `https://graph.facebook.com/v25.0/${accountId}/media`,
      null, 
      {
        params: {
          image_url: imageUrl,
          caption: caption || "",
          media_type: mediaType,
          access_token: account.access_token
        }
      }
    );

    const creationId = containerRes.data.id;
    console.log(`Step 1 Success: Container ID ${creationId} created.`);

    console.log("Step 2: Publishing the Container to Instagram Feed...");
    const publishRes = await axios.post(
      `https://graph.facebook.com/v25.0/${accountId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: account.access_token
        }
      }
    );

    const publishedPostId = publishRes.data.id;
    console.log(`Step 2 Success: Post Published! ID: ${publishedPostId}`);

    res.status(200).json({ 
      success: true, 
      message: "Post published successfully to Instagram!", 
      postId: publishedPostId 
    });

  } catch (error) {
    console.error("Error publishing post:", error.response?.data || error.message);
    
    let errorMessage = "Failed to publish post";
    let details = error.response?.data?.error?.message || "Unknown Meta API error";

    if (error.response?.data?.error?.code === 36001) {
       errorMessage = "Invalid Image Format or Inaccessible URL";
       details = "Meta could not download the image. Please make sure the URL ends in .jpg or .png and is publicly accessible.";
    }

    res.status(400).json({ error: errorMessage, details: details });
  }
};

// 🚀 NEW: Delete Instagram Post Logic
export const deleteInstagramPost = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(403).json({ error: "Not allowed." });

    await axios.delete(`https://graph.facebook.com/v25.0/${postId}`, { 
      params: { access_token: account.access_token } 
    });

    res.status(200).json({ success: true, message: "Post deleted" });
  } catch (error) {
    console.error("Delete Post Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to delete post" });
  }
};

// ==========================================
// 💬 COMMENTS MANAGEMENT (WITH SYNC)
// ==========================================
export const getPostComments = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // 1. Fetch live comments from Meta
    const response = await axios.get(`https://graph.facebook.com/v25.0/${postId}/comments`, {
      params: {
        fields: "id,text,timestamp,username,replies{id,text,timestamp,username}",
        access_token: account.access_token
      }
    });

    const metaComments = response.data.data || [];
    const activeMetaCommentIds = [];

    // 2. Save and Update comments
    for (const comment of metaComments) {
      activeMetaCommentIds.push(comment.id);

      await Comment.findOneAndUpdate(
        { comment_id: comment.id },
        {
          ig_account_id: accountId,
          ig_media_id: postId,
          username: comment.username || "Unknown",
          text: comment.text || "",
          timestamp: new Date(comment.timestamp),
          is_hidden: false // Meta pe available hai
        },
        { returnDocument: 'after', upsert: true }
      );

      if (comment.replies && comment.replies.data) {
        for (const reply of comment.replies.data) {
          activeMetaCommentIds.push(reply.id);

          await Comment.findOneAndUpdate(
            { comment_id: reply.id },
            {
              ig_account_id: accountId,
              ig_media_id: postId,
              parent_id: comment.id,
              username: reply.username || "Unknown",
              text: reply.text || "",
              timestamp: new Date(reply.timestamp),
              is_hidden: false // Meta pe available hai
            },
            { returnDocument: 'after', upsert: true }
          );
        }
      }
    }

    // 3. Mark comments as hidden if they were deleted on Meta
    await Comment.updateMany(
      { ig_media_id: postId, comment_id: { $nin: activeMetaCommentIds } },
      { $set: { is_hidden: true } }
    );

    // 4. Send updated data back
    const dbComments = await Comment.find({ ig_media_id: postId }).sort({ timestamp: -1 });
    res.status(200).json({ success: true, comments: dbComments });

  } catch (error) {
    console.error("Error fetching comments:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
};

export const replyToComment = async (req, res) => {
  try {
    const { accountId, commentId } = req.params;
    const { text, postId } = req.body;

    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${commentId}/replies`,
      null,
      { params: { message: text, access_token: account.access_token } }
    );

    const newReply = new Comment({
      ig_account_id: accountId,
      ig_media_id: postId,
      comment_id: response.data.id,
      parent_id: commentId,
      username: account.ig_username || "You", 
      text: text,
      timestamp: new Date(),
      is_hidden: false
    });
    await newReply.save();

    res.status(200).json({ success: true, reply: newReply });
  } catch (error) {
    console.error("Error replying to comment:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to reply to comment" });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { accountId, commentId } = req.params;
    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    
    // Attempt to delete from Meta
    try {
      await axios.delete(`https://graph.facebook.com/v25.0/${commentId}`, {
        params: { access_token: account.access_token }
      });
    } catch (metaErr) {
      console.log("Comment may already be deleted from Meta. Proceeding to hard delete from DB.");
    }

    // Hard delete from Database
    await Comment.findOneAndDelete({ comment_id: commentId });
    res.status(200).json({ success: true, message: "Comment deleted successfully" });
  } catch (error) {
    console.error("Error deleting comment:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to delete comment" });
  }
};


// ==========================================
// ✉️ MESSAGES & INBOX MANAGEMENT
// ==========================================

export const getConversations = async (req, res) => {
  try {
    const { accountId } = req.params;
    const conversations = await Conversation.find({ instagram_user_id: accountId }).sort({ last_message_time: -1 });
    res.status(200).json({ success: true, conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await Message.find({ conversation_id: conversationId }).sort({ createdAt: 1 });
    res.status(200).json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { customer_ig_id, text, conversationId } = req.body;

    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    try {
      await axios.post(
        `https://graph.instagram.com/v25.0/17841472440589636/messages`,
        { recipient: { id: customer_ig_id }, message: { text: text } },
        { params: { access_token: "IGAAO6K423gJtBZAGF2VU5fbjdURmpoT0Y1NUI0bkdxMG83U0FmY29mZADBna1BBeFJhbXZAzUkVadDR6bnBfbEFpMWVzbG1GVkdTd1BJcU4ycmJma3dDX1h2NW5XcEJFTUczcjd0NlJvZAk5nQlNid1h6bW9NaUNUV2FpdmFPNlpkMAZDZD" } }
      );
    } catch (metaError) {
      console.error("Meta API Warning:", metaError.response?.data || metaError.message);
      return res.status(400).json({ error: "Failed to deliver message via Meta API", details: metaError.response?.data });
    }

    const newMessage = new Message({
      conversation_id: conversationId,
      sender_id: accountId,
      receiver_id: customer_ig_id,
      text: text,
      is_from_me: true
    });
    await newMessage.save();

    await Conversation.findByIdAndUpdate(conversationId, {
      last_message: text,
      last_message_time: new Date()
    });

    res.status(200).json({ success: true, message: newMessage });
  } catch (error) {
    console.error("Send Message Error:", error);
    res.status(500).json({ error: "Failed to send message" });
  }
};

export const toggleIgConversationAI = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { isEnabled } = req.body; 

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: "isEnabled must be a boolean value" });
    }

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId, { ai_enabled: isEnabled }, { returnDocument: 'after' } 
    );

    if (!updatedConversation) return res.status(404).json({ error: "Conversation not found" });

    res.status(200).json({ 
      success: true, 
      message: `AI auto-reply is now ${isEnabled ? 'ON' : 'OFF'} for this Instagram chat.`,
      ai_enabled: updatedConversation.ai_enabled 
    });
  } catch (error) {
    console.error("Error toggling IG conversation AI:", error);
    res.status(500).json({ error: "Failed to toggle conversation AI settings" });
  }
};


// ==========================================
// 🤖 AUTO-REPLY MANAGEMENT
// ==========================================
export const getAutoReplyRule = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const rule = await AutoReplyRule.findOne({ platform: 'instagram', account_id: accountId, post_id: postId });
    res.status(200).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch auto-reply rule" });
  }
};

export const saveAutoReplyRule = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const { isEnabled, replyText } = req.body;

    const rule = await AutoReplyRule.findOneAndUpdate(
      { platform: 'instagram', account_id: accountId, post_id: postId },
      { is_enabled: isEnabled, reply_text: replyText },
      { returnDocument: 'after', upsert: true }
    );

    res.status(200).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Failed to save auto-reply rule" });
  }
};