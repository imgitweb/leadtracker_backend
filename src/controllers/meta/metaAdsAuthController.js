import axios from "axios";
import dotenv from "dotenv";
import MetaAdAccount from "../../models/MetaAdAccount.js";

dotenv.config();

const CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;

// ==================================================
// FETCH FROM META & STORE ALL ACCOUNTS IN DATABASE
// ==================================================
export const syncAdAccounts = async (req, res) => {
  try {
    const { accessToken } = req.body;
    const userId = req.user._id;

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // 1. Generate Long-Lived Token
    let longLivedToken = accessToken;
    try {
      const tokenExchangeRes = await axios.get(
        "https://graph.facebook.com/v25.0/oauth/access_token",
        {
          params: {
            grant_type: "fb_exchange_token",
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            fb_exchange_token: accessToken,
          },
        },
      );
      longLivedToken = tokenExchangeRes.data.access_token;
    } catch (tokenErr) {
      console.error(
        "Token Exchange Failed:",
        tokenErr.response?.data || tokenErr.message,
      );
    }

    // 2. Fetch all Ad Accounts from Meta API
    const adAccountsRes = await axios.get(
      "https://graph.facebook.com/v25.0/me/adaccounts",
      {
        params: {
          access_token: longLivedToken,
          fields: "id,name,account_status",
          limit: 100,
        },
      },
    );

    const accountsFromMeta = adAccountsRes.data.data;

    if (!accountsFromMeta || accountsFromMeta.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No Ad Accounts found on Meta.",
        accounts: [],
      });
    }

    // 3. STORE ALL FETCHED ACCOUNTS IN DATABASE (Loop & Upsert)
    const savedAccounts = [];

    for (const acc of accountsFromMeta) {
      const savedAcc = await MetaAdAccount.findOneAndUpdate(
        { userId: userId, adAccountId: acc.id }, // Find by user + ad account id
        {
          userId: userId,
          userAccessToken: longLivedToken,
          adAccountId: acc.id,
          name: acc.name || "Unnamed Account",
          accountStatus: acc.account_status,
          // linkedPageId abhi null rahega, jab tak user UI se page map nahi karta
        },
        { new: true, upsert: true }, // Upsert: Naya hai toh create karo, purana hai toh update karo
      );
      savedAccounts.push(savedAcc);
    }

    // 4. Send Database-saved accounts back to frontend
    return res.status(200).json({
      success: true,
      message: "All Ad Accounts synced and saved to Database successfully!",
      accounts: savedAccounts, // Yeh direct Database ka data hai
    });
  } catch (error) {
    console.error(
      "Sync Ad Accounts Error:",
      error.response?.data || error.message,
    );
    if (error.response?.data?.error) {
      return res
        .status(400)
        .json({ error: `Meta Error: ${error.response.data.error.message}` });
    }
    return res.status(500).json({ error: "Failed to sync Ad Accounts." });
  }
};

// ==================================================
// NEW: GET ALL SAVED AD ACCOUNTS FROM DATABASE
// ==================================================
export const getSavedAdAccounts = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log("$$$", userId);

    const savedAccounts = await MetaAdAccount.find({ userId }).sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      accounts: savedAccounts || [],
    });
  } catch (error) {
    console.error("Get Saved Accounts DB Error:", error.message);
    return res
      .status(500)
      .json({ error: "Failed to fetch saved accounts from database." });
  }
};
