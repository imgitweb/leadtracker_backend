import FacebookConversation from "../../models/FacebookConversation.js";
import FacebookMessage from "../../models/FacebookMessage.js";

// Same Verify Token logic as Instagram
// const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN; 
const VERIFY_TOKEN = "qwertyuiop1234567890"; 


export const verifyFbWebhook = (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
};

export const handleFbWebhook = async (req, res) => {
  const body = req.body;
  console.log("fb webhook recive massage hit --  ")
  if (body.object === "page") {
    for (const entry of body.entry) {
      const pageId = entry.id;
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          if (!webhookEvent.message || !webhookEvent.message.text || webhookEvent.message.is_echo) continue;

          const senderId = webhookEvent.sender.id;
          const text = webhookEvent.message.text;

          try {
            let conv = await FacebookConversation.findOne({ page_id: pageId, customer_psid: senderId });
            if (!conv) {
              conv = new FacebookConversation({
                page_id: pageId, customer_psid: senderId,
                customer_name: "FB_User_" + senderId.substring(0,6),
                last_message: text, last_message_time: new Date(webhookEvent.timestamp)
              });
              await conv.save();
            } else {
              conv.last_message = text;
              conv.last_message_time = new Date(webhookEvent.timestamp);
              await conv.save();
            }

            const msg = new FacebookMessage({
              conversation_id: conv._id, sender_id: senderId, receiver_id: pageId, text, is_from_me: false
            });
            await msg.save();
          } catch (e) {
             console.error("Error saving FB Webhook:", e);
          }
        }
      }
    }
    return res.status(200).send("EVENT_RECEIVED");
  }
  return res.sendStatus(404);
};