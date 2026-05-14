import mongoose from "mongoose";

const fbConversationSchema = new mongoose.Schema({
  page_id: { type: String, required: true },
  customer_psid: { type: String, required: true }, // Page-Scoped ID
  customer_name: { type: String, default: "Facebook User" },
  customer_profile_pic: { type: String, default: "" },
  last_message: { type: String, default: "" },
  last_message_time: { type: Date, default: Date.now },
  ai_enabled: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model("FacebookConversation", fbConversationSchema);