import mongoose from "mongoose";

const facebookCommentSchema = new mongoose.Schema(
  {
    fb_page_id: { type: String, required: true, index: true }, // FB Page ID
    fb_post_id: { type: String, required: true, index: true }, // FB Post ID
    comment_id: { type: String, required: true, unique: true }, // Meta Comment ID
    parent_id: { type: String, default: null }, // Agar ye reply hai
    
    // Facebook API thoda alag data deta hai (sender name aur id dono aate hain)
    sender_name: { type: String, required: true }, 
    sender_id: { type: String }, // User ki FB profile ID
    
    text: { type: String },
    timestamp: { type: Date, required: true },
    is_hidden: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const FacebookComment = mongoose.model("FacebookComment", facebookCommentSchema);
export default FacebookComment;