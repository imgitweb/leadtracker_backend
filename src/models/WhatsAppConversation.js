import mongoose from "mongoose";

const waConversationSchema = new mongoose.Schema({
  phone_number_id: { type: String, required: true }, // Apka WA Number ID
  customer_phone: { type: String, required: true }, // Customer ka Number (with country code)
  customer_name: { type: String, default: "WA User" },
  last_message: { type: String, default: "" },
  last_message_time: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model("WhatsAppConversation", waConversationSchema);