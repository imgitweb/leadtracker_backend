import axios from "axios";
import mongoose from "mongoose";
import FormData from "form-data";
import MetaAdAccount from "../../models/MetaAdAccount.js";
import MetaAdSet from "../../models/metaAdsetsModel.js";
import MetaAd from "../../models/metaAds.js";
import FacebookAccount from "../../models/FacebookAccount.js"; // Required for Lead Forms page token

const META_API = `https://graph.facebook.com/v25.0`;

// ==========================================
// FETCH AD SETS FOR A CAMPAIGN
// ==========================================
export const getCampaignAdSets = async (req, res) => {
  try {
    const userId = req.user._id;
    const { campaignId, adAccountId } = req.query;

    if (!campaignId || !adAccountId) {
      return res.status(400).json({
        success: false,
        message: "campaignId and adAccountId are required",
      });
    }

    const metaAdAccount = await MetaAdAccount.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      adAccountId,
    }).select("adAccountId userAccessToken");

    if (!metaAdAccount) {
      return res.status(404).json({
        success: false,
        message: "Meta Ad Account not found",
      });
    }

    const response = await axios.get(`${META_API}/${campaignId}/adsets`, {
      params: {
        fields: "id,name,status,campaign_id,daily_budget,lifetime_budget,billing_event,optimization_goal,targeting,created_time,start_time,end_time",
        access_token: metaAdAccount.userAccessToken,
      },
    });

    const adSets = response.data.data || [];

    if (adSets.length) {
      await MetaAdSet.bulkWrite(
        adSets.map((adSet) => ({
          updateOne: {
            filter: { adSetId: adSet.id },
            update: {
              $set: {
                userId,
                adAccountId: metaAdAccount.adAccountId,
                campaignId: adSet.campaign_id || campaignId,
                adSetId: adSet.id,
                adSetName: adSet.name,
                status: adSet.status,
                dailyBudget: adSet.daily_budget || 0,
                lifetimeBudget: adSet.lifetime_budget || 0,
                billingEvent: adSet.billing_event,
                optimizationGoal: adSet.optimization_goal,
                targeting: adSet.targeting,
                createdTime: adSet.created_time,
                startTime: adSet.start_time,
                endTime: adSet.end_time,
                metaData: adSet,
              },
            },
            upsert: true,
          },
        })),
      );
    }

    const savedAdSets = await MetaAdSet.find({
      userId: new mongoose.Types.ObjectId(userId),
      campaignId,
    }).select("-metaData -v");

    return res.status(200).json({
      success: true,
      count: savedAdSets.length,
      adSets: savedAdSets,
    });
  } catch (error) {
    console.error("Get ad sets error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ad sets",
      error: error.response?.data?.error?.message || error.message,
    });
  }
};

// ==========================================
// FETCH ADS FOR AN AD SET
// ==========================================
export const getAdSetAds = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adSetId, adAccountId } = req.query;

    if (!adSetId || !adAccountId) {
      return res.status(400).json({
        success: false,
        message: "adSetId and adAccountId are required",
      });
    }

    const metaAdAccount = await MetaAdAccount.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      adAccountId,
    }).select("adAccountId userAccessToken");

    if (!metaAdAccount) {
      return res.status(404).json({
        success: false,
        message: "Meta Ad Account not found",
      });
    }

    const response = await axios.get(`${META_API}/${adSetId}/ads`, {
      params: {
        fields: "id,name,status,effective_status,adset_id,campaign_id,tracking_specs,creative{id,name,status,thumbnail_url,asset_feed_spec,body,actor_id}",
        access_token: metaAdAccount.userAccessToken,
        limit: 500,
      },
    });

    const ads = response.data?.data || [];

    if (ads.length) {
      await MetaAd.bulkWrite(
        ads.map((ad) => ({
          updateOne: {
            filter: { userId, adId: ad.id },
            update: {
              $set: {
                userId,
                adAccountId,
                campaignId: ad.campaign_id,
                adSetId: ad.adset_id,
                adId: ad.id,
                adName: ad.name,
                status: ad.status,
                effectiveStatus: ad.effective_status,
                creative: {
                  creativeId: ad.creative?.id,
                  name: ad.creative?.name,
                  status: ad.creative?.status,
                  thumbnailUrl: ad.creative?.thumbnail_url,
                  actorId: ad.creative?.actor_id,
                  body: ad.creative?.body,
                  assetFeedSpec: ad.creative?.asset_feed_spec || {},
                },
                trackingSpecs: ad.tracking_specs || [],
                metaData: ad,
              },
            },
            upsert: true,
          },
        })),
      );
    }

    const savedAds = await MetaAd.find({ userId, adSetId })
      .select("-metaData -__v")
      .lean();

    return res.status(200).json({
      success: true,
      count: savedAds.length,
      ads: savedAds,
    });
  } catch (error) {
    console.error("Get ads error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ads",
      error: error.response?.data?.error?.message || error.message,
    });
  }
};

// ==========================================
// CREATE AD SET INSIDE EXISTING CAMPAIGN
// ==========================================
export const createAdSet = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    // Support both FormData (JSON.parse) or raw JSON from frontend
    if (!req.body.data && Object.keys(req.body).length === 0) {
      return res.status(400).json({ error: "No ad set data provided." });
    }
    const formData = req.body.data ? JSON.parse(req.body.data) : req.body;

    const {
      adAccountId,
      campaignId,
      campaignObjective, 
      budgetStrategy,
      budgetType,
      dailyBudget,
      bidStrategy,
      bidAmount,
      adSetName,
      adSetStartDate,
      selectedLocations,
      minAge,
      maxAge,
    } = formData;

    if (!adAccountId || !campaignId || !adSetName) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    const accountRecord = await MetaAdAccount.findOne({ userId: req.user._id, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    const finalObjective = campaignObjective || "OUTCOME_TRAFFIC";
    let optimizationGoal = "LINK_CLICKS"; 
    if (finalObjective === "OUTCOME_AWARENESS") optimizationGoal = "REACH";
    if (finalObjective === "OUTCOME_ENGAGEMENT") optimizationGoal = "POST_ENGAGEMENT";
    if (finalObjective === "OUTCOME_LEADS") optimizationGoal = "LEAD_GENERATION";

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
      name: adSetName,
      campaign_id: campaignId,
      billing_event: "IMPRESSIONS",
      optimization_goal: optimizationGoal,
      targeting: targetingPayload,
      status: "PAUSED",
      access_token: token,
      start_time: adSetStartDate ? new Date(adSetStartDate).toISOString() : new Date().toISOString()
    };

    // 🔥 FIX: Apply budget only if strategy is Ad Set Level
    if (budgetStrategy === "ad_set_budget") {
      if (budgetType === "daily_budget") {
        adSetPayload.daily_budget = dailyBudget * 100;
      } else {
        adSetPayload.lifetime_budget = dailyBudget * 100;
      }
      adSetPayload.bid_strategy = bidStrategy || "LOWEST_COST_WITHOUT_CAP";

      const cappedStrategies = ["LOWEST_COST_WITH_BID_CAP", "COST_CAP", "BID_CAP"];
      if (cappedStrategies.includes(bidStrategy)) {
        if (bidAmount) {
          adSetPayload.bid_amount = bidAmount * 100; 
        } else {
          return res.status(400).json({ error: `Meta API Error: 'bidAmount' is required when using ${bidStrategy} strategy.` });
        }
      }
    }

    const adSetRes = await axios.post(`${META_API}/${actId}/adsets`, adSetPayload);
    const newAdSetId = adSetRes.data.id;

    // Save to Database
    const newAdSet = new MetaAdSet({
      userId,
      adAccountId,
      campaignId,
      adSetId: newAdSetId,
      adSetName,
      status: "PAUSED",
      dailyBudget: budgetStrategy === "ad_set_budget" ? dailyBudget : 0,
      lifetimeBudget: 0,      
      budget_remaining: 0,    
      billingEvent: "IMPRESSIONS",
      optimizationGoal,
      targeting: targetingPayload,
      createdTime: new Date().toISOString(),
    });

    await newAdSet.save();

    return res.status(201).json({
      success: true,
      message: "Ad Set Created Successfully!",
      data: newAdSet,
    });
  } catch (error) {
    console.error("Meta API AdSet Creation Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.error_user_msg || error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

// ==========================================
// CREATE SINGLE AD INSIDE EXISTING AD SET
// ==========================================
export const createAd = async (req, res) => {
  try {
    const userId = req.user._id.toString();

    if (!req.body.data) {
      return res.status(400).json({ error: "No ad data provided." });
    }
    const formData = JSON.parse(req.body.data);

    const {
      adAccountId,
      adSetId,
      campaignId,
      campaignObjective,
      pageId,
      websiteUrl,
      adText,
      headline,
      callToAction,
      imageUrl,
      isExistingPost,
      existingPostId,
      adName,
      leadForm 
    } = formData;

    const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

    const accountRecord = await MetaAdAccount.findOne({ userId: req.user._id, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    // --- CREATE LEAD GENERATION FORM ---
    let leadFormId = null;
    if (campaignObjective === "OUTCOME_LEADS" && leadForm && !isExistingPost) {
      const pageRecord = await FacebookAccount.findOne({ page_id: pageId, userId });
      if (!pageRecord || !pageRecord.access_token) {
         return res.status(400).json({ error: "Page Access Token is missing." });
      }

      const pageToken = pageRecord.access_token;
      let questionsPayload = [];

      if (leadForm.questions?.customQuestions) {
        leadForm.questions.customQuestions.forEach(q => {
          let qObj = { type: "CUSTOM", label: q.question };
          if (q.type === 'MULTIPLE_CHOICE' && q.options) {
            qObj.options = q.options.filter(o => o.trim()).map(opt => ({ value: opt }));
          }
          questionsPayload.push(qObj);
        });
      }

      if (leadForm.questions?.prefill) {
        leadForm.questions.prefill.forEach(prefillType => {
          questionsPayload.push({ type: String(prefillType).toUpperCase() });
        });
      }

      if (questionsPayload.length === 0) questionsPayload.push({ type: "FULL_NAME" }, { type: "EMAIL" });

      const formPayload = {
        name: leadForm.name || "Lead Generation Form",
        form_type: leadForm.form_type || "MORE_VOLUME", 
        access_token: pageToken,
        privacy_policy: JSON.stringify({
          url: leadForm.privacyPolicy.url,
          link_text: leadForm.privacyPolicy.linkText || "Privacy Policy"
        }),
        questions: JSON.stringify(questionsPayload),
      };

      if (leadForm.questions?.message) formPayload.question_page_custom_headline = leadForm.questions.message;

      if (leadForm.intro?.useGreeting) {
        formPayload.context_card = JSON.stringify({
          style: "PARAGRAPH_STYLE",
          title: leadForm.intro.headline || "Welcome",
          content: [leadForm.intro.description || "Please provide your details below."],
          button_text: "Next" 
        }); 
      }

      if (leadForm.ending) {
        formPayload.thank_you_page = JSON.stringify({
          title: leadForm.ending.headline || "Thanks.",
          body: leadForm.ending.description || "Exit the form now.",
          button_type: "VIEW_WEBSITE",
          button_text: leadForm.ending.buttonText || "View website",
          website_url: leadForm.ending.websiteUrl || websiteUrl || "https://facebook.com"
        });
      }

      const formRes = await axios.post(`${META_API}/${pageId}/leadgen_forms`, formPayload);
      leadFormId = formRes.data.id;
    }

    // --- MEDIA UPLOAD (MULTER SUPPORTED) ---
    let metaImageHash = null;
    let metaVideoId = null;

    if (!isExistingPost && req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");

      if (isVideo) {
        const form = new FormData();
        form.append("access_token", token);
        form.append("source", req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
        const videoRes = await axios.post(`${META_API}/${actId}/advideos`, form, { headers: form.getHeaders() });
        metaVideoId = videoRes.data.id;
      } else {
        const base64Image = req.file.buffer.toString("base64");
        const imageRes = await axios.post(`${META_API}/${actId}/adimages`, { bytes: base64Image, access_token: token });
        const imageKeys = Object.keys(imageRes.data.images);
        metaImageHash = imageRes.data.images[imageKeys[0]].hash;
      }
    }

    // --- CREATE AD CREATIVE ---
    let creativeId = null;

    if (isExistingPost && existingPostId) {
      const creativeRes = await axios.post(`${META_API}/${actId}/adcreatives`, {
        name: adName || `Creative - ${new Date().getTime()}`,
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
          call_to_action: { type: callToAction || "LEARN_MORE", value: { link: targetLink } },
          message: adText,
          title: headline
        };
        if (leadFormId) object_story_spec.video_data.call_to_action.value.lead_gen_form_id = leadFormId;
      } else {
        const pictureData = metaImageHash ? { image_hash: metaImageHash } : { picture: imageUrl };
        object_story_spec.link_data = {
          link: targetLink,
          message: adText,
          name: headline,
          call_to_action: { type: callToAction || "LEARN_MORE", value: { link: targetLink } },
          ...pictureData
        };
        if (leadFormId) object_story_spec.link_data.call_to_action.value.lead_gen_form_id = leadFormId;
      }

      const creativeRes = await axios.post(`${META_API}/${actId}/adcreatives`, {
        name: adName || `Creative - ${new Date().getTime()}`,
        object_story_spec: object_story_spec,
        access_token: token,
      });
      creativeId = creativeRes.data.id;
    }

    // --- PUBLISH ACTUAL AD ---
    const adRes = await axios.post(`${META_API}/${actId}/ads`, {
      name: adName || `Final Ad - ${new Date().getTime()}`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
      access_token: token,
    });

    const newAdId = adRes.data.id;

    // Save to Database
    const newAd = new MetaAd({
      userId,
      adAccountId,
      campaignId: campaignId || "", 
      adSetId,
      adId: newAdId,
      adName: adName,
      status: "PAUSED",
      effectiveStatus: "PAUSED",
      creative: { creativeId: creativeId },
    });

    await newAd.save();

    return res.status(201).json({
      success: true,
      message: "Ad Created Successfully!",
      data: newAd,
    });

  } catch (error) {
    console.error("Meta API Ad Creation Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.error_user_msg || error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

// ==========================================
// AD SET ACTIONS: UPDATE STATUS & DELETE
// ==========================================
export const updateAdSetStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId, adSetId, status } = req.body;

    if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status provided." });
    }

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }

    await axios.post(`${META_API}/${adSetId}`, {
      status: status,
      access_token: accountRecord.userAccessToken,
    });

    const updatedAdSet = await MetaAdSet.findOneAndUpdate(
      { adSetId: adSetId, userId: userId },
      { status: status },
      { new: true }
    );

    return res.status(200).json({ 
      success: true, 
      message: `Ad Set status updated to ${status}`,
      data: updatedAdSet 
    });
  } catch (error) {
    console.error("Update AdSet Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Failed to update Ad Set";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

export const deleteAdSet = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId } = req.body; 
    const { adSetId } = req.params;

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }

    await axios.delete(`${META_API}/${adSetId}`, {
      data: { access_token: accountRecord.userAccessToken },
    });

    await MetaAdSet.findOneAndDelete({ adSetId: adSetId, userId: userId });

    return res.status(200).json({ 
      success: true, 
      message: "Ad Set deleted successfully" 
    });
  } catch (error) {
    console.error("Delete AdSet Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Failed to delete Ad Set";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

// ==========================================
// AD ACTIONS: UPDATE STATUS & DELETE
// ==========================================
export const updateAdStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId, adId, status } = req.body;

    if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status provided." });
    }

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }

    await axios.post(`${META_API}/${adId}`, {
      status: status,
      access_token: accountRecord.userAccessToken,
    });

    const updatedAd = await MetaAd.findOneAndUpdate(
      { adId: adId, userId: userId },
      { status: status, effectiveStatus: status },
      { new: true }
    );

    return res.status(200).json({ 
      success: true, 
      message: `Ad status updated to ${status}`,
      data: updatedAd 
    });
  } catch (error) {
    console.error("Update Ad Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Failed to update Ad";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

export const deleteAd = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId } = req.body;
    const { adId } = req.params;

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }

    await axios.delete(`${META_API}/${adId}`, {
      data: { access_token: accountRecord.userAccessToken },
    });

    await MetaAd.findOneAndDelete({ adId: adId, userId: userId });

    return res.status(200).json({ 
      success: true, 
      message: "Ad deleted successfully" 
    });
  } catch (error) {
    console.error("Delete Ad Error:", error.response?.data || error.message);
    const metaMsg = error.response?.data?.error?.message || "Failed to delete Ad";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

// ==========================================
// AD INSIGHTS (DAILY BREAKDOWN)
// ==========================================
export const getAdInsights = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adId, adAccountId, datePreset = "maximum" } = req.query;

    if (!adId || !adAccountId) {
      return res.status(400).json({
        success: false,
        message: "adId and adAccountId are required",
      });
    }

    const metaAdAccount = await MetaAdAccount.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      adAccountId,
    }).select("userAccessToken");

    if (!metaAdAccount) {
      return res.status(404).json({
        success: false,
        message: "Meta Ad Account not found",
      });
    }

    const response = await axios.get(`${META_API}/${adId}/insights`, {
      params: {
        fields: "ad_id,impressions,clicks,spend,ctr",
        date_preset: datePreset,
        time_increment: 1, 
        access_token: metaAdAccount.userAccessToken,
      },
    });

    const insights = response.data?.data || [];

    if (insights.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No delivery data found for this period.",
        data: [], 
      });
    }

    return res.status(200).json({
      success: true,
      data: insights, 
    });

  } catch (error) {
    console.error("Get ad insights error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch ad insights",
      error: error.response?.data?.error?.message || error.message,
    });
  }
};