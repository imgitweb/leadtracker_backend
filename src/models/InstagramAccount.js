import mongoose from "mongoose";

const instagramAccountSchema = new mongoose.Schema(
  {
    // Aapke main User system ki ID (Link karne ke liye)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
    
    instagram_user_id: { type: String, required: true, unique: true },
    ig_username: { type: String },           // Instagram Username
    ig_profile_picture: { type: String },    // Instagram Profile Picture URL
    ai_enabled: { type: Boolean, default: false },
    access_token: { type: String, required: true }, // Long-lived token
    
    // 🔥 FIX 1: connected_page_id add kiya (Backend ko iski zaroorat hai)
    connected_page_id: { type: String },
    
    permissions: { type: [String] },
    
    // 🔥 FIX 2: required hata diya taki callback code bina error save kar sake
    token_expires_at: { type: Date }, 
  },
  { timestamps: true }
);

export default mongoose.model("InstagramAccount", instagramAccountSchema);