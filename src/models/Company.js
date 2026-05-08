import mongoose from 'mongoose';
import { PLANS } from '../config/plans.js';

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a company name'],
      trim: true,
      unique: true,
      maxlength: [100, 'Company name cannot be more than 100 characters'],
    },
    website: {
      type: String,
      default: null,
    },
    industry: {
      type: String,
      enum: [
        'technology',
        'finance',
        'healthcare',
        'retail',
        'manufacturing',
        'education',
        'real_estate',
        'other',
      ],
      default: 'other',
    },
    description: {
      type: String,
      default: null,
      maxlength: [1000, 'Description cannot be more than 1000 characters'],
    },
    logo: {
      type: String,
      default: null,
    },
    plan: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'enterprise',
    },
    planStartDate: {
      type: Date,
      default: Date.now,
    },
    planEndDate: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
    },
    maxUsers: {
      type: Number,
      default: 5,
    },
    maxLeads: {
      type: Number,
      default: 250,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    settings: {
      apiEnabled: {
        type: Boolean,
        default: true,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Sync limits based on plan
companySchema.pre('save', function () {
  if (this.isModified('plan') || this.isNew) {
    const planLimits = PLANS[this.plan] || PLANS.free;
    this.maxUsers = planLimits.maxUsers;
    this.maxLeads = planLimits.maxLeads;
  }
});

const Company = mongoose.model('Company', companySchema);
export default Company;
