import axios from "axios";
import dotenv from 'dotenv';
import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";
import WhatsAppAccount from "../../models/WhatsAppAccount.js"; 
import StartupData from "../../models/StartupData.js";         
import { generateAIReply } from "../../utils/aiHelper.js";     

dotenv.config();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
// const VERIFY_TOKEN = "qwertyuiop1234567890"; // Same as your FB/IG token

// 1. Verify Webhook (GET)
export const verifyWaWebhook = (req, res) => {
  console.log("verify ---")
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
};

// 2. Handle Incoming Webhook Events (POST)
export const handleWaWebhook = async (req, res) => {
  const body = req.body;
   console.log("webhook hit  ---")

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === "messages") {
          const value = change.value;
          const phoneId = value.metadata.phone_number_id; // Aapka WA Number ID
          
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              
              // Ignore unsupported message types for now (handling only text)
              if (msg.type !== "text") continue;

              const customerPhone = msg.from; // Customer ka phone number
              const text = msg.text.body;
              
              // Get Customer Name from contact profile
              const customerName = value.contacts?.[0]?.profile?.name || customerPhone;

              try {
                // ==========================================
                // STEP 1: SAVE INCOMING MESSAGE TO DB
                // ==========================================
                let conv = await WhatsAppConversation.findOne({ phone_number_id: phoneId, customer_phone: customerPhone });
                if (!conv) {
                  conv = new WhatsAppConversation({
                    phone_number_id: phoneId, 
                    customer_phone: customerPhone, 
                    customer_name: customerName,
                    last_message: text, 
                    last_message_time: new Date(msg.timestamp * 1000), // WA sends unix timestamp
                    ai_enabled: true // 🔥 Default true for new WA chats
                  });
                  await conv.save();
                } else {
                  conv.last_message = text;
                  conv.last_message_time = new Date(msg.timestamp * 1000);
                  await conv.save();
                }

                const newMsg = new WhatsAppMessage({
                  conversation_id: conv._id, 
                  sender_id: customerPhone, 
                  receiver_id: phoneId, 
                  text, 
                  is_from_me: false // Customer ka message
                });
                await newMsg.save();


                const io = req.app.get('socketio'); // Main server se socket nikaala
                  io.emit("receive_new_message", {
                    platform: "whatsapp", // FB ke webhook mein isko "facebook" kar dein
                    conversationId: conversation._id,
                    message: text // Jo abhi DB mein save hua hai
                  });

                // ==========================================
                // STEP 2: AI AUTO-REPLY LOGIC
                // ==========================================
                const account = await WhatsAppAccount.findOne({ phone_number_id: phoneId });

                // 🔥 MAIN UPDATE: Checking account.ai_enabled AND conv.ai_enabled
                if (account && account.ai_enabled && conv.ai_enabled !== false) {
                  console.log("AI is enabled globally AND for this specific WA chat. Fetching startup data...");
                  
                  const startupContext = await StartupData.findOne({ userId: account.userId });

                  if (startupContext) {
                    // 1. Generate AI Reply (Platform as 'WhatsApp')
                    const aiReplyText = await generateAIReply(text, startupContext, "WhatsApp");
                    
                    console.log(`[WA AI Reply Generated]: ${aiReplyText}`);

                    // 2. Send Reply via WhatsApp Cloud API
                    try {
                      await axios.post(
                        `https://graph.facebook.com/v19.0/${phoneId}/messages`,
                        {
                          messaging_product: "whatsapp",
                          to: customerPhone,
                          type: "text",
                          text: { body: aiReplyText }
                        },
                        {
                          headers: {
                            Authorization: `Bearer ${account.access_token}`,
                            "Content-Type": "application/json"
                          }
                        }
                      );

                      // 3. Save Outgoing AI Message to DB
                      const aiMsg = new WhatsAppMessage({
                        conversation_id: conv._id,
                        sender_id: phoneId,          // Sender ab aapka WA number hai
                        receiver_id: customerPhone,
                        text: aiReplyText,
                        is_from_me: true             // System ne bheja hai
                      });
                      await aiMsg.save();

                      // 4. Update Conversation with AI's Last Message
                      conv.last_message = aiReplyText;
                      conv.last_message_time = new Date();
                      await conv.save();

                    } catch (metaError) {
                      console.error("Meta API Failed to send WA AI reply:", metaError.response?.data || metaError.message);
                    }
                  } else {
                    console.log("Startup data missing for this user. Cannot send WA AI reply.");
                  }
                } else {
                  // Agar Global AI off hai, ya is user ka specific chat AI off (muted) hai
                  console.log(`AI skipped for WhatsApp: Either Account AI is OFF or Chat AI is muted for Conv ID: ${conv._id}`);
                }

              } catch (e) {
                console.error("Error saving WA Webhook or executing AI:", e);
              }
            }
          }
        }
      }
    }
    // Meta requires a 200 OK response immediately
    return res.status(200).send("EVENT_RECEIVED");
  }
  return res.sendStatus(404);
};

// import WhatsAppConversation from "../../models/WhatsAppConversation.js";
// import WhatsAppMessage from "../../models/WhatsAppMessage.js";

// const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// export const verifyWaWebhook = (req, res) => {
//   if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
//     res.status(200).send(req.query["hub.challenge"]);
//   } else {
//     res.sendStatus(403);
//   }
// };

// export const handleWaWebhook = async (req, res) => {
//   const body = req.body;

//   if (body.object === "whatsapp_business_account") {
//     for (const entry of body.entry) {
//       for (const change of entry.changes) {
//         if (change.field === "messages") {
//           const value = change.value;
//           const phoneId = value.metadata.phone_number_id; // Apka WA Number ID
          
//           if (value.messages && value.messages.length > 0) {
//             for (const msg of value.messages) {
//               // Ignore unsupported message types for now (handling only text)
//               if (msg.type !== "text") continue;

//               const customerPhone = msg.from;
//               const text = msg.text.body;
              
//               // Get Customer Name from contact profile
//               const customerName = value.contacts?.[0]?.profile?.name || customerPhone;

//               try {
//                 let conv = await WhatsAppConversation.findOne({ phone_number_id: phoneId, customer_phone: customerPhone });
//                 if (!conv) {
//                   conv = new WhatsAppConversation({
//                     phone_number_id: phoneId, customer_phone: customerPhone, customer_name: customerName,
//                     last_message: text, last_message_time: new Date(msg.timestamp * 1000) // WA sends unix timestamp
//                   });
//                   await conv.save();
//                 } else {
//                   conv.last_message = text;
//                   conv.last_message_time = new Date(msg.timestamp * 1000);
//                   await conv.save();
//                 }

//                 const newMsg = new WhatsAppMessage({
//                   conversation_id: conv._id, sender_id: customerPhone, receiver_id: phoneId, text, is_from_me: false
//                 });
//                 await newMsg.save();
//               } catch (e) {
//                 console.error("Error saving WA Webhook:", e);
//               }
//             }
//           }
//         }
//       }
//     }
//     return res.status(200).send("EVENT_RECEIVED");
//   }
//   return res.sendStatus(404);
// };