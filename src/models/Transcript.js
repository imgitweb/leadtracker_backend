import mongoose from "mongoose";

const messageItemSchema = new mongoose.Schema(
  {
    speaker: {
      type: String,
      enum: ["AI Agent", "User"],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const transcriptSchema = new mongoose.Schema(
  {
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      unique: true,
      index: true,
    },
    callSid: {
      type: String,
      required: true,
      index: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
      index: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
      index: true,
    },
    messages: [messageItemSchema],
    language: {
      type: String,
      default: "hi-IN",
    },
    isComplete: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Transcript =
  mongoose.models.Transcript || mongoose.model("Transcript", transcriptSchema);

export default Transcript;
