import dotenv from 'dotenv';
import axios from "axios";
import InstagramAccount from "../../models/InstagramAccount.js"; // Aapka model path

dotenv.config();

// Frontend JS SDK use karne ke baad redirectToInstagram ki zaroorat nahi padti, 
// par agar aapki kisi purani file mein iska import hai, toh app crash hone se bachane ke liye ise blank chhod sakte hain:
export const redirectToInstagram = (req, res) => {
  res.status(400).json({ error: "Deprecated. Use frontend JS SDK instead." });
};


// 🔥 NAYA API: Handle Frontend JS SDK Callback
export const handleInstagramCallback = async (req, res) => {
  try {
    // 1. Safety check for Auth Middleware
    // if (!req.user || !req.user._id) {
    //   return res.status(401).json({ error: "Unauthorized: User not found." });
    // }

    const { accessToken } = req.body; 
    const userId = req.user._id.toString();

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // 2. Graph API Call: Fetch FB Pages and check for connected 'instagram_business_account'
    // Hum ek hi call mein page ka data, token aur usse jude IG account ka data nikal rahe hain.
    const fbRes = await axios.get(`https://graph.facebook.com/v25.0/me/accounts`, {
      params: {
        access_token: accessToken,
        fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url}'
      }
    });

    const pages = fbRes.data.data;

    // 3. Filter pages jinme sach mein Instagram Business Account connected hai
    const pagesWithIg = pages.filter(page => page.instagram_business_account != null);

    if (!pagesWithIg || pagesWithIg.length === 0) {
      return res.status(400).json({ 
        error: "no_ig_account", 
        message: "No connected Instagram Business accounts found. Ensure your Instagram is a Professional account linked to a Facebook Page." 
      });
    }

    const savedAccounts = [];

    // 4. Save Instagram accounts to Database
    for (const page of pagesWithIg) {
      const igData = page.instagram_business_account;
      
      const savedAcc = await InstagramAccount.findOneAndUpdate(
        { instagram_user_id: igData.id, userId: userId }, // specific to this user
        {
          userId: userId,
          ig_username: igData.username,
          ig_profile_picture: igData.profile_picture_url || "",
          
          // 🚨 BAHUT ZAROORI: Meta Graph API mein Instagram ko manage karne ke liye 
          // hamesha connected Facebook Page ka 'access_token' use hota hai!
          access_token: page.access_token, 
          
          connected_page_id: page.id // Reference ke liye rakhna achha hai
        },
        { new: true, upsert: true }
      );
      
      savedAccounts.push(savedAcc);
    }

    // 5. Send JSON success response to React
    res.status(200).json({ 
      success: true, 
      message: "Instagram connected successfully", 
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
// import InstagramAccount from "../../models/InstagramAccount.js";
// dotenv.config();

// const CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
// const CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
// const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// // 🔥 Use the latest Graph API version
// const API_VERSION = "v25.0"; 

// // 1. Redirect to Instagram
// export const redirectToInstagram = (req, res) => {
//   try {
//     const userId = req.user._id.toString(); 
    
//     // 🔥 FIX: Read requested scopes from frontend query params, fallback to defaults if not provided
//     const requestedScopes = req.query.scopes || "instagram_business_basic,instagram_business_manage_messages";
    
//     console.log("Generating Instagram Auth URL for User ID:", userId, "with scopes:", requestedScopes);

//     const params = new URLSearchParams({
//       client_id: CLIENT_ID,
//       redirect_uri: REDIRECT_URI,
//       response_type: "code",
//       scope: requestedScopes, // Injecting dynamic selected scopes here
//       state: userId 
//     });

//     const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
//     console.log("url --- ", url);
    
//     res.json({ authUrl: url });
//   } catch (error) {
//     console.error("Error generating Instagram Auth URL:", error);
//     res.status(500).json({ error: "Failed to generate authentication URL" });
//   }
// };

// // 2. Handle Callback -> Exchange Token -> Save -> Redirect to Frontend
// export const handleInstagramCallback = async (req, res) => {
//   let code = req.query.code;
//   const userId = req.query.state;
//   console.log("Callback code received:", code ? "Yes" : "No");

//   if (!code) {
//     return res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=NoCode`);
//   }

//   // BULLETPROOF CLEANING: Remove Meta's trailing hash
//   code = code.split("#_")[0].trim();

//   let validAccessToken = "";
//   let igUserId = "";
//   let permissionsArray = [];
//   let expiresIn = 3600; // Default to 1 hour

//   // ==========================================
//   // STEP A: Get Initial Token
//   // ==========================================
//   try {
//     const tokenParams = new URLSearchParams({
//       client_id: CLIENT_ID,
//       client_secret: CLIENT_SECRET,
//       grant_type: "authorization_code",
//       redirect_uri: REDIRECT_URI,
//       code: code,
//     });

//     const shortTokenResponse = await axios.post(
//       `https://api.instagram.com/oauth/access_token`,
//       tokenParams.toString(),
//       { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
//     );

//     validAccessToken = shortTokenResponse.data.access_token;
//     igUserId = shortTokenResponse.data.user_id;
//     permissionsArray = Array.isArray(shortTokenResponse.data.permissions)
//       ? shortTokenResponse.data.permissions
//       : shortTokenResponse.data.permissions?.split(",") || [];

//     console.log("✅ Step A Success. Token Prefix:", validAccessToken?.substring(0, 10));
//   } catch (error) {
//     console.error("❌ STEP A FAILED:", error.response?.data || error.message);
//     return res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=TokenExchangeFailed`);
//   }

//   // ==========================================
//   // STEP B: Exchange for Long-Lived Token
//   // ==========================================
//   try {
//     const longTokenResponse = await axios.get(
//       `https://graph.instagram.com/v20.0/access_token`,
//       {
//         params: {
//           grant_type: "ig_exchange_token",
//           client_secret: CLIENT_SECRET,
//           access_token: validAccessToken,
//         },
//       }
//     );

//     validAccessToken = longTokenResponse.data.access_token; 
//     expiresIn = longTokenResponse.data.expires_in || 5184000; 
    
//     console.log("✅ Step B Success. Long-Lived Token Prefix:", validAccessToken?.substring(0, 10));
//   } catch (error) {
//     console.error("❌ STEP B FAILED (Meta rejected exchange):", error.response?.data?.error?.message || error.message);
//     console.log("⚠️ Falling back to Step A token to prevent crash...");
//   }

//   // ==========================================
//   // STEP C: Fetch Instagram Username & Profile
//   // ==========================================
//   let igUsername = "";
//   let igProfilePic = "";
//   try {
//     const profileResponse = await axios.get(`https://graph.instagram.com/v20.0/me`, {
//       params: {
//         fields: "id,username,profile_picture_url",
//         access_token: validAccessToken
//       }
//     });
    
//     igUsername = profileResponse.data.username || "InstagramUser";
//     igProfilePic = profileResponse.data.profile_picture_url || "";
    
//     console.log("✅ Step C Success. Fetched user:", igUsername);
//   } catch (error) {
//     console.error("❌ STEP C FAILED (Could not fetch profile):", error.response?.data?.error?.message || error.message);
//   }

//   // ==========================================
//   // STEP D: Save to MongoDB & Redirect
//   // ==========================================
//   try {
//     const expiryDate = new Date();
//     expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

//     await InstagramAccount.findOneAndUpdate(
//       { instagram_user_id: igUserId },
//       {
//         userId: userId || null, 
//         ig_username: igUsername,
//         ig_profile_picture: igProfilePic,
//         access_token: validAccessToken,
//         permissions: permissionsArray,
//         token_expires_at: expiryDate,
//       },
//       { new: true, upsert: true }
//     );

//     console.log("✅ Step D Success. User saved to DB.");
//     res.redirect(`${FRONTEND_URL}/integrations?insta_status=success&username=${igUsername}`);

//   } catch (error) {
//     console.error("❌ STEP D FAILED (Database error):", error.message);
//     res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=DBError`);
//   }
// };

// 3. API to Refresh the Long-Lived Token
export const refreshInstagramToken = async (req, res) => {
  const { instagram_user_id } = req.body;

  try {
    const account = await InstagramAccount.findOne({ instagram_user_id });
    if (!account) return res.status(404).json({ error: "Instagram account not found in DB" });

    const refreshResponse = await axios.get(
      `https://graph.instagram.com/${API_VERSION}/refresh_access_token`, 
      {
        params: {
          grant_type: "ig_refresh_token",
          access_token: account.access_token,
        },
      }
    );

    const refreshData = refreshResponse.data;
    const newExpiryDate = new Date();
    newExpiryDate.setSeconds(newExpiryDate.getSeconds() + refreshData.expires_in);

    account.access_token = refreshData.access_token;
    account.token_expires_at = newExpiryDate;
    await account.save();

    res.json({ message: "Token refreshed successfully!", expires_at: account.token_expires_at });

  } catch (error) {
    console.error("Refresh Token Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to refresh token", details: error.response?.data });
  }
};

// // 4. Fetch Connection Status for Dashboard/Frontend
// export const getInstagramStatus = async (req, res) => {
//   try {
//     const userId = req.user._id;

//     const accounts = await InstagramAccount.find({ userId: userId });

//     if (!accounts || accounts.length === 0) {
//       return res.status(200).json({ isLinked: false, accounts: [] });
//     }

//     res.status(200).json({
//       isLinked: true,
//       accounts: accounts.map(acc => ({
//         ig_username: acc.ig_username,
//         ig_profile_picture: acc.ig_profile_picture,
//         instagram_user_id: acc.instagram_user_id
//       }))
//     });

//   } catch (error) {
//     res.status(500).json({ error: "Server error" });
//   }
// };