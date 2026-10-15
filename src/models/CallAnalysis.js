import mongoose from "mongoose";

const callAnalysisSchema = new mongoose.Schema(
  {
    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Call",
      required: true,
      unique: true,
      index: true,
    },
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
    sentiment: {
      type: String,
      enum: ["Positive", "Negative", "Neutral"],
      required: true,
      default: "Neutral",
    },
    responseCategory: {
      type: String,
      enum: [
        "Interested",
        "Not Interested",
        "Callback Requested",
        "Already Using Service",
        "Wrong Number",
        "Do Not Call",
        "Unclear",
      ],
      required: true,
      default: "Unclear",
    },
    summary: {
      type: String,
      default: "",
    },
    mainRequirement: {
      type: String,
      default: null,
    },
    objection: {
      type: String,
      default: null,
    },
    followUpRequired: {
      type: Boolean,
      default: false,
    },
    suggestedNextAction: {
      type: String,
      default: "",
    },
    rawAiResponse: {
      type: String,
      default: null,
    },
    analyzedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

const CallAnalysis =
  mongoose.models.CallAnalysis ||
  mongoose.model("CallAnalysis", callAnalysisSchema);

export default CallAnalysis;
