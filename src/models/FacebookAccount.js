import mongoose from "mongoose";

const facebookAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  // ==========================================
  // Personal Profile Fields (Optional)
  // ==========================================
  id: { type: String }, 
  name: { type: String },
  profile_picture: { type: String },

  // ==========================================
  // Business Page Fields (Optional)
  // ==========================================
  page_id: { type: String }, // Yahan se required: true aur unique: true hata diya hai
  page_name: { type: String }, // Yahan se required: true hata diya hai
  page_profile_picture: { type: String },
  
  // ==========================================
  // Shared Fields
  // ==========================================
  ai_enabled: { type: Boolean, default: false },
  access_token: { type: String, required: true }, // Ye dono mein aayega, isliye required hai

}, { timestamps: true });

export default mongoose.model("FacebookAccount", facebookAccountSchema);