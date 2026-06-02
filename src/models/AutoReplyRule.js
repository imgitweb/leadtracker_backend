import mongoose from "mongoose";

const autoReplyRuleSchema = new mongoose.Schema(
  {
    platform: { 
      type: String, 
      enum: ['instagram', 'facebook'], 
      required: true 
    },
    account_id: { 
      type: String, 
      required: true, 
      index: true 
    }, // IG Account ID ya FB Page ID
    post_id: { 
      type: String, 
      required: true, 
      index: true,
      unique: true // Ek post par ek hi rule hoga
    }, 
    is_enabled: { 
      type: Boolean, 
      default: false 
    },
    reply_text: { 
      type: String, 
      required: true 
    } // Wo custom message jo aap bhejna chahte hain
  },
  { timestamps: true }
);

const AutoReplyRule = mongoose.model("AutoReplyRule", autoReplyRuleSchema);
export default AutoReplyRule;