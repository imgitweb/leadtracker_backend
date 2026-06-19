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
      index: true
    },

    status: {
      type: String,
      enum: ["New", "Contacted", "Qualified", "Converted", "Support", "Lost"],
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

    // 📱 SMART PHONE FIELD (Automatic Normalization)
    phone: {
      type: String,
      index: true,
      set: function(num) {
        if (!num) return num;
        // Step 1: Remove all spaces, +, -, etc. (Keep only numbers)
        let cleanNum = num.replace(/\D/g, ''); 
        
        // Step 2: Indian Number Logic - Agar 12 digit hai aur 91 se start hai, toh 91 hata do
        if (cleanNum.length === 12 && cleanNum.startsWith('91')) {
          return cleanNum.substring(2); // Returns 10 digit number e.g., 8103306133
        }
        return cleanNum; // Returns as is if not 12 digits
      }
    },

    // 🤖 AI & Platform Specific Data (NEW FIELDS)
    aiSummary: {
      type: String // User kya chahta hai (Intent) yahan aayega
    },

    platformDetails: {
      instagramUsername: { type: String, index: true },
      facebookUsername: { type: String, index: true },
      whatsappRawNumber: { type: String }, // Exact Meta API number (e.g., 918103306133) reply bhejne ke liye
      platformAccountId: { type: String, index: true } // Jis Page ID ya WA Phone ID par message aaya tha
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

    // 📊 Tracking (No enum, default Website)
    source: {
      type: String,
      default: "Website",
    },
    
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
leadSchema.index({ companyId: 1, source: 1 }); // Quick filter by source (helpful for AI leads)

// Analytics
leadSchema.index({ companyId: 1, createdAt: -1 });

const Lead = mongoose.model('Lead', leadSchema);
export default Lead;