import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    // The linked Instagram Account ID (Your Page)
    instagram_user_id: { type: String, required: true },
    
    // The external user messaging your page
    customer_ig_id: { type: String, required: true },
    customer_username: { type: String, default: "Instagram User" },
    customer_profile_pic: { type: String, default: "" },
    is_ai_enabled: { type: Boolean, default: true },
    last_message: { type: String, default: "" },
    last_message_time: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", conversationSchema);