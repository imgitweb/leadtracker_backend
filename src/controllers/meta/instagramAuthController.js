import dotenv from 'dotenv';
import axios from "axios";
import InstagramAccount from "../../models/InstagramAccount.js"; // Aapka model path

dotenv.config();

// ENV variables for token exchange
const CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;

// Frontend JS SDK use karne ke baad redirectToInstagram ki zaroorat nahi padti, 
// par agar aapki kisi purani file mein iska import hai, toh app crash hone se bachane ke liye ise blank chhod sakte hain:
export const redirectToInstagram = (req, res) => {
  res.status(400).json({ error: "Deprecated. Use frontend JS SDK instead." });
};

// 🔥 NAYA API: Handle Frontend JS SDK Callback
export const handleInstagramCallback = async (req, res) => {
  try {
    const { accessToken } = req.body; 
    const userId = req.user._id.toString();

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // ==================================================
    // STEP 1: EXCHANGE FOR LONG-LIVED TOKEN (CRITICAL)
    // ==================================================
    let longLivedToken = accessToken; // Fallback to short token if exchange fails
    try {
      const tokenExchangeRes = await axios.get('https://graph.facebook.com/v25.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          fb_exchange_token: accessToken
        }
      });
      longLivedToken = tokenExchangeRes.data.access_token;
    } catch (tokenErr) {
      console.error("Token Exchange Failed (Using short-lived):", tokenErr.response?.data || tokenErr.message);
    }

    // ==================================================
    // STEP 2: FETCH PAGES & LINKED IG ACCOUNTS
    // ==================================================
    // Long-lived token use karke page fetch karenge, toh Page token PERMANENT milega
    const fbRes = await axios.get(`https://graph.facebook.com/v25.0/me/accounts`, {
      params: {
        access_token: longLivedToken,
        fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}'
      }
    });

    const pages = fbRes.data.data;

    // Filter pages jinme sach mein Instagram Business Account connected hai
    const pagesWithIg = pages.filter(page => page.instagram_business_account != null);

    if (!pagesWithIg || pagesWithIg.length === 0) {
      return res.status(400).json({ 
        error: "no_ig_account", 
        message: "No connected Instagram Business accounts found. Ensure your Instagram is a Professional account linked to a Facebook Page." 
      });
    }

    const savedAccounts = [];

    // ==================================================
    // STEP 3: SAVE TO DB & SUBSCRIBE IG WEBHOOKS
    // ==================================================
    for (const page of pagesWithIg) {
      const igData = page.instagram_business_account;
      const pageAccessToken = page.access_token; // 🚨 Yeh token ab PERMANENT hai
      
      const savedAcc = await InstagramAccount.findOneAndUpdate(
        { instagram_user_id: igData.id, userId: userId }, 
        {
          userId: userId,
          ig_username: igData.username,
          ig_profile_picture: igData.profile_picture_url || "",
          access_token: pageAccessToken, 
          connected_page_id: page.id 
        },
        { new: true, upsert: true }
      );
      
      savedAccounts.push(savedAcc);

      // ==================================================
      // STEP 3.5: AUTO-SUBSCRIBE INSTAGRAM WEBHOOKS
      // ==================================================
      try {
        await axios.post(`https://graph.facebook.com/v25.0/${page.id}/subscribed_apps`, null, {
          params: {
            access_token: pageAccessToken,
            // 🚨 IG DMs aur Comments ke liye yeh specific fields zaroori hain
            subscribed_fields: 'messages,instagram_manage_messages,instagram_manage_comments' 
          }
        });
        console.log(`✅ IG Webhook subscribed for Page: ${page.name} (IG Username: @${igData.username})`);
      } catch (webhookErr) {
        console.error(`❌ IG Webhook Subscription Failed for @${igData.username}:`, webhookErr.response?.data || webhookErr.message);
      }
    }

    // 4. Send JSON success response to React
    res.status(200).json({ 
      success: true, 
      message: "Instagram connected and webhooks subscribed successfully", 
      accounts: savedAccounts 
    });

  } catch (error) {
    console.error("❌ IG Auth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process Instagram connection." });
  }
};


// ==========================================
// Baaki status aur unlink wale routes
// ==========================================

export const getInstagramStatus = async (req, res) => {
  try {
    const accounts = await InstagramAccount.find({ userId: req.user._id });
    res.status(200).json({ isLinked: accounts.length > 0, accounts });
  } catch (error) {
    console.error("Status Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const unlinkInstagramAccount = async (req, res) => {
  try {
    await InstagramAccount.findOneAndDelete({ 
      userId: req.user._id, 
      instagram_user_id: req.params.ig_id 
    });
    res.status(200).json({ success: true, message: "Unlinked successfully" });
  } catch (error) {
    console.error("Unlink Error:", error);
    res.status(500).json({ error: "Failed to unlink" });
  }
};












// import dotenv from 'dotenv';
// import axios from "axios";
// import InstagramAccount from "../../models/InstagramAccount.js"; // Aapka model path

// dotenv.config();

// // Frontend JS SDK use karne ke baad redirectToInstagram ki zaroorat nahi padti, 
// // par agar aapki kisi purani file mein iska import hai, toh app crash hone se bachane ke liye ise blank chhod sakte hain:
// export const redirectToInstagram = (req, res) => {
//   res.status(400).json({ error: "Deprecated. Use frontend JS SDK instead." });
// };


// // 🔥 NAYA API: Handle Frontend JS SDK Callback
// export const handleInstagramCallback = async (req, res) => {
//   try {
//     // 1. Safety check for Auth Middleware
//     // if (!req.user || !req.user._id) {
//     //   return res.status(401).json({ error: "Unauthorized: User not found." });
//     // }

//     const { accessToken } = req.body; 
//     const userId = req.user._id.toString();

//     if (!accessToken) {
//       return res.status(400).json({ error: "Access token is required" });
//     }

//     // 2. Graph API Call: Fetch FB Pages and check for connected 'instagram_business_account'
//     // Hum ek hi call mein page ka data, token aur usse jude IG account ka data nikal rahe hain.
//     const fbRes = await axios.get(`https://graph.facebook.com/v25.0/me/accounts`, {
//       params: {
//         access_token: accessToken,
//         fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}'
//       }
//     });

//     const pages = fbRes.data.data;

//     // 3. Filter pages jinme sach mein Instagram Business Account connected hai
//     const pagesWithIg = pages.filter(page => page.instagram_business_account != null);

//     if (!pagesWithIg || pagesWithIg.length === 0) {
//       return res.status(400).json({ 
//         error: "no_ig_account", 
//         message: "No connected Instagram Business accounts found. Ensure your Instagram is a Professional account linked to a Facebook Page." 
//       });
//     }

//     const savedAccounts = [];

//     // 4. Save Instagram accounts to Database
//     for (const page of pagesWithIg) {
//       const igData = page.instagram_business_account;
      
//       const savedAcc = await InstagramAccount.findOneAndUpdate(
//         { instagram_user_id: igData.id, userId: userId }, // specific to this user
//         {
//           userId: userId,
//           ig_username: igData.username,
//           ig_profile_picture: igData.profile_picture_url || "",
          
//           // 🚨 BAHUT ZAROORI: Meta Graph API mein Instagram ko manage karne ke liye 
//           // hamesha connected Facebook Page ka 'access_token' use hota hai!
//           access_token: page.access_token, 
          
//           connected_page_id: page.id // Reference ke liye rakhna achha hai
//         },
//         { new: true, upsert: true }
//       );
      
//       savedAccounts.push(savedAcc);
//     }

//     // 5. Send JSON success response to React
//     res.status(200).json({ 
//       success: true, 
//       message: "Instagram connected successfully", 
//       accounts: savedAccounts 
//     });

//   } catch (error) {
//     console.error("❌ IG Auth Error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to process Instagram connection." });
//   }
// };


// // ==========================================
// // Baaki status aur unlink wale routes
// // ==========================================

// export const getInstagramStatus = async (req, res) => {
//   try {
//     const accounts = await InstagramAccount.find({ userId: req.user._id });
//     res.status(200).json({ isLinked: accounts.length > 0, accounts });
//   } catch (error) {
//     console.error("Status Error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };


// export const unlinkInstagramAccount = async (req, res) => {
//   try {
//     await InstagramAccount.findOneAndDelete({ 
//       userId: req.user._id, 
//       instagram_user_id: req.params.ig_id 
//     });
//     res.status(200).json({ success: true, message: "Unlinked successfully" });
//   } catch (error) {
//     console.error("Unlink Error:", error);
//     res.status(500).json({ error: "Failed to unlink" });
//   }
// };



