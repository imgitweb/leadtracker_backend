import axios from "axios";
import MetaAdAccount from "../../models/MetaAdAccount.js";
import MetaAdCampaign from "../../models/MetaAdCampaign.js";
import FacebookAccount from "../../models/FacebookAccount.js"; // Naya import
import mongoose from "mongoose";
const META_API = "https://graph.facebook.com/v25.0";

// ==========================================
// NEW: GET LINKED FACEBOOK PAGES FOR DROPDOWN
// ==========================================
export const getLinkedPages = async (req, res) => {
  try {
    const userId = req.user._id;

    // Sirf wo accounts nikalo jinke paas page_id hai
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

// ==========================================
// CREATE FULL CAMPAIGN (Existing Function)
// ==========================================
// export const createFullCampaign = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const {
//       adAccountId,
//       campaignName,
//       dailyBudget,
//       pageId,
//       websiteUrl,
//       adText,
//       imageUrl,
//       targetLocation,
//       minAge,
//       is_adset_budget_sharing_enabled = false,
//       bidStrategy = "LOWEST_COST_WITHOUT_CAP",
//       targetGender,
//       advantage_audience,
//       maxAge,
//     } = req.body;

//     console.log("$$$", req.body);

//     // 1. Get Token from DB
//     const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
//     if (!accountRecord || !accountRecord.userAccessToken) {
//       return res.status(404).json({
//         error: "Access Token not found. Please sync your account again.",
//       });
//     }
//     const token = accountRecord.userAccessToken;

//     // 2. CREATE CAMPAIGN
//     const campaignRes = await axios.post(
//       `${META_API}/${adAccountId}/campaigns`,
//       {
//         name: campaignName,
//         objective: "OUTCOME_TRAFFIC",
//         status: "PAUSED",
//         special_ad_categories: [],
//         access_token: token,
//         is_adset_budget_sharing_enabled,
//         bid_strategy: bidStrategy,
//       },
//     );
//     const campaignId = campaignRes.data.id;

//     // 3. CREATE AD SET (Targeting updated with Frontend data)
//     const adSetRes = await axios.post(`${META_API}/${adAccountId}/adsets`, {
//       name: `${campaignName} - AdSet`,
//       campaign_id: campaignId,
//       daily_budget: dailyBudget * 100,
//       billing_event: "IMPRESSIONS",
//       optimization_goal: "LINK_CLICKS",
//       targeting: {
//         geo_locations: { countries: [targetLocation || "IN"] },
//         age_min: minAge || 18,
//         age_max: maxAge || 65,
//         gender: targetGender,
//         interests: advantage_audience,
//       },
//       status: "PAUSED",
//       access_token: token,
//     });
//     const adSetId = adSetRes.data.id;

//     // 4. CREATE AD CREATIVE
//     const creativeRes = await axios.post(
//       `${META_API}/${adAccountId}/adcreatives`,
//       {
//         name: `${campaignName} - Creative`,
//         object_story_spec: {
//           page_id: pageId,
//           link_data: {
//             link: websiteUrl,
//             message: adText,
//             picture: imageUrl,
//             call_to_action: { type: "LEARN_MORE" },
//           },
//         },
//         access_token: token,
//       },
//     );
//     const creativeId = creativeRes.data.id;

//     // 5. CREATE ACTUAL AD
//     const adRes = await axios.post(`${META_API}/${adAccountId}/ads`, {
//       name: `${campaignName} - Final Ad`,
//       adset_id: adSetId,
//       creative: { creative_id: creativeId },
//       status: "PAUSED",
//       access_token: token,
//     });

//     // 6. SAVE TO DATABASE
//     const newCampaign = new MetaAdCampaign({
//       userId,
//       adAccountId,
//       campaignId,
//       adSetId,
//       creativeId,
//       adId: adRes.data.id,
//       campaignName,
//       budget: dailyBudget,
//       websiteUrl,
//     });
//     await newCampaign.save();

//     return res.status(201).json({
//       success: true,
//       message: "Campaign Created Successfully!",
//       data: newCampaign,
//     });
//   } catch (error) {
//     console.error(
//       "Meta API Creation Error:",
//       error.response?.data || error.message,
//     );
//     const metaMsg =
//       error.response?.data?.error?.message || "Unknown Meta Error";
//     return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
//   }
// };


export const createFullCampaign = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      adAccountId,
      campaignName,
      dailyBudget,
      pageId,
      websiteUrl,
      adText,
      imageUrl,
      targetLocation,
      minAge,
      is_adset_budget_sharing_enabled = false,
      bidStrategy = "LOWEST_COST_WITHOUT_CAP",
      bidAmount, // 🔥 NEW: Extracted bidAmount from frontend payload
      targetGender,
      advantage_audience,
      maxAge,
    } = req.body;

    console.log("$$$ Payload received from frontend:", req.body);

    // 1. Get Token from DB
    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({
        error: "Access Token not found. Please sync your account again.",
      });
    }
    const token = accountRecord.userAccessToken;

    // 2. CREATE CAMPAIGN
    const campaignRes = await axios.post(
      `${META_API}/${adAccountId}/campaigns`,
      {
        name: campaignName,
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        access_token: token,
        is_adset_budget_sharing_enabled,
        bid_strategy: bidStrategy,
      },
    );
    const campaignId = campaignRes.data.id;

    // 3. CREATE AD SET (Targeting & Bid Strategy handled carefully)
    
    // Step A: Map frontend string genders to Meta API integers
    let genderTargeting = [];
    if (targetGender === "male") genderTargeting = [1];
    else if (targetGender === "female") genderTargeting = [2];

    // Step B: Build the targeting payload dynamically
// Step B: Build the targeting payload dynamically
    const targetingPayload = {
      geo_locations: { countries: [targetLocation || "IN"] },
      age_min: minAge || 18,
      age_max: maxAge || 65,
      // 🔥 NEW FIX: Meta ab isko strictly mangta hai
      targeting_automation: {
        advantage_audience: advantage_audience ? 1 : 0
      }
    };

    // Agar 'all' hai, toh genders field bhejo hi mat, Meta khud samajh jayega
    if (genderTargeting.length > 0) {
      targetingPayload.genders = genderTargeting; 
    }

    // Step C: Build Ad Set Payload
    const adSetPayload = {
      name: `${campaignName} - AdSet`,
      campaign_id: campaignId,
      daily_budget: dailyBudget * 100, // INR to Paise
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      targeting: targetingPayload,
      status: "PAUSED",
      access_token: token,
    };

    // 🔥 NEW: Dynamically add bid_amount if strategy requires a Cap
    const cappedStrategies = ["LOWEST_COST_WITH_BID_CAP", "COST_CAP", "BID_CAP"];
    if (cappedStrategies.includes(bidStrategy)) {
      if (!bidAmount) {
        // Backend validation: Stop API call if frontend missed sending bidAmount
        return res.status(400).json({ 
          error: `Meta API Error: 'bidAmount' is required when using ${bidStrategy} strategy.` 
        });
      }
      // Add bid_amount (INR to Paise conversion)
      adSetPayload.bid_amount = bidAmount * 100;
    }

    // Hit Meta API for Ad Set
    const adSetRes = await axios.post(`${META_API}/${adAccountId}/adsets`, adSetPayload);
    const adSetId = adSetRes.data.id;

    // 4. CREATE AD CREATIVE
    const creativeRes = await axios.post(
      `${META_API}/${adAccountId}/adcreatives`,
      {
        name: `${campaignName} - Creative`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            link: websiteUrl,
            message: adText,
            picture: imageUrl,
            call_to_action: { type: "LEARN_MORE" },
          },
        },
        access_token: token,
      },
    );
    const creativeId = creativeRes.data.id;

    // 5. CREATE ACTUAL AD
    const adRes = await axios.post(`${META_API}/${adAccountId}/ads`, {
      name: `${campaignName} - Final Ad`,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
      access_token: token,
    });

    // 6. SAVE TO DATABASE
    const newCampaign = new MetaAdCampaign({
      userId,
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
    console.error(
      "Meta API Creation Error:",
      error.response?.data || error.message,
    );
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

    // Fetch posts using Page Access Token, including 'is_eligible_for_promotion'
    const response = await axios.get(
      `https://graph.facebook.com/v25.0/${pageId}/posts`,
      {
        params: {
          // ADDED: is_eligible_for_promotion
          fields:
            "id,message,full_picture,permalink_url,created_time,is_eligible_for_promotion",
          access_token: account.access_token,
        },
      },
    );

    const allPosts = response.data.data || [];

    // FIX: Filter ONLY posts that Facebook allows to be boosted
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
    const { adAccountId, campaignId, status } = req.body; // status can be 'ACTIVE', 'PAUSED', or 'ARCHIVED'

    if (!["ACTIVE", "PAUSED", "ARCHIVED"].includes(status)) {
      return res.status(400).json({ error: "Invalid status provided." });
    }

    // 1. Get Token from DB
    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    // 2. Hit Meta API to update status
    await axios.post(`${META_API}/${campaignId}`, {
      status: status,
      access_token: token,
    });

    // 3. Update status in your MongoDB
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
    console.error(
      "Update Status Error:",
      error.response?.data || error.message,
    );
    const metaMsg =
      error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

// ==========================================
// MODIFY CAMPAIGN SETTINGS (BUDGET / OBJECTIVE)
// ==========================================
export const modifyCampaign = async (req, res) => {
  try {
    const userId = req.user._id;
    const { adAccountId, campaignId, objective, dailyBudget } = req.body;

    const accountRecord = await MetaAdAccount.findOne({ userId, adAccountId });
    if (!accountRecord || !accountRecord.userAccessToken) {
      return res.status(404).json({ error: "Access Token not found." });
    }
    const token = accountRecord.userAccessToken;

    // Prepare payload dynamically based on what needs to be updated
    const payload = { access_token: token };
    if (objective) payload.objective = objective;
    if (dailyBudget) payload.daily_budget = dailyBudget * 100; // Assuming frontend sends INR, convert to paise

    // Hit Meta API
    await axios.post(`${META_API}/${campaignId}`, payload);

    // Update MongoDB
    const updatedCampaign = await MetaAdCampaign.findOneAndUpdate(
      { campaignId: campaignId, userId: userId },
      { budget: dailyBudget }, // Add other fields if tracking them
      { new: true },
    );

    return res.status(200).json({
      success: true,
      message: "Campaign modified successfully",
      data: updatedCampaign,
    });
  } catch (error) {
    console.error(
      "Modify Campaign Error:",
      error.response?.data || error.message,
    );
    const metaMsg =
      error.response?.data?.error?.message || "Unknown Meta Error";
    return res.status(500).json({ error: `Meta API Error: ${metaMsg}` });
  }
};

// ==========================================
// DELETE AD CAMPAIGN
// ==========================================
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

    // Hit Meta API with DELETE method
    await axios.delete(`${META_API}/${campaignId}`, {
      data: { access_token: token }, // Axios handles DELETE payloads in the `data` object
    });

    // Remove from your MongoDB
    await MetaAdCampaign.findOneAndDelete({
      campaignId: campaignId,
      userId: userId,
    });

    return res.status(200).json({
      success: true,
      message: "Campaign permanently deleted.",
    });
  } catch (error) {
    console.error(
      "Delete Campaign Error:",
      error.response?.data || error.message,
    );
    const metaMsg =
      error.response?.data?.error?.message || "Unknown Meta Error";
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
      .select(
        "campaignId campaignName status objective buying_type created_time",
      )
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
      },
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
      .select(
        "campaignId campaignName status objective buying_type created_time",
      )
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
      },
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
      .select(
        "campaignId campaignName status objective buying_type created_time",
      )
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
