import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      index: true,
    },

    description: {
      type: String,
    },

    status: {
      type: String,
      enum: ['Open', 'Pending', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },

    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      }
    ],

    meta: {
      type: mongoose.Schema.Types.Mixed,
    }
  },
  { timestamps: true }
);

// indexes
supportTicketSchema.index({ companyId: 1, status: 1 });
supportTicketSchema.index({ companyId: 1, createdAt: -1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
export default SupportTicket;
