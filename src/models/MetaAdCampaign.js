import mongoose from "mongoose";

const metaAdCampaignSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    adAccountId: { type: String, required: true }, // e.g., act_123456789
    campaignId: { type: String, required: true },
    adSetId: { type: String, required: true },
    creativeId: { type: String, required: true },
    adId: { type: String, required: true },
    campaignName: { type: String, required: true },
    status: { type: String, default: 'PAUSED' },
    budget: { type: Number },
    websiteUrl: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model("MetaAdCampaign", metaAdCampaignSchema);