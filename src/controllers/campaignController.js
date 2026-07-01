import Campaign from "../models/Campaign.js";
import CallingLead from "../models/CallingLead.js";

// GET /campaigns
const getCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find().sort({ createdAt: -1 });
    res.json({ success: true, campaigns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /Campaigns/calling-lead
const getCallingLeads = async (req, res) => {
  try {
    const leads = await CallingLead.find().sort({ createdAt: -1 });
    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/campaigns/create
const createCampaign = async (req, res) => {
  try {
    const {
      campaignName,
      phoneNumbers,
      prompt,
      voice,
      startTime,
      endTime,
      callGapSeconds,
    } = req.body;

    if (!campaignName || !Array.isArray(phoneNumbers) || !phoneNumbers.length) {
      return res.status(400).json({
        success: false,
        message: "campaignName aur phoneNumbers required hain",
      });
    }
    if (!prompt) {
      return res.status(400).json({ success: false, message: "prompt required hai" });
    }

    const uniqueNumbers = Array.from(
      new Set(phoneNumbers.map((n) => String(n).trim()).filter(Boolean)),
    );

    const campaign = await Campaign.create({
      campaignName,
      prompt,
      voice: voice || "keshavi",
      startTime: startTime || null,
      endTime: endTime || null,
      callGapSeconds: callGapSeconds || 60,
      totalLeads: uniqueNumbers.length,
      totalQueued: uniqueNumbers.length,
      status: "scheduled",
    });

    await CallingLead.insertMany(
      uniqueNumbers.map((phone) => ({
        campaignId: campaign._id,
        phone,
        prompt,
        selectedVoice: voice || "keshavi",
        callStatus: "queued",
        source: "Bulk Campaign",
      })),
      { ordered: false },
    );

    res.json({
      success: true,
      message: "Campaign created successfully",
      campaign,
    });
  } catch (error) {
    console.error("createCampaign error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/campaigns/:id/start
// Worker (campaignWorker.js) auto-picks up any campaign with status
// "running" on its next tick — this endpoint just flips the flag.
const startCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    if (campaign.status === "running") {
      return res.status(400).json({ success: false, message: "Campaign already running" });
    }
    if (campaign.status === "completed") {
      return res.status(400).json({ success: false, message: "Campaign already completed" });
    }

    campaign.status = "running";
    campaign.startedAt = new Date();
    await campaign.save();

    res.json({
      success: true,
      message: "Campaign started successfully",
    });
  } catch (error) {
    console.error("startCampaign error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/campaigns/:id/pause
const pauseCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findByIdAndUpdate(
      id,
      { status: "paused" },
      { new: true },
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    res.json({ success: true, message: "Campaign paused", campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export { getCampaigns, getCallingLeads, createCampaign, startCampaign, pauseCampaign };