import StartupData from "../models/StartupData.js";
import InstagramAccount from "../models/InstagramAccount.js";
import FacebookAccount from "../models/FacebookAccount.js"; 
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
// export const saveStartupData = async (req, res) => {
//   try {
//     const userId = req.user._id || req.user.id;
//     // 🔥 Naye fields ko destructured body se nikal liya hai
//     const { businessName, industry, websiteUrl, contactEmail, contactPhone, description, faq, tone } = req.body;

//     let startupData = await StartupData.findOne({ userId });
    
//     if (startupData) {
//       startupData.businessName = businessName;
//       startupData.industry = industry;
//       startupData.websiteUrl = websiteUrl;
//       startupData.contactEmail = contactEmail;
//       startupData.contactPhone = contactPhone;
//       startupData.description = description;
//       startupData.faq = faq;
//       startupData.tone = tone;
//       startupData.updatedAt = Date.now();
//     } else {
//       startupData = new StartupData({ 
//         userId, businessName, industry, websiteUrl, contactEmail, contactPhone, description, faq, tone 
//       });
//     }
    
//     await startupData.save();
//     res.status(200).json({ success: true, startupData });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to save startup data" });
//   }
// };

export const saveStartupData = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    // 🔥 customPrompt ko req.body se nikal liya
    const { businessName, industry, websiteUrl, contactEmail, contactPhone, description, faq, tone, customPrompt } = req.body;

    let startupData = await StartupData.findOne({ userId });
    
    if (startupData) {
      startupData.businessName = businessName;
      startupData.industry = industry;
      startupData.websiteUrl = websiteUrl;
      startupData.contactEmail = contactEmail;
      startupData.contactPhone = contactPhone;
      startupData.description = description;
      startupData.faq = faq;
      startupData.tone = tone;
      startupData.customPrompt = customPrompt; // 🔥 Update kiya
      startupData.updatedAt = Date.now();
    } else {
      startupData = new StartupData({ 
        userId, businessName, industry, websiteUrl, contactEmail, contactPhone, description, faq, tone, customPrompt // 🔥 Add kiya
      });
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

    if (platform === 'instagram') {
      updatedAccount = await InstagramAccount.findOneAndUpdate(
        { instagram_user_id: accountId, userId },
        { ai_enabled: isEnabled },
        { returnDocument: 'after' } // Updated for Mongoose compatibility
      );
    } else if (platform === 'facebook') {
      updatedAccount = await FacebookAccount.findOneAndUpdate(
        { page_id: accountId, userId },
        { ai_enabled: isEnabled },
        { returnDocument: 'after' }
      );
    } else if (platform === 'whatsapp') {
      updatedAccount = await WhatsAppAccount.findOneAndUpdate(
        { phone_number_id: accountId, userId },
        { ai_enabled: isEnabled },
        { returnDocument: 'after' }
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
    const userId = req.user.id || req.user._id; 
    
    // 🔥 customPrompt ko req.body me add kar diya hai
    const { 
      accountId, 
      businessName, 
      industry, 
      websiteUrl, 
      contactEmail, 
      contactPhone, 
      description, 
      faq, 
      tone, 
      customPrompt 
    } = req.body;

    if (!accountId || !businessName) {
      return res.status(400).json({ error: "Account ID and Business Name are required." });
    }

    let startupData = await StartupData.findOne({ userId });
    
    if (!startupData) {
      // Naya record banate waqt customPrompt save hoga
      startupData = new StartupData({
        userId, 
        businessName, 
        industry, 
        websiteUrl, 
        contactEmail, 
        contactPhone, 
        description, 
        faq, 
        tone,
        customPrompt
      });
    } else {
      // Purana record update karte waqt customPrompt update hoga
      startupData.businessName = businessName;
      startupData.industry = industry;
      startupData.websiteUrl = websiteUrl;
      startupData.contactEmail = contactEmail;
      startupData.contactPhone = contactPhone;
      startupData.description = description;
      startupData.faq = faq;
      startupData.tone = tone;
      startupData.customPrompt = customPrompt; 
    }
    
    await startupData.save();

    await InstagramAccount.findOneAndUpdate(
      { instagram_user_id: accountId, userId: userId },
      { ai_enabled: true },
      { returnDocument: 'after' }
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