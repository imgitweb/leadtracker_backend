import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    // 🔐 Multi-tenant (MOST IMPORTANT)
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true
    },

    formId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Form",
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: ["New", "Contacted", "Qualified", "Converted", "Lost"],
      default: "New",
      index: true
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium"
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    // 🧠 Dynamic Lead Data (SUPER IMPORTANT)
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    // 🔍 Extracted Fields (Search Optimization)
    name: {
      type: String,
      index: true
    },

    email: {
      type: String,
      index: true
    },

    phone: {
      type: String,
      index: true
    },

    // 👥 Assignment (Quick Access)
    assignedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    // 🔁 Follow Ups
    followUps: [
      {
        _id: mongoose.Schema.Types.ObjectId,
        date: {
          type: Date,
          default: Date.now
        },
        note: String,
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        nextFollowUpDate: Date
      }
    ],

    remarks: [
      {
        note: String,
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User"
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // 📊 Tracking
    source: {
      type: String,
      default: "Website",
    }
    , 


    tags: [String],

  },
  {
    timestamps: true // createdAt & updatedAt auto
  }
);


// ⚡ INDEXES (VERY IMPORTANT FOR SCALE)

// Fast filtering
leadSchema.index({ companyId: 1, status: 1 });
leadSchema.index({ companyId: 1, formId: 1 });

// Analytics
leadSchema.index({ companyId: 1, createdAt: -1 });



const Lead = mongoose.model('Lead', leadSchema);
export default Lead;
