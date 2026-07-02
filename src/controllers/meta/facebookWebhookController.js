import axios from "axios";
import dotenv from 'dotenv';

// Facebook Models
import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";
import FacebookAccount from "../../models/FacebookAccount.js";
import FacebookComment from "../../models/FacebookComment.js"; 

// Instagram Models
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import InstagramAccount from "../../models/InstagramAccount.js";
import Comment from "../../models/InstagramComment.js";
import AutoReplyRule from "../../models/AutoReplyRule.js";

// Common Models
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js";

dotenv.config();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN; 

// ==========================================
// 1. Verify Webhook (GET) 
// ==========================================


export const verifyFbWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFIED SUCCESSFULLY!");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};


// ==========================================
// 2. Handle Incoming Webhook Events (POST)
// ==========================================
export const handleFbWebhook = async (req, res) => {
  
  const body = req.body;
  const io = req.app.get('socketio'); // Get Socket IO instance for alerts
  
  console.log(`[Webhook Hit] Received Object: ${body.object}`);

  // ----------------------------------------------------
  // 🟦 FACEBOOK LOGIC (body.object === "page")
  // ----------------------------------------------------
  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageId = entry.id;

      // 💬 MODULE A: FACEBOOK DIRECT MESSAGES (DMs)
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

          const senderId = webhookEvent.sender.id;
          const text = webhookEvent.message.text;

          console.log(`[FB DM] From: ${senderId} | Text: "${text}"`);

          try {
            let conv = await FacebookConversation.findOne({ page_id: pageId, customer_psid: senderId });
            
            if (!conv) {
              conv = new FacebookConversation({
                page_id: pageId, 
                customer_psid: senderId,
                customer_name: "FB_User_" + senderId.substring(0, 6),
                last_message: text, 
                last_message_time: new Date(webhookEvent.timestamp),
                ai_enabled: true 
              });
            } else {
              conv.last_message = text;
              conv.last_message_time = new Date(webhookEvent.timestamp);
            }
            await conv.save();

            const msg = new FacebookMessage({
              conversation_id: conv._id, sender_id: senderId, receiver_id: pageId, text: text, is_from_me: false 
            });
            await msg.save();

            if (io) io.emit("receive_new_message", { platform: "facebook", conversationId: conv._id, message: msg });

            // 🤖 AI AUTO-REPLY FOR FB DM WITH LEAD CAPTURE
            const account = await FacebookAccount.findOne({ page_id: pageId });
            if (account && account.ai_enabled && conv.ai_enabled !== false) {
              const startupContext = await StartupData.findOne({ userId: account.userId });
              if (startupContext) {
                
                // 🔥 1. Fetch History for Context
                const recentMessages = await FacebookMessage.find({ conversation_id: conv._id, _id: { $ne: msg._id } })
                  .sort({ createdAt: -1 }).limit(5);
                const formattedHistory = recentMessages.reverse().map(m => ({
                  role: m.is_from_me ? "assistant" : "user",
                  content: m.text
                }));

                // 🔥 2. Prepare Customer Data
                const customerInfo = { name: conv.customer_name, accountId: senderId };

                // 🔥 3. Call AI
                const aiResult = await generateAIReply(text, startupContext, "Facebook", "", customerInfo, formattedHistory);
                const aiReplyText = aiResult.text;

                // 🔥 4. Send Lead Alert & Update Conversation Model
                if (aiResult.leadAction) {
                  // Update conversation as lead
                  conv.is_lead = true;
                  conv.lead_summary = aiResult.leadAction.lead.aiSummary;
                  
                  if (io) {
                     io.emit("hot_lead_detected", {
                        action: aiResult.leadAction.type,
                        leadName: aiResult.leadAction.lead.name,
                        platform: "Facebook",
                        conversationId: conv._id,
                        summary: aiResult.leadAction.lead.aiSummary || "FB User is interested!"
                     });
                  }
                }

                try {
                  await axios.post(
                    `https://graph.facebook.com/v25.0/me/messages`,
                    { recipient: { id: senderId }, message: { text: aiReplyText } },
                    { params: { access_token: account.access_token } }
                  );
                  const aiMsg = new FacebookMessage({
                    conversation_id: conv._id, sender_id: pageId, receiver_id: senderId, text: aiReplyText, is_from_me: true 
                  });
                  await aiMsg.save();
                  
                  // Save updated conversation
                  conv.last_message = aiReplyText; 
                  conv.last_message_time = new Date(); 
                  await conv.save();
                  
                  console.log(`[FB AI DM Reply Sent]: ${aiReplyText}`);
                } catch (err) { console.error("FB AI Reply Failed:", err.message); }
              }
            }
          } catch (e) { console.error("Error processing FB DM event:", e); }
        }
      }

      // 📝 MODULE B: FACEBOOK POST COMMENTS
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "feed" && change.value.item === "comment" && change.value.verb === "add") {
            const commentData = change.value;
            if (commentData.from.id === pageId) continue;

            const commentId = commentData.comment_id;
            const commentText = commentData.message;
            const postId = commentData.post_id;

            console.log(`[FB Comment] From: ${commentData.from.id} | Text: "${commentText}"`);

            try {
              const newComment = new FacebookComment({
                fb_page_id: pageId, fb_post_id: postId, comment_id: commentId,
                sender_name: commentData.from.name, sender_id: commentData.from.id, message: commentText, timestamp: new Date()
              });
              await newComment.save();

              // 🤖 AI AUTO-REPLY FOR FB COMMENT
              const account = await FacebookAccount.findOne({ page_id: pageId });
              if (account && account.ai_enabled) {
                const startupContext = await StartupData.findOne({ userId: account.userId });
                if (startupContext) {
                  let postCaption = "No caption";
                  try {
                    const postCtx = await axios.get(`https://graph.facebook.com/v25.0/${postId}`, { params: { fields: "message", access_token: account.access_token }});
                    postCaption = postCtx.data.message || "No caption";
                  } catch (e) {}

                  // 🔥 AI Call for Comment
                  const customerInfo = { name: commentData.from.name, accountId: commentData.from.id };
                  const aiResult = await generateAIReply(commentText, startupContext, "Facebook Comment", postCaption, customerInfo, []);
                  const aiReplyText = aiResult.text;

                  // 🔥 Send Lead Alert if comment shows high intent
                  if (aiResult.leadAction && io) {
                    io.emit("hot_lead_detected", {
                       action: aiResult.leadAction.type,
                       leadName: aiResult.leadAction.lead.name,
                       platform: "Facebook Comment",
                       summary: aiResult.leadAction.lead.aiSummary || "FB Commenter is interested!"
                    });
                  }

                  try {
                    const replyRes = await axios.post(
                      `https://graph.facebook.com/v25.0/${commentId}/comments`, null,
                      { params: { message: aiReplyText, access_token: account.access_token } }
                    );
                    const aiSavedReply = new FacebookComment({
                      fb_page_id: pageId, fb_post_id: postId, comment_id: replyRes.data.id, parent_id: commentId,
                      sender_name: account.page_name || "Page Admin", message: aiReplyText, timestamp: new Date()
                    });
                    await aiSavedReply.save();
                    console.log(`[FB AI Comment Reply Sent]: ${aiReplyText}`);
                  } catch (err) { console.error("FB Comment Reply Failed:", err.message); }
                }
              }
            } catch (error) { console.error("Error processing FB Comment event:", error); }
          }
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  }


  // ----------------------------------------------------
  // 🟪 INSTAGRAM LOGIC (body.object === "instagram")
  // ----------------------------------------------------
  else if (body.object === "instagram") {
    for (const entry of body.entry) {
      const myAccountId = entry.id; 

      // 💬 MODULE A: INSTAGRAM DIRECT MESSAGES (DMs)
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

          const customerId = webhookEvent.sender.id;
          const messageText = webhookEvent.message.text;
          const timestamp = webhookEvent.timestamp;

          console.log(`[IG DM] From: ${customerId} | Text: "${messageText}"`);

          try {
            let conversation = await Conversation.findOne({ instagram_user_id: myAccountId, customer_ig_id: customerId });
            if (!conversation) {
              conversation = new Conversation({
                instagram_user_id: myAccountId, customer_ig_id: customerId, customer_username: "IG_User_" + customerId.substring(0, 6),
                last_message: messageText, last_message_time: new Date(timestamp), ai_enabled: true 
              });
            } else {
              conversation.last_message = messageText; conversation.last_message_time = new Date(timestamp);
            }
            await conversation.save();

            const incomingMessage = new Message({
              conversation_id: conversation._id, sender_id: customerId, receiver_id: myAccountId, text: messageText, is_from_me: false
            });
            await incomingMessage.save();

            if (io) io.emit("receive_new_message", { platform: "instagram", conversationId: conversation._id, message: incomingMessage });

            // 🤖 AI AUTO-REPLY FOR IG DM WITH LEAD CAPTURE
            const account = await InstagramAccount.findOne({ instagram_user_id: myAccountId });
            if (account && account.ai_enabled && conversation.ai_enabled !== false) {
              const startupContext = await StartupData.findOne({ userId: account.userId });
              if (startupContext) {
                
                // 🔥 1. Fetch History (FIXED: Using correct Instagram Models now)
                const recentMessages = await Message.find({ conversation_id: conversation._id, _id: { $ne: incomingMessage._id } })
                  .sort({ createdAt: -1 }).limit(5);
                const formattedHistory = recentMessages.reverse().map(m => ({
                  role: m.is_from_me ? "assistant" : "user",
                  content: m.text
                }));

                // 🔥 2. Prepare Customer Data
                const customerInfo = { name: conversation.customer_username, accountId: customerId };

                // 🔥 3. Call AI
                const aiResult = await generateAIReply(messageText, startupContext, "Instagram DM", "", customerInfo, formattedHistory);
                const aiReplyText = aiResult.text;

                // 🔥 4. Send Alert & Update Conversation Model
                if (aiResult.leadAction) {
                  // Update IG conversation as lead
                  conversation.is_lead = true;
                  conversation.lead_summary = aiResult.leadAction.lead.aiSummary;

                  if (io) {
                     io.emit("hot_lead_detected", {
                        action: aiResult.leadAction.type,
                        leadName: aiResult.leadAction.lead.name,
                        platform: "Instagram",
                        conversationId: conversation._id,
                        summary: aiResult.leadAction.lead.aiSummary || "IG User is interested!"
                     });
                  }
                }

                try {
                  await axios.post(
                    `https://graph.facebook.com/v25.0/me/messages`,
                    { recipient: { id: customerId }, message: { text: aiReplyText } },
                    { params: { access_token: account.access_token } }
                  );
                  const outgoingMessage = new Message({
                    conversation_id: conversation._id, sender_id: myAccountId, receiver_id: customerId, text: aiReplyText, is_from_me: true
                  });
                  await outgoingMessage.save();
                  
                  // Save updated conversation
                  conversation.last_message = aiReplyText; 
                  conversation.last_message_time = new Date(); 
                  await conversation.save();
                  
                  console.log(`[IG AI DM Reply Sent]: ${aiReplyText}`);
                } catch (err) { console.error("IG AI Reply Failed:", err.message); }
              }
            }
          } catch (error) { console.error("Error processing IG DM event:", error); }
        }
      }

      // 📝 MODULE B: INSTAGRAM POST COMMENTS
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "comments") {
            const commentData = change.value;
            if (commentData.from.id === myAccountId) continue;

            const commentId = commentData.id;
            const commentText = commentData.text;
            const mediaId = commentData.media.id; 
            const customerUsername = commentData.from.username;

            console.log(`[IG Comment] By @${customerUsername} on Post ${mediaId}: "${commentText}"`);

            try {
              const newComment = new Comment({
                ig_account_id: myAccountId, ig_media_id: mediaId, comment_id: commentId,
                username: customerUsername, text: commentText, timestamp: new Date()
              });
              await newComment.save();

              // 🤖 AUTO-REPLY LOGIC FOR IG COMMENT
              const account = await InstagramAccount.findOne({ instagram_user_id: myAccountId });
              if (account) {
                const autoRule = await AutoReplyRule.findOne({ platform: 'instagram', account_id: myAccountId, post_id: mediaId });
                let replyTextToSend = null;

                if (autoRule && autoRule.is_enabled) {
                  replyTextToSend = autoRule.reply_text;
                } else if (account.ai_enabled) {
                  const startupContext = await StartupData.findOne({ userId: account.userId });
                  if (startupContext) {
                    let postCaption = "No caption";
                    try {
                      const postCtx = await axios.get(`https://graph.facebook.com/v25.0/${mediaId}`, { params: { fields: "caption", access_token: account.access_token } });
                      postCaption = postCtx.data.caption || "No caption";
                    } catch (e) {}
                    
                    // 🔥 Fetch AI Response (with Lead Capture)
                    const customerInfo = { name: customerUsername, accountId: commentData.from.id };
                    const aiResult = await generateAIReply(commentText, startupContext, "Instagram Comment", postCaption, customerInfo, []);
                    replyTextToSend = aiResult.text;

                    // 🔥 Send Lead Alert
                    if (aiResult.leadAction && io) {
                      io.emit("hot_lead_detected", {
                         action: aiResult.leadAction.type,
                         leadName: aiResult.leadAction.lead.name,
                         platform: "Instagram Comment",
                         summary: aiResult.leadAction.lead.aiSummary || "IG Commenter is interested!"
                      });
                    }
                  }
                }

                if (replyTextToSend) {
                  try {
                    const replyRes = await axios.post(
                      `https://graph.facebook.com/v25.0/${commentId}/replies`, null,
                      { params: { message: replyTextToSend, access_token: account.access_token } }
                    );
                    const aiSavedReply = new Comment({
                      ig_account_id: myAccountId, ig_media_id: mediaId, comment_id: replyRes.data.id, parent_id: commentId, 
                      username: account.ig_username, text: replyTextToSend, timestamp: new Date()
                    });
                    await aiSavedReply.save();
                    console.log(`[IG Comment Reply Sent]: ${replyTextToSend}`);
                  } catch (err) { console.error("IG Comment Reply Failed:", err.message); }
                }
              }
            } catch (error) { console.error("Error processing IG Comment event:", error); }
          }
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  }

  // ----------------------------------------------------
  // ⚠️ UNKNOWN OBJECT
  // ----------------------------------------------------
  else {
    return res.sendStatus(404);
  }
};