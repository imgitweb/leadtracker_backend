import Call from "../models/Call.js";
import Transcript from "../models/Transcript.js";
import CallAnalysis from "../models/CallAnalysis.js";
import { sendResponse, sendError, getPagination } from "../utils/helpers.js";

/**
 * 1. List calls with advanced filtering
 */
export const getCalls = async (req, res) => {
  try {
    const {
      campaignId,
      status,
      sentiment,
      responseCategory,
      startDate,
      endDate,
      search = "",
      page = 1,
      limit = 20,
    } = req.query;

    const { skip, limit: parsedLimit } = getPagination(page, limit);
    const query = {};

    if (campaignId) query.campaignId = campaignId;
    if (status && status !== "all") query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (search.trim()) {
      query.$or = [
        { toNumber: { $regex: search.trim(), $options: "i" } },
        { callSid: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const [calls, total] = await Promise.all([
      Call.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("contactId", "name phone email sentiment responseCategory doNotCall")
        .populate("campaignId", "name language callerId")
        .lean(),
      Call.countDocuments(query),
    ]);

    // Attach analysis and sentiment to call list
    const callIds = calls.map((c) => c._id);
    const analyses = await CallAnalysis.find({ callId: { $in: callIds } }).lean();
    const analysisMap = new Map();
    analyses.forEach((a) => analysisMap.set(String(a.callId), a));

    let enrichedCalls = calls.map((c) => ({
      ...c,
      analysis: analysisMap.get(String(c._id)) || null,
    }));

    // Filter by sentiment / responseCategory if specified
    if (sentiment && sentiment !== "all") {
      enrichedCalls = enrichedCalls.filter(
        (c) => c.analysis?.sentiment?.toLowerCase() === sentiment.toLowerCase()
      );
    }

    if (responseCategory && responseCategory !== "all") {
      enrichedCalls = enrichedCalls.filter(
        (c) => c.analysis?.responseCategory?.toLowerCase() === responseCategory.toLowerCase()
      );
    }

    return sendResponse(res, 200, true, "Calls retrieved successfully", {
      calls: enrichedCalls,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    console.error("Get Calls Error:", error);
    return sendError(res, 500, "Failed to fetch calls", error);
  }
};

/**
 * 2. Get call details
 */
export const getCallById = async (req, res) => {
  try {
    const { id } = req.params;
    const call = await Call.findById(id)
      .populate("contactId")
      .populate("campaignId")
      .lean();

    if (!call) {
      return sendError(res, 404, "Call not found");
    }

    const [transcript, analysis] = await Promise.all([
      Transcript.findOne({ callId: id }).lean(),
      CallAnalysis.findOne({ callId: id }).lean(),
    ]);

    return sendResponse(res, 200, true, "Call details retrieved", {
      call: {
        ...call,
        transcript: transcript?.messages || [],
        analysis: analysis || null,
      },
    });
  } catch (error) {
    console.error("Get Call By ID Error:", error);
    return sendError(res, 500, "Failed to fetch call details", error);
  }
};

/**
 * 3. Retrieve conversation transcript for a call
 */
export const getCallTranscript = async (req, res) => {
  try {
    const { id } = req.params;
    const transcript = await Transcript.findOne({ callId: id }).lean();

    if (!transcript) {
      return sendResponse(res, 200, true, "No transcript available yet", {
        messages: [],
        isComplete: false,
      });
    }

    return sendResponse(res, 200, true, "Transcript retrieved successfully", {
      messages: transcript.messages || [],
      isComplete: transcript.isComplete,
      language: transcript.language,
    });
  } catch (error) {
    console.error("Get Transcript Error:", error);
    return sendError(res, 500, "Failed to fetch transcript", error);
  }
};

/**
 * 4. Retrieve AI analysis for a call
 */
export const getCallAnalysis = async (req, res) => {
  try {
    const { id } = req.params;
    const analysis = await CallAnalysis.findOne({ callId: id }).lean();

    if (!analysis) {
      return sendResponse(res, 200, true, "Analysis not yet generated or call pending", {
        analysis: null,
      });
    }

    return sendResponse(res, 200, true, "Call analysis retrieved successfully", { analysis });
  } catch (error) {
    console.error("Get Analysis Error:", error);
    return sendError(res, 500, "Failed to fetch analysis", error);
  }
};

export default {
  getCalls,
  getCallById,
  getCallTranscript,
  getCallAnalysis,
};
