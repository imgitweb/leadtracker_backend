import mongoose from "mongoose";

const metaAdSetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    adAccountId: {
      type: String,
      required: true,
    },

    campaignId: {
      type: String,
      required: true,

      ref: "MetaAdCampaign",
    },

    adSetId: {
      type: String,
      required: true,
      unique: true,
    },

    adSetName: {
      type: String,
      required: true,
      trim: true,
    },
    budget_remaining: {
      type: Number,
      required: true,
      trim: true,
    },
    dailyBudget: {
      type: Number,
      required: true,
      trim: true,
    },
    lifetimeBudget: {
      type: Number,
      required: true,
      trim: true,
    },
    startTime: {
      type: String,
      required: false,
      trim: true,
    },
    targeting: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
      default: {},
    },
    endTime: {
      type: String,
      required: false,
      trim: true,
    },
    createdTime: {
      type: String,
      required: false,
      trim: true,
    },
    billingEvent: {
      type: String,
      required: false,
      trim: true,
    },
    optimizationGoal: {
      type: String,
      required: false,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "ACTIVE",
        "PAUSED",
        "ARCHIVED",
        "DELETED",
        "PENDING_REVIEW",
        "DISAPPROVED",
      ],
      default: "PAUSED",
    },

    metaData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("MetaAdSets", metaAdSetSchema);
