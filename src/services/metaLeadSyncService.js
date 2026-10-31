import axios from "axios";
import Lead from "../models/Lead.js";
import FacebookAccount from "../models/FacebookAccount.js";
import User from "../models/User.js";

const GRAPH_API_VERSION = "v25.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Normalizes phone numbers (removes non-digits, strips Indian 91 country code if 12 digits)
 */
export const normalizePhone = (num) => {
  if (!num) return "";
  const clean = String(num).replace(/\D/g, "");
  if (clean.length === 12 && clean.startsWith("91")) {
    return clean.substring(2);
  }
  return clean;
};

/**
 * Extracts standard and custom fields from Meta field_data array
 */
export const parseLeadFieldData = (fieldData = []) => {
  let name = "";
  let email = "";
  let phone = "";
  const customQuestions = {};

  if (!Array.isArray(fieldData)) {
    return { name, email, phone, customQuestions };
  }

  for (const item of fieldData) {
    const rawKey = (item.name || "").trim().toLowerCase();
    const rawVal = Array.isArray(item.values) ? item.values[0] : item.values;
    if (!rawVal) continue;

    const valStr = String(rawVal).trim();

    if (["full_name", "fullname", "name"].includes(rawKey)) {
      name = valStr;
    } else if (rawKey === "first_name") {
      name = name ? `${valStr} ${name}` : valStr;
    } else if (rawKey === "last_name") {
      name = name ? `${name} ${valStr}` : valStr;
    } else if (["email", "email_address", "work_email"].includes(rawKey)) {
      email = valStr.toLowerCase();
    } else if (["phone_number", "phone", "contact_number", "mobile", "mobile_number"].includes(rawKey)) {
      phone = valStr;
    } else {
      // Custom questions or other fields
      customQuestions[item.name] = valStr;
    }
  }

  return { name, email, phone, customQuestions };
};

/**
 * Subscribes a page to the Meta Leadgen webhook app
 */
export const subscribePageLeadgen = async (pageId, pageAccessToken) => {
  try {
    const res = await axios.post(
      `${META_GRAPH_BASE}/${pageId}/subscribed_apps`,
      null,
      {
        params: {
          access_token: pageAccessToken,
          subscribed_fields: "messages,messaging_postbacks,feed,leadgen",
        },
      }
    );
    console.log(`[MetaLeadSync] Subscribed webhook for Page ${pageId}:`, res.data);
    return true;
  } catch (err) {
    console.error(
      `[MetaLeadSync] Failed to subscribe webhook for Page ${pageId}:`,
      err.response?.data || err.message
    );
    return false;
  }
};

/**
 * Saves a Meta Lead into CRM with strict duplicate checks
 */
export const saveMetaLead = async ({
  leadData,
  pageId,
  companyId,
  userId,
  formName = "",
  io = null,
}) => {
  if (!leadData || !leadData.id) {
    return { status: "INVALID_DATA" };
  }

  const metaLeadId = String(leadData.id);

  // 1. Primary Duplicate Check: By metaLeadId
  const existingMetaLead = await Lead.findOne({
    companyId,
    metaLeadId,
  });

  if (existingMetaLead) {
    return {
      status: "SKIPPED_DUPLICATE",
      reason: "metaLeadId already exists",
      leadId: existingMetaLead._id,
      metaLeadId,
    };
  }

  // Parse fields
  const { name, email, phone, customQuestions } = parseLeadFieldData(leadData.field_data);
  const normalizedPhone = normalizePhone(phone);

  // 2. Secondary Duplicate Check: By Phone Number (within same company)
  if (normalizedPhone) {
    const existingPhoneLead = await Lead.findOne({
      companyId,
      phone: normalizedPhone,
    });
    if (existingPhoneLead) {
      return {
        status: "SKIPPED_DUPLICATE",
        reason: "phone already exists",
        leadId: existingPhoneLead._id,
        phone: normalizedPhone,
        metaLeadId,
      };
    }
  }

  // 3. Create New Lead
  const newLead = new Lead({
    companyId,
    createdBy: userId || undefined,
    updatedBy: userId || undefined,
    name: name || "Facebook Lead",
    email: email || "",
    phone: normalizedPhone || phone || "",
    source: "Facebook Ads",
    status: "New",
    priority: "Medium",
    metaLeadId,
    metaDetails: {
      formId: leadData.form_id || "",
      formName: formName || "",
      adId: leadData.ad_id || "",
      adName: leadData.ad_name || "",
      adsetId: leadData.adset_id || "",
      adsetName: leadData.adset_name || "",
      campaignId: leadData.campaign_id || "",
      campaignName: leadData.campaign_name || "",
      pageId: String(pageId || ""),
    },
    platformDetails: {
      platformAccountId: String(pageId || ""),
      facebookUsername: name || "",
    },
    data: {
      ...customQuestions,
      metaLeadId,
      metaAdName: leadData.ad_name || "",
      metaCampaignName: leadData.campaign_name || "",
      metaAdsetName: leadData.adset_name || "",
      metaFormId: leadData.form_id || "",
      metaPageId: String(pageId || ""),
      createdTimeOnMeta: leadData.created_time || null,
      rawFieldData: leadData.field_data || [],
    },
  });

  await newLead.save();

  // 4. Real-time alert via Socket.IO
  if (io) {
    io.emit("new_lead_received", {
      lead: newLead,
      source: "Facebook Ads",
      platform: "facebook",
    });

    io.emit("hot_lead_detected", {
      action: "facebook_ad_lead",
      leadName: newLead.name,
      platform: "Facebook Ads",
      summary: `New Lead from FB Ad: ${leadData.ad_name || leadData.campaign_name || "Instant Form"}`,
    });
  }

  return {
    status: "CREATED",
    lead: newLead,
  };
};

/**
 * Fetches single lead payload from Meta Graph API
 */
export const fetchLeadFromGraph = async (leadgenId, pageAccessToken) => {
  const fields = [
    "id",
    "created_time",
    "ad_id",
    "ad_name",
    "adset_id",
    "adset_name",
    "campaign_id",
    "campaign_name",
    "form_id",
    "field_data",
  ].join(",");

  const res = await axios.get(`${META_GRAPH_BASE}/${leadgenId}`, {
    params: {
      access_token: pageAccessToken,
      fields,
    },
  });
  return res.data;
};

/**
 * Syncs all past leads for a specific Facebook Page
 */
export const syncLeadsForPage = async ({ pageRecord, companyId, userId, io = null }) => {
  const pageId = pageRecord.page_id;
  const pageToken = pageRecord.access_token;

  if (!pageToken || !pageId) {
    return {
      success: false,
      error: `Missing token or pageId for page ${pageRecord.page_name || pageId}`,
    };
  }

  // Ensure webhook subscription is active
  await subscribePageLeadgen(pageId, pageToken);

  let formsScanned = 0;
  let totalFetched = 0;
  let syncedCount = 0;
  let skippedCount = 0;

  try {
    // 1. Fetch all Lead Forms under this Page
    const formsRes = await axios.get(`${META_GRAPH_BASE}/${pageId}/leadgen_forms`, {
      params: {
        access_token: pageToken,
        fields: "id,name,status,leads_count",
        limit: 100,
      },
    });

    const forms = formsRes.data?.data || [];
    formsScanned = forms.length;

    console.log(`[MetaLeadSync] Found ${forms.length} forms for page ${pageRecord.page_name || pageId}`);

    // 2. Fetch leads for each form
    for (const form of forms) {
      try {
        let nextPageUrl = `${META_GRAPH_BASE}/${form.id}/leads`;
        let params = {
          access_token: pageToken,
          fields: "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data",
          limit: 100,
        };

        while (nextPageUrl) {
          const leadsRes = await axios.get(nextPageUrl, { params });
          const leadsBatch = leadsRes.data?.data || [];
          totalFetched += leadsBatch.length;

          for (const leadData of leadsBatch) {
            const result = await saveMetaLead({
              leadData,
              pageId,
              companyId,
              userId,
              formName: form.name,
              io,
            });

            if (result.status === "CREATED") {
              syncedCount++;
            } else if (result.status === "SKIPPED_DUPLICATE") {
              skippedCount++;
            }
          }

          // Handle Meta pagination
          if (leadsRes.data?.paging?.next) {
            nextPageUrl = leadsRes.data.paging.next;
            params = {}; // URL already contains query params
          } else {
            nextPageUrl = null;
          }
        }
      } catch (formErr) {
        console.error(
          `[MetaLeadSync] Error fetching leads for form ${form.id}:`,
          formErr.response?.data || formErr.message
        );
      }
    }

    return {
      success: true,
      pageId,
      pageName: pageRecord.page_name,
      formsScanned,
      totalFetched,
      syncedCount,
      skippedCount,
    };
  } catch (err) {
    console.error(
      `[MetaLeadSync] Error syncing page ${pageId}:`,
      err.response?.data || err.message
    );
    return {
      success: false,
      pageId,
      pageName: pageRecord.page_name,
      error: err.response?.data?.error?.message || err.message,
      formsScanned,
      totalFetched,
      syncedCount,
      skippedCount,
    };
  }
};

