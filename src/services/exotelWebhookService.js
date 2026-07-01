import CallingLead from "../models/CallingLead.js";
import Campaign from "../models/Campaign.js";

class ExotelWebhookService {
  async handleWebhook(body) {
    try {
      const call = body.Call || body;

      const sid = call.Sid;

      if (!sid) {
        throw new Error("Missing Exotel Call SID");
      }

      const lead = await CallingLead.findOne({
        exotelCallSid: sid,
      });

      if (!lead) {
        console.log("Lead not found:", sid);
        return;
      }

      // ----------------------------
      // Save Exotel Data
      // ----------------------------

      lead.callStatus = this.mapStatus(call.Status);

      lead.callDuration = Number(call.Duration || 0);

      lead.callPrice = Number(call.Price || 0);

      lead.answeredBy = call.AnsweredBy || "";

      lead.callEndedAt = new Date();

      if (call.RecordingUrl) {
        lead.recording = {
          url: call.RecordingUrl,
          presignedUrl: call.PreSignedRecordingUrl || "",
        };
      }

      await lead.save();

      await this.updateCampaignStats(lead.campaignId);

      console.log(
        `✅ Lead Updated (${lead.phone}) Status : ${lead.callStatus}`
      );

      return lead;
    } catch (error) {
      console.error(
        "Exotel Webhook Error:",
        error.message
      );

      throw error;
    }
  }

  mapStatus(status) {
    switch ((status || "").toLowerCase()) {
      case "completed":
        return "completed";

      case "busy":
        return "busy";

      case "failed":
        return "failed";

      case "no-answer":
      case "no_answer":
        return "no_answer";

      case "in-progress":
      case "inprogress":
      case "ringing":
        return "calling";

      default:
        return "completed";
    }
  }

  async updateCampaignStats(campaignId) {
    if (!campaignId) return;

    const [
      totalLeads,
      totalAnswered,
      totalCompleted,
      totalFailed,
      totalBusy,
      totalNoAnswer,
      totalQualified,
    ] = await Promise.all([
      CallingLead.countDocuments({
        campaignId,
      }),

      CallingLead.countDocuments({
        campaignId,
        answeredBy: "human",
      }),

      CallingLead.countDocuments({
        campaignId,
        callStatus: "completed",
      }),

      CallingLead.countDocuments({
        campaignId,
        callStatus: "failed",
      }),

      CallingLead.countDocuments({
        campaignId,
        callStatus: "busy",
      }),

      CallingLead.countDocuments({
        campaignId,
        callStatus: "no_answer",
      }),

      CallingLead.countDocuments({
        campaignId,
        status: "qualified",
      }),
    ]);

    const progress =
      totalLeads === 0
        ? 0
        : Math.round(
            ((totalCompleted +
              totalFailed +
              totalBusy +
              totalNoAnswer) /
              totalLeads) *
              100
          );

    await Campaign.findByIdAndUpdate(campaignId, {
      totalLeads,
      totalAnswered,
      totalCompleted,
      totalFailed,
      totalBusy,
      totalNoAnswer,
      totalQualified,
      progress,

      ...(progress === 100
        ? {
            status: "completed",
            completedAt: new Date(),
          }
        : {}),
    });
  }
}

export default new ExotelWebhookService();