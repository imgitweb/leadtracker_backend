import Campaign from "../models/Campaign.js";
import Lead from "../models/CallingLead.js";
// import { callQueue } from "../queues/callQueue.js";

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

    if (!campaignName || !prompt || !phoneNumbers?.length) {
      return res.status(400).json({
        success: false,
        message: "Campaign name, prompt and phone numbers are required",
      });
    }

    const campaign = await Campaign.create({
      campaignName,
      prompt,
      voice: voice || "priyanka",
      startTime: startTime || null,
      endTime: endTime || null,
      callGapSeconds: Number(callGapSeconds) || 60,
      totalLeads: phoneNumbers.length,
      status: "scheduled",
    });

    const leadsPayload = phoneNumbers.map((phone, index) => ({
      campaignId: campaign._id,
      name: `Lead ${index + 1}`,
      phone,
      callStatus: "pending",
      source: "AI Call Campaign",
    }));

    await Lead.insertMany(leadsPayload);

    return res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      campaign,
    });
  } catch (error) {
    console.error("Create campaign error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Campaign create failed",
      error: error.message,
    });
  }
};

const getCampaigns = async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .lean();

    const campaignsWithNumbers = await Promise.all(
      campaigns.map(async (campaign) => {
        const leads = await Lead.find({
          campaignId: campaign._id,
        })
          .select("phone callStatus")
          .lean();

        return {
          ...campaign,
          voice: campaign.voice || "priyanka",
          phoneNumbers: leads.map((lead) => ({
            phone: lead.phone,
            status: lead.callStatus,
          })),
        };
      })
    );

    return res.json({
      success: true,
      campaigns: campaignsWithNumbers,
    });
  } catch (error) {
    console.error("Get campaigns error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Campaigns fetch failed",
      error: error.message,
    });
  }
};

const startCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;

    const campaign = await Campaign.findById(campaignId);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    const leads = await Lead.find({
      campaignId,
      callStatus: {
        $in: ["pending", "failed"],
      },
    });

    if (!leads.length) {
      return res.status(400).json({
        success: false,
        message: "No pending leads found",
      });
    }

    // Queue jobs
    for (const lead of leads) {
      if (typeof callQueue !== "undefined") {
        await callQueue.add(
          "call-lead",
          {
            leadId: lead._id.toString(),
            campaignId: campaign._id.toString(),
          },
          {
            jobId: `campaign-${campaign._id}-lead-${lead._id}`,
          }
        );
      }

      lead.callStatus = "queued";
      await lead.save();
    }

    campaign.status = "running";
    await campaign.save();

    return res.json({
      success: true,
      message: `${leads.length} leads added to queue`,
      totalQueued: leads.length,
    });
  } catch (error) {
    console.error("Start campaign error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Campaign start failed",
      error: error.message,
    });
  }
};

const callStatusWebhook = async (req, res) => {
  try {
    const callSid = req.body.CallSid;
    const callStatus = req.body.CallStatus;
    const callDuration = req.body.CallDuration || 0;

    const statusMap = {
      initiated: "calling",
      ringing: "calling",
      "in-progress": "answered",
      completed: "completed",
      busy: "busy",
      failed: "failed",
      "no-answer": "no_answer",
      canceled: "failed",
    };

    const updatedStatus =
      statusMap[callStatus] || callStatus;

    const lead = await Lead.findOneAndUpdate(
      { callSid },
      {
        callStatus: updatedStatus,
        callDuration: Number(callDuration) || 0,
      },
      {
        new: true,
      }
    );

    if (lead?.campaignId) {
      const pendingLeads =
        await Lead.countDocuments({
          campaignId: lead.campaignId,
          callStatus: {
            $in: [
              "pending",
              "queued",
              "calling",
              "answered",
            ],
          },
        });

      if (pendingLeads === 0) {
        await Campaign.findByIdAndUpdate(
          lead.campaignId,
          {
            status: "completed",
          }
        );
      }
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error(
      "Call status webhook error:",
      error.message
    );

    return res.status(500).send("ERROR");
  }
};

const getCallingLeads = async (req, res) => {
  try {
    const leads = await Lead.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    console.error("Get calling leads error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch calling leads",
      error: error.message,
    });
  }
};

export {
  createCampaign,
  getCampaigns,
  startCampaign,
  callStatusWebhook,
  getCallingLeads,
};