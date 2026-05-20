import dotenv from 'dotenv';
import axios from "axios";
import WhatsAppAccount from "../../models/WhatsAppAccount.js";
dotenv.config();


const APP_ID = process.env.FACEBOOK_CLIENT_ID;
const APP_SECRET = process.env.FACEBOOK_CLIENT_SECRET;

// const APP_ID = "1175088701269032";
// const APP_SECRET = "60fef6ba1770f20b048991ba65b94893";

export const handleWhatsAppCallback = async (req, res) => {
  try {
    // ✅ Extract the new IDs sent by the updated React frontend
    const { code, waba_id, phone_number_id } = req.body;
    console.log("req.body --------------------",req.body)
    const userId = req.user._id.toString();

    // 1. Basic validation
    if (!code) return res.status(400).json({ error: "Code is required from Meta" });
    if (!waba_id || !phone_number_id) {
       return res.status(400).json({ 
           error: "Missing WhatsApp IDs. The user may not have completed the Embedded Signup setup completely." 
       });
    }

    // 2. Exchange CODE for Access Token
    const tokenRes = await axios.get(`https://graph.facebook.com/v25.0/oauth/access_token`, {
      params: { 
        client_id: APP_ID, 
        client_secret: APP_SECRET, 
        code: code,
      }
    });
    
    const accessToken = tokenRes.data.access_token;

    // 3. Get the Display Phone Number using the provided phone_number_id
    // This avoids needing the broad 'business_management' scope entirely.
    const phoneRes = await axios.get(`https://graph.facebook.com/v25.0/${phone_number_id}`, {
      params: { access_token: accessToken }
    });

    const display_phone_number = phoneRes.data.display_phone_number;

    // 4. Save directly to your MongoDB database
    await WhatsAppAccount.findOneAndUpdate(
      { phone_number_id: phone_number_id },
      {
        userId,
        waba_id: waba_id,
        display_phone_number: display_phone_number,
        access_token: accessToken
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, message: "WhatsApp connected successfully!" });
  } catch (error) {
    console.error("WA Auth Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to connect WhatsApp. Check console for details." });
  }
};

export const getWhatsAppStatus = async (req, res) => {
  try {
    const accounts = await WhatsAppAccount.find({ userId: req.user._id });
    res.status(200).json({ isLinked: accounts.length > 0, accounts });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};

export const unlinkWhatsAppAccount = async (req, res) => {
  try {
    await WhatsAppAccount.findOneAndDelete({ userId: req.user._id, phone_number_id: req.params.phone_number_id });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to unlink" });
  }
};




// import dotenv from 'dotenv';
// import axios from "axios";
// import WhatsAppAccount from "../../models/WhatsAppAccount.js";
// dotenv.config();

// // const APP_ID = process.env.FACEBOOK_CLIENT_ID;
// // const APP_SECRET = process.env.FACEBOOK_CLIENT_SECRET;

// const APP_ID = "1175088701269032";
// const APP_SECRET = "60fef6ba1770f20b048991ba65b94893";


// export const handleWhatsAppCallback = async (req, res) => {
//   try {
//     // ✅ FIX: Frontend se ab 'code' aur 'origin' aayega
//     const { code, origin } = req.body;
//     const userId = req.user._id.toString();

//     if (!code) return res.status(400).json({ error: "Code is required from Meta" });

//     // 1. Exchange CODE for Access Token (Naya logic)
//     const tokenRes = await axios.get(`https://graph.facebook.com/v19.0/oauth/access_token`, {
//       params: { 
//         client_id: APP_ID, 
//         client_secret: APP_SECRET, 
//         code: code,
//         redirect_uri: origin
//       }
//     });
    
//     // Meta humein valid Access token de dega
//     const accessToken = tokenRes.data.access_token;

//     // 2. Get User's Businesses -> WABAs -> Phone Numbers
//     const businessRes = await axios.get(`https://graph.facebook.com/v19.0/me/businesses`, { 
//       params: { access_token: accessToken } 
//     });
    
//     let phoneFound = false;
//     for (const business of businessRes.data.data) {
//       const wabaRes = await axios.get(`https://graph.facebook.com/v19.0/${business.id}/owned_whatsapp_business_accounts`, { 
//         params: { access_token: accessToken } 
//       });
      
//       for (const waba of wabaRes.data.data) {
//         const phoneRes = await axios.get(`https://graph.facebook.com/v19.0/${waba.id}/phone_numbers`, { 
//           params: { access_token: accessToken } 
//         });
        
//         for (const phone of phoneRes.data.data) {
//           phoneFound = true;
//           await WhatsAppAccount.findOneAndUpdate(
//             { phone_number_id: phone.id },
//             {
//               userId,
//               waba_id: waba.id,
//               display_phone_number: phone.display_phone_number,
//               access_token: accessToken
//             },
//             { new: true, upsert: true }
//           );
//         }
//       }
//     }

//     if (!phoneFound) {
//       return res.status(404).json({ error: "No WhatsApp Business Numbers found in your account." });
//     }

//     res.status(200).json({ success: true, message: "WhatsApp connected successfully!" });
//   } catch (error) {
//     console.error("WA Auth Error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to connect WhatsApp. Check console for details." });
//   }
// };

// export const getWhatsAppStatus = async (req, res) => {
//   try {
//     const accounts = await WhatsAppAccount.find({ userId: req.user._id });
//     res.status(200).json({ isLinked: accounts.length > 0, accounts });
//   } catch (error) {
//     res.status(500).json({ error: "Server error" });
//   }
// };

// export const unlinkWhatsAppAccount = async (req, res) => {
//   try {
//     await WhatsAppAccount.findOneAndDelete({ userId: req.user._id, phone_number_id: req.params.phone_number_id });
//     res.status(200).json({ success: true });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to unlink" });
//   }
// };