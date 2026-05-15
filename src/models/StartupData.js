import mongoose from 'mongoose';

const StartupDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessName: { type: String, required: true },
  description: { type: String }, // What the startup does
  faq: { type: String },         // Q&A data for training
  tone: { type: String, default: 'professional' }, // 'friendly', 'witty', etc.
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('StartupData', StartupDataSchema);