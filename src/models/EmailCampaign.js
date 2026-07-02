import mongoose from 'mongoose';

const recipientSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, default: '' },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    source: { type: String, trim: true, default: 'manual' },
    customData: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const sendLogSchema = new mongoose.Schema(
  {
    email: { type: String, trim: true, required: true },
    status: { type: String, trim: true, required: true },
    messageId: { type: String, trim: true, default: '' },
    trackingId: { type: String, trim: true, default: '' },
    openedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
    error: { type: String, trim: true, default: '' },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const emailCampaignSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    smtpConfigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailSmtpConfig',
      default: null,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailTemplate',
      default: null,
    },
    templateKey: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, required: true },
    subjectSnapshot: { type: String, required: true },
    htmlSnapshot: { type: String, required: true },
    textSnapshot: { type: String, default: '' },
    audienceSource: { type: String, trim: true, default: 'manual' },
    recipients: { type: [recipientSchema], default: [] },
    ccRecipients: { type: [recipientSchema], default: [] },
    bccRecipients: { type: [recipientSchema], default: [] },
    recipientCount: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    readCount: { type: Number, default: 0 },
    unsubscribeCount: { type: Number, default: 0 },
    attachments: { 
      type: [{
        filename: { type: String, required: true },
        path: { type: String, required: true },
        size: { type: Number, default: 0 },
        mimetype: { type: String, default: '' }
      }],
      default: []
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'partially_sent', 'failed'],
      default: 'draft',
    },
    scheduleAt: { type: Date, default: null },
    lastDispatchedAt: { type: Date, default: null },
    sendLog: { type: [sendLogSchema], default: [] },
    errorMessage: { type: String, trim: true, default: '' },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

const EmailCampaign = mongoose.model('EmailCampaign', emailCampaignSchema);

export default EmailCampaign;