import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const companyModuleSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
      index: true,
    },
    modules: {
      type: [moduleSchema],
      default: [],
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    syncedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const CompanyModule = mongoose.model('CompanyModule', companyModuleSchema);
export default CompanyModule;
