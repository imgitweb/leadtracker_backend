import axios from "axios";
import dotenv from 'dotenv';
import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";
import FacebookAccount from "../../models/FacebookAccount.js";
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js"; // Aapka AI helper

dotenv.config();

// Same Verify Token logic as Instagram
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN; 
// const VERIFY_TOKEN = "qwertyuiop1234567890"; 

// 1. Verify Webhook (GET)
export const verifyFbWebhook = (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
};

// 2. Handle Incoming Webhook Events (POST)
export const handleFbWebhook = async (req, res) => {
  const body = req.body;
  console.log("FB Webhook receive message hit -- ");

  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageId = entry.id; // Aapke Facebook Page ki ID

      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          
          // Agar message text nahi hai ya aapne khud bheja hai (echo), toh skip karein
          if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

          const senderId = webhookEvent.sender.id; // Customer ki PSID (Page-Scoped ID)
          const text = webhookEvent.message.text;

          try {
            // ==========================================
            // STEP 1: SAVE INCOMING MESSAGE TO DB
            // ==========================================
            let conv = await FacebookConversation.findOne({ page_id: pageId, customer_psid: senderId });
            
            if (!conv) {
              conv = new FacebookConversation({
                page_id: pageId, 
                customer_psid: senderId,
                customer_name: "FB_User_" + senderId.substring(0, 6),
                last_message: text, 
                last_message_time: new Date(webhookEvent.timestamp),
                ai_enabled: true // Default true for new chats
              });
              await conv.save();
            } else {
              conv.last_message = text;
              conv.last_message_time = new Date(webhookEvent.timestamp);
              await conv.save();
            }

            const msg = new FacebookMessage({
              conversation_id: conv._id, 
              sender_id: senderId, 
              receiver_id: pageId, 
              text: text, 
              is_from_me: false // Customer ka message
            });
            await msg.save();

            // ==========================================
            // STEP 2: AI AUTO-REPLY LOGIC
            // ==========================================
            const account = await FacebookAccount.findOne({ page_id: pageId });

            // 🔥 MAIN UPDATE: Checking account.ai_enabled AND conv.ai_enabled
            // conv.ai_enabled !== false ensures backward compatibility with older documents where field might be undefined
            if (account && account.ai_enabled && conv.ai_enabled !== false) {
              console.log("AI is enabled globally AND for this specific chat. Fetching startup data...");
              
              const startupContext = await StartupData.findOne({ userId: account.userId });

              if (startupContext) {
                // 1. Generate AI Reply (Platform as 'Facebook')
                const aiReplyText = await generateAIReply(text, startupContext, "Facebook");
                
                console.log(`[FB AI Reply Generated]: ${aiReplyText}`);

                // 2. Send Reply via Meta Graph API
                try {
                  await axios.post(
                    `https://graph.facebook.com/v19.0/me/messages`,
                    {
                      recipient: { id: senderId },
                      message: { text: aiReplyText }
                    },
                    {
                      params: { access_token: account.access_token } // FB Page Access Token
                    }
                  );

                  // 3. Save Outgoing AI Message to DB
                  const aiMsg = new FacebookMessage({
                    conversation_id: conv._id,
                    sender_id: pageId,        // Sender ab aapka page hai
                    receiver_id: senderId,
                    text: aiReplyText,
                    is_from_me: true         // True kyunki system ne bheja
                  });
                  await aiMsg.save();

                  // 4. Update Conversation with AI's Last Message
                  conv.last_message = aiReplyText;
                  conv.last_message_time = new Date();
                  await conv.save();

                } catch (metaError) {
                  console.error("Meta API Failed to send FB AI reply:", metaError.response?.data || metaError.message);
                }
              } else {
                console.log("Startup data missing for this user. Cannot send FB AI reply.");
              }
            } else {
              // Agar Global AI off hai, ya is user ka specific chat AI off (muted) hai
              console.log(`AI skipped: Either Account AI is OFF or Chat AI is muted for Conv ID: ${conv._id}`);
            }

          } catch (e) {
             console.error("Error saving FB Webhook or executing AI:", e);
          }
        }
      }
    }
    // Meta ko hamesha 200 return karna zaroori hai
    return res.status(200).send("EVENT_RECEIVED");
  }
  return res.sendStatus(404);
};



// import FacebookConversation from "../../models/FacebookConversation.js";
// import FacebookMessage from "../../models/FacebookMessage.js";

// // Same Verify Token logic as Instagram
// // const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN; 
// const VERIFY_TOKEN = "qwertyuiop1234567890"; 


// export const verifyFbWebhook = (req, res) => {
//   if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
//     res.status(200).send(req.query["hub.challenge"]);
//   } else {
//     res.sendStatus(403);
//   }
// };

// export const handleFbWebhook = async (req, res) => {
//   const body = req.body;
//   console.log("fb webhook recive massage hit --  ")
//   if (body.object === "page") {
//     for (const entry of body.entry) {
//       const pageId = entry.id;
//       if (entry.messaging) {
//         for (const webhookEvent of entry.messaging) {
//           if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

//           const senderId = webhookEvent.sender.id;
//           const text = webhookEvent.message.text;

//           try {
//             let conv = await FacebookConversation.findOne({ page_id: pageId, customer_psid: senderId });
//             if (!conv) {
//               conv = new FacebookConversation({
//                 page_id: pageId, customer_psid: senderId,
//                 customer_name: "FB_User_" + senderId.substring(0,6),
//                 last_message: text, last_message_time: new Date(webhookEvent.timestamp)
//               });
//               await conv.save();
//             } else {
//               conv.last_message = text;
//               conv.last_message_time = new Date(webhookEvent.timestamp);
//               await conv.save();
//             }

//             const msg = new FacebookMessage({
//               conversation_id: conv._id, sender_id: senderId, receiver_id: pageId, text, is_from_me: false
//             });
//             await msg.save();
//           } catch (e) {
//              console.error("Error saving FB Webhook:", e);
//           }
//         }
//       }
//     }
//     return res.status(200).send("EVENT_RECEIVED");
//   }
//   return res.sendStatus(404);
// };