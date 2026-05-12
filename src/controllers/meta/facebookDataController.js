import axios from "axios";
import FacebookAccount from "../../models/FacebookAccount.js";
import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";

export const getFacebookPosts = async (req, res) => {
  try {
    const account = await FacebookAccount.findOne({ page_id: req.params.pageId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    const response = await axios.get(`https://graph.facebook.com/v19.0/${account.page_id}/published_posts`, {
      params: { fields: "id,message,full_picture,permalink_url,created_time", access_token: account.access_token }
    });
    res.status(200).json({ posts: response.data.data });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch posts" });
  }
};

export const getFbConversations = async (req, res) => {
  try {
    const conversations = await FacebookConversation.find({ page_id: req.params.pageId }).sort({ last_message_time: -1 });
    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const getFbMessages = async (req, res) => {
  try {
    // We check for 'convId', 'conversationId', or 'id' to ensure we catch 
    // whatever parameter name you defined in your Express routes.
    const conversationId = req.params.convId || req.params.conversationId || req.params.id;
    console.log("conversationId ------------------",conversationId);

    if (!conversationId) {
      console.error("Missing Route Parameter. Params received:", req.params);
      return res.status(400).json({ error: "Conversation ID is missing in route parameters" });
    }

    // Fetch messages matching the conversation ID
    const messages = await FacebookMessage.find({ 
      conversation_id: conversationId 
    }).sort({ createdAt: 1 }); // 1 for ascending order (oldest to newest)

    console.log("........");
    
    res.status(200).json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const sendFbMessage = async (req, res) => {
  try {
    const { pageId } = req.params;
    const { customer_psid, text, conversationId } = req.body;

    const account = await FacebookAccount.findOne({ page_id: pageId });
    
    // Send to Meta
    await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/messages`,
      { recipient: { id: customer_psid }, message: { text: text } },
      { params: { access_token: account.access_token } }
    );

    // Save locally
    const newMessage = new FacebookMessage({
      conversation_id: conversationId, sender_id: pageId, receiver_id: customer_psid, text, is_from_me: true
    });
    await newMessage.save();

    await FacebookConversation.findByIdAndUpdate(conversationId, { last_message: text, last_message_time: new Date() });

    res.status(200).json({ message: newMessage });
  } catch (error) {
    console.error("FB Send Error:", error.response?.data || error);
    res.status(500).json({ error: "Failed to send message" });
  }
};


export const updateFbConversationName = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { customer_name } = req.body;

    if (!customer_name) {
      return res.status(400).json({ error: "Customer name is required" });
    }

    const updatedConversation = await FacebookConversation.findByIdAndUpdate(
      conversationId,
      { customer_name: customer_name },
      { new: true } // Returns the updated document
    );

    if (!updatedConversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.status(200).json({ 
      message: "Name updated successfully", 
      conversation: updatedConversation 
    });
  } catch (error) {
    console.error("Error updating conversation name:", error);
    res.status(500).json({ error: "Failed to update conversation name" });
  }
};


export const clearFbMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;

    // 1. Delete all messages matching this conversation ID
    await FacebookMessage.deleteMany({ conversation_id: conversationId });

    // 2. Update the conversation document to show it was cleared
    await FacebookConversation.findByIdAndUpdate(
      conversationId,
      { 
        last_message: "Chat cleared", 
        last_message_time: new Date() 
      }
    );

    res.status(200).json({ message: "Chat cleared successfully" });
  } catch (error) {
    console.error("Error clearing chat messages:", error);
    res.status(500).json({ error: "Failed to clear chat messages" });
  }
};