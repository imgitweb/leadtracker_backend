import axios from "axios";
import InstagramAccount from "../../models/InstagramAccount.js";
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js";
// 1. Fetch Instagram Posts (Media)
export const getInstagramPosts = async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Fetch media from Instagram Graph API
    const response = await axios.get(`https://graph.instagram.com/${accountId}/media`, {
      params: {
        fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,",
        access_token: account.access_token
      }
    });

    res.status(200).json({ success: true, posts: response.data.data });
  } catch (error) {
    console.error("Error fetching posts:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch Instagram posts" });
  }
};

// 2. Get All Conversations for an Account
export const getConversations = async (req, res) => {
  try {
    const { accountId } = req.params;
    const conversations = await Conversation.find({ instagram_user_id: accountId }).sort({ last_message_time: -1 });
    res.status(200).json({ success: true, conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

// 3. Get Messages for a specific Conversation
export const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const messages = await Message.find({ conversation_id: conversationId }).sort({ createdAt: 1 });
    res.status(200).json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// 4. Send a Message to a Customer
export const sendMessage = async (req, res) => {
  try {
    const { accountId } = req.params;
    const { customer_ig_id, text, conversationId } = req.body;

    const account = await InstagramAccount.findOne({ instagram_user_id: accountId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    /* NOTE: To physically send a message to Instagram, you use the Meta Graph API.
      Requires the 'instagram_manage_messages' permission.
    */
    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/${accountId}/messages`,
        { recipient: { id: customer_ig_id }, message: { text: text } },
        { params: { access_token: account.access_token } }
      );
    } catch (metaError) {
      console.error("Meta API Warning (Message might not send if sandbox mode):", metaError.response?.data || metaError.message);
      // We will continue saving to DB for UI demonstration even if Meta rejects it (e.g., due to 24hr policy)
    }

    // Save Message to DB
    const newMessage = new Message({
      conversation_id: conversationId,
      sender_id: accountId,
      receiver_id: customer_ig_id,
      text: text,
      is_from_me: true
    });
    await newMessage.save();

    // Update Conversation Last Message
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
    const { isEnabled } = req.body; // true ya false

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: "isEnabled must be a boolean value" });
    }

    const updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { ai_enabled: isEnabled },
      { new: true } // Return updated document
    );

    if (!updatedConversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

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