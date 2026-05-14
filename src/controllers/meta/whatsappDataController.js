import axios from "axios";
import WhatsAppAccount from "../../models/WhatsAppAccount.js";
import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";

export const getWaConversations = async (req, res) => {
  try {
    const conversations = await WhatsAppConversation.find({ phone_number_id: req.params.phoneId }).sort({ last_message_time: -1 });
    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

export const getWaMessages = async (req, res) => {
  try {
    const messages = await WhatsAppMessage.find({ conversation_id: req.params.convId }).sort({ createdAt: 1 });
    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

export const sendWaMessage = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const { customer_phone, text, conversationId } = req.body;

    const account = await WhatsAppAccount.findOne({ phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "Account not found" });
    
    // WhatsApp Cloud API Messaging Endpoint
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        to: customer_phone,
        type: "text",
        text: { body: text }
      },
      { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
    );

    const newMessage = new WhatsAppMessage({
      conversation_id: conversationId, sender_id: phoneId, receiver_id: customer_phone, text, is_from_me: true
    });
    await newMessage.save();

    await WhatsAppConversation.findByIdAndUpdate(conversationId, { last_message: text, last_message_time: new Date() });

    res.status(200).json({ message: newMessage });
  } catch (error) {
    console.error("WA Send Error:", error.response?.data || error);
    res.status(500).json({ error: "Failed to send WA message" });
  }
};


export const toggleWaConversationAI = async (req, res) => {
  try {
    const { convId } = req.params; // Route params se conversationId lenge
    const { isEnabled } = req.body; // true ya false

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: "isEnabled must be a boolean value" });
    }

    const updatedConversation = await WhatsAppConversation.findByIdAndUpdate(
      convId,
      { ai_enabled: isEnabled },
      { new: true } // Return updated document
    );

    if (!updatedConversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: `AI auto-reply is now ${isEnabled ? 'ON' : 'OFF'} for this WhatsApp chat.`,
      ai_enabled: updatedConversation.ai_enabled 
    });
  } catch (error) {
    console.error("Error toggling WA conversation AI:", error);
    res.status(500).json({ error: "Failed to toggle conversation AI settings" });
  }
};