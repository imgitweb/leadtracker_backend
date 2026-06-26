import mongoose from 'mongoose';

const StartupDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  businessName: { type: String, required: true },
  industry: { type: String, default: "" },         
  websiteUrl: { type: String, default: "" },       
  contactEmail: { type: String, default: "" },     
  contactPhone: { type: String, default: "" },     
  description: { type: String }, 
  faq: { type: String },         
  tone: { type: String, default: 'professional' }, 
  customPrompt: { type: String, default: "" }, // 🔥 Naya field add kiya
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('StartupData', StartupDataSchema);