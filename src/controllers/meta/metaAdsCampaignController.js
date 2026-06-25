import axios from "axios";
import FormData from "form-data";
import MetaAdAccount from "../../models/MetaAdAccount.js";
import MetaAdCampaign from "../../models/MetaAdCampaign.js";
import FacebookAccount from "../../models/FacebookAccount.js";
import mongoose from "mongoose";

const META_API = "https://graph.facebook.com/v25.0";

export const getLinkedPages = async (req, res) => {
  try {
    const userId = req.user._id;
    const pages = await FacebookAccount.find({
      userId: userId,
      page_id: { $exists: true, $ne: null },
    }).select("-access_token -v");

    return res.status(200).json({ success: true, pages });
  } catch (error) {
    console.error("Fetch Pages Error:", error.message);
    return res
      .status(500)
      .json({ error: "Failed to fetch linked Facebook Pages." });
  }
};

export const createFullCampaign = async (req, res) => {
  try {
    // 🔥 FIX: User ID ko string me convert kiya taaki DB query fail na ho
    const userId = req.user._id.toString();

    if (!req.body.data) {
      return res.status(400).json({ error: "No campaign data provided." });
    }
    const formData = JSON.parse(req.body.data);

    const {
      adAccountId,
      campaignName,
      campaignObjective,
      budgetStrategy,
      budgetType,
      dailyBudget,
      is_adset_budget_sharing_enabled,
      pageId,
      websiteUrl,
      adText,
      headline,
      callToAction,
      imageUrl,
      selectedLocations,
      minAge,
      maxAge,
      isExistingPost,
      existingPostId,
      bidStrategy,
      bidAmount,
      hasSpendLimits,
      spendLimitType,
      spendLimitMin,
      spendLimitMax,
      adSetName,
      adSetStartDate,
      leadForm 
    } = formData;

    console.log("$$$ Parsed Payload received from frontend:", formData);

    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    const accountRecord = await MetaAdAccount.findOne({ userId: req.user._id, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({
        error: "Access Token not found. Please sync your account again.",
      });
    }
    const token = accountRecord.userAccessToken;

    // --- CREATE LEAD GENERATION FORM (IF OBJECTIVE IS LEADS) ---
   // --- CREATE LEAD GENERATION FORM (IF OBJECTIVE IS LEADS) ---
  
// --- CREATE LEAD GENERATION FORM (IF OBJECTIVE IS LEADS) ---
    let leadFormId = null;
    if (campaignObjective === "OUTCOME_LEADS" && leadForm && !isExistingPost) {
      console.log("Creating Meta Lead Generation Form...");
      
      const pageRecord = await FacebookAccount.findOne({ page_id: pageId, userId });
      
      if (!pageRecord || !pageRecord.access_token) {
         console.error("Page Access Token missing in DB for Page ID:", pageId);
         return res.status(400).json({ error: "Page Access Token is missing. Please disconnect and reconnect your Facebook Page." });
      }

      const pageToken = pageRecord.access_token;
      let questionsPayload = [];

      // Add Custom Questions
      if (leadForm.questions?.customQuestions && leadForm.questions.customQuestions.length > 0) {
        leadForm.questions.customQuestions.forEach(q => {
          let qObj = { type: "CUSTOM", label: q.question };
          if (q.type === 'MULTIPLE_CHOICE' && q.options) {
            qObj.options = q.options.filter(o => o.trim()).map(opt => ({ value: opt }));
          }
          questionsPayload.push(qObj);
        });
      }

      // Add Prefill Questions (Email, Full Name, etc.)
      if (leadForm.questions?.prefill && leadForm.questions.prefill.length > 0) {
        leadForm.questions.prefill.forEach(prefillType => {
          // 🔥 FIX 1: Ensure type is strictly uppercase (e.g., 'email' -> 'EMAIL')
          questionsPayload.push({ type: String(prefillType).toUpperCase() });
        });
      }

      // Meta strictly requires at least 1 question. Fallback added.
      if (questionsPayload.length === 0) {
         questionsPayload.push({ type: "FULL_NAME" }, { type: "EMAIL" });
      }

      // 🔥 FIX 2: Meta API strictly requires complex nested fields to be STRINGIFIED.
      const formPayload = {
        name: leadForm.name || "Lead Generation Form",
        form_type: leadForm.form_type || "MORE_VOLUME", 
        access_token: pageToken,
        privacy_policy: JSON.stringify({
          url: leadForm.privacyPolicy.url,
          link_text: leadForm.privacyPolicy.linkText || "Privacy Policy"
        }),
        questions: JSON.stringify(questionsPayload), // Stringified Array
      };

      // Handle custom headline for the questions page if provided
      if (leadForm.questions?.message) {
         formPayload.question_page_custom_headline = leadForm.questions.message;
      }

      // Add Context Card (Intro)
      if (leadForm.intro?.useGreeting) {
        formPayload.context_card = JSON.stringify({
          style: "PARAGRAPH_STYLE",
          title: leadForm.intro.headline || "Welcome",
          content: [leadForm.intro.description || "Please provide your details below."],
          button_text: "Next" 
        }); // Stringified Object
      }

      // Add Thank You Page (Completion)
      if (leadForm.ending) {
        formPayload.thank_you_page = JSON.stringify({
          title: leadForm.ending.headline || "Thanks, you're all set.",
          body: leadForm.ending.description || "You can visit our website or exit the form now.",
          button_type: "VIEW_WEBSITE",
          button_text: leadForm.ending.buttonText || "View website",
          // 🔥 FIX 3: Fallback explicitly defined to prevent empty URL crashes
          website_url: leadForm.ending.websiteUrl || websiteUrl || "https://facebook.com"
        }); // Stringified Object
      }

      const formRes = await axios.post(`${META_API}/${pageId}/leadgen_forms`, formPayload);
      
      leadFormId = formRes.data.id;
      console.log("Lead Form Created! ID:", leadFormId);
    }
    // --- MEDIA UPLOAD ---
    let metaImageHash = null;
    let metaVideoId = null;

    if (!isExistingPost && req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");

      if (isVideo) {
        console.log("Uploading Video to Meta...");
        const form = new FormData();
        form.append("access_token", token);
        form.append("source", req.file.buffer, {
          filename: req.file.originalname,
          contentType: req.file.mimetype,
        });

        const videoRes = await axios.post(`${META_API}/${actId}/advideos`, form, { headers: form.getHeaders() });
        metaVideoId = videoRes.data.id;
        console.log("Video Uploaded! ID:", metaVideoId);
      } else {
        console.log("Uploading Image to Meta via Base64...");
        const base64Image = req.file.buffer.toString("base64");
        
        const imageRes = await axios.post(`${META_API}/${actId}/adimages`, {
          bytes: base64Image,
          access_token: token,
        });
        
        const imageKeys = Object.keys(imageRes.data.images);
        metaImageHash = imageRes.data.images[imageKeys[0]].hash;
        console.log("Image Uploaded! Hash:", metaImageHash);
      }
    }

    const finalObjective = campaignObjective || "OUTCOME_TRAFFIC";
    
    let optimizationGoal = "LINK_CLICKS"; 
    if (finalObjective === "OUTCOME_AWARENESS") optimizationGoal = "REACH";
    if (finalObjective === "OUTCOME_ENGAGEMENT") optimizationGoal = "POST_ENGAGEMENT";
    if (finalObjective === "OUTCOME_LEADS") optimizationGoal = "LEAD_GENERATION";

    // --- CREATE CAMPAIGN ---
    const campaignPayload = {
      name: campaignName,
      objective: finalObjective,
      status: "PAUSED",
      special_ad_categories: [],
      access_token: token,
    };

    if (budgetStrategy === "campaign_budget") {
      campaignPayload.bid_strategy = bidStrategy || "LOWEST_COST_WITHOUT_CAP";
      
      if (budgetType === "daily_budget") {
        campaignPayload.daily_budget = dailyBudget * 100;
      } else {
        campaignPayload.lifetime_budget = dailyBudget * 100;
      }
    } else {
      campaignPayload.is_adset_budget_sharing_enabled = Boolean(is_adset_budget_sharing_enabled);
      
      if (is_adset_budget_sharing_enabled) {
        campaignPayload.bid_strategy = bidStrategy || "LOWEST_COST_WITHOUT_CAP";
      }
    }

    const campaignRes = await axios.post(`${META_API}/${actId}/campaigns`, campaignPayload);
    const campaignId = campaignRes.data.id;

    // --- CREATE AD SET ---
    const countries = selectedLocations && selectedLocations.length > 0
      ? selectedLocations.filter(loc => loc.type === "country").map(loc => loc.id || "IN")
      : ["IN"];

    const targetingPayload = {
      geo_locations: { countries: countries.length > 0 ? countries : ["IN"] },
      age_min: minAge || 18,
      age_max: maxAge || 65,
      targeting_automation: { advantage_audience: 1 }
    };

    const adSetPayload = {
      name: adSetName || `${campaignName} - AdSet`,
      campaign_id: campaignId,
      billing_event: "IMPRESSIONS",
      optimization_goal: optimizationGoal,
      targeting: targetingPayload,
      status: "PAUSED",
      access_token: token,
      start_time: adSetStartDate ? new Date(adSetStartDate).toISOString() : new Date().toISOString()
    };

    if (budgetStrategy === "ad_set_budget") {
      if (budgetType === "daily_budget") {
        adSetPayload.daily_budget = dailyBudget * 100;
      } else {
        adSetPayload.lifetime_budget = dailyBudget * 100;
      }
      adSetPayload.bid_strategy = bidStrategy || "LOWEST_COST_WITHOUT_CAP";
    }

    const cappedStrategies = ["LOWEST_COST_WITH_BID_CAP", "COST_CAP", "BID_CAP"];
    if (cappedStrategies.includes(bidStrategy)) {
      if (bidAmount) {
        adSetPayload.bid_amount = bidAmount * 100; // INR to Paise
      } else {
        return res.status(400).json({ error: `Meta API Error: 'bidAmount' is required when using ${bidStrategy} strategy.` });
      }
    }

    const adSetRes = await axios.post(`${META_API}/${actId}/adsets`, adSetPayload);
    const adSetId = adSetRes.data.id;

    // --- CREATE AD CREATIVE ---
    let creativeId = null;

    if (isExistingPost && existingPostId) {
      const creativeRes = await axios.post(`${META_API}/${actId}/adcreatives`, {
        name: formData.adName || `${campaignName} - Creative`,
        object_story_id: `${pageId}_${existingPostId}`,
        access_token: token,
      });
      creativeId = creativeRes.data.id;
    } else {
      let object_story_spec = { page_id: pageId };

      const targetLink = leadFormId ? "http://fb.me/" : websiteUrl;

      if (metaVideoId) {
        object_story_spec.video_data = {
          video_id: metaVideoId,
          call_to_action: {
            type: callToAction || "LEARN_MORE",
            value: { link: targetLink }
          },
          message: adText,
          title: headline
        };
        if (leadFormId) {
           object_story_spec.video_data.call_to_action.value.lead_gen_form_id = leadFormId;
        }
      } else {
        const pictureData = metaImageHash ? { image_hash: metaImageHash } : { picture: imageUrl };
        object_story_spec.link_data = {
          link: targetLink,
          message: adText,
          name: headline,
          call_to_action: {
             type: callToAction || "LEARN_MORE",
             value: { link: targetLink }
          },
          ...pictureData
        };
        if (leadFormId) {
           object_story_spec.link_data.call_to_action.value.lead_gen_form_id = leadFormId;
        }
      }

      const creativeRes = await axios.post(`${META_API}/${actId}/adcreatives`, {
        name: formData.adName || `${campaignName} - Creative`,
        object_story_spec: object_story_spec,
        access_token: token,
      });
      creativeId = creativeRes.data.id;
    }

    // --- PUBLISH ACTUAL AD ---
    const adRes = await axios.post(`${META_API}/${actId}/ads`, {
      name: formData.adName || `${campaignName} - Final Ad`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
      access_token: token,
    });

    // --- SAVE TO DB ---
    const newCampaign = new MetaAdCampaign({
      userId: req.user._id,
      adAccountId,
      campaignId,
      adSetId,
      creativeId,
      adId: adRes.data.id,
      campaignName,
      budget: dailyBudget,
      websiteUrl,
    });
    await newCampaign.save();

    return res.status(201).json({
      success: true,
      message: "Campaign Created Successfully!",
      data: newCampaign,
    });
  } catch (error) {
    console.error("Meta API Creation Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || error.response?.data?.error?.error_user_msg || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

export const getPagePosts = async (req, res) => {
  try {
    const { pageId } = req.params;
    const userId = req.user._id;

    const account = await FacebookAccount.findOne({ page_id: pageId, userId });
    if (!account) return res.status(404).json({ error: "Account not found" });

    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${pageId}/posts`,
      {
        params: {
          fields:
            "id,message,full_picture,permalink_url,created_time,is_eligible_for_promotion",
          access_token: account.access_token,
        },
      },
    );

    const allPosts = response.data.data || [];
    const promotablePosts = allPosts.filter(
      (post) => post.is_eligible_for_promotion === true,
    );

    res.status(200).json({ posts: promotablePosts });
  } catch (error) {
    console.error("Fetch Posts Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch page posts" });
  }
};

export const updateCampaignStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId, campaignId, status } = req.body; 

    if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status provided." });
    }

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    await axios.post(`${META_API}/${campaignId}`, {
      status: status,
      access_token: token,
    });

    const updatedCampaign = await MetaAdCampaign.findOneAndUpdate(
      { campaignId: campaignId, userId: userId },
      { status: status },
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: `Campaign status updated to ${status}`,
      data: updatedCampaign,
    });
  } catch (error) {
    console.error("Update Status Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

export const modifyCampaign = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId, campaignId, objective, dailyBudget } = req.body;

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    const payload = { access_token: token };
    if (objective) payload.objective = objective;
    if (dailyBudget) payload.daily_budget = dailyBudget * 100;

    await axios.post(`${META_API}/${campaignId}`, payload);

    const updatedCampaign = await MetaAdCampaign.findOneAndUpdate(
      { campaignId: campaignId, userId: userId },
      { budget: dailyBudget }, 
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: "Campaign modified successfully",
      data: updatedCampaign,
    });
  } catch (error) {
    console.error("Modify Campaign Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId } = req.body;
    const { campaignId } = req.params;

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    await axios.delete(`${META_API}/${campaignId}`, {
      data: { access_token: token },
    });

    await MetaAdCampaign.findOneAndDelete({
      campaignId: campaignId,
      userId: userId,
    });

    return res.status(200).json({
      success: true,
      message: "Campaign permanently deleted.",
    });
  } catch (error) {
    console.error("Delete Campaign Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

export const getAllCampaigns = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId } = req.query;

    if (!adAccountId) {
      return res.status(400).json({
        success: false,
        message: "adAccountId is required",
      });
    }

    const existingCampaigns = await MetaAdCampaign.find({
      userId,
      adAccountId,
    })
      .select("campaignId campaignName status objective buying_type created_time")
      .sort({ createdAt: -1 })
      .lean();

    if (existingCampaigns.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Campaigns fetched successfully",
        campaigns: existingCampaigns,
        count: existingCampaigns.length,
      });
    }

    const metaAdAccount = await MetaAdAccount.findOne({
      userId,
      adAccountId,
    }).select("adAccountId userAccessToken");

    if (!metaAdAccount) {
      return res.status(404).json({
        success: false,
        message: "No linked Meta Ad Account found for this user.",
      });
    }

    const { data } = await axios.get(
      `${META_API}/${metaAdAccount.adAccountId}/campaigns`,
      {
        params: {
          fields: "id,name,status,objective,buying_type,created_time",
          access_token: metaAdAccount.userAccessToken,
        },
      }
    );

    const campaigns = data?.data || [];

    if (campaigns.length > 0) {
      await MetaAdCampaign.bulkWrite(
        campaigns.map((camp) => ({
          updateOne: {
            filter: {
              userId,
              adAccountId: metaAdAccount.adAccountId,
              campaignId: camp.id,
            },
            update: {
              $set: {
                userId,
                adAccountId: metaAdAccount.adAccountId,
                campaignId: camp.id,
                campaignName: camp.name,
                status: camp.status,
                objective: camp.objective,
                buying_type: camp.buying_type,
                created_time: camp.created_time,
              },
            },
            upsert: true,
          },
        })),
      );
    }

    const savedCampaigns = await MetaAdCampaign.find({
      userId,
      adAccountId,
    })
      .select("campaignId campaignName status objective buying_type created_time")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Campaigns fetched successfully",
      campaigns: savedCampaigns,
      count: savedCampaigns.length,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns",
      error: error.response?.data?.error?.message || error.message,
    });
  }
};

export const syncWithMeta = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId } = req.query;

    const metaAdAccount = await MetaAdAccount.findOne({
      userId,
      adAccountId,
    }).select("adAccountId userAccessToken");

    if (!metaAdAccount) {
      return res.status(404).json({
        success: false,
        message: "No linked Meta Ad Account found for this user.",
      });
    }

    const { data } = await axios.get(
      `${META_API}/${metaAdAccount.adAccountId}/campaigns`,
      {
        params: {
          fields: "id,name,status,objective,buying_type,created_time",
          access_token: metaAdAccount.userAccessToken,
        },
      }
    );

    const campaigns = data?.data || [];

    if (campaigns.length > 0) {
      await MetaAdCampaign.bulkWrite(
        campaigns.map((camp) => ({
          updateOne: {
            filter: {
              userId,
              adAccountId: metaAdAccount.adAccountId,
              campaignId: camp.id,
            },
            update: {
              $set: {
                userId,
                adAccountId: metaAdAccount.adAccountId,
                campaignId: camp.id,
                campaignName: camp.name,
                status: camp.status,
                objective: camp.objective,
                buying_type: camp.buying_type,
                created_time: camp.created_time,
              },
            },
            upsert: true,
          },
        })),
      );
    }

    const savedCampaigns = await MetaAdCampaign.find({
      userId,
      adAccountId,
    })
      .select("campaignId campaignName status objective buying_type created_time")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Campaigns fetched successfully",
      campaigns: savedCampaigns,
      count: savedCampaigns.length,
    });
  } catch (error) {
    console.log("Something went wrong!", error);
    return res.status(500).json({
      message: "Something went wrong while syncing with meta",
      success: false,
    });
  }
};