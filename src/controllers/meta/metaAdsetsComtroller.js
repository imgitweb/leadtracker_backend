import axios from "axios";
import mongoose from "mongoose";
import MetaAdAccount from "../../models/MetaAdAccount.js";
import MetaAdSet from "../../models/metaAdsetsModel.js";
import MetaAd from "../../models/metaAds.js";

const META_API = `https://graph.facebook.com/v25.0`;

export const getCampaignAdSets = async (req, res) => {
  try {
    const userId = req.user._id;
    const { campaignId } = req.query;
    const { adAccountId } = req.query;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "campaignId is required",
      });
    }

    if (!adAccountId) {
      return res.status(400).json({
        success: false,
        message: "adAccountId is required",
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
        fields:
          "id,name,status,campaign_id,daily_budget,lifetime_budget,billing_event,optimization_goal,targeting,created_time,start_time,end_time",
        access_token: metaAdAccount.userAccessToken,
      },
    });

    const adSets = response.data.data || [];

    if (adSets.length) {
      await MetaAdSet.bulkWrite(
        adSets.map((adSet) => ({
          updateOne: {
            filter: {
              adSetId: adSet.id,
            },
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

export const getAdSetAds = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adSetId } = req.query;
    const { adAccountId } = req.query;

    if (!adSetId) {
      return res.status(400).json({
        success: false,
        message: "adSetId is required",
      });
    }

    if (!adAccountId) {
      return res.status(400).json({
        success: false,
        message: "adAccountId is required",
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
        fields:
          "id,name,status,effective_status,adset_id,campaign_id,tracking_specs,creative{id,name,status,thumbnail_url,asset_feed_spec,body,actor_id}",
        access_token: metaAdAccount.userAccessToken,
        limit: 500,
      },
    });

    const ads = response.data?.data || [];

    if (ads.length) {
      await MetaAd.bulkWrite(
        ads.map((ad) => ({
          updateOne: {
            filter: {
              userId,
              adId: ad.id,
            },
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

    const savedAds = await MetaAd.find({
      userId,
      adSetId,
    })
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
    const userId = req.user._id;
    const {
      adAccountId,
      campaignId,
      adSetName,
      dailyBudget,
      targetLocation,
      targetGender,
      minAge,
      maxAge,
      advantage_audience,
    } = req.body;

    if (!adAccountId || !campaignId || !adSetName || !dailyBudget) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // 1. Get Access Token
    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({
        error: "Access Token not found. Please sync your account again.",
      });
    }
    const token = accountRecord.userAccessToken;

    // 2. Format Meta Targeting Rules
    let genderTargeting = [1, 2]; // Default to ALL
    if (targetGender === "male") genderTargeting = [1];
    if (targetGender === "female") genderTargeting = [2];

    const isAdvantage = advantage_audience ? 1 : 0;

    const targetingSpec = {
      geo_locations: { countries: [targetLocation || "IN"] },
      age_min: minAge || 18,
      age_max: maxAge || 65,
      genders: genderTargeting,
      targeting_automation: {
        advantage_audience: isAdvantage,
      },
    };

    // 3. Create Ad Set on Meta
    const adSetRes = await axios.post(`${META_API}/${adAccountId}/adsets`, {
      name: adSetName,
      campaign_id: campaignId,
      daily_budget: dailyBudget * 100, // INR to Paise
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      targeting: targetingSpec,
      status: "PAUSED",
      access_token: token,
    });

    const newAdSetId = adSetRes.data.id;

    // 4. Save the newly created Ad Set to Database (FIXED Mongoose Validation)
    const newAdSet = new MetaAdSet({
      userId,
      adAccountId,
      campaignId,
      adSetId: newAdSetId,
      adSetName,
      status: "PAUSED",
      dailyBudget: dailyBudget,
      lifetimeBudget: 0,      // Fix: Added required field
      budget_remaining: 0,    // Fix: Added required field
      billingEvent: "IMPRESSIONS",
      optimizationGoal: "LINK_CLICKS",
      targeting: targetingSpec,
      createdTime: new Date().toISOString(),
    });

    await newAdSet.save();

    return res.status(201).json({
      success: true,
      message: "Ad Set Created Successfully!",
      data: newAdSet,
    });
  } catch (error) {
    console.error("Create Ad Set Error:", error.response?.data || error.message);
    
    const metaMsg = 
      error.response?.data?.error?.error_user_msg || 
      error.response?.data?.error?.message || 
      "Unknown Meta Error";
      
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};



// ==========================================
// NEW: CREATE SINGLE AD INSIDE EXISTING AD SET
// ==========================================
export const createAd = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      adAccountId,
      adSetId,
      adName,
      pageId,
      isExistingPost,
      existingPostId,
      adText,
      imageUrl,
      websiteUrl,
    } = req.body;

    if (!adAccountId || !adSetId || !adName || !pageId) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // 1. Get Access Token
    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    // 2. Prepare Creative Payload
    let creativePayload = {
      name: `${adName} - Creative`,
      access_token: token,
    };

    if (isExistingPost) {
      if (!existingPostId) return res.status(400).json({ error: "Missing existing post ID" });
      creativePayload.object_story_id = existingPostId;
    } else {
      if (!websiteUrl || !imageUrl) return res.status(400).json({ error: "Missing image or website URL" });
      creativePayload.object_story_spec = {
        page_id: pageId,
        link_data: {
          link: websiteUrl,
          message: adText,
          picture: imageUrl,
          call_to_action: { type: "LEARN_MORE" },
        },
      };
    }

    // 3. Create Ad Creative on Meta
    const creativeRes = await axios.post(`${META_API}/${adAccountId}/adcreatives`, creativePayload);
    const creativeId = creativeRes.data.id;

    // 4. Create Actual Ad on Meta linking to the AdSet
    const adRes = await axios.post(`${META_API}/${adAccountId}/ads`, {
      name: adName,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED", // Default to paused
      access_token: token,
    });

    const newAdId = adRes.data.id;

    // 5. Fetch Ad Data back to save properly in DB
    const fetchedAdRes = await axios.get(`${META_API}/${newAdId}`, {
      params: {
        fields: "id,name,status,effective_status,adset_id,campaign_id,tracking_specs,creative{id,name,status,thumbnail_url,asset_feed_spec,body,actor_id}",
        access_token: token
      }
    });
    
    const adData = fetchedAdRes.data;

    // 6. Save Ad to Database
    const newAd = new MetaAd({
      userId,
      adAccountId,
      campaignId: adData.campaign_id || "", 
      adSetId,
      adId: newAdId,
      adName: adData.name,
      status: adData.status,
      effectiveStatus: adData.effective_status,
      creative: {
        creativeId: adData.creative?.id,
        name: adData.creative?.name,
        status: adData.creative?.status,
        thumbnailUrl: adData.creative?.thumbnail_url,
        actorId: adData.creative?.actor_id,
        body: adData.creative?.body,
        assetFeedSpec: adData.creative?.asset_feed_spec || {},
      },
      trackingSpecs: adData.tracking_specs || [],
      metaData: adData
    });

    await newAd.save();

    return res.status(201).json({ 
      success: true, 
      message: "Ad created successfully!", 
      data: newAd 
    });

  } catch (error) {
    console.error("Create Ad Error:", error.response?.data || error.message);
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

    // Hit Meta API
    await axios.post(`${META_API}/${adSetId}`, {
      status: status,
      access_token: accountRecord.userAccessToken,
    });

    // Update MongoDB
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

    // Hit Meta API to Delete
    await axios.delete(`${META_API}/${adSetId}`, {
      data: { access_token: accountRecord.userAccessToken },
    });

    // Delete from MongoDB
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

    // Hit Meta API
    await axios.post(`${META_API}/${adId}`, {
      status: status,
      access_token: accountRecord.userAccessToken,
    });

    // Update MongoDB
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

    // Hit Meta API to Delete
    await axios.delete(`${META_API}/${adId}`, {
      data: { access_token: accountRecord.userAccessToken },
    });

    // Delete from MongoDB
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
// Ad Insights: 
// ==========================================

// export const getAdInsights = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const { adId, adAccountId, datePreset = "maximum" } = req.query;

//     // 1. Validation
//     if (!adId) {
//       return res.status(400).json({
//         success: false,
//         message: "adId is required",
//       });
//     }

//     if (!adAccountId) {
//       return res.status(400).json({
//         success: false,
//         message: "adAccountId is required",
//       });
//     }

//     // 2. Fetch User's Meta Access Token
//     const metaAdAccount = await MetaAdAccount.findOne({
//       userId: new mongoose.Types.ObjectId(userId),
//       adAccountId,
//     }).select("userAccessToken");

//     if (!metaAdAccount) {
//       return res.status(404).json({
//         success: false,
//         message: "Meta Ad Account not found",
//       });
//     }

//     // 3. Call Meta Insights API
//     // const response = await axios.get(`${META_API}/${adId}/insights`, {
//     //   params: {
//     //     fields: "ad_id,ad_name,impressions,clicks,spend,ctr,cpc,actions,reach",
//     //     date_preset: datePreset, // frontend can pass 'last_30d', 'last_7d', defaults to 'maximum'
//     //     access_token: metaAdAccount.userAccessToken,
//     //   },
//     // });



//     // ... backend controller mein Meta API call ke params mein change karein ...
// const response = await axios.get(`${META_API}/${adId}/insights`, {
//   params: {
//     fields: "ad_id,impressions,clicks,spend,ctr",
//     date_preset: datePreset,
//     // ================= ADD THIS LINE =================
//     time_increment: 1, // '1' ka matlab daily break-down data milega
//     // =================================================
//     access_token: metaAdAccount.userAccessToken,
//   },
// });

// // Response ab ek array milega jisme har din ka object hoga
// const insights = response.data?.data || [];

// return res.status(200).json({
//   success: true,
//   data: insights, // Ab ye full array frontend ko jaayega
// });

//    // const insights = response.data?.data || [];

//     // 4. Handle Empty Data (If ad has 0 delivery so far)
//     let metrics = {
//       ad_id: adId,
//       impressions: "0",
//       clicks: "0",
//       spend: "0",
//       ctr: "0",
//       cpc: "0",
//       reach: "0",
//       actions: []
//     };

//     if (insights.length > 0) {
//       metrics = insights[0]; // Take the first object from the array
//     }

//     return res.status(200).json({
//       success: true,
//       data: metrics,
//     });

//   } catch (error) {
//     console.error("Get ad insights error:", error.response?.data || error.message);

//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch ad insights",
//       error: error.response?.data?.error?.message || error.message,
//     });
//   }
// };

export const getAdInsights = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adId, adAccountId, datePreset = "maximum" } = req.query;

    // 1. Validation
    if (!adId || !adAccountId) {
      return res.status(400).json({
        success: false,
        message: "adId and adAccountId are required",
      });
    }

    // 2. Fetch User's Meta Access Token
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

    // 3. Call Meta Insights API
    const response = await axios.get(`${META_API}/${adId}/insights`, {
      params: {
        fields: "ad_id,impressions,clicks,spend,ctr",
        date_preset: datePreset,
        time_increment: 1, // Get daily breakdown array
        access_token: metaAdAccount.userAccessToken,
      },
    });

    // 4. Handle Response
    const insights = response.data?.data || [];

    // If no delivery/data, send a clean empty array instead of failing
    if (insights.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No delivery data found for this period.",
        data: [], 
      });
    }

    // Send the full array of daily insights to the frontend
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