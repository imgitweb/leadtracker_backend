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

    // Selected AI Voice
    voice: {
      type: String,
      default: "keshavi",
    },

    // AI Configuration
    aiProvider: {
      type: String,
      default: "openai",
    },

    sttProvider: {
      type: String,
      default: "deepgram",
    },

    ttsProvider: {
      type: String,
      default: "elevenlabs",
    },

    telephonyProvider: {
      type: String,
      default: "exotel",
    },

    // Campaign Schedule
    callGapSeconds: {
      type: Number,
      default: 60,
      min: 5,
    },

    startTime: {
      type: Date,
      default: null,
    },

    endTime: {
      type: Date,
      default: null,
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    // Statistics
    totalLeads: {
      type: Number,
      default: 0,
    },

    totalQueued: {
      type: Number,
      default: 0,
    },

    totalCalling: {
      type: Number,
      default: 0,
    },

    totalAnswered: {
      type: Number,
      default: 0,
    },

    totalCompleted: {
      type: Number,
      default: 0,
    },

    totalQualified: {
      type: Number,
      default: 0,
    },

    totalBusy: {
      type: Number,
      default: 0,
    },

    totalNoAnswer: {
      type: Number,
      default: 0,
    },

    totalFailed: {
      type: Number,
      default: 0,
    },

    progress: {
      type: Number,
      default: 0,
    },

    // Campaign Status
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "draft",
    },

    // Notes
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Campaign =
  mongoose.models.Campaign ||
  mongoose.model("Campaign", campaignSchema);

export default Campaign;