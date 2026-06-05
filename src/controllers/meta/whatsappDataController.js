import axios from "axios";
import FormData from "form-data";
import WhatsAppAccount from "../../models/WhatsAppAccount.js";
import WhatsAppConversation from "../../models/WhatsAppConversation.js";
import WhatsAppMessage from "../../models/WhatsAppMessage.js";
import WhatsAppTemplate from "../../models/WhatsAppTemplate.js"; // Naya model import karein

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
export const createWhatsAppTemplate = async (req, res) => {
  try {
    console.log("req.body - - - - - - - - - - - - -",req.body)
    const { phoneId, name, category, language, headerText, bodyText, footerText, buttons } = req.body;
    const userId = req.user._id;

    // Database se waba_id nikalna
    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });

    if (!account || !account.waba_id) {
      return res.status(404).json({ error: "WhatsApp account or WABA ID not found." });
    }

    const { waba_id, access_token } = account;

    // Components array dynamically build karein
    const components = [];

    // Header (Optional)
    if (headerText && headerText.trim() !== '') {
      components.push({ type: 'HEADER', format: 'TEXT', text: headerText });
    }

    // Body (Required)
    const bodyComponent = { type: 'BODY', text: bodyText };
    
    // Check for variables {{1}}, {{2}} in body text
    const varMatches = bodyText.match(/\{\{\d+\}\}/g);
    let hasVariables = false;
    if (varMatches && varMatches.length > 0) {
      hasVariables = true;
      // Provide dummy examples for Meta validation
      const exampleValues = varMatches.map((v, index) => `Value ${index + 1}`);
      bodyComponent.example = { body_text: [exampleValues] };
    }
    components.push(bodyComponent);

    // Footer (Optional)
    if (footerText && footerText.trim() !== '') {
      components.push({ type: 'FOOTER', text: footerText });
    }

    // Buttons (Optional)
    if (buttons && buttons.length > 0) {
      const formattedButtons = buttons.map(btn => {
        if (btn.type === 'QUICK_REPLY') {
          return { type: 'QUICK_REPLY', text: btn.text };
        } else if (btn.type === 'URL') {
          return { type: 'URL', text: btn.text, url: btn.url };
        } else if (btn.type === 'PHONE_NUMBER') {
          return { type: 'PHONE_NUMBER', text: btn.text, phone_number: btn.phone_number };
        }
        return null;
      }).filter(Boolean);

      if (formattedButtons.length > 0) {
        components.push({ type: 'BUTTONS', buttons: formattedButtons });
      }
    }

    const templatePayload = {
      name: name,
      language: language,
      category: category,
      components: components
    };

    // Agar variables use huye hain toh Meta v23.0 requires parameter_format to be specified explicitly
    if (hasVariables) {
      templatePayload.parameter_format = "POSITIONAL"; // or "NAMED" depending on syntax
    }

    // Send to Meta Graph API
    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${waba_id}/message_templates`,
      templatePayload,
      { headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" } }
    );

    // ✅ SAVE TO DATABASE AFTER SUCCESS
    const newTemplate = new WhatsAppTemplate({
      userId,
      phone_number_id: phoneId,
      waba_id,
      meta_template_id: response.data.id,
      name: name,
      language: language,
      category: category,
      components: components,
      status: response.data.status || "PENDING"
    });

    await newTemplate.save();

    res.status(200).json({ 
      success: true, 
      message: "Template submitted and saved to database successfully!",
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
const resolveTemplateText = (template, variables = []) => {
  const bodyComponent = template.components.find(c => c.type === "BODY");
  if (!bodyComponent) return `[Template: ${template.name}]`;

  let text = bodyComponent.text;

  // {{1}}, {{2}} replace karo actual variable values se
  variables.forEach((val, index) => {
    text = text.replace(new RegExp(`\\{\\{${index + 1}\\}\\}`, "g"), val || "");
  });

  return text;
};



export const sendBulkWaTemplate = async (req, res) => {
  try {
    const { phoneId } = req.params;
    const { templateName, language, recipients } = req.body;
    const userId = req.user._id;

    const account = await WhatsAppAccount.findOne({ userId, phone_number_id: phoneId });
    if (!account) return res.status(404).json({ error: "WhatsApp account not found." });

    // Template ek baar fetch karo — sabke liye same template use hogi
    const template = await WhatsAppTemplate.findOne({ 
      phone_number_id: phoneId, 
      name: templateName 
    });
    if (!template) return res.status(404).json({ error: "Template not found." });

    const results = { total: recipients.length, success: 0, failed: 0, errors: [] };

    for (const rec of recipients) {
      try {
        // --- 1. Build Meta API payload ---
        const components = [];
        if (rec.variables && rec.variables.length > 0) {
          components.push({
            type: "body",
            parameters: rec.variables.map(val => ({
              type: "text",
              text: val || " ",
            })),
          });
        }

        const payload = {
          messaging_product: "whatsapp",
          to: rec.phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: components.length > 0 ? components : undefined,
          },
        };

        // --- 2. Send to Meta ---
        await axios.post(
          `https://graph.facebook.com/v23.0/${phoneId}/messages`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        // --- 3. Variables replace karke actual text banao ---
        // "Hello {{1}}, your order {{2}}" → "Hello Rahul, your order #123"
        const resolvedText = resolveTemplateText(template, rec.variables || []);

        // --- 4. Conversation find karo ya naya banao ---
        const conversationUpdate = {
          $set: {
            last_message: resolvedText, // actual text store hoga
            last_message_time: new Date(),
          },
          $setOnInsert: {
            phone_number_id: phoneId,
            customer_phone: rec.phone,
            customer_name: rec.name || "WA User",
            ai_enabled: true,
          },
        };

        if (rec.name) {
          conversationUpdate.$set.customer_name = rec.name;
        }

        const conversation = await WhatsAppConversation.findOneAndUpdate(
          { phone_number_id: phoneId, customer_phone: rec.phone },
          conversationUpdate,
          { upsert: true, new: true }
        );

        // --- 5. Message save karo actual text ke saath ---
        await WhatsAppMessage.create({
          conversation_id: conversation._id,
          sender_id: phoneId,
          receiver_id: rec.phone,
          text: resolvedText,         // "Hello Rahul, your order #123 is confirmed!"
          is_from_me: true,
          is_read: true,
          message_type: "template",
          template_name: templateName,
        });

        results.success++;
      } catch (err) {
        results.failed++;
        const errorMsg = err.response?.data?.error?.message || err.message || "Unknown error";
        results.errors.push({ phone: rec.phone, error: errorMsg });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk send done. Success: ${results.success}, Failed: ${results.failed}`,
      results,
    });

  } catch (error) {
    console.error("Bulk Send Error:", error);
    res.status(500).json({ error: "Failed to process bulk template sending." });
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

    // 4. Fetch Analytics from Meta Graph API
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${account.waba_id}/template_analytics`,
      {
        headers: { Authorization: `Bearer ${account.access_token}` },
        params: {
          start: startStr,
          end: endStr,
          granularity: "DAILY",
          template_ids: `[${dbTemplate.meta_template_id}]`
        }
      }
    );

    // 5. Aggregate metrics across all returned data points
    let totalSent = 0;
    let totalDelivered = 0;
    let totalRead = 0;

    const dataPoints = response.data.data?.[0]?.data_points || [];
    dataPoints.forEach(pt => {
        totalSent += pt.sent || 0;
        totalDelivered += pt.delivered || 0;
        totalRead += pt.read || 0;
    });

    res.status(200).json({ 
      success: true, 
      summary: { sent: totalSent, delivered: totalDelivered, read: totalRead },
      raw: dataPoints
    });

  } catch (error) {
    console.error("Meta Template Analytics Error:", error.response?.data || error.message);
    const metaError = error.response?.data?.error?.message;
    // Note: Template Insights error aane par clear message dena zaruri hai
    res.status(500).json({ error: metaError || "Failed to fetch analytics. Please check if Template Analytics is enabled in your Meta Dashboard." });
  }
};


// ==========================================
// 11. GET WABA INSIGHTS (Overview Analytics)
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

    // --- NEW LOGIC: Fetch Template IDs from DB ---
    // 1. Build query for templates
    const templateQuery = { userId, phone_number_id: phoneId, status: 'APPROVED' };

    // 2. Filter by category if a specific one is selected from Frontend
    if (category && category !== 'ALL') {
      templateQuery.category = category;
    }

    // 3. Fetch templates
    const templates = await WhatsAppTemplate.find(templateQuery);

    // 4. If no templates exist for this filter, return 0 directly without hitting Meta API
    if (templates.length === 0) {
      return res.status(200).json({ 
        success: true, 
        metrics: { delivered: 0, read: 0, readRate: 0, clicked: 0, clickRate: 0 }
      });
    }

    // 5. Extract just the meta_template_ids
    const templateIds = templates.map(t => t.meta_template_id).filter(Boolean);

    if (templateIds.length === 0) {
        return res.status(200).json({ 
        success: true, 
        metrics: { delivered: 0, read: 0, readRate: 0, clicked: 0, clickRate: 0 }
      });
    }

    // --- DATE LOGIC ---
    // Default to last 30 days if not provided
    if (!start || !end) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      start = startDate.toISOString().split('T')[0];
      end = endDate.toISOString().split('T')[0];
    }

    // --- META API CALL ---
    const response = await axios.get(
      `https://graph.facebook.com/v23.0/${account.waba_id}/template_analytics`,
      {
        headers: { Authorization: `Bearer ${account.access_token}` },
        params: { 
            start, 
            end, 
            granularity: "DAILY",
            template_ids: JSON.stringify(templateIds) // <-- FIX: Passing required template IDs
        }
      }
    );

    let delivered = 0;
    let read = 0;
    let clicked = 0;

    const dataPoints = response.data.data?.[0]?.data_points || [];
    
    dataPoints.forEach(pt => {
        delivered += pt.delivered || 0;
        read += pt.read || 0;
        clicked += pt.clicked || 0; 
    });

    const readRate = delivered > 0 ? ((read / delivered) * 100).toFixed(1) : 0;
    const clickRate = delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : 0;

    res.status(200).json({ 
      success: true, 
      metrics: { 
        delivered, 
        read, 
        readRate: parseFloat(readRate), 
        clicked, 
        clickRate: parseFloat(clickRate) 
      }
    });

  } catch (error) {
    console.error("Meta Insights Error:", error.response?.data || error.message);
    const metaErrorData = error.response?.data?.error;
    
    // Handle specific Insights Disabled Error
    if (metaErrorData?.error_subcode === 4182004) {
      return res.status(403).json({ 
        error: "Insights disabled. Please enable Template Insights in Meta WhatsApp Manager." 
      });
    }

    // Handle the Missing Template ID or other generic errors
    res.status(500).json({ error: metaErrorData?.message || "Failed to fetch account insights." });
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

    res.status(200).json({ success: true, profile: account });
  } catch (error) {
    console.error("Fetch Profile Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch WhatsApp profile details." });
  }
};

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