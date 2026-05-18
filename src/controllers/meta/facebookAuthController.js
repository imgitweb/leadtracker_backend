import axios from "axios";
import dotenv from 'dotenv';
import FacebookAccount from "../../models/FacebookAccount.js";
dotenv.config();



// const CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
// const CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;
// const REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
// const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const CLIENT_ID = "1175088701269032";
const CLIENT_SECRET = "60fef6ba1770f20b048991ba65b94893";
const REDIRECT_URI = "https://mysimon-vector-protective-shadow.trycloudflare.com/api/fb/auth/callback";
const FRONTEND_URL = "http://localhost:5173";


export const redirectToFacebook = (req, res) => {
  const userId = req.user._id.toString();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: userId,
    scope: 'pages_show_list,pages_messaging,pages_read_engagement',
    response_type: 'code'
  });
  res.json({ authUrl: `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}` });
};

export const handleFacebookCallback = async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state;

  console.log("code is - ",code)
  console.log("user id is - ",userId)

  if (!code) return res.redirect(`${FRONTEND_URL}/integrations?fb_status=error`);

  try {
    // 1. Exchange code for User Access Token
    const tokenRes = await axios.get(`https://graph.facebook.com/v25.0/oauth/access_token`, {
      params: { client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, client_secret: CLIENT_SECRET, code }
    });
    const userAccessToken = tokenRes.data.access_token;
    
    console.log("user access tocken - ", tokenRes.data)

    // 2. Fetch all Pages managed by User
    const pagesRes = await axios.get(`https://graph.facebook.com/v25.0/me/accounts`, {
      params: { access_token: userAccessToken }
    });

    const pages = pagesRes.data.data;
    if (pages.length === 0) {
      return res.redirect(`${FRONTEND_URL}/integrations?fb_status=nopages`);
    }

    // 3. Save all pages to Database with their specific Page Access Tokens
    for (const page of pages) {
      // Get page profile pic
      let picUrl = "";
      try {
        const picRes = await axios.get(`https://graph.facebook.com/v25.0/${page.id}/picture?redirect=0&access_token=${page.access_token}`);
        picUrl = picRes.data.data.url;
      } catch (e) {}

      await FacebookAccount.findOneAndUpdate(
        { page_id: page.id },
        {
          userId,
          page_name: page.name,
          page_profile_picture: picUrl,
          access_token: page.access_token
        },
        { new: true, upsert: true }
      );
    }

    res.redirect(`${FRONTEND_URL}/integrations?fb_status=success`);
  } catch (error) {
    console.error("FB Auth Error:", error.response?.data || error.message);
    res.redirect(`${FRONTEND_URL}/integrations?fb_status=error`);
  }
};

export const getFacebookStatus = async (req, res) => {
  try {
    const accounts = await FacebookAccount.find({ userId: req.user._id });
    res.status(200).json({ isLinked: accounts.length > 0, accounts });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

export const unlinkFacebookAccount = async (req, res) => {
  try {
    await FacebookAccount.findOneAndDelete({ userId: req.user._id, page_id: req.params.page_id });
    res.status(200).json({ success: true, message: "Unlinked successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to unlink" });
  }
};