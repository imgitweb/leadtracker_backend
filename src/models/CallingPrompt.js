import mongoose from "mongoose";

const callingPromptSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    systemPrompt: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "Sales & Outreach",
      trim: true,
    },
    language: {
      type: String,
      default: "hi-IN",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default mongoose.model("CallingPrompt", callingPromptSchema);

