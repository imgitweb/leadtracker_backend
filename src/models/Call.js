import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
    },
    callSid: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fromNumber: {
      type: String,
      required: true,
    },
    toNumber: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "queued",
        "initiated",
        "ringing",
        "in-progress",
        "completed",
        "busy",
        "no-answer",
        "failed",
        "canceled",
      ],
      default: "queued",
      index: true,
    },
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    duration: {
      type: Number,
      default: 0, // in seconds
    },
    recordingUrl: {
      type: String,
      default: null,
    },
    transcriptStatus: {
      type: String,
      enum: ["pending", "in-progress", "completed", "failed"],
      default: "pending",
    },
    analysisStatus: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
    outcome: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Call = mongoose.models.Call || mongoose.model("Call", callSchema);

export default Call;
