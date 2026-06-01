import mongoose from 'mongoose';

const knowledgeRepositoryItemSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['folder', 'document'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KnowledgeRepositoryItem',
      default: null,
      index: true,
    },
    iconKey: {
      type: String,
      default: null,
    },
    color: {
      type: String,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    fileName: {
      type: String,
      default: null,
    },
    fileUrl: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number,
      default: null,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

knowledgeRepositoryItemSchema.index({ companyId: 1, parentId: 1, type: 1, sortOrder: 1, title: 1 });

const KnowledgeRepositoryItem = mongoose.model('KnowledgeRepositoryItem', knowledgeRepositoryItemSchema);

export default KnowledgeRepositoryItem;