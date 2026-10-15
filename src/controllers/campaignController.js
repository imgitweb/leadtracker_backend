import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Call from "../models/Call.js";
import { processContactList } from "../utils/phoneValidator.js";
import { processCallingQueue } from "../services/callingQueueService.js";
import { sendResponse, sendError, getPagination, getCompanyUserIds } from "../utils/helpers.js";

/**
 * 1. Create a new Calling Campaign
 */
export const createCampaign = async (req, res) => {
  try {
    const {
      name,
      campaignName,
      description,
      systemPrompt,
      prompt,
      callerId,
      language,
      voice,
      maxConcurrentCalls,
      retryLimit,
      contacts, // array of { name, phone, email }
    } = req.body;

    const finalName = name || campaignName;
    const finalPrompt = systemPrompt || prompt;

    if (!finalName || !finalPrompt) {
      return sendError(res, 400, "Campaign name and AI agent system prompt are required.");
    }

    const companyId = req.user?.company?._id || req.user?.company;

    // Create Campaign document
    const campaign = new Campaign({
      name: finalName,
      campaignName: finalName,
      description: description || "",
      systemPrompt: finalPrompt,
      prompt: finalPrompt,
      callerId: callerId || process.env.TWILIO_PHONE_NUMBER,
      language: language || "hi-IN",
      voice: voice || "Polly.Aditi",
      maxConcurrentCalls: Number(maxConcurrentCalls) || 2,
      retryLimit: Number(retryLimit) !== undefined ? Number(retryLimit) : 1,
      status: "draft",
      company: companyId,
      createdBy: req.user?._id,
    });

    // If contacts provided in payload, validate & save them
    if (contacts && Array.isArray(contacts) && contacts.length > 0) {
      const { validContacts } = processContactList(contacts);

      if (validContacts.length > 0) {
        await campaign.save();

        const contactDocs = validContacts.map((c) => ({
          ...c,
          campaignId: campaign._id,
          company: companyId,
        }));

        await Contact.insertMany(contactDocs, { ordered: false }).catch(() => {});

        const totalSaved = await Contact.countDocuments({ campaignId: campaign._id });
        campaign.totalContacts = totalSaved;
        campaign.pendingCalls = totalSaved;
        await campaign.save();

        return sendResponse(res, 201, true, "Campaign created successfully with contacts.", {
          campaign,
          contactsCount: totalSaved,
        });
      }
    }

    await campaign.save();
    return sendResponse(res, 201, true, "Campaign created successfully as draft.", { campaign });
  } catch (error) {
    console.error("Create Campaign Error:", error);
    return sendError(res, 500, "Failed to create campaign", error);
  }
};

/**
 * 2. Get list of campaigns with filters
 */
export const getCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "", status } = req.query;
    const { skip, limit: parsedLimit } = getPagination(page, limit);

    const companyUserIds = await getCompanyUserIds(req.user);
    const companyId = req.user?.company?._id || req.user?.company;

    const query = {
      ...(companyId
        ? { $or: [{ company: companyId }, { createdBy: { $in: companyUserIds } }] }
        : { createdBy: { $in: companyUserIds } }),
    };

    if (status && status !== "all") {
      query.status = status.toLowerCase();
    }

    if (search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { campaignName: { $regex: search.trim(), $options: "i" } },
        { description: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("createdBy", "fullName name email")
        .lean(),
      Campaign.countDocuments(query),
    ]);

    return sendResponse(res, 200, true, "Campaigns retrieved", {
      campaigns,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    console.error("Get Campaigns Error:", error);
    return sendError(res, 500, "Failed to fetch campaigns", error);
  }
};

/**
 * 3. Get single campaign details with contact & call statistics
 */
export const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id).populate("createdBy", "fullName name email").lean();

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    // Refresh contact counts from database
    const [totalContacts, completedCalls, pendingCalls, failedCalls] = await Promise.all([
      Contact.countDocuments({ campaignId: id }),
      Contact.countDocuments({ campaignId: id, callStatus: "completed" }),
      Contact.countDocuments({ campaignId: id, callStatus: { $in: ["pending", "queued"] } }),
      Contact.countDocuments({ campaignId: id, callStatus: { $in: ["failed", "busy", "no-answer"] } }),
    ]);

    return sendResponse(res, 200, true, "Campaign details retrieved", {
      campaign: {
        ...campaign,
        totalContacts,
        callsCompleted: completedCalls,
        pendingCalls,
        callsFailed: failedCalls,
      },
    });
  } catch (error) {
    console.error("Get Campaign Details Error:", error);
    return sendError(res, 500, "Failed to fetch campaign details", error);
  }
};

/**
 * 4. Update campaign
 */
export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    if (campaign.status === "running") {
      return sendError(res, 400, "Cannot edit a currently running campaign. Please pause it first.");
    }

    const {
      name,
      campaignName,
      description,
      systemPrompt,
      prompt,
      callerId,
      language,
      voice,
      maxConcurrentCalls,
      retryLimit,
    } = req.body;

    if (name || campaignName) campaign.name = name || campaignName;
    if (description !== undefined) campaign.description = description;
    if (systemPrompt || prompt) campaign.systemPrompt = systemPrompt || prompt;
    if (callerId) campaign.callerId = callerId;
    if (language) campaign.language = language;
    if (voice) campaign.voice = voice;
    if (maxConcurrentCalls) campaign.maxConcurrentCalls = Number(maxConcurrentCalls);
    if (retryLimit !== undefined) campaign.retryLimit = Number(retryLimit);

    await campaign.save();
    return sendResponse(res, 200, true, "Campaign updated successfully", { campaign });
  } catch (error) {
    console.error("Update Campaign Error:", error);
    return sendError(res, 500, "Failed to update campaign", error);
  }
};

/**
 * 5. Start Campaign
 */
export const startCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    const totalContacts = await Contact.countDocuments({ campaignId: id, doNotCall: false });
    if (totalContacts === 0) {
      return sendError(res, 400, "Cannot start campaign with 0 valid contacts. Please add contacts first.");
    }

    campaign.status = "running";
    if (!campaign.startTime) campaign.startTime = new Date();
    await campaign.save();

    // Trigger queue worker immediately
    const io = req.app.get("socketio");
    processCallingQueue(io).catch(() => {});

    return sendResponse(res, 200, true, "Campaign started successfully! Calls are being dispatched.", { campaign });
  } catch (error) {
    console.error("Start Campaign Error:", error);
    return sendError(res, 500, "Failed to start campaign", error);
  }
};

/**
 * 6. Pause Campaign
 */
export const pauseCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    campaign.status = "paused";
    await campaign.save();

    return sendResponse(res, 200, true, "Campaign paused. Active calls will conclude and no new calls will be placed.", { campaign });
  } catch (error) {
    console.error("Pause Campaign Error:", error);
    return sendError(res, 500, "Failed to pause campaign", error);
  }
};

/**
 * 7. Resume Campaign
 */
export const resumeCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    campaign.status = "running";
    await campaign.save();

    const io = req.app.get("socketio");
    processCallingQueue(io).catch(() => {});

    return sendResponse(res, 200, true, "Campaign resumed successfully.", { campaign });
  } catch (error) {
    console.error("Resume Campaign Error:", error);
    return sendError(res, 500, "Failed to resume campaign", error);
  }
};

/**
 * 8. Cancel Campaign
 */
export const cancelCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    campaign.status = "cancelled";
    campaign.completedAt = new Date();
    await campaign.save();

    return sendResponse(res, 200, true, "Campaign cancelled.", { campaign });
  } catch (error) {
    console.error("Cancel Campaign Error:", error);
    return sendError(res, 500, "Failed to cancel campaign", error);
  }
};

/**
 * 9. Preview contacts before campaign creation (Checks validation & duplicates)
 */
export const previewContacts = (req, res) => {
  try {
    const { contacts } = req.body;
    if (!contacts || !Array.isArray(contacts)) {
      return sendError(res, 400, "Contacts list array is required");
    }

    const { validContacts, invalidContacts, duplicates } = processContactList(contacts);

    return sendResponse(res, 200, true, "Contacts preview generated", {
      totalInput: contacts.length,
      validCount: validContacts.length,
      invalidCount: invalidContacts.length,
      duplicateCount: duplicates.length,
      validContacts: validContacts.slice(0, 50), // Sample for preview
      invalidContacts,
      duplicates,
    });
  } catch (error) {
    console.error("Preview Contacts Error:", error);
    return sendError(res, 500, "Failed to preview contacts", error);
  }
};

/**
 * 10. Delete Campaign
 */
export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    await Promise.all([
      Campaign.findByIdAndDelete(id),
      Contact.deleteMany({ campaignId: id }),
      Call.deleteMany({ campaignId: id }),
    ]);

    return sendResponse(res, 200, true, "Campaign and associated data deleted successfully");
  } catch (error) {
    console.error("Delete Campaign Error:", error);
    return sendError(res, 500, "Failed to delete campaign", error);
  }
};

export default {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  previewContacts,
  deleteCampaign,
};