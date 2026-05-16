import axios from "axios";
import dotenv from 'dotenv';
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import InstagramAccount from "../../models/InstagramAccount.js";
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js"; // Aapka AI helper


dotenv.config();


const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
// const VERIFY_TOKEN = "qwertyuiop1234567890"

// 1. Meta Webhook Verification (GET Request)
export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED SUCCESSFULLY!");
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
};

// 2. Receive Messages via Webhook (POST Request)
export const handleWebhookEvent = async (req, res) => {
  const body = req.body;

  // Check if the event is from Instagram
  if (body.object === "instagram") {
    
    for (const entry of body.entry) {
      const myAccountId = entry.id; // Yeh aapka connected Instagram Account ID hai

      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          
          // Agar message nahi hai (delivery reports aati hain), toh skip karein
          if (!webhookEvent.message || !webhookEvent.message.text) continue;
          
          // Agar message aapne khud bheja hai (echo), toh skip karein
          if (webhookEvent.message.is_echo) continue;

          const customerId = webhookEvent.sender.id; // Customer jisne message bheja hai
          const messageText = webhookEvent.message.text;
          const timestamp = webhookEvent.timestamp;

          console.log(`[New IG Message] From: ${customerId} To: ${myAccountId} Text: ${messageText}`);

          try {
            // ==========================================
            // STEP 1: SAVE INCOMING MESSAGE TO DB
            // ==========================================
            let conversation = await Conversation.findOne({
              instagram_user_id: myAccountId,
              customer_ig_id: customerId
            });

            if (!conversation) {
              conversation = new Conversation({
                instagram_user_id: myAccountId,
                customer_ig_id: customerId,
                customer_username: "IG_User_" + customerId.substring(0, 6),
                last_message: messageText,
                last_message_time: new Date(timestamp),
                ai_enabled: true // 🔥 Default true for new IG chats
              });
              await conversation.save();
            } else {
              conversation.last_message = messageText;
              conversation.last_message_time = new Date(timestamp);
              await conversation.save();
            }

            const incomingMessage = new Message({
              conversation_id: conversation._id,
              sender_id: customerId,
              receiver_id: myAccountId,
              text: messageText,
              is_from_me: false // Kyunki customer ne bheja hai
            });
            await incomingMessage.save();

            // ==========================================
            // STEP 2: AI AUTO-REPLY LOGIC
            // ==========================================
            const account = await InstagramAccount.findOne({ instagram_user_id: myAccountId });

            // 🔥 MAIN UPDATE: Checking account.ai_enabled AND conversation.ai_enabled
            if (account && account.ai_enabled && conversation.ai_enabled !== false) {
              console.log("AI is enabled globally AND for this specific IG chat. Fetching startup data...");
              
              const startupContext = await StartupData.findOne({ userId: account.userId });

              if (startupContext) {
                // 1. Generate AI Reply
                const aiReplyText = await generateAIReply(messageText, startupContext, "Instagram");
                
                console.log(`[AI Reply Generated]: ${aiReplyText}`);

                // 2. Send Reply via Meta Graph API
                try {
                  await axios.post(
                    `https://graph.facebook.com/v19.0/me/messages`,
                    {
                      recipient: { id: customerId },
                      message: { text: aiReplyText }
                    },
                    {
                      params: { access_token: account.access_token } // User ka page token
                    }
                  );

                  // 3. Save Outgoing AI Message to DB
                  const outgoingMessage = new Message({
                    conversation_id: conversation._id,
                    sender_id: myAccountId, // Ab sender aapka account hai
                    receiver_id: customerId,
                    text: aiReplyText,
                    is_from_me: true
                  });
                  await outgoingMessage.save();

                  // 4. Update Conversation with AI's Last Message
                  conversation.last_message = aiReplyText;
                  conversation.last_message_time = new Date();
                  await conversation.save();

                } catch (metaError) {
                  console.error("Meta API Failed to send AI reply:", metaError.response?.data || metaError.message);
                }
              } else {
                console.log("Startup data missing for this user. Cannot send AI reply.");
              }
            } else {
              // Agar Global AI off hai, ya is user ka specific chat AI off (muted) hai
              console.log(`AI skipped for Instagram: Either Account AI is OFF or Chat AI is muted for Conv ID: ${conversation._id}`);
            }

          } catch (error) {
            console.error("Error processing webhook messaging event:", error);
          }
        }
      }
    }

    // Hamesha 200 OK return karna hai, warna Meta retries karta rahega aur server hang ho sakta hai
    return res.status(200).send("EVENT_RECEIVED");
  } else {
    return res.sendStatus(404);
  }
};








// import Conversation from "../../models/Conversation.js";
// import Message from "../../models/Message.js";

// const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// // const VERIFY_TOKEN = "qwertyuiop1234567890"

// // 1. Meta Webhook Verification (GET Request)
// // Jab aap Meta Dashboard mein Webhook URL dalenge, Meta ye check karega
// export const verifyWebhook = (req, res) => {
//   const mode = req.query["hub.mode"];
//   const token = req.query["hub.verify_token"];
//   const challenge = req.query["hub.challenge"];

//   if (mode && token) {
//     if (mode === "subscribe" && token === VERIFY_TOKEN) {
//       console.log("WEBHOOK VERIFIED SUCCESSFULLY!");
//       return res.status(200).send(challenge); // Meta needs this exact challenge back
//     } else {
//       return res.sendStatus(403);
//     }
//   }
//   return res.sendStatus(400);
// };

// // 2. Receive Messages via Webhook (POST Request)
// export const handleWebhookEvent = async (req, res) => {
//   const body = req.body;

//   // Check if the event is from Instagram
//   if (body.object === "instagram") {
    
//     // Meta sends an array of entries (events can be batched)
//     for (const entry of body.entry) {
//       const myAccountId = entry.id; // Yeh aapka connected Instagram Account ID hai

//       // Iterate over messaging events
//       if (entry.messaging) {
//         for (const webhookEvent of entry.messaging) {
          
//           // Agar message nahi hai (kabhi kabhi delivery reports aati hain), toh skip karein
//           if (!webhookEvent.message || !webhookEvent.message.text) continue;
          
//           // Agar message aapne khud bheja hai (echo), toh skip karein (Kyunki sendMessage API mein humne isko DB mein save kara liya hai)
//           if (webhookEvent.message.is_echo) continue;

//           const customerId = webhookEvent.sender.id; // Customer jisne message bheja hai
//           const messageText = webhookEvent.message.text;
//           const timestamp = webhookEvent.timestamp;

//           console.log(`[New IG Message] From: ${customerId} To: ${myAccountId} Text: ${messageText}`);

//           try {
//             // Step 1: Find if a conversation already exists
//             let conversation = await Conversation.findOne({
//               instagram_user_id: myAccountId,
//               customer_ig_id: customerId
//             });

//             // Agar pehli baar message aaya hai, toh nayi conversation banayein
//             if (!conversation) {
//               conversation = new Conversation({
//                 instagram_user_id: myAccountId,
//                 customer_ig_id: customerId,
//                 customer_username: "IG_User_" + customerId.substring(0, 6), // Graph API se real naam laane ke liye token chahiye hota hai, abhi hum ID use kar rahe hain
//                 last_message: messageText,
//                 last_message_time: new Date(timestamp)
//               });
//               await conversation.save();
//             } else {
//               // Purani conversation ko update karein
//               conversation.last_message = messageText;
//               conversation.last_message_time = new Date(timestamp);
//               await conversation.save();
//             }

//             // Step 2: Save the actual Message in DB
//             const newMessage = new Message({
//               conversation_id: conversation._id,
//               sender_id: customerId,
//               receiver_id: myAccountId,
//               text: messageText,
//               is_from_me: false // Kyunki customer ne bheja hai
//             });
//             await newMessage.save();

//           } catch (error) {
//             console.error("Error saving incoming webhook message to DB:", error);
//           }
//         }
//       }
//     }

//     // Return a '200 OK' response to all requests
//     // (Bohot zaruri hai, warna Meta baar-baar same message bhejta rahega)
//     return res.status(200).send("EVENT_RECEIVED");
//   } else {
//     // Return a '404 Not Found' if event is not from an Instagram subscription
//     return res.sendStatus(404);
//   }
// };