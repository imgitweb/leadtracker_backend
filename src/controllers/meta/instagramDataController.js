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

    // 🔴 NEW FIX: Basic URL Validation Check
    // Meta requires direct image links. Check if it's not a generic HTML page.
    if (imageUrl.includes('drive.google.com') || imageUrl.includes('dropbox.com/s/')) {
      return res.status(400).json({ 
        error: "Invalid Image Source", 
        details: "Google Drive or Dropbox share links are not supported by Meta. Please use a direct public image URL (ending in .jpg, .png, etc.)." 
      });
    }

    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // STEP 1: Create Media Container
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

    // STEP 2: Publish the Container
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
    // 🔴 NEW FIX: Better Error Handling for Meta API Rejections
    console.error("Error publishing post:", error.response?.data || error.message);
    
    let errorMessage = "Failed to publish post";
    let details = error.response?.data?.error?.message || "Unknown Meta API error";

    // Agar Meta exact wahi 36001 image format error de raha hai
    if (error.response?.data?.error?.code === 36001) {
       errorMessage = "Invalid Image Format or Inaccessible URL";
       details = "Meta could not download the image. Please make sure the URL ends in .jpg or .png and is 100% publicly accessible on the internet.";
    }

    res.status(400).json({ 
      error: errorMessage, 
      details: details
    });
  }
};

// ==========================================
// 💬 COMMENTS MANAGEMENT
// ==========================================
export const getPostComments = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    const response = await axios.get(`https://graph.facebook.com/v25.0/${postId}/comments`, {
      params: {
        fields: "id,text,timestamp,username,replies{id,text,timestamp,username}",
        access_token: account.access_token
      }
    });

    const metaComments = response.data.data;
    const savedComments = [];

    for (const comment of metaComments) {
      const savedComment = await Comment.findOneAndUpdate(
        { comment_id: comment.id },
        {
          ig_account_id: accountId,
          ig_media_id: postId,
          username: comment.username,
          text: comment.text,
          timestamp: new Date(comment.timestamp)
        },
        { new: true, upsert: true }
      );
      savedComments.push(savedComment);

      if (comment.replies && comment.replies.data) {
        for (const reply of comment.replies.data) {
          await Comment.findOneAndUpdate(
            { comment_id: reply.id },
            {
              ig_account_id: accountId,
              ig_media_id: postId,
              parent_id: comment.id,
              username: reply.username,
              text: reply.text,
              timestamp: new Date(reply.timestamp)
            },
            { upsert: true }
          );
        }
      }
    }

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
      username: account.ig_username, 
      text: text,
      timestamp: new Date()
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
    
    await axios.delete(`https://graph.facebook.com/v25.0/${commentId}`, {
      params: { access_token: account.access_token }
    });

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
        `https://graph.facebook.com/v25.0/${accountId}/messages`,
        { recipient: { id: customer_ig_id }, message: { text: text } },
        { params: { access_token: account.access_token } }
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
      conversationId, { ai_enabled: isEnabled }, { new: true } 
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



// 👉 Get Auto-Reply Rule for a Post
export const getAutoReplyRule = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const rule = await AutoReplyRule.findOne({ platform: 'instagram', account_id: accountId, post_id: postId });
    res.status(200).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch auto-reply rule" });
  }
};

// 👉 Save/Update Auto-Reply Rule for a Post
export const saveAutoReplyRule = async (req, res) => {
  try {
    const { accountId, postId } = req.params;
    const { isEnabled, replyText } = req.body;

    const rule = await AutoReplyRule.findOneAndUpdate(
      { platform: 'instagram', account_id: accountId, post_id: postId },
      { is_enabled: isEnabled, reply_text: replyText },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, rule });
  } catch (error) {
    res.status(500).json({ error: "Failed to save auto-reply rule" });
  }
};


// import axios from "axios";
// import InstagramAccount from "../../models/InstagramAccount.js";
// import Conversation from "../../models/Conversation.js";
// import Message from "../../models/Message.js";
// import StartupData from "../../models/StartupData.js";
// import { generateAIReply } from "../../utils/aiHelper.js";

// // 1. Fetch Instagram Posts (Media)
// export const getInstagramPosts = async (req, res) => {
//   try {
//     const { accountId } = req.params;
//     const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    
//     if (!account) return res.status(404).json({ error: "Account not found" });

//     // ✅ FIX: Use graph.facebook.com with the v25.0 API for Business Accounts
//     // The account.access_token is the Facebook Page Token which has permissions for this IG ID
//     const response = await axios.get(`https://graph.facebook.com/v25.0/${accountId}/media`, {
//       params: {
//         fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp", // Removed trailing comma
//         access_token: account.access_token
//       }
//     });

//     res.status(200).json({ success: true, posts: response.data.data });
//   } catch (error) {
//     console.error("Error fetching posts:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to fetch Instagram posts" });
//   }
// };

// // 2. Get All Conversations for an Account (From your DB)
// export const getConversations = async (req, res) => {
//   try {
//     const { accountId } = req.params;
//     // Assuming Webhooks are populating this DB in the background
//     const conversations = await Conversation.find({ instagram_user_id: accountId }).sort({ last_message_time: -1 });
//     res.status(200).json({ success: true, conversations });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to fetch conversations" });
//   }
// };

// // 3. Get Messages for a specific Conversation
// export const getMessages = async (req, res) => {
//   try {
//     const { conversationId } = req.params;
//     const messages = await Message.find({ conversation_id: conversationId }).sort({ createdAt: 1 });
//     res.status(200).json({ success: true, messages });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to fetch messages" });
//   }
// };

// // 4. Send a Message to a Customer
// export const sendMessage = async (req, res) => {
//   try {
//     const { accountId } = req.params;
//     const { customer_ig_id, text, conversationId } = req.body;

//     const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
//     if (!account) return res.status(404).json({ error: "Account not found" });

//     // ✅ FIX: Updated to v25.0
//     try {
//       await axios.post(
//         `https://graph.facebook.com/v25.0/${accountId}/messages`,
//         { 
//           recipient: { id: customer_ig_id }, 
//           message: { text: text } 
//         },
//         { 
//           params: { access_token: account.access_token } 
//         }
//       );
//     } catch (metaError) {
//       console.error("Meta API Warning (Message might not send if sandbox mode or 24hr rule):", metaError.response?.data || metaError.message);
//       // Depending on your logic, you might want to return an error here instead of saving to DB
//       // if the message actually fails to deliver to Instagram.
//       return res.status(400).json({ error: "Failed to deliver message via Meta API", details: metaError.response?.data });
//     }

//     // Save Message to DB only if Meta API succeeds
//     const newMessage = new Message({
//       conversation_id: conversationId,
//       sender_id: accountId,
//       receiver_id: customer_ig_id,
//       text: text,
//       is_from_me: true
//     });
//     await newMessage.save();

//     // Update Conversation Last Message
//     await Conversation.findByIdAndUpdate(conversationId, {
//       last_message: text,
//       last_message_time: new Date()
//     });

//     res.status(200).json({ success: true, message: newMessage });
//   } catch (error) {
//     console.error("Send Message Error:", error);
//     res.status(500).json({ error: "Failed to send message" });
//   }
// };

// // 5. Toggle AI Auto-Reply
// export const toggleIgConversationAI = async (req, res) => {
//   try {
//     const { conversationId } = req.params;
//     const { isEnabled } = req.body; 

//     if (typeof isEnabled !== 'boolean') {
//       return res.status(400).json({ error: "isEnabled must be a boolean value" });
//     }

//     const updatedConversation = await Conversation.findByIdAndUpdate(
//       conversationId,
//       { ai_enabled: isEnabled },
//       { new: true } 
//     );

//     if (!updatedConversation) {
//       return res.status(404).json({ error: "Conversation not found" });
//     }

//     res.status(200).json({ 
//       success: true, 
//       message: `AI auto-reply is now ${isEnabled ? 'ON' : 'OFF'} for this Instagram chat.`,
//       ai_enabled: updatedConversation.ai_enabled 
//     });
//   } catch (error) {
//     console.error("Error toggling IG conversation AI:", error);
//     res.status(500).json({ error: "Failed to toggle conversation AI settings" });
//   }
// };







