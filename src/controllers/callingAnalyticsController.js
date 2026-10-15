import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Call from "../models/Call.js";
import CallAnalysis from "../models/CallAnalysis.js";
import { sendResponse, sendError } from "../utils/helpers.js";

/**
 * Overview statistics across calling campaigns
 */
export const getAnalyticsOverview = async (req, res) => {
  try {
    const companyId = req.user?.company?._id || req.user?.company;

    const campaignQuery = companyId ? { company: companyId } : {};
    const callQuery = companyId ? { company: companyId } : {};

    const [
      totalCampaigns,
      totalContacts,
      totalCalls,
      completedCalls,
      inProgressCalls,
      failedCalls,
      positiveCount,
      negativeCount,
      neutralCount,
      interestedCount,
      followUpCount,
    ] = await Promise.all([
      Campaign.countDocuments(campaignQuery),
      Contact.countDocuments(companyId ? { company: companyId } : {}),
      Call.countDocuments(callQuery),
      Call.countDocuments({ ...callQuery, status: "completed" }),
      Call.countDocuments({ ...callQuery, status: { $in: ["initiated", "ringing", "in-progress"] } }),
      Call.countDocuments({ ...callQuery, status: { $in: ["failed", "busy", "no-answer", "canceled"] } }),
      CallAnalysis.countDocuments({ sentiment: "Positive" }),
      CallAnalysis.countDocuments({ sentiment: "Negative" }),
      CallAnalysis.countDocuments({ sentiment: "Neutral" }),
      CallAnalysis.countDocuments({ responseCategory: "Interested" }),
      CallAnalysis.countDocuments({ followUpRequired: true }),
    ]);

    return sendResponse(res, 200, true, "Calling Analytics Overview retrieved", {
      totalCampaigns,
      totalContacts,
      totalCalls,
      callsCompleted: completedCalls,
      callsInProgress: inProgressCalls,
      callsFailed: failedCalls,
      positiveResponses: positiveCount,
      negativeResponses: negativeCount,
      neutralResponses: neutralCount,
      interestedContacts: interestedCount,
      followUpsRequired: followUpCount,
    });
  } catch (error) {
    console.error("Get Analytics Overview Error:", error);
    return sendError(res, 500, "Failed to fetch analytics overview", error);
  }
};

/**
 * Campaign-specific analytics and sentiment breakdown
 */
export const getCampaignAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id).lean();

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    const [
      totalContacts,
      completedCalls,
      inProgressCalls,
      failedCalls,
      sentimentCounts,
      categoryCounts,
    ] = await Promise.all([
      Contact.countDocuments({ campaignId: id }),
      Call.countDocuments({ campaignId: id, status: "completed" }),
      Call.countDocuments({ campaignId: id, status: { $in: ["initiated", "ringing", "in-progress"] } }),
      Call.countDocuments({ campaignId: id, status: { $in: ["failed", "busy", "no-answer"] } }),
      CallAnalysis.aggregate([
        { $match: { campaignId: campaign._id } },
        { $group: { _id: "$sentiment", count: { $sum: 1 } } },
      ]),
      CallAnalysis.aggregate([
        { $match: { campaignId: campaign._id } },
        { $group: { _id: "$responseCategory", count: { $sum: 1 } } },
      ]),
    ]);

    const sentimentMap = { Positive: 0, Negative: 0, Neutral: 0 };
    sentimentCounts.forEach((s) => {
      if (s._id) sentimentMap[s._id] = s.count;
    });

    const categoryMap = {};
    categoryCounts.forEach((c) => {
      if (c._id) categoryMap[c._id] = c.count;
    });

    return sendResponse(res, 200, true, "Campaign Analytics retrieved", {
      campaign,
      stats: {
        totalContacts,
        completedCalls,
        inProgressCalls,
        failedCalls,
        sentiment: sentimentMap,
        categories: categoryMap,
      },
    });
  } catch (error) {
    console.error("Get Campaign Analytics Error:", error);
    return sendError(res, 500, "Failed to fetch campaign analytics", error);
  }
};

/**
 * Sentiment & Response Category aggregated charts
 */
export const getSentimentDistribution = async (req, res) => {
  try {
    const [sentimentAgg, categoryAgg] = await Promise.all([
      CallAnalysis.aggregate([
        { $group: { _id: "$sentiment", count: { $sum: 1 } } },
      ]),
      CallAnalysis.aggregate([
        { $group: { _id: "$responseCategory", count: { $sum: 1 } } },
      ]),
    ]);

    const sentiments = sentimentAgg.map((item) => ({
      name: item._id || "Neutral",
      value: item.count,
    }));

    const categories = categoryAgg.map((item) => ({
      name: item._id || "Unclear",
      value: item.count,
    }));

    return sendResponse(res, 200, true, "Sentiment distribution retrieved", {
      sentiments,
      categories,
    });
  } catch (error) {
    console.error("Get Sentiment Distribution Error:", error);
    return sendError(res, 500, "Failed to fetch sentiment distribution", error);
  }
};

export default {
  getAnalyticsOverview,
  getCampaignAnalytics,
  getSentimentDistribution,
};
