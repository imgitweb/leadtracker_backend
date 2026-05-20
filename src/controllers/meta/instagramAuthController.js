import dotenv from 'dotenv';
import axios from "axios";
import InstagramAccount from "../../models/InstagramAccount.js";
dotenv.config();

const CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// 🔥 Use the latest Graph API version
const API_VERSION = "v20.0"; 

// 1. Redirect to Instagram
export const redirectToInstagram = (req, res) => {
  try {
    const userId = req.user._id.toString(); 
    
    // 🔥 FIX: Read requested scopes from frontend query params, fallback to defaults if not provided
    const requestedScopes = req.query.scopes || "instagram_business_basic,instagram_business_manage_messages";
    
    console.log("Generating Instagram Auth URL for User ID:", userId, "with scopes:", requestedScopes);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: requestedScopes, // Injecting dynamic selected scopes here
      state: userId 
    });

    const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
    console.log("url --- ", url);
    
    res.json({ authUrl: url });
  } catch (error) {
    console.error("Error generating Instagram Auth URL:", error);
    res.status(500).json({ error: "Failed to generate authentication URL" });
  }
};

// 2. Handle Callback -> Exchange Token -> Save -> Redirect to Frontend
export const handleInstagramCallback = async (req, res) => {
  let code = req.query.code;
  const userId = req.query.state;
  console.log("Callback code received:", code ? "Yes" : "No");

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=NoCode`);
  }

  // BULLETPROOF CLEANING: Remove Meta's trailing hash
  code = code.split("#_")[0].trim();

  let validAccessToken = "";
  let igUserId = "";
  let permissionsArray = [];
  let expiresIn = 3600; // Default to 1 hour

  // ==========================================
  // STEP A: Get Initial Token
  // ==========================================
  try {
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code: code,
    });

    const shortTokenResponse = await axios.post(
      `https://api.instagram.com/oauth/access_token`,
      tokenParams.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    validAccessToken = shortTokenResponse.data.access_token;
    igUserId = shortTokenResponse.data.user_id;
    permissionsArray = Array.isArray(shortTokenResponse.data.permissions)
      ? shortTokenResponse.data.permissions
      : shortTokenResponse.data.permissions?.split(",") || [];

    console.log("✅ Step A Success. Token Prefix:", validAccessToken?.substring(0, 10));
  } catch (error) {
    console.error("❌ STEP A FAILED:", error.response?.data || error.message);
    return res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=TokenExchangeFailed`);
  }

  // ==========================================
  // STEP B: Exchange for Long-Lived Token
  // ==========================================
  try {
    const longTokenResponse = await axios.get(
      `https://graph.instagram.com/v20.0/access_token`,
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: CLIENT_SECRET,
          access_token: validAccessToken,
        },
      }
    );

    validAccessToken = longTokenResponse.data.access_token; 
    expiresIn = longTokenResponse.data.expires_in || 5184000; 
    
    console.log("✅ Step B Success. Long-Lived Token Prefix:", validAccessToken?.substring(0, 10));
  } catch (error) {
    console.error("❌ STEP B FAILED (Meta rejected exchange):", error.response?.data?.error?.message || error.message);
    console.log("⚠️ Falling back to Step A token to prevent crash...");
  }

  // ==========================================
  // STEP C: Fetch Instagram Username & Profile
  // ==========================================
  let igUsername = "";
  let igProfilePic = "";
  try {
    const profileResponse = await axios.get(`https://graph.instagram.com/v20.0/me`, {
      params: {
        fields: "id,username,profile_picture_url",
        access_token: validAccessToken
      }
    });
    
    igUsername = profileResponse.data.username || "InstagramUser";
    igProfilePic = profileResponse.data.profile_picture_url || "";
    
    console.log("✅ Step C Success. Fetched user:", igUsername);
  } catch (error) {
    console.error("❌ STEP C FAILED (Could not fetch profile):", error.response?.data?.error?.message || error.message);
  }

  // ==========================================
  // STEP D: Save to MongoDB & Redirect
  // ==========================================
  try {
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

    await InstagramAccount.findOneAndUpdate(
      { instagram_user_id: igUserId },
      {
        userId: userId || null, 
        ig_username: igUsername,
        ig_profile_picture: igProfilePic,
        access_token: validAccessToken,
        permissions: permissionsArray,
        token_expires_at: expiryDate,
      },
      { new: true, upsert: true }
    );

    console.log("✅ Step D Success. User saved to DB.");
    res.redirect(`${FRONTEND_URL}/integrations?insta_status=success&username=${igUsername}`);

  } catch (error) {
    console.error("❌ STEP D FAILED (Database error):", error.message);
    res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=DBError`);
  }
};

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

// 4. Fetch Connection Status for Dashboard/Frontend
export const getInstagramStatus = async (req, res) => {
  try {
    const userId = req.user._id;

    const accounts = await InstagramAccount.find({ userId: userId });

    if (!accounts || accounts.length === 0) {
      return res.status(200).json({ isLinked: false, accounts: [] });
    }

    res.status(200).json({
      isLinked: true,
      accounts: accounts.map(acc => ({
        ig_username: acc.ig_username,
        ig_profile_picture: acc.ig_profile_picture,
        instagram_user_id: acc.instagram_user_id
      }))
    });

  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};