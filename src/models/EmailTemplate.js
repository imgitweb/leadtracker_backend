import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: { type: String, trim: true, required: true },
    subject: { type: String, trim: true, required: true },
    htmlBody: { type: String, required: true },
    textBody: { type: String, default: '' },
    description: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: ['general', 'welcome', 'followup', 'announcement', 'promotional', 'notification'],
      default: 'general',
    },
    variables: { type: [String], default: [] },
    isBuiltin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

emailTemplateSchema.index({ companyId: 1, name: 1 }, { unique: true });

const EmailTemplate = mongoose.model('EmailTemplate', emailTemplateSchema);

export default EmailTemplate;