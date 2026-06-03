import mongoose from "mongoose";

const metaAdAccountSchema = new mongoose.Schema(
  {
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    userAccessToken: { 
      type: String, 
      required: true 
    }, 
    adAccountId: { 
      type: String, 
      required: true 
    }, // Example: 'act_123456789'
    name: { 
      type: String,
      default: "Unnamed Account" 
    },
    accountStatus: { 
      type: Number,
      default: 1
    },
    linkedPageId: { 
      type: String,
      default: null 
    } // Future mein Ad chalane ke liye jis Facebook Page ka use hoga
  },
  { timestamps: true }
);

// Taaki ek user ka ek ad account do baar save na ho
metaAdAccountSchema.index({ userId: 1, adAccountId: 1 }, { unique: true });

export default mongoose.model("MetaAdAccount", metaAdAccountSchema);