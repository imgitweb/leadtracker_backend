import mongoose from "mongoose";

const metaAdCampaignSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    adAccountId: { type: String, required: true },
    campaignId: { type: String, required: true },
    adSetId: { type: String, required: false },
    creativeId: { type: String, required: false },
    adId: { type: String, required: false },
    campaignName: { type: String, required: false },
    buying_type: { type: String, required: false },
    objective: { type: String, required: false },
    created_time: { type: String, required: false },
    status: { type: String, default: "PAUSED" },
    budget: { type: Number },
    websiteUrl: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model("MetaAdCampaign", metaAdCampaignSchema);
