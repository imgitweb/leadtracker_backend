import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Backward compatibility alias
    campaignName: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // AI Agent Instructions / System Prompt
    systemPrompt: {
      type: String,
      required: true,
      trim: true,
    },
    // Backward compatibility alias
    prompt: {
      type: String,
      trim: true,
    },

    // Twilio Verified / Authorized caller ID
    callerId: {
      type: String,
      default: process.env.TWILIO_PHONE_NUMBER || "",
      trim: true,
    },

    // Campaign Status
    status: {
      type: String,
      enum: [
        "draft",
        "queued",
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
      default: "draft",
    },

    // Language & Voice
    language: {
      type: String,
      default: "hi-IN",
    },
    voice: {
      type: String,
      default: "Polly.Aditi",
    },

    // Concurrency & Retry Settings
    maxConcurrentCalls: {
      type: Number,
      default: 2,
      min: 1,
      max: 50,
    },
    retryLimit: {
      type: Number,
      default: 1,
      min: 0,
      max: 5,
    },
    callGapSeconds: {
      type: Number,
      default: 5,
      min: 1,
    },

    // Metrics & Statistics
    totalContacts: {
      type: Number,
      default: 0,
    },
    pendingCalls: {
      type: Number,
      default: 0,
    },
    callsInitiated: {
      type: Number,
      default: 0,
    },
    callsCompleted: {
      type: Number,
      default: 0,
    },
    callsFailed: {
      type: Number,
      default: 0,
    },

    // Sentiment & Classification Aggregates
    positiveCount: {
      type: Number,
      default: 0,
    },
    negativeCount: {
      type: Number,
      default: 0,
    },
    neutralCount: {
      type: Number,
      default: 0,
    },
    interestedCount: {
      type: Number,
      default: 0,
    },

    // Multi-tenancy & ownership
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    // Timestamps
    startTime: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save to sync name <-> campaignName and systemPrompt <-> prompt
campaignSchema.pre("save", function () {
  if (this.name && !this.campaignName) {
    this.campaignName = this.name;
  } else if (this.campaignName && !this.name) {
    this.name = this.campaignName;
  }

  if (this.systemPrompt && !this.prompt) {
    this.prompt = this.systemPrompt;
  } else if (this.prompt && !this.systemPrompt) {
    this.systemPrompt = this.prompt;
  }
});

const Campaign =
  mongoose.models.Campaign || mongoose.model("Campaign", campaignSchema);

export default Campaign;