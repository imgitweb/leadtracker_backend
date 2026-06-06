import mongoose from "mongoose";

const whatsappCampaignLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  phone_number_id: { type: String, required: true },
  template_name: { type: String, required: true },
  total_recipients: { type: Number, default: 0 },
  successful_sends: { type: Number, default: 0 },
  failed_sends: { type: Number, default: 0 },
  // Har user ka detailed report track karne ke liye array
  delivery_details: [{
    phone: String,
    status: { type: String, enum: ["success", "failed"] },
    message_id: String,       // Agar success hua toh Meta message ID
    error_message: String     // Agar fail hua toh error ka karan
  }]
}, { timestamps: true });

export default mongoose.model("WhatsAppCampaignLog", whatsappCampaignLogSchema);