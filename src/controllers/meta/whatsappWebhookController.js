import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

export const verifyWaWebhook = (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
};

export const handleWaWebhook = async (req, res) => {
  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === "messages") {
          const value = change.value;
          const phoneId = value.metadata.phone_number_id; // Apka WA Number ID
          
          if (value.messages && value.messages.length > 0) {
            for (const msg of value.messages) {
              // Ignore unsupported message types for now (handling only text)
              if (msg.type !== "text") continue;

              const customerPhone = msg.from;
              const text = msg.text.body;
              
              // Get Customer Name from contact profile
              const customerName = value.contacts?.[0]?.profile?.name || customerPhone;

              try {
                let conv = await WhatsAppConversation.findOne({ phone_number_id: phoneId, customer_phone: customerPhone });
                if (!conv) {
                  conv = new WhatsAppConversation({
                    phone_number_id: phoneId, customer_phone: customerPhone, customer_name: customerName,
                    last_message: text, last_message_time: new Date(msg.timestamp * 1000) // WA sends unix timestamp
                  });
                  await conv.save();
                } else {
                  conv.last_message = text;
                  conv.last_message_time = new Date(msg.timestamp * 1000);
                  await conv.save();
                }

                const newMsg = new WhatsAppMessage({
                  conversation_id: conv._id, sender_id: customerPhone, receiver_id: phoneId, text, is_from_me: false
                });
                await newMsg.save();
              } catch (e) {
                console.error("Error saving WA Webhook:", e);
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