import mongoose from "mongoose";

const waAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  waba_id: { type: String, required: true }, // WhatsApp Business Account ID
  phone_number_id: { type: String, required: true, unique: true }, // Jis number se message jayega
  display_phone_number: { type: String, required: true },
  ai_enabled: { type: Boolean, default: false },
  access_token: { type: String, required: true }, // User ka Long Lived Token
}, { timestamps: true });

export default mongoose.model("WhatsAppAccount", waAccountSchema);