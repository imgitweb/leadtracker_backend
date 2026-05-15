import dotenv from 'dotenv';
import axios from "axios";
import InstagramAccount from "../../models/InstagramAccount.js";
dotenv.config();

const CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID;
const CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET;
const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// const CLIENT_ID = "1962418167691714";
// const CLIENT_SECRET = "3b6398df9198a40aa687721e9b8e1181";
// const REDIRECT_URI = "https://wma-constitutional-memo-node.trycloudflare.com/api/insta/callback";
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// 1. Redirect to Instagram (Sends Auth URL to Frontend)
export const redirectToInstagram = (req, res) => {
  try {
    // 🔥 FIX: Mongoose document ID is accessed via _id, not userId
    const userId = req.user._id.toString(); 
    
    console.log("Generating Instagram Auth URL for User ID:", userId);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish",
      state: userId // Send User ID to Meta to track who is logging in
    });

    const url = `https://www.instagram.com/oauth/authorize?${params.toString()}`;
    console.log("url --- ",url)
    
    // Return URL to frontend so it can redirect the window
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
  console.log("call back code - ", code) // Meta returns our userId here

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/integrations?insta_status=error&message=NoCode`);
  }

  // BULLETPROOF CLEANING: Remove Meta's trailing hash
  code = code.split("#_")[0].trim();

  try {
    // Step A: Get Short-Lived Token
    const tokenParams = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code: code,
    });

    const shortTokenResponse = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      tokenParams.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const shortTokenData = shortTokenResponse.data;
    const shortLivedToken = shortTokenData.access_token;
    const igUserId = shortTokenData.user_id;

    const permissionsArray = Array.isArray(shortTokenData.permissions)
      ? shortTokenData.permissions
      : shortTokenData.permissions.split(",");

    // Step B: Exchange for Long-Lived Token
    const longTokenResponse = await axios.get(
      "https://graph.instagram.com/access_token",
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: CLIENT_SECRET,
          access_token: shortLivedToken,
        },
      }
    );

    const longLivedData = longTokenResponse.data;
    const longLivedToken = longLivedData.access_token;

    // Step C: Fetch Instagram Username & Profile Picture
    let igUsername = "";
    let igProfilePic = "";
    try {
      const profileResponse = await axios.get(`https://graph.instagram.com/me`, {
        params: {
          fields: "id,username,profile_picture_url",
          access_token: longLivedToken
        }
      });
      igUsername = profileResponse.data.username;
      igProfilePic = profileResponse.data.profile_picture_url || "";
    } catch (profileError) {
      console.error("Warning: Could not fetch profile data", profileError.response?.data?.error?.message);
    }

    // Step D: Save to MongoDB
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + longLivedData.expires_in);

    await InstagramAccount.findOneAndUpdate(
      { instagram_user_id: igUserId },
      {
        userId: userId || null, 
        ig_username: igUsername,
        ig_profile_picture: igProfilePic,
        access_token: longLivedToken,
        permissions: permissionsArray,
        token_expires_at: expiryDate,
      },
      { new: true, upsert: true }
    );

    // SUCCESS REDIRECT: Send user back to Frontend Integrations page
    res.redirect(`${FRONTEND_URL}/integrations?insta_status=success&username=${igUsername}`);

  } catch (error) {
    console.error("Authentication Error:", error.response?.data || error.message);
    // ERROR REDIRECT
    res.redirect(`${FRONTEND_URL}/integrations?insta_status=error`);
  }
};

// 3. API to Refresh the Long-Lived Token
export const refreshInstagramToken = async (req, res) => {
  const { instagram_user_id } = req.body;

  try {
    const account = await InstagramAccount.findOne({ instagram_user_id });
    if (!account) return res.status(404).json({ error: "Instagram account not found in DB" });

    const refreshResponse = await axios.get(
      "https://graph.instagram.com/refresh_access_token",
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
    // 🔥 FIX: Mongoose document ID is accessed via _id
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