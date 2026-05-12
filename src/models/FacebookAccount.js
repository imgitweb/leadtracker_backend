import mongoose from "mongoose";

const facebookAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  page_id: { type: String, required: true, unique: true },
  page_name: { type: String, required: true },
  page_profile_picture: { type: String },
  access_token: { type: String, required: true }, // PAGE Access Token
}, { timestamps: true });

export default mongoose.model("FacebookAccount", facebookAccountSchema);