import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "Customer",
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      default: "",
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
    callStatus: {
      type: String,
      enum: [
        "pending",
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
      default: "pending",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastCallTime: {
      type: Date,
      default: null,
    },
    lastCallSid: {
      type: String,
      default: null,
    },
    sentiment: {
      type: String,
      enum: ["Positive", "Negative", "Neutral", null],
      default: null,
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
        null,
      ],
      default: null,
    },
    doNotCall: {
      type: Boolean,
      default: false,
      index: true,
    },
    customData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to avoid duplicate contacts in the same campaign
contactSchema.index({ campaignId: 1, phone: 1 });

const Contact =
  mongoose.models.Contact || mongoose.model("Contact", contactSchema);

export default Contact;
