import axios from "axios";
import FormData from "form-data";
import WhatsAppAccount from "../../models/WhatsAppAccount.js";
import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";
import WhatsAppTemplate from "../../models/WhatsAppTemplate.js"; // Naya model import karein
import WhatsAppCampaignLog from "../../models/WhatsAppCampaignLog.js";
import dotenv from 'dotenv';
dotenv.config();

const APP_ID = process.env.FACEBOOK_CLIENT_ID;
// ==========================================
// 1. GET CONVERSATIONS
// ==========================================
export const getWaConversations = async (req, res) => {
  try {
    const conversations = await WhatsAppConversation.find({ phone_number_id: req.params.phoneId }).sort({ last_message_time: -1 });
    res.status(200).json({ conversations });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

// ==========================================
// 2. GET MESSAGES
// ==========================================
export const getWaMessages = async (req, res) => {
  try {
    const messages = await WhatsAppMessage.find({ conversation_id: req.params.convId }).sort({ createdAt: 1 });
    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// ==========================================
// 3. SEND MESSAGE
// ==========================================
export const sendWaMessage = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const { customer_phone, text, conversationId } = req.body;

    const account = await WhatsAppAccount.findOne({ phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "Account not found" });
    
    // WhatsApp Cloud API Messaging Endpoint
    await axios.post(
      `https://graph.facebook.com/v23.0/${phoneId}/messages`,
      {
        messaging_product: "whatsapp",
        to: customer_phone,
        type: "text",
        text: { body: text }
      },
      { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
    );

    const newMessage = new WhatsAppMessage({
      conversation_id: conversationId, sender_id: phoneId, receiver_id: customer_phone, text, is_from_me: true
    });
    await newMessage.save();

    await WhatsAppConversation.findByIdAndUpdate(conversationId, { last_message: text, last_message_time: new Date() });

    res.status(200).json({ message: newMessage });
  } catch (error) {
    console.error("WA Send Error:", error.response?.data || error);
    res.status(500).json({ error: "Failed to send WA message" });
  }
};

// ==========================================
// 4. TOGGLE AI AUTO-REPLY
// ==========================================
export const toggleWaConversationAI = async (req, res) => {
  try {
    const { convId } = req.params; 
    const { isEnabled } = req.body; 

    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: "isEnabled must be a boolean value" });
    }

    const updatedConversation = await WhatsAppConversation.findByIdAndUpdate(
      convId,
      { ai_enabled: isEnabled },
      { new: true } 
    );

    if (!updatedConversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.status(200).json({ 
      success: true, 
      message: `AI auto-reply is now ${isEnabled ? 'ON' : 'OFF'} for this WhatsApp chat.`,
      ai_enabled: updatedConversation.ai_enabled 
    });
  } catch (error) {
    console.error("Error toggling WA conversation AI:", error);
    res.status(500).json({ error: "Failed to toggle conversation AI settings" });
  }
};

// ==========================================
// 5. CREATE WHATSAPP TEMPLATE (UPDATED WITH DB & BUTTONS)
// ==========================================


// ==========================================
// HELPER: RESUMABLE UPLOAD API
// ==========================================
const uploadMediaForTemplate = async (file, accessToken, appId) => {
  try {
    // Step 1: Create Upload Session
    const sessionRes = await axios.post(
      `https://graph.facebook.com/v25.0/${appId}/uploads`,
      null,
      {
        params: {
          file_length: file.size,
          file_type: file.mimetype,
          access_token: accessToken
        }
      }
    );
    
    const uploadSessionId = sessionRes.data.id;

    // Step 2: Upload File Data
    const uploadRes = await axios.post(
      `https://graph.facebook.com/v25.0/${uploadSessionId}`,
      file.buffer, // multer se aaya buffer
      {
        headers: {
          Authorization: `OAuth ${accessToken}`,
          "file_offset": "0"
        }
      }
    );
    
    // Returns the file handle (e.g., "4::aW...")
    return uploadRes.data.h; 
  } catch (error) {
    console.error("Resumable Upload Error:", error.response?.data || error.message);
    throw new Error("Failed to upload media to Meta.");
  }
};

// ==========================================
// CREATE WHATSAPP TEMPLATE
// ==========================================
export const createWhatsAppTemplate = async (req, res) => {
  try {
    // 🚨 SAFETY CHECK: Agar multer configure nahi hai toh error dega, server crash nahi hoga
    if (!req.body) {
      return res.status(400).json({ error: "No data received. Make sure multer middleware is added in the route." });
    }

    // 1. Extract values from FormData
    const { 
      phoneId, name, category, language, purpose, 
      headerType, headerText, bodyText, footerText, buttonType 
    } = req.body;

    if (!phoneId) {
       return res.status(400).json({ error: "phoneId is required." });
    }

    // 2. Parse stringified arrays
    let parsedButtons = [];
    let parsedBodySamples = [];
    if (req.body.buttons) parsedButtons = JSON.parse(req.body.buttons);
    if (req.body.bodySamples) parsedBodySamples = JSON.parse(req.body.bodySamples);

    // 3. Extract uploaded file (via multer)
    const file = req.file; 
    const userId = req.user._id;

    // 4. Get Account Details
    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    const { waba_id, access_token } = account;
    // NOTE: Resumable Upload API ke liye aapko apna Meta App ID chahiye hoga.
  

    // 5. Build Components Array dynamically based on Meta's Docs
    const components = [];

    // --- HEADER COMPONENT ---
    if (headerType === 'TEXT' && headerText && headerText.trim() !== '') {
      const headerComp = { type: 'HEADER', format: 'TEXT', text: headerText };
      
      const headerVarMatches = headerText.match(/\{\{\d+\}\}/g);
      if (headerVarMatches && headerVarMatches.length > 0) {
        headerComp.example = { header_text: ["Sample Header Value"] }; 
      }
      components.push(headerComp);
    } 
    else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
      const headerComp = { type: 'HEADER', format: headerType };
      
      if (file) {
        try {
          // ✅ USE THE REAL UPLOAD FUNCTION
          const fileHandle = await uploadMediaForTemplate(file, access_token, APP_ID);
          headerComp.example = { header_handle: [fileHandle] };
        } catch (uploadError) {
          return res.status(500).json({ error: "Failed to upload media to Meta's Resumable API." });
        }
      } else {
        return res.status(400).json({ error: `Please provide a file for ${headerType} header.` });
      }
      components.push(headerComp);}

    else if (headerType === 'LOCATION') {
      components.push({ type: 'HEADER', format: 'LOCATION' });
    }

    // --- BODY COMPONENT ---
    const bodyComponent = { type: 'BODY', text: bodyText };
    const bodyVarMatches = bodyText.match(/\{\{\d+\}\}/g);
    let hasVariables = false;
    
    if (bodyVarMatches && bodyVarMatches.length > 0) {
      hasVariables = true;
      const exampleValues = parsedBodySamples.length > 0 ? parsedBodySamples : bodyVarMatches.map((v, i) => `Sample ${i + 1}`);
      
      bodyComponent.example = { body_text: [exampleValues] };
    }
    components.push(bodyComponent);

    // --- FOOTER COMPONENT ---
    if (footerText && footerText.trim() !== '') {
      components.push({ type: 'FOOTER', text: footerText });
    }

    // --- BUTTONS COMPONENT ---
    if (parsedButtons && parsedButtons.length > 0 && buttonType !== 'NONE') {
      const formattedButtons = parsedButtons.map(btn => {
        if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
        if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url };
        if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
        return null;
      }).filter(Boolean);

      if (formattedButtons.length > 0) {
        components.push({ type: 'BUTTONS', buttons: formattedButtons });
      }
    }

    // 6. Build Final Template Payload
    const templatePayload = {
      name: name,
      language: language,
      category: category,
      components: components
    };

    if (hasVariables) {
      templatePayload.parameter_format = "POSITIONAL";
    }

    // 7. Send to Meta API
    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${waba_id}/message_templates`,
      templatePayload,
      { 
        headers: { 
          Authorization: `Bearer ${access_token}`, 
          "Content-Type": "application/json" 
        } 
      }
    );

    // 8. Save to Database
    const newTemplate = new WhatsAppTemplate({
      userId,
      phone_number_id: phoneId,
      waba_id,
      meta_template_id: response.data.id,
      name: name,
      language: language,
      category: category,
      components: components,
      status: response.data.status || "PENDING",
      purpose: purpose || "" 
    });

    await newTemplate.save();

    res.status(200).json({ 
      success: true, 
      message: "Template submitted and saved successfully!",
      template: newTemplate
    });

  } catch (error) {
    console.error("Meta API Template Error:", error.response?.data || error.message);
    const errorMsg = error.response?.data?.error?.error_user_msg 
                  || error.response?.data?.error?.message 
                  || "Failed to create template on Meta.";

    res.status(500).json({ error: errorMsg });
  }
};

// export const createWhatsAppTemplate = async (req, res) => {
//   try {
//     // req.body se 'purpose' bhi extract kiya gaya hai
//     const { phoneId, name, category, language, headerText, bodyText, footerText, buttons, purpose } = req.body;
//     const userId = req.user._id;

//     // Database se waba_id nikalna
//     const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });

//     if (!account || !account.waba_id) {
//       return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
//     }

//     const { waba_id, access_token } = account;

//     // Components array dynamically build karein
//     const components = [];

//     // Header
//     if (headerText && headerText.trim() !== '') {
//       components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
//     }

//     // Body
//     const bodyComponent = { type: 'BODY', text: bodyText };
//     const varMatches = bodyText.match(/\{\{\d+\}\}/g);
//     let hasVariables = false;
    
//     if (varMatches && varMatches.length > 0) {
//       hasVariables = true;
//       const exampleValues = varMatches.map((v, index) => `Value ${index + 1}`);
//       bodyComponent.example = { body_text: [exampleValues] };
//     }
//     components.push(bodyComponent);

//     // Footer
//     if (footerText && footerText.trim() !== '') {
//       components.push({ type: 'FOOTER', text: footerText });
//     }

//     // Buttons
//     if (buttons && buttons.length > 0) {
//       const formattedButtons = buttons.map(btn => {
//         if (btn.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: btn.text };
//         if (btn.type === 'URL') return { type: 'URL', text: btn.text, url: btn.url };
//         if (btn.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
//         return null;
//       }).filter(Boolean);

//       if (formattedButtons.length > 0) {
//         components.push({ type: 'BUTTONS', buttons: formattedButtons });
//       }
//     }

//     // Ye data Meta ko jayega (isme purpose nahi hai)
//     const templatePayload = {
//       name: name,
//       language: language,
//       category: category,
//       components: components
//     };

//     if (hasVariables) {
//       templatePayload.parameter_format = "POSITIONAL";
//     }

//     // Send to Meta Graph API
//     const response = await axios.post(
//       `https://graph.facebook.com/v25.0/${waba_id}/message_templates`,
//       templatePayload,
//       { headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" } }
//     );

//     // ✅ SAVE TO DATABASE AFTER SUCCESS (Yahan purpose save hoga)
//     const newTemplate = new WhatsAppTemplate({
//       userId,
//       phone_number_id: phoneId,
//       waba_id,
//       meta_template_id: response.data.id,
//       name: name,
//       language: language,
//       category: category,
//       components: components,
//       status: response.data.status || "PENDING",
//       purpose: purpose || "" // <-- Purpose mapped here
//     });

//     await newTemplate.save();

//     res.status(200).json({ 
//       success: true, 
//       message: "Template submitted and saved to database successfully!",
//       template: newTemplate
//     });

//   } catch (error) {
//     console.error("Meta API Template Error:", error.response?.data || error.message);
//     const errorMsg = error.response?.data?.error?.error_user_msg 
//                   || error.response?.data?.error?.message 
//                   || "Failed to create template on Meta.";

//     res.status(500).json({ error: errorMsg });
//   }
// };

// export const createWhatsAppTemplate = async (req, res) => {
//   try {
//     console.log("req.body - - - - - - - - - - - - -",req.body)
//     const { phoneId, name, category, language, headerText, bodyText, footerText, buttons } = req.body;
//     const userId = req.user._id;

//     // Database se waba_id nikalna
//     const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });

//     if (!account || !account.waba_id) {
//       return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
//     }

//     const { waba_id, access_token } = account;

//     // Components array dynamically build karein
//     const components = [];

//     // Header (Optional)
//     if (headerText && headerText.trim() !== '') {
//       components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
//     }

//     // Body (Required)
//     const bodyComponent = { type: 'BODY', text: bodyText };
    
//     // Check for variables {{1}}, {{2}} in body text
//     const varMatches = bodyText.match(/\{\{\d+\}\}/g);
//     let hasVariables = false;
//     if (varMatches && varMatches.length > 0) {
//       hasVariables = true;
//       // Provide dummy examples for Meta validation
//       const exampleValues = varMatches.map((v, index) => `Value ${index + 1}`);
//       bodyComponent.example = { body_text: [exampleValues] };
//     }
//     components.push(bodyComponent);

//     // Footer (Optional)
//     if (footerText && footerText.trim() !== '') {
//       components.push({ type: 'FOOTER', text: footerText });
//     }

//     // Buttons (Optional)
//     if (buttons && buttons.length > 0) {
//       const formattedButtons = buttons.map(btn => {
//         if (btn.type === 'QUICK_REPLY') {
//           return { type: 'QUICK_REPLY', text: btn.text };
//         } else if (btn.type === 'URL') {
//           return { type: 'URL', text: btn.text, url: btn.url };
//         } else if (btn.type === 'PHONE_NUMBER') {
//           return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
//         }
//         return null;
//       }).filter(Boolean);

//       if (formattedButtons.length > 0) {
//         components.push({ type: 'BUTTONS', buttons: formattedButtons });
//       }
//     }

//     const templatePayload = {
//       name: name,
//       language: language,
//       category: category,
//       components: components
//     };

//     // Agar variables use huye hain toh Meta v23.0 requires parameter_format to be specified explicitly
//     if (hasVariables) {
//       templatePayload.parameter_format = "POSITIONAL"; // or "NAMED" depending on syntax
//     }

//     // Send to Meta Graph API
//     const response = await axios.post(
//       `https://graph.facebook.com/v25.0/${waba_id}/message_templates`,
//       templatePayload,
//       { headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" } }
//     );

//     // ✅ SAVE TO DATABASE AFTER SUCCESS
//     const newTemplate = new WhatsAppTemplate({
//       userId,
//       phone_number_id: phoneId,
//       waba_id,
//       meta_template_id: response.data.id,
//       name: name,
//       language: language,
//       category: category,
//       components: components,
//       status: response.data.status || "PENDING"
//     });

//     await newTemplate.save();

//     res.status(200).json({ 
//       success: true, 
//       message: "Template submitted and saved to database successfully!",
//       template: newTemplate
//     });

//   } catch (error) {
//     console.error("Meta API Template Error:", error.response?.data || error.message);
//     const errorMsg = error.response?.data?.error?.error_user_msg 
//                   || error.response?.data?.error?.message 
//                   || "Failed to create template on Meta.";

//     res.status(500).json({ error: errorMsg });
//   }
// };


// ==========================================
// 6. GET ALL TEMPLATES FROM DATABASE (Frontend Display)
// ==========================================
export const getWaTemplates = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const userId = req.user._id;

    // Fetch from our DB directly for fast UI loading
    const templates = await WhatsAppTemplate.find({ userId, phone_number_id: phoneId }).sort({ createdAt: -1 });
    
    res.status(200).json({ success: true, templates });
  } catch (error) {
    console.error("Error fetching local templates:", error);
    res.status(500).json({ error: "Failed to fetch templates from database" });
  }
};

// ==========================================
// 7. FETCH ALL TEMPLATES FROM META AND SYNC TO DB
// ==========================================
export const syncWaTemplates = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    const { waba_id, access_token } = account;

    // Fetch ALL templates directly from Meta
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${waba_id}/message_templates`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const metaTemplates = response.data.data; // Array of templates from Meta

    if (!metaTemplates || metaTemplates.length === 0) {
      return res.status(200).json({ success: true, message: "No templates found on Meta.", templates: [] });
    }

    // Bulk update database using name + language as the unique identifier for a template
    const bulkOps = metaTemplates.map(tpl => ({
      updateOne: {
        filter: { waba_id: waba_id, name: tpl.name, language: tpl.language },
        update: {
          $set: {
            userId,
            phone_number_id: phoneId,
            meta_template_id: tpl.id,
            category: tpl.category,
            components: tpl.components,
            status: tpl.status
          }
        },
        upsert: true
      }
    }));

    if (bulkOps.length > 0) {
      await WhatsAppTemplate.bulkWrite(bulkOps);
    }

    // Fetch updated templates from our DB to return to frontend
    const updatedTemplates = await WhatsAppTemplate.find({ userId, phone_number_id: phoneId }).sort({ createdAt: -1 });

    res.status(200).json({ 
      success: true, 
      message: "Templates successfully synced with Meta.",
      templates: updatedTemplates
    });

  } catch (error) {
    console.error("Meta API Sync Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to sync templates from Meta." });
  }
};

// ==========================================
// 8. REFRESH STATUS OF A SINGLE TEMPLATE
// ==========================================
export const refreshTemplateStatus = async (req, res) => {
  try {
    const { phoneId, templateId } = req.params; // templateId is the Meta template ID or DB ID
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "WhatsApp account not found." });

    // Assuming frontend passes the Meta Template ID (meta_template_id)
    const dbTemplate = await WhatsAppTemplate.findOne({ _id: templateId, userId });
    
    if (!dbTemplate || !dbTemplate.meta_template_id) {
       return res.status(404).json({ error: "Template not found in local database." });
    }

    // Call Meta API to get ONLY the status of this specific template
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${dbTemplate.meta_template_id}?fields=status`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );

    const newStatus = response.data.status;

    // Update in database
    dbTemplate.status = newStatus;
    await dbTemplate.save();

    res.status(200).json({ 
      success: true, 
      message: `Template status updated to ${newStatus}`,
      status: newStatus,
      template: dbTemplate
    });

  } catch (error) {
    console.error("Meta API Status Refresh Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch template status from Meta." });
  }
};

// ==========================================
// 9. POST SENT BULK TEMPLATE 
// ==========================================

// export const sendBulkWaTemplate = async (req, res) => {
//   try {
//     const { phoneId } = req.params;
//     const { templateName, language, recipients } = req.body;
//     const userId = req.user._id;

//     const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
//     if (!account) return res.status(404).json({ error: "WhatsApp account not found." });

//     const results = {
//       total: recipients.length,
//       success: 0,
//       failed: 0,
//       errors: []
//     };

//     // Note: For massive lists (10k+), this should be handled via a background queue (like BullMQ). 
//     // For standard bulk sends (up to a few hundred), a Promise.all or sequential loop works fine.
    
//     for (const rec of recipients) {
//       try {
//         // Build the dynamic components payload for Meta API
//         const components = [];
        
//         // If template has body variables (e.g. {{1}}, {{2}}), attach them
//         if (rec.variables && rec.variables.length > 0) {
//           components.push({
//             type: "body",
//             parameters: rec.variables.map(val => ({
//               type: "text",
//               text: val || " " // fallback to space if empty
//             }))
//           });
//         }

//         const payload = {
//           messaging_product: "whatsapp",
//           to: rec.phone,
//           type: "template",
//           template: {
//             name: templateName,
//             language: { code: language },
//             components: components.length > 0 ? components : undefined
//           }
//         };

//         // Send to Meta
//         await axios.post(
//           `https://graph.facebook.com/v23.0/${phoneId}/messages`,
//           payload,
//           { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
//         );

//         results.success++;
//       } catch (err) {
//         results.failed++;
//         const errorMsg = err.response?.data?.error?.message || "Unknown error";
//         results.errors.push({ phone: rec.phone, error: errorMsg });
//       }
//     }

//     res.status(200).json({ 
//       success: true, 
//       message: `Bulk message completed. Success: ${results.success}, Failed: ${results.failed}`,
//       results 
//     });

//   } catch (error) {
//     console.error("Bulk Send Error:", error);
//     res.status(500).json({ error: "Failed to process bulk template sending." });
//   }
// };

// Helper function — {{1}}, {{2}} ko actual values se replace karo
// const resolveTemplateText = (template, variables = []) => {
//   const bodyComponent = template.components.find(c => c.type === "BODY");
//   if (!bodyComponent) return `[Template: ${template.name}]`;

//   let text = bodyComponent.text;

//   // {{1}}, {{2}} replace karo actual variable values se
//   variables.forEach((val, index) => {
//     text = text.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"), val || "");
//   });

//   return text;
// };



// export const sendBulkWaTemplate = async (req, res) => {
//   try {
//     const { phoneId } = req.params;
//     const { templateName, language, recipients } = req.body;
//     const userId = req.user._id;

//     const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
//     if (!account) return res.status(404).json({ error: "WhatsApp account not found." });

//     // Template ek baar fetch karo — sabke liye same template use hogi
//     const template = await WhatsAppTemplate.findOne({ 
//       phone_number_id: phoneId, 
//       name: templateName 
//     });
//     if (!template) return res.status(404).json({ error: "Template not found." });

//     const results = { total: recipients.length, success: 0, failed: 0, errors: [] };

//     for (const rec of recipients) {
//       try {
//         // --- 1. Build Meta API payload ---
//         const components = [];
//         if (rec.variables && rec.variables.length > 0) {
//           components.push({
//             type: "body",
//             parameters: rec.variables.map(val => ({
//               type: "text",
//               text: val || " ",
//             })),
//           });
//         }

//         const payload = {
//           messaging_product: "whatsapp",
//           to: rec.phone,
//           type: "template",
//           template: {
//             name: templateName,
//             language: { code: language },
//             components: components.length > 0 ? components : undefined,
//           },
//         };

//         // --- 2. Send to Meta ---
//         await axios.post(
//           `https://graph.facebook.com/v23.0/${phoneId}/messages`,
//           payload,
//           {
//             headers: {
//               Authorization: `Bearer ${account.access_token}`,
//               "Content-Type": "application/json",
//             },
//           }
//         );

//         // --- 3. Variables replace karke actual text banao ---
//         // "Hello {{1}}, your order {{2}}" → "Hello Rahul, your order #123"
//         const resolvedText = resolveTemplateText(template, rec.variables || []);

//         // --- 4. Conversation find karo ya naya banao ---
//         const conversationUpdate = {
//           $set: {
//             last_message: resolvedText, // actual text store hoga
//             last_message_time: new Date(),
//           },
//           $setOnInsert: {
//             phone_number_id: phoneId,
//             customer_phone: rec.phone,
//             customer_name: rec.name || "WA User",
//             ai_enabled: true,
//           },
//         };

//         if (rec.name) {
//           conversationUpdate.$set.customer_name = rec.name;
//         }

//         const conversation = await WhatsAppConversation.findOneAndUpdate(
//           { phone_number_id: phoneId, customer_phone: rec.phone },
//           conversationUpdate,
//           { upsert: true, new: true }
//         );

//         // --- 5. Message save karo actual text ke saath ---
//         await WhatsAppMessage.create({
//           conversation_id: conversation._id,
//           sender_id: phoneId,
//           receiver_id: rec.phone,
//           text: resolvedText,         // "Hello Rahul, your order #123 is confirmed!"
//           is_from_me: true,
//           is_read: true,
//           message_type: "template",
//           template_name: templateName,
//         });

//         results.success++;
//       } catch (err) {
//         results.failed++;
//         const errorMsg = err.response?.data?.error?.message || err.message || "Unknown error";
//         results.errors.push({ phone: rec.phone, error: errorMsg });
//       }
//     }

//     res.status(200).json({
//       success: true,
//       message: `Bulk send done. Success: ${results.success}, Failed: ${results.failed}`,
//       results,
//     });

//   } catch (error) {
//     console.error("Bulk Send Error:", error);
//     res.status(500).json({ error: "Failed to process bulk template sending." });
//   }
// };

const resolveTemplateText = (template, variables = []) => {
  try {
    const bodyComponent = template?.components?.find(c => c.type?.toLowerCase() === "body");
    if (!bodyComponent || !bodyComponent.text) return `[Template: ${template?.name || 'WhatsApp Template'}]`;

    let text = bodyComponent.text;
    variables.forEach((val, index) => {
      text = text.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"), val || "");
    });
    return text;
  } catch (err) {
    console.error("Error resolving template:", err);
    return "Template message processed and sent.";
  }
};

export const sendBulkWaTemplate = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const { templateName, language, recipients } = req.body;
    const userId = req.user?._id;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Recipients data array is mandatory." });
    }

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "WhatsApp account not found." });

    // Yahan hum template fetch kar rahe hain, jisme se hume _id aur meta_template_id mil jayega
    const template = await WhatsAppTemplate.findOne({ 
      phone_number_id: phoneId, 
      name: templateName 
    });
    if (!template) return res.status(404).json({ error: "Template not found." });

    // --- FIX 1: Normalize Phones & Remove Duplicates ---
    const uniqueRecipientsMap = new Map();
    
    for (const rec of recipients) {
      if (!rec.phone) continue;
      
      let cleanedPhone = String(rec.phone).replace(/[^0-9]/g, '');
      
      if (cleanedPhone.length === 10) {
        cleanedPhone = '91' + cleanedPhone;
      }

      if (!uniqueRecipientsMap.has(cleanedPhone)) {
        uniqueRecipientsMap.set(cleanedPhone, { ...rec, phone: cleanedPhone });
      }
    }

    const uniqueRecipients = Array.from(uniqueRecipientsMap.values());

    const results = { total: uniqueRecipients.length, success: 0, failed: 0, errors: [] };
    const deliveryDetails = [];

    for (const rec of uniqueRecipients) {
      try {
        const cleanedPhone = rec.phone;

        const components = [];
        if (rec.variables && rec.variables.length > 0) {
          components.push({
            type: "body",
            parameters: rec.variables.map(val => ({ type: "text", text: String(val || " ") })),
          });
        }

        const payload = {
          messaging_product: "whatsapp",
          to: cleanedPhone,
          type: "template",
          template: {
            name: templateName,
            language: { code: language || "en" },
            components: components.length > 0 ? components : undefined,
          },
        };

        // Send via Meta
        const metaResponse = await axios.post(
          `https://graph.facebook.com/v23.0/${phoneId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              "Content-Type": "application/json",
            },
            timeout: 12000
          }
        );

        const messageId = metaResponse.data?.messages?.[0]?.id || `wamid_${Date.now()}`;
        const resolvedText = resolveTemplateText(template, rec.variables || []);

        const conversationUpdate = {
          $set: {
            last_message: resolvedText, 
            last_message_time: new Date(),
          },
          $setOnInsert: {
            phone_number_id: phoneId,      
            customer_phone: cleanedPhone,  
            ai_enabled: true,
            customer_name: rec.name || "WA User", 
          },
        };

        const conversation = await WhatsAppConversation.findOneAndUpdate(
          { phone_number_id: phoneId, customer_phone: cleanedPhone }, 
          conversationUpdate,
          { upsert: true, returnDocument: 'after' } 
        );

        // NAYA CODE: Yahan template_id aur meta_template_id dono save karwa diye hain
        await WhatsAppMessage.create({
          message_id: messageId,
          status: "sent",
          conversation_id: conversation._id,
          sender_id: phoneId,
          receiver_id: cleanedPhone,
          text: resolvedText,
          is_from_me: true,
          is_read: true,
          message_type: "template",
          template_name: templateName,
          template_id: template._id,                   // <-- ADDED THIS
          meta_template_id: template.meta_template_id  // <-- ADDED THIS
        });

        results.success++;
        deliveryDetails.push({
          phone: cleanedPhone,
          status: "success",
          message_id: messageId,
          error_message: null
        });

      } catch (err) {
        results.failed++;
        const errorMsg = err.response?.data?.error?.message || err.message || "Failed to process.";
        results.errors.push({ phone: rec.phone, error: errorMsg });
        
        deliveryDetails.push({
          phone: rec.phone,
          status: "failed",
          message_id: null,
          error_message: errorMsg
        });
      }
    }

    // NAYA CODE: Campaign Log mein bhi template_id add kar diya gaya hai
    await WhatsAppCampaignLog.create({
      userId: userId,
      phone_number_id: phoneId,
      template_name: templateName,
      template_id: template._id,                   // <-- ADDED THIS
      meta_template_id: template.meta_template_id, // <-- ADDED THIS
      total_recipients: results.total,
      successful_sends: results.success,
      failed_sends: results.failed,
      delivery_details: deliveryDetails
    });

    res.status(200).json({
      success: true,
      message: `Campaign Processing Complete. Success: ${results.success}, Failed: ${results.failed}`,
      results,
    });

  } catch (error) {
    console.error("Critical Route Error:", error);
    res.status(500).json({ error: "Failed to process campaign." });
  }
};

// ==========================================
// 10. GET TEMPLATE ANALYTICS (Sent, Delivered, Read)
// ==========================================
export const getWaTemplateAnalytics = async (req, res) => {
  try {
    const { phoneId, templateId } = req.params;
    const userId = req.user._id;

    // 1. Get WABA ID
    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    // 2. Get Meta Template ID from your Database
    const dbTemplate = await WhatsAppTemplate.findOne({ _id: templateId, userId });
    if (!dbTemplate || !dbTemplate.meta_template_id) {
       return res.status(404).json({ error: "Template not found in database." });
    }

    // 3. Format dates for the last 30 days (Format: YYYY-MM-DD)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    
    const startStr = start.toISOString().split('T')[0]; 
    const endStr = end.toISOString().split('T')[0];

    // Meta API requires a stringified JSON array of strings
    const formattedTemplateIds = JSON.stringify([String(dbTemplate.meta_template_id)]);

    // 4. Fetch Analytics strictly from Meta Graph API
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${account.waba_id}/template_analytics`,
      {
        headers: { Authorization: `Bearer ${account.access_token}` },
        params: {
          start: startStr,
          end: endStr,
          granularity: "DAILY",
          template_ids: formattedTemplateIds
        }
      }
    );

    // 5. Aggregate metrics across all returned data points
    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;

    const metaData = response.data.data;

    if (metaData && metaData.length > 0) {
      // Standard Meta API Structure: data[0].data_points
      const dataPoints = metaData[0]?.data_points || [];
      
      if (dataPoints.length > 0) {
        dataPoints.forEach(pt => {
            totalSent += pt.sent || 0;
            totalDelivered += pt.delivered || 0;
            totalRead += pt.read || 0;
        });
      } else {
        // Fallback parsing just in case Meta returns a flat structure
        metaData.forEach(pt => {
            totalSent += pt.sent || 0;
            totalDelivered += pt.delivered || 0;
            totalRead += pt.read || 0;
        });
      }
    }

    // --- NAYA LOGIC: HYBRID LOCAL FALLBACK ---
    let data_source = "meta_api";

    // Agar Meta ne sab kuch 0 bheja hai (yaani abhi tak update nahi hua)
    if (totalSent === 0 && totalDelivered === 0 && totalRead === 0) {
      data_source = "local_database";
      
      // Local Database se real-time messages count karein
      // (dbTemplate.name use kar rahe hain taki purane messages bhi correctly map ho jayein)
      totalSent = await WhatsAppMessage.countDocuments({ 
        template_name: dbTemplate.name,
        sender_id: phoneId 
      });

      totalDelivered = await WhatsAppMessage.countDocuments({ 
        template_name: dbTemplate.name,
        sender_id: phoneId,
        status: { $in: ["delivered", "read"] } // Jo read hua hai wo delivered bhi mana jayega
      });

      totalRead = await WhatsAppMessage.countDocuments({ 
        template_name: dbTemplate.name,
        sender_id: phoneId,
        status: "read" 
      });
    }

    res.status(200).json({ 
      success: true, 
      summary: { sent: totalSent, delivered: totalDelivered, read: totalRead },
      source: data_source, // Ye batayega ki data Meta se aaya hai ya Local DB se
      raw: metaData
    });

  } catch (error) {
    console.error("Meta Template Analytics Error:", error.response?.data || error.message);
    const metaError = error.response?.data?.error?.message;
    res.status(500).json({ error: metaError || "Failed to fetch analytics. Please check if Template Insights is enabled." });
  }
};


// ==========================================
// 11. GET WABA INSIGHTS (Overview + Detailed History)
// ==========================================
export const getWaAccountInsights = async (req, res) => {
  try {
    const { phoneId } = req.params;
    let { start, end, category } = req.query; 
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    const templateQuery = { userId, phone_number_id: phoneId, status: 'APPROVED' };
    if (category && category !== 'ALL') templateQuery.category = category;
    
    const templates = await WhatsAppTemplate.find(templateQuery);

    if (templates.length === 0) {
      return res.status(200).json({ 
        success: true, 
        metrics: { delivered: 0, read: 0, readRate: 0, clicked: 0, clickRate: 0 },
        templateBreakdown: [],
        recentHistory: [],
        source: "empty"
      });
    }

    // --- 1. OVERALL METRICS FROM META (With Fallback) ---
    const templateIds = templates.map(t => t.meta_template_id).filter(Boolean);
    const top10TemplateIds = templateIds.slice(0, 10);
    const formattedTemplateIdsArray = JSON.stringify(top10TemplateIds.map(id => String(id)));

    if (!start || !end) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      start = startDate.toISOString().split('T')[0];
      end = endDate.toISOString().split('T')[0];
    }

    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${account.waba_id}/template_analytics`,
      {
        headers: { Authorization: `Bearer ${account.access_token}` },
        params: { start, end, granularity: "DAILY", template_ids: formattedTemplateIdsArray }
      }
    ).catch(() => ({ data: { data: [] } })); // Catch Meta errors silently to continue with DB

    let delivered = 0, read = 0, clicked = 0;
    const metaDataArray = response.data.data || [];
    
    metaDataArray.forEach(dataset => {
        const dataPoints = dataset.data_points || [];
        dataPoints.forEach(pt => {
            delivered += pt.delivered || 0;
            read += pt.read || 0;
            clicked += pt.clicked || 0; 
        });
    });

    let dataSource = "meta_api";
    const templateNames = templates.map(t => t.name); 

    // Fallback if Meta is 0 or delayed
    if (delivered === 0 && read === 0) {
      dataSource = "local_database";
      delivered = await WhatsAppMessage.countDocuments({
        sender_id: phoneId, template_name: { $in: templateNames }, status: { $in: ["delivered", "read"] }
      });
      read = await WhatsAppMessage.countDocuments({
        sender_id: phoneId, template_name: { $in: templateNames }, status: "read"
      });
    }

    const readRate = delivered > 0 ? ((read / delivered) * 100).toFixed(1) : 0;
    const clickRate = delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : 0;

    // --- 2. DETAILED TEMPLATE BREAKDOWN (From Local DB) ---
    const templateBreakdown = await Promise.all(templates.map(async (tpl) => {
      const sentC = await WhatsAppMessage.countDocuments({ sender_id: phoneId, template_name: tpl.name });
      const delC = await WhatsAppMessage.countDocuments({ sender_id: phoneId, template_name: tpl.name, status: { $in: ["delivered", "read"] } });
      const readC = await WhatsAppMessage.countDocuments({ sender_id: phoneId, template_name: tpl.name, status: "read" });

      return {
        id: tpl._id,
        name: tpl.name,
        category: tpl.category,
        language: tpl.language,
        sent: sentC,
        delivered: delC,
        read: readC
      };
    }));

    // Remove templates with 0 sends and sort by most sent
    const activeTemplateBreakdown = templateBreakdown.filter(t => t.sent > 0).sort((a, b) => b.sent - a.sent);

    // --- 3. RECENT MESSAGE HISTORY (Who, When, Which Template) ---
    // Fetching last 50 template messages
    const recentMessagesRaw = await WhatsAppMessage.find({
      sender_id: phoneId,
      message_type: "template"
    }).sort({ createdAt: -1 }).limit(50);

    const recentHistory = recentMessagesRaw.map(msg => ({
      id: msg._id,
      phone: msg.receiver_id,
      template_name: msg.template_name,
      status: msg.status,
      date: msg.createdAt
    }));

    res.status(200).json({ 
      success: true, 
      source: dataSource,
      metrics: { delivered, read, readRate: parseFloat(readRate), clicked, clickRate: parseFloat(clickRate) },
      templateBreakdown: activeTemplateBreakdown,
      recentHistory
    });

  } catch (error) {
    console.error("Meta Insights Error:", error);
    res.status(500).json({ error: "Failed to fetch account insights." });
  }
};



// ==========================================
// 12. GET WHATSAPP PROFILE DETAILS (Fetch & Sync to DB)
// ==========================================

export const getWaProfileDetails = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // Meta API se Profile aur Name dono ek sath fetch karein
    const [profileRes, phoneRes] = await Promise.all([
      axios.get(
        `https://graph.facebook.com/v23.0/${phoneId}/whatsapp_business_profile`,
        { headers: { Authorization: `Bearer ${account.access_token}` }, params: { fields: "about,address,description,email,profile_picture_url,websites,vertical" } }
      ).catch(() => ({ data: { data: [{}] } })), // Fallback if empty
      
      axios.get(
        `https://graph.facebook.com/v23.0/${phoneId}`,
        { headers: { Authorization: `Bearer ${account.access_token}` }, params: { fields: "verified_name,name_status" } }
      ).catch(() => ({ data: {} })) // Fallback
    ]);

    const profileData = profileRes.data.data[0] || {};
    const phoneData = phoneRes.data || {};

    // DB Update
    account.about = profileData.about || account.about;
    account.description = profileData.description || account.description;
    account.email = profileData.email || account.email;
    account.address = profileData.address || account.address;
    account.profile_picture_url = profileData.profile_picture_url || account.profile_picture_url;
    account.websites = profileData.websites || account.websites;
    account.verified_name = phoneData.verified_name || account.verified_name;
    account.name_status = phoneData.name_status || account.name_status;
    
    await account.save();

    // Mongoose document ko plain object banayein
    const safeProfile = account.toObject();
    
    // Access token hata dein taki frontend par na jaye
    delete safeProfile.access_token;

    res.status(200).json({ success: true, profile: safeProfile });
  } catch (error) {
    console.error("Fetch Profile Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch WhatsApp profile details." });
  }
};

// export const getWaProfileDetails = async (req, res) => {
//   try {
//     const { phoneId } = req.params;
//     const userId = req.user._id;

//     const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
//     if (!account) return res.status(404).json({ error: "Account not found" });

//     // Meta API se Profile aur Name dono ek sath fetch karein
//     const [profileRes, phoneRes] = await Promise.all([
//       axios.get(
//         `https://graph.facebook.com/v23.0/${phoneId}/whatsapp_business_profile`,
//         { headers: { Authorization: `Bearer ${account.access_token}` }, params: { fields: "about,address,description,email,profile_picture_url,websites,vertical" } }
//       ).catch(() => ({ data: { data: [{}] } })), // Fallback if empty
      
//       axios.get(
//         `https://graph.facebook.com/v23.0/${phoneId}`,
//         { headers: { Authorization: `Bearer ${account.access_token}` }, params: { fields: "verified_name,name_status" } }
//       ).catch(() => ({ data: {} })) // Fallback
//     ]);

//     const profileData = profileRes.data.data[0] || {};
//     const phoneData = phoneRes.data || {};

//     // DB Update
//     account.about = profileData.about || account.about;
//     account.description = profileData.description || account.description;
//     account.email = profileData.email || account.email;
//     account.address = profileData.address || account.address;
//     account.profile_picture_url = profileData.profile_picture_url || account.profile_picture_url;
//     account.websites = profileData.websites || account.websites;
//     account.verified_name = phoneData.verified_name || account.verified_name;
//     account.name_status = phoneData.name_status || account.name_status;
    
//     await account.save();

//     res.status(200).json({ success: true, profile: account });
//   } catch (error) {
//     console.error("Fetch Profile Error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to fetch WhatsApp profile details." });
//   }
// };

// ==========================================
// 13. UPDATE WHATSAPP PROFILE & DISPLAY NAME
// ==========================================


export const updateWaProfileDetails = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const { description, address, email, websites, about, verified_name } = req.body;
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    // 1. Text details update
    const payload = {
      messaging_product: "whatsapp" // <-- Ye parameter mandatory hai
    };
    
    let shouldUpdateProfile = false;
    
    if (description !== undefined) { payload.description = description; shouldUpdateProfile = true; }
    if (address !== undefined) { payload.address = address; shouldUpdateProfile = true; }
    if (email !== undefined) { payload.email = email; shouldUpdateProfile = true; }
    if (websites !== undefined) { payload.websites = websites; shouldUpdateProfile = true; }

    if (shouldUpdateProfile) {
      await axios.post(
        `https://graph.facebook.com/v23.0/${phoneId}/whatsapp_business_profile`,
        payload,
        { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
      );
    }

    // 2. About Text update (Status)
    if (about !== undefined && about !== account.about) {
      await axios.post(
        `https://graph.facebook.com/v23.0/${phoneId}/settings`,
        { 
          messaging_product: "whatsapp", // <-- Yahan bhi zaroori hai
          about: about 
        },
        { headers: { Authorization: `Bearer ${account.access_token}` } }
      );
    }

    // 3. DISPLAY NAME Update (Meta Review Required)
    if (verified_name && verified_name !== account.verified_name) {
      await axios.post(
        `https://graph.facebook.com/v23.0/${phoneId}`,
        { 
          messaging_product: "whatsapp", // <-- Yahan bhi zaroori hai
          verified_name: verified_name 
        },
        { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
      );
      account.name_status = "PENDING_REVIEW"; // Automatically set to pending
    }

    // Update DB
    if (description !== undefined) account.description = description;
    if (address !== undefined) account.address = address;
    if (email !== undefined) account.email = email;
    if (websites !== undefined) account.websites = websites;
    if (about !== undefined) account.about = about;
    if (verified_name !== undefined) account.verified_name = verified_name;
    
    await account.save();

    res.status(200).json({ success: true, message: "Profile details updated successfully!", profile: account });
  } catch (error) {
    console.error("Update Profile Error:", error.response?.data || error.message);
    const metaError = error.response?.data?.error?.message || error.response?.data?.error?.error_user_msg;
    res.status(400).json({ error: metaError || "Failed to update profile details." });
  }
};

// ==========================================
// 14. UPDATE PROFILE PHOTO ONLY (Meta + DB Sync)
// ==========================================
export const updateWaProfilePhoto = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    if (!req.file) return res.status(400).json({ error: "Please upload an image file." });

    // Step A: Image ko Meta Media endpoint par upload karke File Handle lein
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("file", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });

    const mediaRes = await axios.post(
      `https://graph.facebook.com/v23.0/${phoneId}/media`,
      form,
      { headers: { ...form.getHeaders(), Authorization: `Bearer ${account.access_token}` } }
    );

    const fileHandle = mediaRes.data.id;

    // Step B: File Handle ko WhatsApp Business Profile mein set karein
    await axios.post(
      `https://graph.facebook.com/v23.0/${phoneId}/whatsapp_business_profile`,
      { profile_picture: fileHandle },
      { headers: { Authorization: `Bearer ${account.access_token}`, "Content-Type": "application/json" } }
    );

    // Step C: Naya profile_picture_url fetch karein aur DB me update karein
    const profileRes = await axios.get(
      `https://graph.facebook.com/v23.0/${phoneId}/whatsapp_business_profile?fields=profile_picture_url`,
      { headers: { Authorization: `Bearer ${account.access_token}` } }
    );

    const newUrl = profileRes.data.data[0]?.profile_picture_url;
    if (newUrl) {
      account.profile_picture_url = newUrl;
      await account.save();
    }

    res.status(200).json({ 
      success: true, 
      message: "Profile photo updated successfully!", 
      profile_picture_url: account.profile_picture_url 
    });
  } catch (error) {
    console.error("Update Photo Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to update profile photo." });
  }
};



// ==========================================
// 15. UPDATE CHAT USER NAME
// ==========================================
export const updateWaConversationName = async (req, res) => {
  try {
    const { convId } = req.params;
    const { customer_name } = req.body;
    
    if (!customer_name || customer_name.trim() === "") {
      return res.status(400).json({ error: "Name cannot be empty." });
    }

    const updatedConversation = await WhatsAppConversation.findByIdAndUpdate(
      convId,
      { customer_name: customer_name.trim() },
      { new: true }
    );

    if (!updatedConversation) return res.status(404).json({ error: "Conversation not found" });

    res.status(200).json({ success: true, conversation: updatedConversation });
  } catch (error) {
    console.error("Update Name Error:", error);
    res.status(500).json({ error: "Failed to update conversation name." });
  }
};



// ==========================================
// UPDATE TEMPLATE PURPOSE (INTERNAL DB ONLY)
// ==========================================
export const updateTemplatePurpose = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { purpose } = req.body;
    const userId = req.user._id;
    console.log("hit - - - - - - - - -- - - - - -")

    // Validation
    if (!templateId) {
      return res.status(400).json({ error: "Template ID is required." });
    }

    if (purpose === undefined) {
      return res.status(400).json({ error: "Purpose text is required." });
    }

    // Find template and update only the purpose field
    const updatedTemplate = await WhatsAppTemplate.findOneAndUpdate(
      { _id: templateId, userId: userId }, // Ensure user owns the template
      { $set: { purpose: purpose.trim() } },
      { new: true } // Returns the updated document
    );

    if (!updatedTemplate) {
      return res.status(404).json({ error: "Template not found or you don't have permission to edit it." });
    }

    res.status(200).json({ 
      success: true, 
      message: "Template purpose updated successfully.",
      template: updatedTemplate 
    });

  } catch (error) {
    console.error("Error updating template purpose:", error);
    res.status(500).json({ error: "Internal server error while updating purpose." });
  }
};



// ==========================================
// DELETE WHATSAPP TEMPLATE
// ==========================================
export const deleteWhatsAppTemplate = async (req, res) => {
  try {
    const { phoneId, id } = req.params; // 'id' is your local MongoDB _id for the template
    const userId = req.user._id;

    // 1. Find the template in local Database first to get its 'name'
    const template = await WhatsAppTemplate.findOne({ _id: id, phone_number_id: phoneId, userId });
    
    if (!template) {
      return res.status(404).json({ error: "Template not found in local database." });
    }

    // 2. Get the WhatsApp Account to retrieve the access token and WABA ID
    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    
    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    const { waba_id, access_token } = account;
    const templateName = template.name;

    // 3. Call Meta API to delete the template
    // Note: Meta deletes templates by 'name'. This will delete all language versions of this template.
    try {
      await axios.delete(
        `https://graph.facebook.com/v25.0/${waba_id}/message_templates`,
        {
          params: { name: templateName },
          headers: { Authorization: `Bearer ${access_token}` }
        }
      );
    } catch (metaError) {
      // If Meta throws an error, we catch it here.
      // Sometimes the template might already be deleted on Meta, but exists locally.
      // We check if the error is specifically about it not existing, otherwise we throw.
      const metaErrMsg = metaError.response?.data?.error?.message || "";
      if (!metaErrMsg.toLowerCase().includes("does not exist")) {
        console.error("Meta API Delete Error:", metaError.response?.data || metaError.message);
        return res.status(500).json({ 
          error: metaError.response?.data?.error?.error_user_msg || metaErrMsg || "Failed to delete template on Meta." 
        });
      }
    }

    // 4. Delete from local MongoDB
    // Since Meta deletes ALL templates with this name, it's best practice to delete all local copies with this name
    await WhatsAppTemplate.deleteMany({ phone_number_id: phoneId, name: templateName, userId });

    res.status(200).json({ 
      success: true, 
      message: `Template '${templateName}' deleted successfully.` 
    });

  } catch (error) {
    console.error("Delete Template Error:", error);
    res.status(500).json({ error: "Internal server error while deleting template." });
  }
};












export const subscribeWabaApp = async (req, res) => {
  try {
    // Route parameter ka naam kuch bhi ho (accountId ya phoneId), value yahan aayegi
    const { accountId } = req.params; 

    // 🟢 FIX: findById() ki jagah findOne() use karein aur phone_number_id se match karein
    const account = await WhatsAppAccount.findOne({ phone_number_id: accountId });
    
    if (!account) {
      return res.status(404).json({ 
        success: false, 
        message: "WhatsApp Account database mein nahi mila." 
      });
    }

    // WABA ID aur Token aapke schema se extract karein
    const WABA_ID = account.waba_id;
    const TOKEN = account.access_token;

    if (!WABA_ID || !TOKEN) {
      return res.status(400).json({ 
        success: false, 
        message: "Account mein WABA ID ya Access Token missing hai." 
      });
    }

    // Meta Graph API URL 
    const apiVersion = process.env.META_API_VERSION || "v23.0";
    const url = `https://graph.facebook.com/${apiVersion}/${WABA_ID}/subscribed_apps`;

    // Meta API ko POST request bhejein
    const metaResponse = await axios.post(
      url,
      {}, 
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
        },
      }
    );

    // Success Response frontend ko bhejein
    return res.status(200).json({
      success: true,
      message: "App successfully WABA par subscribe ho gayi hai! Webhooks ab aana shuru ho jayenge.",
      metaData: metaResponse.data,
    });

  } catch (error) {
    const errorMessage = error.response?.data || error.message;
    console.error("❌ App Subscription Error:", JSON.stringify(errorMessage, null, 2));

    return res.status(500).json({
      success: false,
      message: "Meta Graph API par app subscribe karne mein error aayi.",
      error: errorMessage,
    });
  }
};