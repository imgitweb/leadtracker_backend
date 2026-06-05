import mongoose from 'mongoose';

const emailSmtpConfigSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    providerName: { type: String, trim: true, default: 'Custom SMTP' },
    host: { type: String, trim: true, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, default: false },
    username: { type: String, trim: true, required: true },
    password: { type: String, trim: true, required: true },
    fromName: { type: String, trim: true, required: true },
    fromEmail: { type: String, trim: true, required: true },
    replyTo: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    lastTestedAt: { type: Date, default: null },
    lastTestStatus: { type: String, trim: true, default: null },
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

const EmailSmtpConfig = mongoose.model('EmailSmtpConfig', emailSmtpConfigSchema);

export default EmailSmtpConfig;