import axios from "axios";
import dotenv from 'dotenv';
import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";
import FacebookAccount from "../../models/FacebookAccount.js";
import FacebookComment from "../../models/FacebookComment.js"; 
import StartupData from "../../models/StartupData.js";
import { generateAIReply } from "../../utils/aiHelper.js";

dotenv.config();

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN; 

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

  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageId = entry.id; // Aapke Facebook Page ki ID

      // ==========================================
      // 💬 MODULE A: HANDLE DIRECT MESSAGES (DMs)
      // ==========================================
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

          const senderId = webhookEvent.sender.id;
          const text = webhookEvent.message.text;

          // 🔥 IMMEDIATELY PRINT TO CONSOLE AS REQUESTED
          console.log(`[Webhook Hit - DM] Message received from ID: ${senderId} | Message text: "${text}"`);

          try {
            // STEP 1: SAVE DM TO DB
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
              conversation_id: conv._id, 
              sender_id: senderId, 
              receiver_id: pageId, 
              text: text, 
              is_from_me: false 
            });
            await msg.save();

            const io = req.app.get('socketio'); 
            if (io) {
              io.emit("receive_new_message", {
                platform: "facebook",
                conversationId: conv._id,
                message: msg 
              });
            }

            // ==========================================
            // 🤖 AI AUTO-REPLY ENABLED FOR DMs
            // ==========================================
            const account = await FacebookAccount.findOne({ page_id: pageId });

            if (account && account.ai_enabled && conv.ai_enabled !== false) {
              const startupContext = await StartupData.findOne({ userId: account.userId });

              if (startupContext) {
                const aiReplyText = await generateAIReply(text, startupContext, "Facebook");
                
                try {
                  await axios.post(
                    `https://graph.facebook.com/v19.0/me/messages`,
                    { recipient: { id: senderId }, message: { text: aiReplyText } },
                    { params: { access_token: account.access_token } }
                  );

                  const aiMsg = new FacebookMessage({
                    conversation_id: conv._id,
                    sender_id: pageId,
                    receiver_id: senderId,
                    text: aiReplyText,
                    is_from_me: true 
                  });
                  await aiMsg.save();

                  conv.last_message = aiReplyText;
                  conv.last_message_time = new Date();
                  await conv.save();
                  
                  console.log(`[FB AI DM Reply Sent]: ${aiReplyText}`);

                } catch (metaError) {
                  console.error("Meta API Failed to send FB AI reply:", metaError.response?.data || metaError.message);
                }
              }
            }

          } catch (e) {
             console.error("Error processing FB DM event:", e);
          }
        }
      }

      // ==========================================
      // 📝 MODULE B: HANDLE POST COMMENTS
      // ==========================================
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "feed" && change.value.item === "comment" && change.value.verb === "add") {
            const commentData = change.value;
            
            // Ignore self-replies from the Page itself
            if (commentData.from.id === pageId) continue;

            const commentId = commentData.comment_id;
            const commentText = commentData.message;
            const postId = commentData.post_id;
            const senderId = commentData.from.id;
            const senderName = commentData.from.name;

            // 🔥 IMMEDIATELY PRINT TO CONSOLE AS REQUESTED
            console.log(`[Webhook Hit - Comment] Message received from ID: ${senderId} (Name: ${senderName}) | Message text: "${commentText}"`);

            try {
              // STEP 1: SAVE INCOMING COMMENT TO DB
              const newComment = new FacebookComment({
                fb_page_id: pageId,
                fb_post_id: postId,
                comment_id: commentId,
                sender_name: senderName,
                sender_id: senderId,
                message: commentText,
                timestamp: new Date()
              });
              await newComment.save();

              // ==========================================
              // 🤖 AI AUTO-REPLY ENABLED FOR COMMENTS
              // ==========================================
              const account = await FacebookAccount.findOne({ page_id: pageId });

              if (account && account.ai_enabled) {
                const startupContext = await StartupData.findOne({ userId: account.userId });

                if (startupContext) {
                  let postCaption = "No caption";
                  try {
                    const postContextRes = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
                      params: {
                        fields: "message", 
                        access_token: account.access_token
                      }
                    });
                    postCaption = postContextRes.data.message || "No caption";
                  } catch (contextError) {
                    console.error("Could not fetch FB post context:", contextError.message);
                  }

                  const aiReplyText = await generateAIReply(
                    commentText, 
                    startupContext, 
                    "Facebook Comment", 
                    postCaption
                  );
                  
                  try {
                    const replyRes = await axios.post(
                      `https://graph.facebook.com/v19.0/${commentId}/comments`,
                      null,
                      {
                        params: { 
                          message: aiReplyText,
                          access_token: account.access_token 
                        }
                      }
                    );

                    const aiSavedReply = new FacebookComment({
                      fb_page_id: pageId,
                      fb_post_id: postId,
                      comment_id: replyRes.data.id,
                      parent_id: commentId,
                      sender_name: account.page_name || "Page Admin",
                      message: aiReplyText,
                      timestamp: new Date()
                    });
                    await aiSavedReply.save();
                    
                    console.log(`[FB AI Comment Reply Sent]: ${aiReplyText}`);

                  } catch (metaError) {
                    console.error("Meta API Failed to send FB comment reply:", metaError.response?.data || metaError.message);
                  }
                }
              }

            } catch (error) {
              console.error("Error processing FB Comment event:", error);
            }
          }
        }
      }
    }
    // Meta ko hamesha 200 return karna zaroori hai
    return res.status(200).send("EVENT_RECEIVED");
  }
  return res.sendStatus(404);
};

















// import axios from "axios";
// import dotenv from 'dotenv';
// import FacebookConversation from "../../models/FacebookConversation.js";
// import FacebookMessage from "../../models/FacebookMessage.js";
// import FacebookAccount from "../../models/FacebookAccount.js";
// import FacebookComment from "../../models/FacebookComment.js"; 
// import StartupData from "../../models/StartupData.js";
// import { generateAIReply } from "../../utils/aiHelper.js";

// dotenv.config();

// const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN; 

// // 1. Verify Webhook (GET)
// export const verifyFbWebhook = (req, res) => {
//   if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
//     res.status(200).send(req.query["hub.challenge"]);
//   } else {
//     res.sendStatus(403);
//   }
// };

// // 2. Handle Incoming Webhook Events (POST)
// export const handleFbWebhook = async (req, res) => {
//   const body = req.body;

//   if (body.object === "page") {
//     for (const entry of body.entry) {
//       const pageId = entry.id; // Aapke Facebook Page ki ID

//       // ==========================================
//       // 💬 MODULE A: HANDLE DIRECT MESSAGES (DMs)
//       // ==========================================
//       if (entry.messaging) {
//         for (const webhookEvent of entry.messaging) {
//           if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

//           const senderId = webhookEvent.sender.id;
//           const text = webhookEvent.message.text;

//           // 🔥 IMMEDIATELY PRINT TO CONSOLE AS REQUESTED
//           console.log(`[Webhook Hit - DM] Message received from ID: ${senderId} | Message text: "${text}"`);

//           try {
//             // STEP 1: SAVE DM TO DB
//             let conv = await FacebookConversation.findOne({ page_id: pageId, customer_psid: senderId });
            
//             if (!conv) {
//               conv = new FacebookConversation({
//                 page_id: pageId, 
//                 customer_psid: senderId,
//                 customer_name: "FB_User_" + senderId.substring(0, 6),
//                 last_message: text, 
//                 last_message_time: new Date(webhookEvent.timestamp),
//                 ai_enabled: true 
//               });
//             } else {
//               conv.last_message = text;
//               conv.last_message_time = new Date(webhookEvent.timestamp);
//             }
//             await conv.save();

//             const msg = new FacebookMessage({
//               conversation_id: conv._id, 
//               sender_id: senderId, 
//               receiver_id: pageId, 
//               text: text, 
//               is_from_me: false 
//             });
//             await msg.save();

//             const io = req.app.get('socketio'); 
//             if (io) {
//               io.emit("receive_new_message", {
//                 platform: "facebook",
//                 conversationId: conv._id,
//                 message: msg 
//               });
//             }

//             // ==========================================
//             // 🛑 AI AUTO-REPLY TEMPORARILY DISABLED
//             // ==========================================
//             /* const account = await FacebookAccount.findOne({ page_id: pageId });

//             if (account && account.ai_enabled && conv.ai_enabled !== false) {
//               const startupContext = await StartupData.findOne({ userId: account.userId });

//               if (startupContext) {
//                 const aiReplyText = await generateAIReply(text, startupContext, "Facebook");
                
//                 try {
//                   await axios.post(
//                     `https://graph.facebook.com/v19.0/me/messages`,
//                     { recipient: { id: senderId }, message: { text: aiReplyText } },
//                     { params: { access_token: account.access_token } }
//                   );

//                   const aiMsg = new FacebookMessage({
//                     conversation_id: conv._id,
//                     sender_id: pageId,
//                     receiver_id: senderId,
//                     text: aiReplyText,
//                     is_from_me: true 
//                   });
//                   await aiMsg.save();

//                   conv.last_message = aiReplyText;
//                   conv.last_message_time = new Date();
//                   await conv.save();

//                 } catch (metaError) {
//                   console.error("Meta API Failed to send FB AI reply:", metaError.response?.data || metaError.message);
//                 }
//               }
//             }
//             */

//           } catch (e) {
//              console.error("Error processing FB DM event:", e);
//           }
//         }
//       }

//       // ==========================================
//       // 📝 MODULE B: HANDLE POST COMMENTS
//       // ==========================================
//       if (entry.changes) {
//         for (const change of entry.changes) {
//           if (change.field === "feed" && change.value.item === "comment" && change.value.verb === "add") {
//             const commentData = change.value;
            
//             // Ignore self-replies from the Page itself
//             if (commentData.from.id === pageId) continue;

//             const commentId = commentData.comment_id;
//             const commentText = commentData.message;
//             const postId = commentData.post_id;
//             const senderId = commentData.from.id;
//             const senderName = commentData.from.name;

//             // 🔥 IMMEDIATELY PRINT TO CONSOLE AS REQUESTED
//             console.log(`[Webhook Hit - Comment] Message received from ID: ${senderId} (Name: ${senderName}) | Message text: "${commentText}"`);

//             try {
//               // STEP 1: SAVE INCOMING COMMENT TO DB
//               const newComment = new FacebookComment({
//                 fb_page_id: pageId,
//                 fb_post_id: postId,
//                 comment_id: commentId,
//                 sender_name: senderName,
//                 sender_id: senderId,
//                 message: commentText,
//                 timestamp: new Date()
//               });
//               await newComment.save();

//               // ==========================================
//               // 🛑 AI AUTO-REPLY TEMPORARILY DISABLED
//               // ==========================================
//               /*
//               const account = await FacebookAccount.findOne({ page_id: pageId });

//               if (account && account.ai_enabled) {
//                 const startupContext = await StartupData.findOne({ userId: account.userId });

//                 if (startupContext) {
//                   let postCaption = "No caption";
//                   try {
//                     const postContextRes = await axios.get(`https://graph.facebook.com/v19.0/${postId}`, {
//                       params: {
//                         fields: "message", 
//                         access_token: account.access_token
//                       }
//                     });
//                     postCaption = postContextRes.data.message || "No caption";
//                   } catch (contextError) {
//                     console.error("Could not fetch FB post context:", contextError.message);
//                   }

//                   const aiReplyText = await generateAIReply(
//                     commentText, 
//                     startupContext, 
//                     "Facebook Comment", 
//                     postCaption
//                   );
                  
//                   try {
//                     const replyRes = await axios.post(
//                       `https://graph.facebook.com/v19.0/${commentId}/comments`,
//                       null,
//                       {
//                         params: { 
//                           message: aiReplyText,
//                           access_token: account.access_token 
//                         }
//                       }
//                     );

//                     const aiSavedReply = new FacebookComment({
//                       fb_page_id: pageId,
//                       fb_post_id: postId,
//                       comment_id: replyRes.data.id,
//                       parent_id: commentId,
//                       sender_name: account.page_name || "Page Admin",
//                       message: aiReplyText,
//                       timestamp: new Date()
//                     });
//                     await aiSavedReply.save();
                    
//                     console.log(`[FB AI Comment Reply Sent]: ${aiReplyText}`);

//                   } catch (metaError) {
//                     console.error("Meta API Failed to send FB comment reply:", metaError.response?.data || metaError.message);
//                   }
//                 }
//               }
//               */

//             } catch (error) {
//               console.error("Error processing FB Comment event:", error);
//             }
//           }
//         }
//       }
//     }
//     // Meta ko hamesha 200 return karna zaroori hai
//     return res.status(200).send("EVENT_RECEIVED");
//   }
//   return res.sendStatus(404);
// };