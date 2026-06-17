// Webhook Controller File
import axios from "axios";
import dotenv from 'dotenv';
import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";
import WhatsAppAccount from "../../models/WhatsAppAccount.js"; 
import WhatsAppCampaignLog from "../../models/WhatsAppCampaignLog.js"; // 🔥 Import Log Model
import StartupData from "../../models/StartupData.js";         
import { generateAIReply } from "../../utils/aiHelper.js";     

dotenv.config();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// 1. Verify Webhook (GET)
export const verifyWaWebhook = (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
};

// 2. Handle Incoming Webhook Events (POST)
export const handleWaWebhook = async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === "messages") {
          const value = change.value;
          const phoneId = value.metadata.phone_number_id; 

          // ===================================================================
          // 🔥 NAYA LOGIC: MESSAGE STATUS TRACKING (Sent, Delivered, Read, Failed)
          // ===================================================================
          if (value.statuses && value.statuses.length > 0) {
            for (const statusObj of value.statuses) {
              const messageId = statusObj.id;      
              const status = statusObj.status;     
              const recipientPhone = statusObj.recipient_id;
              
              // Agar message fail hua hai toh error message nikal lo
              let errorMsg = null;
              if (status === "failed" && statusObj.errors) {
                  errorMsg = statusObj.errors[0]?.message || statusObj.errors[0]?.title;
              }

              try {
                // 1. Update in WhatsAppMessage (For normal chat UI)
                const updatedMessage = await WhatsAppMessage.findOneAndUpdate(
                  { message_id: messageId },
                  { status: status },
                  { new: true } 
                );

                // 2. Update in WhatsAppCampaignLog (For Campaign Reports)
                // Hum check kar rahe hain kis campaign me ye messageId hai aur use update kar rahe hain
                let updateCampaignQuery = { $set: { "delivery_details.$.status": status } };
                if (errorMsg) {
                   updateCampaignQuery.$set["delivery_details.$.error_message"] = errorMsg;
                }

                await WhatsAppCampaignLog.findOneAndUpdate(
                  { "delivery_details.message_id": messageId },
                  updateCampaignQuery
                );

                // 3. Emit via Socket.io for Real-time Frontend Updates
                const io = req.app.get('socketio');
                if (io) {
                    io.emit("message_status_update", {
                        messageId: messageId,
                        status: status,
                        conversationId: updatedMessage ? updatedMessage.conversation_id : null,
                        recipientPhone: recipientPhone,
                        error: errorMsg
                    });
                }

              } catch (err) {
                console.error("Error updating message status in DB:", err);
              }
            }
          }

          // ===================================================================
          // INCOMING MESSAGES LOGIC (Jo user text bhejta hai)
          // ===================================================================
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              if (msg.type !== "text") continue;

              const customerPhone = msg.from; 
              const text = msg.text.body;
              const customerName = value.contacts?.[0]?.profile?.name || customerPhone;
              const metaMessageId = msg.id; 

              try {
                let conv = await WhatsAppConversation.findOne({ phone_number_id: phoneId, customer_phone: customerPhone });
                if (!conv) {
                  conv = new WhatsAppConversation({
                    phone_number_id: phoneId, 
                    customer_phone: customerPhone, 
                    customer_name: customerName,
                    last_message: text, 
                    last_message_time: new Date(msg.timestamp * 1000), 
                    ai_enabled: true 
                  });
                  await conv.save();
                } else {
                  conv.last_message = text;
                  conv.last_message_time = new Date(msg.timestamp * 1000);
                  await conv.save();
                }

                const newMsg = new WhatsAppMessage({
                  conversation_id: conv._id, 
                  message_id: metaMessageId, 
                  sender_id: customerPhone, 
                  receiver_id: phoneId, 
                  text, 
                  is_from_me: false,
                  status: 'read' 
                });
                await newMsg.save();

                const io = req.app.get('socketio'); 
                if (io) {
                    io.emit("receive_new_message", {
                      platform: "whatsapp",
                      conversationId: conv._id, 
                      message: newMsg 
                    });
                }

                // AI AUTO-REPLY LOGIC
                const account = await WhatsAppAccount.findOne({ phone_number_id: phoneId });

                if (account && account.ai_enabled && conv.ai_enabled !== false) {
                  const startupContext = await StartupData.findOne({ userId: account.userId });

                  if (startupContext) {
                    const aiReplyText = await generateAIReply(text, startupContext, "WhatsApp");
                    
                    try {
                      const response = await axios.post(
                        `https://graph.facebook.com/v19.0/${phoneId}/messages`,
                        {
                          messaging_product: "whatsapp",
                          to: customerPhone,
                          type: "text",
                          text: { body: aiReplyText }
                        },
                        { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
                      );

                      const sentMetaMessageId = response.data.messages[0].id;

                      const aiMsg = new WhatsAppMessage({
                        conversation_id: conv._id,
                        message_id: sentMetaMessageId, // Save for webhook tracking
                        sender_id: phoneId,          
                        receiver_id: customerPhone,
                        text: aiReplyText,
                        is_from_me: true,
                        status: 'sent'             
                      });
                      await aiMsg.save();

                      conv.last_message = aiReplyText;
                      conv.last_message_time = new Date();
                      await conv.save();

                    } catch (metaError) {
                      console.error("Meta API Failed to send WA AI reply:", metaError.response?.data || metaError.message);
                    }
                  }
                }
              } catch (e) {
                console.error("Error processing incoming message:", e);
              }
            }
          }
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  }
  return res.sendStatus(404);
};