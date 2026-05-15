import mongoose from 'mongoose';

const systemModuleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    defaultEnabled: {
      type: Boolean,
      default: true,
    },
    group: {
      type: String,
      trim: true,
      default: 'General',
    },
  },
  {
    timestamps: true,
  }
);

const SystemModule = mongoose.model('SystemModule', systemModuleSchema);
export default SystemModule;
