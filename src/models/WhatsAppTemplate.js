import mongoose from "mongoose";

const whatsappTemplateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  phone_number_id: {
    type: String,
    required: true,
  },
  waba_id: {
    type: String,
    required: true,
  },
  meta_template_id: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  components: {
    type: Array, // Store the exact components payload here
    default: [],
  },
  status: {
    type: String, // e.g., PENDING, APPROVED, REJECTED
    default: "PENDING",
  }
}, { timestamps: true });

const WhatsAppTemplate = mongoose.model("WhatsAppTemplate", whatsappTemplateSchema);
export default WhatsAppTemplate;