import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// const VERIFY_TOKEN = "qwertyuiop1234567890"

// 1. Meta Webhook Verification (GET Request)
// Jab aap Meta Dashboard mein Webhook URL dalenge, Meta ye check karega
export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED SUCCESSFULLY!");
      return res.status(200).send(challenge); // Meta needs this exact challenge back
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
    
    // Meta sends an array of entries (events can be batched)
    for (const entry of body.entry) {
      const myAccountId = entry.id; // Yeh aapka connected Instagram Account ID hai

      // Iterate over messaging events
      if (entry.messaging) {
        for (const webhookEvent of entry.messaging) {
          
          // Agar message nahi hai (kabhi kabhi delivery reports aati hain), toh skip karein
          if (!webhookEvent.message || !webhookEvent.message.text) continue;
          
          // Agar message aapne khud bheja hai (echo), toh skip karein (Kyunki sendMessage API mein humne isko DB mein save kara liya hai)
          if (webhookEvent.message.is_echo) continue;

          const customerId = webhookEvent.sender.id; // Customer jisne message bheja hai
          const messageText = webhookEvent.message.text;
          const timestamp = webhookEvent.timestamp;

          console.log(`[New IG Message] From: ${customerId} To: ${myAccountId} Text: ${messageText}`);

          try {
            // Step 1: Find if a conversation already exists
            let conversation = await Conversation.findOne({
              instagram_user_id: myAccountId,
              customer_ig_id: customerId
            });

            // Agar pehli baar message aaya hai, toh nayi conversation banayein
            if (!conversation) {
              conversation = new Conversation({
                instagram_user_id: myAccountId,
                customer_ig_id: customerId,
                customer_username: "IG_User_" + customerId.substring(0, 6), // Graph API se real naam laane ke liye token chahiye hota hai, abhi hum ID use kar rahe hain
                last_message: messageText,
                last_message_time: new Date(timestamp)
              });
              await conversation.save();
            } else {
              // Purani conversation ko update karein
              conversation.last_message = messageText;
              conversation.last_message_time = new Date(timestamp);
              await conversation.save();
            }

            // Step 2: Save the actual Message in DB
            const newMessage = new Message({
              conversation_id: conversation._id,
              sender_id: customerId,
              receiver_id: myAccountId,
              text: messageText,
              is_from_me: false // Kyunki customer ne bheja hai
            });
            await newMessage.save();

          } catch (error) {
            console.error("Error saving incoming webhook message to DB:", error);
          }
        }
      }
    }

    // Return a '200 OK' response to all requests
    // (Bohot zaruri hai, warna Meta baar-baar same message bhejta rahega)
    return res.status(200).send("EVENT_RECEIVED");
  } else {
    // Return a '404 Not Found' if event is not from an Instagram subscription
    return res.sendStatus(404);
  }
};