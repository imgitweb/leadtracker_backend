import mongoose from "mongoose";

const waMessageSchema = new mongoose.Schema({
  conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppConversation', required: true },
  message_id: { type: String, unique: true, sparse: true }, // 🔥 Meta ka wamid id
  sender_id: { type: String, required: true },
  receiver_id: { type: String, required: true },
  text: { type: String, required: true },
  is_from_me: { type: Boolean, required: true },
  message_type: { type: String, enum: ['text', 'template', 'image', 'document'], default: 'text' },
  template_name: { type: String },
  status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' } // 🔥 Message status track karne ke liye
}, { timestamps: true });

export default mongoose.model("WhatsAppMessage", waMessageSchema);