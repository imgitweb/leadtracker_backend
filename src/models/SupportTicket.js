import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
  {
    // Multi-tenant
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },

    // Link to the lead that triggered this ticket (optional – manual tickets won't have it)
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
      index: true,
    },

    subject: {
      type: String,
      required: true,
      index: true,
    },

    description: {
      type: String,
      default: '',
    },

    category: {
      type: String,
      enum: ['General', 'Product Issue', 'Billing', 'Technical', 'Other'],
      default: 'General',
    },

    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
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
      },
    ],

    // Arbitrary extra fields (e.g. source, tags)
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true }
);

// Indexes
supportTicketSchema.index({ companyId: 1, status: 1 });
supportTicketSchema.index({ companyId: 1, createdAt: -1 });
supportTicketSchema.index({ companyId: 1, leadId: 1 });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
export default SupportTicket;
