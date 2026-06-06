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
