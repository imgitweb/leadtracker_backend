import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
    },

    callSid: {
      type: String,
      default: null,
    },

    streamSid: {
      type: String,
      default: null,
    },

    name: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      default: "",
    },

    requirement: {
      type: String,
      default: "",
    },

    budget: {
      type: String,
      default: "",
    },

    location: {
      type: String,
      default: "",
    },

    interest: {
      type: String,
      default: "",
    },

    followUpTime: {
      type: String,
      default: "",
    },

    callStatus: {
      type: String,
      enum: [
        "pending",
        "queued",
        "calling",
        "answered",
        "completed",
        "failed",
        "busy",
        "no_answer",
      ],
      default: "pending",
    },

    retryCount: {
      type: Number,
      default: 0,
    },

    maxRetries: {
      type: Number,
      default: 3,
    },

    lastCallAt: {
      type: Date,
      default: null,
    },

    callDuration: {
      type: Number,
      default: 0,
    },

    aiSummary: { 
      type: String,
      default: "",
    },

    recordingUrl: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["new", "qualified", "follow-up", "closed", "lost"],
      default: "new",
    },
 
    source: {
      type: String,
      default: "AI Call Agent",
    },

    transcript: [
      {
        role: String,
        text: String,
        time: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Prevent OverwriteModelError
const CallingLead =
  mongoose.models.CallingLead ||
  mongoose.model("CallingLead", leadSchema);

export default CallingLead;