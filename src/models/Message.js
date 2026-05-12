import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender_id: { type: String, required: true }, // ID of whoever sent it (You or the Customer)
    receiver_id: { type: String, required: true },
    text: { type: String, required: true },
    is_from_me: { type: Boolean, required: true }, // True if sent by the linked account
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);