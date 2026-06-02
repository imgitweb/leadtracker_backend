import axios from "axios";
import dotenv from 'dotenv';
import FacebookAccount from "../../models/FacebookAccount.js";
dotenv.config();

const CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
const CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;

export const handleFacebookCallback = async (req, res) => {
  try {
    const { accessToken } = req.body; 
    const userId = req.user._id.toString(); 

    if (!accessToken) {
      return res.status(400).json({ error: "Access token is required" });
    }

    // ==================================================
    // STEP 1: EXCHANGE FOR LONG-LIVED TOKEN
    // ==================================================
    let longLivedToken = accessToken; 
    try {
      const tokenExchangeRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
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

    const savedAccounts = [];

    // ==================================================
    // STEP 2: FETCH & SAVE *ONLY* BUSINESS PAGES
    // ==================================================
    try {
      const fbRes = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
        params: {
          access_token: longLivedToken, 
          fields: 'id,name,access_token,picture{url}' 
        }
      });

      const pages = fbRes.data.data;

      if (!pages || pages.length === 0) {
        return res.status(400).json({ 
          error: "no_pages_found",
          message: "No Facebook Business Pages found. Make sure you select a Business Page during login." 
        });
      }

      // Loop through and save ONLY the Business Pages
      for (const page of pages) {
        const picUrl = page.picture?.data?.url || "";
        const pageAccessToken = page.access_token; // Yeh token PERMANENT hai

        const savedAcc = await FacebookAccount.findOneAndUpdate(
          { page_id: page.id, userId: userId }, 
          {
            userId,
            page_id: page.id,                      
            page_name: page.name,                  
            page_profile_picture: picUrl,          
            access_token: pageAccessToken        
          },
          { new: true, upsert: true }
        );
        
        savedAccounts.push(savedAcc);

        // ==================================================
        // STEP 2.5: AUTO-SUBSCRIBE WEBHOOKS FOR THIS PAGE
        // ==================================================
        try {
          await axios.post(`https://graph.facebook.com/v19.0/${page.id}/subscribed_apps`, null, {
            params: {
              access_token: pageAccessToken,
              // Yahan wo fields likhein jo aapko real-time mein chahiye
              subscribed_fields: 'messages,messaging_postbacks,feed,comments' 
            }
          });
          console.log(`✅ Webhook subscribed for Page: ${page.name}`);
        } catch (webhookErr) {
          console.error(`❌ Webhook Subscription Failed for ${page.name}:`, webhookErr.response?.data || webhookErr.message);
          // Hum yahan error throw nahi kar rahe, taaki agar webhook fail bhi ho toh Page save ho jaye.
        }
      }
    } catch (pageErr) {
      console.error("Failed to fetch business pages:", pageErr.response?.data || pageErr.message);
      return res.status(500).json({ error: "Failed to fetch pages from Meta API." });
    }

    // ==================================================
    // STEP 3: FINAL RESPONSE
    // ==================================================
    res.status(200).json({ 
      success: true, 
      message: "Business Pages connected and webhooks subscribed successfully", 
      accounts: savedAccounts 
    });

  } catch (error) {
    console.error("FB Auth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to process Facebook connection." });
  }
};

export const getFacebookStatus = async (req, res) => {
  try {
    const accounts = await FacebookAccount.find({ userId: req.user._id });
    res.status(200).json({ isLinked: accounts.length > 0, accounts });
  } catch (error) {
    console.error("Status Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const unlinkFacebookAccount = async (req, res) => {
  try {
    await FacebookAccount.findOneAndDelete({ userId: req.user._id, page_id: req.params.page_id });
    // Note: Best practice is to also DELETE the webhook subscription from Meta when unlinking, 
    // but deleting from your DB is the most critical step.
    res.status(200).json({ success: true, message: "Unlinked successfully" });
  } catch (error) {
    console.error("Unlink Error:", error);
    res.status(500).json({ error: "Failed to unlink" });
  }
};










// import axios from "axios";
// import dotenv from 'dotenv';
// import FacebookAccount from "../../models/FacebookAccount.js";
// dotenv.config();

// const CLIENT_ID = process.env.FACEBOOK_CLIENT_ID;
// const CLIENT_SECRET = process.env.FACEBOOK_CLIENT_SECRET;

// export const handleFacebookCallback = async (req, res) => {
//   try {
//     const { accessToken } = req.body; 
//     const userId = req.user._id.toString(); 

//     if (!accessToken) {
//       return res.status(400).json({ error: "Access token is required" });
//     }

//     // ==================================================
//     // STEP 1: EXCHANGE FOR LONG-LIVED TOKEN (CRITICAL)
//     // ==================================================
//     let longLivedToken = accessToken; // Fallback to short token if exchange fails
//     try {
//       const tokenExchangeRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
//         params: {
//           grant_type: 'fb_exchange_token',
//           client_id: CLIENT_ID,
//           client_secret: CLIENT_SECRET,
//           fb_exchange_token: accessToken
//         }
//       });
//       longLivedToken = tokenExchangeRes.data.access_token;
//     } catch (tokenErr) {
//       console.error("Token Exchange Failed (Using short-lived):", tokenErr.response?.data || tokenErr.message);
//     }

//     const savedAccounts = [];

//     // ==================================================
//     // STEP 2: FETCH & SAVE *ONLY* BUSINESS PAGES
//     // ==================================================
//     try {
//       // Use the longLivedToken here to ensure Page tokens don't expire quickly
//       const fbRes = await axios.get(`https://graph.facebook.com/v19.0/me/accounts`, {
//         params: {
//           access_token: longLivedToken, 
//           fields: 'id,name,access_token,picture{url}' 
//         }
//       });

//       const pages = fbRes.data.data;

//       if (!pages || pages.length === 0) {
//         return res.status(400).json({ 
//           error: "no_pages_found",
//           message: "No Facebook Business Pages found. Make sure you select a Business Page during login." 
//         });
//       }

//       // Loop through and save ONLY the Business Pages
//       for (const page of pages) {
//         const picUrl = page.picture?.data?.url || "";

//         const savedAcc = await FacebookAccount.findOneAndUpdate(
//           { page_id: page.id, userId: userId }, 
//           {
//             userId,
//             page_id: page.id,                      // Business Page ID
//             page_name: page.name,                  // Business Page Name
//             page_profile_picture: picUrl,          // Business Page Picture
//             access_token: page.access_token        // Page Access Token
//           },
//           { new: true, upsert: true }
//         );
        
//         savedAccounts.push(savedAcc);
//       }
//     } catch (pageErr) {
//       console.error("Failed to fetch business pages:", pageErr.response?.data || pageErr.message);
//       return res.status(500).json({ error: "Failed to fetch pages from Meta API." });
//     }

//     // ==================================================
//     // STEP 3: FINAL RESPONSE
//     // ==================================================
//     res.status(200).json({ 
//       success: true, 
//       message: "Business Pages connected successfully", 
//       accounts: savedAccounts 
//     });

//   } catch (error) {
//     console.error("FB Auth Error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to process Facebook connection." });
//   }
// };

// export const getFacebookStatus = async (req, res) => {
//   try {
//     const accounts = await FacebookAccount.find({ userId: req.user._id });
//     res.status(200).json({ isLinked: accounts.length > 0, accounts });
//   } catch (error) {
//     console.error("Status Error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };

// export const unlinkFacebookAccount = async (req, res) => {
//   try {
//     await FacebookAccount.findOneAndDelete({ userId: req.user._id, page_id: req.params.page_id });
//     res.status(200).json({ success: true, message: "Unlinked successfully" });
//   } catch (error) {
//     console.error("Unlink Error:", error);
//     res.status(500).json({ error: "Failed to unlink" });
//   }
// };












// export const redirectToFacebook = (req, res) => {
//   const userId = req.user._id.toString();
//   const params = new URLSearchParams({
//     client_id: CLIENT_ID,
//     redirect_uri: REDIRECT_URI,
//     state: userId,
//     scope: 'pages_show_list,pages_messaging,pages_read_engagement',
//     response_type: 'code'
//   });
//   res.json({ authUrl: `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}` });
// };

// export const handleFacebookCallback = async (req, res) => {
//   const code = req.query.code;
//   const userId = req.query.state;

//   console.log("code is - ",code)
//   console.log("user id is - ",userId)

//   if (!code) return res.redirect(`${FRONTEND_URL}/integrations?fb_status=error`);

//   try {
//     // 1. Exchange code for User Access Token
//     const tokenRes = await axios.get(`https://graph.facebook.com/v25.0/oauth/access_token`, {
//       params: { client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, client_secret: CLIENT_SECRET, code }
//     });
//     const userAccessToken = tokenRes.data.access_token;
    
//     console.log("user access tocken - ", tokenRes.data)

//     // 2. Fetch all Pages managed by User
//     const pagesRes = await axios.get(`https://graph.facebook.com/v25.0/me/accounts`, {
//       params: { access_token: userAccessToken }
//     });

//     const pages = pagesRes.data.data;
//     if (pages.length === 0) {
//       return res.redirect(`${FRONTEND_URL}/integrations?fb_status=nopages`);
//     }

//     // 3. Save all pages to Database with their specific Page Access Tokens
//     for (const page of pages) {
//       // Get page profile pic
//       let picUrl = "";
//       try {
//         const picRes = await axios.get(`https://graph.facebook.com/v25.0/${page.id}/picture?redirect=0&access_token=${page.access_token}`);
//         picUrl = picRes.data.data.url;
//       } catch (e) {}

//       await FacebookAccount.findOneAndUpdate(
//         { page_id: page.id },
//         {
//           userId,
//           page_name: page.name,
//           page_profile_picture: picUrl,
//           access_token: page.access_token
//         },
//         { new: true, upsert: true }
//       );
//     }

//     res.redirect(`${FRONTEND_URL}/integrations?fb_status=success`);
//   } catch (error) {
//     console.error("FB Auth Error:", error.response?.data || error.message);
//     res.redirect(`${FRONTEND_URL}/integrations?fb_status=error`);
//   }
// };

// export const getFacebookStatus = async (req, res) => {
//   try {
//     const accounts = await FacebookAccount.find({ userId: req.user._id });
//     res.status(200).json({ isLinked: accounts.length > 0, accounts });
//   } catch (error) {
//     res.status(500).json({ error: "Server error" });
//   }
// };

// export const unlinkFacebookAccount = async (req, res) => {
//   try {
//     await FacebookAccount.findOneAndDelete({ userId: req.user._id, page_id: req.params.page_id });
//     res.status(200).json({ success: true, message: "Unlinked successfully" });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to unlink" });
//   }
// };