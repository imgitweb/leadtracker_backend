import mongoose from 'mongoose';

const otpTokenSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    emailOtp: {
      type: String,
      required: true,
    },
    phoneOtp: {
      type: String,
      required: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '30m' }, // Auto-clean after 30 minutes
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('OtpToken', otpTokenSchema);
