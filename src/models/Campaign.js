import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    campaignName: {
      type: String,
      required: true,
      trim: true,
    },

    prompt: {
      type: String,
      required: true,
      trim: true,
    },

    voice: {
      type: String,
      default: "monika",
    },

    callGapSeconds: {
      type: Number,
      default: 60,
    },

    startTime: {
      type: Date,
      default: null,
    },

    endTime: {
      type: Date,
      default: null,
    },

    totalLeads: {
      type: Number,
      default: 0,
    },

    totalAnswered: {
      type: Number,
      default: 0,
    },

    totalQualified: {
      type: Number,
      default: 0,
    },

    totalFailed: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "failed",
      ],
      default: "scheduled",
    },
  },
  {
    timestamps: true,
  }
);

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;