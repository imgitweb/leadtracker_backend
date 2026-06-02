import axios from "axios";
import dotenv from 'dotenv';
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import InstagramAccount from "../../models/InstagramAccount.js";
import Comment from "../../models/InstagramComment.js"; 
import AutoReplyRule from "../../models/AutoReplyRule.js"; // 👈 Naya AutoReplyRule Model Import
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js";

dotenv.config();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

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

// 2. Receive Events via Webhook (POST Request)
export const handleWebhookEvent = async (req, res) => {
  const body = req.body;
  console.log("hit recive-------------------------------------------------------------------------------------------------------------");
  console.log("data is---", req.body)

  if (body.object === "instagram") {
    
    for (const entry of body.entry) {
      const myAccountId = entry.id; 

      // ==========================================
      // 💬 MODULE A: HANDLE DIRECT MESSAGES (DMs)
      // ==========================================
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent.message || !webhookEvent.message.text) continue;
          if (webhookEvent.message.is_echo) continue;

          const customerId = webhookEvent.sender.id;
          const messageText = webhookEvent.message.text;
          const timestamp = webhookEvent.timestamp;

          console.log(`[New IG DM] From: ${customerId} To: ${myAccountId} Text: ${messageText}`);

          try {
            // STEP 1: SAVE DM TO DB
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
                ai_enabled: true 
              });
            } else {
              conversation.last_message = messageText;
              conversation.last_message_time = new Date(timestamp);
            }
            await conversation.save();

            const incomingMessage = new Message({
              conversation_id: conversation._id,
              sender_id: customerId,
              receiver_id: myAccountId,
              text: messageText,
              is_from_me: false
            });
            await incomingMessage.save();

            // 🟢 FIX: Real-time Socket Emit for DMs
            const io = req.app.get('socketio'); 
            if (io) {
              io.emit("receive_new_message", {
                platform: "instagram", 
                conversationId: conversation._id,
                message: incomingMessage // 👈 Yahan text ki jagah pura object bhejna hai
              });
            }

            // STEP 2: AI AUTO-REPLY FOR DM
            const account = await InstagramAccount.findOne({ instagram_user_id: myAccountId });

            if (account && account.ai_enabled && conversation.ai_enabled !== false) {
              const startupContext = await StartupData.findOne({ userId: account.userId });

              if (startupContext) {
                const aiReplyText = await generateAIReply(messageText, startupContext, "Instagram DM");
                
                try {
                  await axios.post(
                    `https://graph.facebook.com/v25.0/me/messages`,
                    { recipient: { id: customerId }, message: { text: aiReplyText } },
                    { params: { access_token: account.access_token } }
                  );

                  const outgoingMessage = new Message({
                    conversation_id: conversation._id,
                    sender_id: myAccountId,
                    receiver_id: customerId,
                    text: aiReplyText,
                    is_from_me: true
                  });
                  await outgoingMessage.save();

                  conversation.last_message = aiReplyText;
                  conversation.last_message_time = new Date();
                  await conversation.save();
                } catch (metaError) {
                  console.error("Meta API Failed to send AI DM reply:", metaError.response?.data || metaError.message);
                }
              }
            }
          } catch (error) {
            console.error("Error processing DM event:", error);
          }
        }
      }

      // ==========================================
      // 📝 MODULE B: HANDLE POST COMMENTS (UPDATED WITH AUTO-REPLY RULE)
      // ==========================================
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "comments") {
            const commentData = change.value;
            
            if (commentData.from.id === myAccountId) continue;

            const commentId = commentData.id;
            const commentText = commentData.text;
            const mediaId = commentData.media.id; 
            const customerUsername = commentData.from.username;

            console.log(`[New IG Comment] By @${customerUsername} on Post ${mediaId}: "${commentText}"`);

            try {
              // STEP 1: SAVE INCOMING COMMENT TO DB
              const newComment = new Comment({
                ig_account_id: myAccountId,
                ig_media_id: mediaId,
                comment_id: commentId,
                username: customerUsername,
                text: commentText,
                timestamp: new Date()
              });
              await newComment.save();

              // STEP 2: CUSTOM AUTO-REPLY OR AI LOGIC
              const account = await InstagramAccount.findOne({ instagram_user_id: myAccountId });

              if (account) {
                // 1. Check if user set a Custom Auto-Reply rule for this specific post
                const autoRule = await AutoReplyRule.findOne({ 
                  platform: 'instagram', 
                  account_id: myAccountId, 
                  post_id: mediaId 
                });

                let replyTextToSend = null;

                if (autoRule && autoRule.is_enabled) {
                  console.log(`[Auto-Reply Rule Found] Overriding AI for Post ${mediaId}`);
                  replyTextToSend = autoRule.reply_text;
                } 
                // 2. Fallback to Global AI if no custom rule exists
                else if (account.ai_enabled) {
                  const startupContext = await StartupData.findOne({ userId: account.userId });
                  
                  if (startupContext) {
                    // Fetch post caption for AI context
                    let postCaption = "No caption";
                    try {
                      const postContextRes = await axios.get(`https://graph.facebook.com/v25.0/${mediaId}`, { 
                        params: { fields: "caption", access_token: account.access_token } 
                      });
                      postCaption = postContextRes.data.caption || "No caption";
                    } catch (e) {
                      console.log("Could not fetch caption for AI context.");
                    }
                    replyTextToSend = await generateAIReply(commentText, startupContext, "Instagram Comment", postCaption);
                  }
                }

                // STEP 3: SEND AND SAVE REPLY IF TEXT GENERATED
                if (replyTextToSend) {
                  try {
                    const replyRes = await axios.post(
                      `https://graph.facebook.com/v25.0/${commentId}/replies`,
                      null,
                      {
                        params: { 
                          message: replyTextToSend,
                          access_token: account.access_token 
                        }
                      }
                    );

                    // Save Admin Reply to DB
                    const aiSavedReply = new Comment({
                      ig_account_id: myAccountId,
                      ig_media_id: mediaId,
                      comment_id: replyRes.data.id, 
                      parent_id: commentId, 
                      username: account.ig_username, 
                      text: replyTextToSend,
                      timestamp: new Date()
                    });
                    await aiSavedReply.save();
                    
                    console.log(`[Comment Reply Sent]: ${replyTextToSend}`);

                  } catch (metaError) {
                    console.error("Meta API Failed to send comment reply:", metaError.response?.data || metaError.message);
                  }
                }
              }
            } catch (error) {
              console.error("Error processing Comment event:", error);
            }
          }
        }
      }

    }

    return res.status(200).send("EVENT_RECEIVED");
  } else {
    return res.sendStatus(404);
  }
};