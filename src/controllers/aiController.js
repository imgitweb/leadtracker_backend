import StartupData from "../models/StartupData.js";
import InstagramAccount from "../models/InstagramAccount.js";
import FacebookAccount from "../models/FacebookAccount.js"; // Assuming you have this
import WhatsAppAccount from "../models/WhatsAppAccount.js";




// 1. Get User's Startup Data
export const getStartupData = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const startupData = await StartupData.findOne({ userId });
    res.status(200).json({ success: true, startupData });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch startup data" });
  }
};

// 2. Save or Update Startup Data
export const saveStartupData = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { businessName, description, faq, tone } = req.body;

    let startupData = await StartupData.findOne({ userId });
    
    if (startupData) {
      startupData.businessName = businessName;
      startupData.description = description;
      startupData.faq = faq;
      startupData.tone = tone;
      startupData.updatedAt = Date.now();
    } else {
      startupData = new StartupData({ userId, businessName, description, faq, tone });
    }
    
    await startupData.save();
    res.status(200).json({ success: true, startupData });
  } catch (error) {
    res.status(500).json({ error: "Failed to save startup data" });
  }
};

// 3. Toggle AI for a specific platform account
export const toggleAIStatus = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { accountId, platform, isEnabled } = req.body;

    let updatedAccount;

    // Update 'ai_enabled' flag in the respective platform's table
    if (platform === 'instagram') {
      updatedAccount = await InstagramAccount.findOneAndUpdate(
        { instagram_user_id: accountId, userId },
        { ai_enabled: isEnabled },
        { new: true }
      );
    } else if (platform === 'facebook') {
      updatedAccount = await FacebookAccount.findOneAndUpdate(
        { page_id: accountId, userId },
        { ai_enabled: isEnabled },
        { new: true }
      );
    } else if (platform === 'whatsapp') {
      updatedAccount = await WhatsAppAccount.findOneAndUpdate(
        { phone_number_id: accountId, userId },
        { ai_enabled: isEnabled },
        { new: true }
      );
    }

    if (!updatedAccount) return res.status(404).json({ error: "Account not found" });

    res.status(200).json({ success: true, account: updatedAccount });
  } catch (error) {
    res.status(500).json({ error: "Failed to toggle AI" });
  }
};



export const setupAIAutoReply = async (req, res) => {
  try {
    // Assuming you have auth middleware that sets req.user
    const userId = req.user.id || req.user._id; 
    const { accountId, businessName, description, faq, tone } = req.body;

    if (!accountId || !businessName) {
      return res.status(400).json({ error: "Account ID and Business Name are required." });
    }

    // 1. Find or Create Startup Data for this user
    let startupData = await StartupData.findOne({ userId });
    
    if (!startupData) {
      startupData = new StartupData({
        userId,
        businessName,
        description,
        faq,
        tone
      });
    } else {
      startupData.businessName = businessName;
      startupData.description = description;
      startupData.faq = faq;
      startupData.tone = tone;
    }
    await startupData.save();

    // 2. Enable AI for the selected Instagram Account
    await InstagramAccount.findOneAndUpdate(
      { instagram_user_id: accountId, userId: userId },
      { ai_enabled: true },
      { new: true }
    );

    res.status(200).json({ 
      success: true, 
      message: "AI Auto-reply enabled successfully!",
      startupData 
    });
  } catch (error) {
    console.error("Error setting up AI:", error);
    res.status(500).json({ error: "Failed to set up AI auto-reply." });
  }
};