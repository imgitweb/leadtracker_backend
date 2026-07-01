import mongoose from "mongoose";

const transcriptSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["assistant", "user", "system"],
      required: true,
    },

    text: {
      type: String,
      required: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const callingLeadSchema = new mongoose.Schema(
  {
    // Campaign
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      default: null,
    },

    // Lead Details
    name: {
      type: String,
      default: "",
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      default: "",
      trim: true,
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

    source: {
      type: String,
      default: "AI Call Agent",
    },

    // Exotel
    exotelCallSid: {
      type: String,
      default: "",
      index: true,
    },

    callDirection: {
      type: String,
      default: "outbound",
    },

    answeredBy: {
      type: String,
      default: "",
    },

    callPrice: {
      type: Number,
      default: 0,
    },

    // Call Status
    callStatus: {
      type: String,
      enum: [
        "pending",
        "queued",
        "processing",
        "calling",
        "answered",
        "completed",
        "failed",
        "busy",
        "no_answer",
        "cancelled",
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

    callStartedAt: {
      type: Date,
      default: null,
    },

    callEndedAt: {
      type: Date,
      default: null,
    },

    lastCallAt: {
      type: Date,
      default: null,
    },

    callDuration: {
      type: Number,
      default: 0,
    },

    // Recording
    recording: {
      url: {
        type: String,
        default: "",
      },

      presignedUrl: {
        type: String,
        default: "",
      },
    },

    // AI
    selectedVoice: {
      type: String,
      default: "",
    },

    prompt: {
      type: String,
      default: "",
    },

    transcript: {
      type: [transcriptSchema],
      default: [],
    },

    aiSummary: {
      type: String,
      default: "",
    },

    sentiment: {
      type: String,
      enum: ["positive", "neutral", "negative"],
      default: "neutral",
    },

    callOutcome: {
      type: String,
      default: "",
    },

    followUpDate: {
      type: Date,
      default: null,
    },

    // CRM Status
    status: {
      type: String,
      enum: [
        "new",
        "interested",
        "qualified",
        "follow-up",
        "closed",
        "lost",
      ],
      default: "new",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent model overwrite
const CallingLead =
  mongoose.models.CallingLead ||
  mongoose.model("CallingLead", callingLeadSchema);

export default CallingLead;