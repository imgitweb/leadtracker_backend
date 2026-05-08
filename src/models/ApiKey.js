import mongoose from 'mongoose';
import crypto from 'crypto';

const apiKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: [true, 'Please provide a name for the API key'],
      trim: true,
      maxlength: [100, 'API key name cannot be more than 100 characters'],
    },
    description: {
      type: String,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    permissions: {
      type: [String],
      default: ['read'],
      enum: ['read', 'write', 'delete', 'admin'],
    },
    lastUsed: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    ipWhitelist: [String],
  },
  {
    timestamps: true,
  }
);

// Hash API key before saving
apiKeySchema.pre('save', async function () {
  if (!this.isModified('key')) {
    return;
  }
  this.keyHash = crypto.createHash('sha256').update(this.key).digest('hex');
});

// Index for efficient queries
apiKeySchema.index({ user: 1, company: 1 });

const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
