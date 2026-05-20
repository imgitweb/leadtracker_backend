import axios from "axios";
import WhatsAppAccount from "../../models/WhatsAppAccount.js";
import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";

// ==========================================
// 1. GET CONVERSATIONS
// ==========================================
export const getWaConversations = async (req, res) => {
  try {
    const conversations = await WhatsAppConversation.find({ phone_number_id: req.params.phoneId }).sort({ last_message_time: -1 });
    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

// ==========================================
// 2. GET MESSAGES
// ==========================================
export const getWaMessages = async (req, res) => {
  try {
    const messages = await WhatsAppMessage.find({ conversation_id: req.params.convId }).sort({ createdAt: 1 });
    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// ==========================================
// 3. SEND MESSAGE
// ==========================================
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

// ==========================================
// 4. TOGGLE AI AUTO-REPLY
// ==========================================
export const toggleWaConversationAI = async (req, res) => {
  try {
    const { convId } = req.params; 
    const { isEnabled } = req.body; 

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: "isEnabled must be a boolean value" });
    }

    const updatedConversation = await WhatsAppConversation.findByIdAndUpdate(
      convId,
      { ai_enabled: isEnabled },
      { new: true } 
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

// ==========================================
// 5. CREATE WHATSAPP TEMPLATE (NEW)
// ==========================================
export const createWhatsAppTemplate = async (req, res) => {
  try {
    const { phoneId, templateName, category, language, headerText, bodyText, footerText } = req.body;
    const userId = req.user._id;

    // Database se verify karein ki is phone number ka waba_id kya hai
    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });

    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    const { waba_id, access_token } = account;

    // Meta API ke liye Components array dynamically build karein
    const components = [];

    // Header optional hai
    if (headerText && headerText.trim() !== '') {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText
      });
    }

    // Body required hai
    components.push({
      type: 'BODY',
      text: bodyText
    });

    // Footer optional hai
    if (footerText && footerText.trim() !== '') {
      components.push({
        type: 'FOOTER',
        text: footerText
      });
    }

    const templatePayload = {
      name: templateName,
      language: language,
      category: category,
      components: components
    };

    // Send to Meta Graph API
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${waba_id}/message_templates`,
      templatePayload,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json"
        }
      }
    );

    res.status(200).json({ 
      success: true, 
      message: "Template submitted for review successfully!",
      template_id: response.data.id,
      status: response.data.status // Usually "PENDING"
    });

  } catch (error) {
    console.error("Meta API Template Error:", error.response?.data || error.message);
    const errorMsg = error.response?.data?.error?.error_user_msg 
                  || error.response?.data?.error?.message 
                  || "Failed to create template on Meta.";

    res.status(500).json({ error: errorMsg });
  }
};


