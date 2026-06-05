import mongoose from "mongoose";

const instagramCommentSchema = new mongoose.Schema(
  {
    ig_account_id: { type: String, required: true, index: true }, // IG Business Account ID
    ig_media_id: { type: String, required: true, index: true }, // IG Post/Reel ID
    comment_id: { type: String, required: true, unique: true }, // Meta Comment ID
    parent_id: { type: String, default: null }, // Agar ye reply hai
    username: { type: String, required: true }, // IG handle kisne comment kiya
    text: { type: String, required: true },
    timestamp: { type: Date, required: true },
    is_hidden: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const InstagramComment = mongoose.model("InstagramComment", instagramCommentSchema);
export default InstagramComment;