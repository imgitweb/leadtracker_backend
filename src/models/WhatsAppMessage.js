import mongoose from "mongoose";

const waMessageSchema = new mongoose.Schema({
  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', required: true },
  sender_id: { type: String, required: true },
  receiver_id: { type: String, required: true },
  text: { type: String, required: true },
  is_from_me: { type: Boolean, required: true },
}, { timestamps: true });

export default mongoose.model("WhatsAppMessage", waMessageSchema);