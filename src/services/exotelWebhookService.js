import CallingLead from "../models/CallingLead.js";
import Campaign from "../models/Campaign.js";

class ExotelWebhookService {
  async handleWebhook(payload) {
    try {
      console.log("========== EXOTEL WEBHOOK ==========");
      console.log(JSON.stringify(payload, null, 2));

      // Exotel may send Call object or flat payload
      const call = payload.Call || payload;

      const sid =
        call.Sid ||
        call.CallSid ||
        call.CallSidNumber;

      if (!sid) {
        throw new Error("Exotel Call SID missing.");
      }

      const lead = await CallingLead.findOne({
        exotelCallSid: sid,
      });

      if (!lead) {
        console.warn(`Lead not found for SID: ${sid}`);
        return null;
      }

      // -------------------------
      // Update Lead
      // -------------------------

      lead.callStatus = this.mapStatus(call.Status);

      lead.callDuration = Number(
        call.Duration || 0
      );

      lead.callPrice = Number(
        call.Price || 0
      );

      lead.answeredBy =
        call.AnsweredBy || "";

      lead.callEndedAt = new Date();

      if (
        call.RecordingUrl ||
        call.PreSignedRecordingUrl
      ) {
        lead.recording = {
          url: call.RecordingUrl || "",
          presignedUrl:
            call.PreSignedRecordingUrl || "",
        };
      }

      await lead.save();

      await this.updateCampaignStats(
        lead.campaignId
      );

      console.log(
        `Lead ${lead.phone} updated -> ${lead.callStatus}`
      );

      return lead;
    } catch (error) {
      console.error(
        "Exotel Webhook Error"
      );
      console.error(error);

      throw error;
    }
  }

  mapStatus(status = "") {
    switch (status.toLowerCase()) {
      case "completed":
      case "completed_successfully":
        return "completed";

      case "busy":
        return "busy";

      case "failed":
      case "failed_error":
        return "failed";

      case "no-answer":
      case "no_answer":
      case "no answer":
        return "no_answer";

      case "ringing":
      case "queued":
      case "initiated":
      case "in-progress":
      case "inprogress":
        return "calling";

      default:
        return "unknown";
    }
  }

  async updateCampaignStats(campaignId) {
    if (!campaignId) return;

    const stats = await CallingLead.aggregate([
      {
        $match: {
          campaignId,
        },
      },
      {
        $group: {
          _id: null,

          totalLeads: {
            $sum: 1,
          },

          totalAnswered: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$answeredBy",
                    "human",
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalCompleted: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$callStatus",
                    "completed",
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalFailed: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$callStatus",
                    "failed",
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalBusy: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$callStatus",
                    "busy",
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalNoAnswer: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$callStatus",
                    "no_answer",
                  ],
                },
                1,
                0,
              ],
            },
          },

          totalQualified: {
            $sum: {
              $cond: [
                {
                  $eq: [
                    "$status",
                    "qualified",
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalLeads: 0,
      totalAnswered: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalBusy: 0,
      totalNoAnswer: 0,
      totalQualified: 0,
    };

    const progress =
      result.totalLeads === 0
        ? 0
        : Math.round(
            ((result.totalCompleted +
              result.totalFailed +
              result.totalBusy +
              result.totalNoAnswer) *
              100) /
              result.totalLeads
          );

    await Campaign.findByIdAndUpdate(
      campaignId,
      {
        ...result,
        progress,

        ...(progress === 100 && {
          status: "completed",
          completedAt: new Date(),
        }),
      }
    );
  }
}

export default new ExotelWebhookService();