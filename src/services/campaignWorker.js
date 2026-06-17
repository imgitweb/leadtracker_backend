import CallingLead from "../models/CallingLead.js";
import Campaign from "../models/Campaign.js";
import { makeCampaignCall } from "./twilioCampaignService.js";

const WORKER_INTERVAL = 3000;
const MAX_RETRIES = 3;

let isWorkerRunning = false;

const campaignWorker = async () => {
  if (isWorkerRunning) return;

  isWorkerRunning = true;

  try {
    const now = new Date();

    const campaigns = await Campaign.find({
      status: "running",
    });

    if (!campaigns.length) {
      return;
    }

    for (const campaign of campaigns) {
      try {
        // Campaign schedule validation
        if (campaign.startTime && now < campaign.startTime) {
          continue;
        }

        if (campaign.endTime && now > campaign.endTime) {
          campaign.status = "completed";
          await campaign.save();

          console.log(
            `✅ Campaign completed by endTime: ${campaign.campaignName}`
          );

          continue;
        }

        // Check if campaign finished
        const pendingLeads = await CallingLead.countDocuments({
          campaignId: campaign._id,
          callStatus: {
            $in: [
              "pending",
              "queued",
              "processing",
              "calling",
            ],
          },
        });

        if (pendingLeads === 0) {
          campaign.status = "completed";
          await campaign.save();

          console.log(
            `✅ Campaign completed: ${campaign.campaignName}`
          );

          continue;
        }

        // Pick next lead atomically
        const lead = await CallingLead.findOneAndUpdate(
          {
            campaignId: campaign._id,
            callStatus: "queued",
            retryCount: {
              $lt: MAX_RETRIES,
            },
          },
          {
            $set: {
              callStatus: "processing",
            },
          },
          {
            sort: {
              createdAt: 1,
            },
            new: true,
          }
        );

        if (!lead) {
          continue;
        }

        console.log(
          `📞 Calling ${lead.phone} | Campaign: ${campaign.campaignName}`
        );

        try {
          const call = await makeCampaignCall({
            phone: lead.phone,
            leadId: lead._id.toString(),
            campaignId: campaign._id.toString(),
            prompt: campaign.prompt,
            voice: campaign.voice || "priyanka",
          });

          lead.callSid = call.sid;
          lead.callStatus = "calling";
          lead.lastCallAt = new Date();

          await lead.save();

          console.log(
            `✅ Call Started | ${lead.phone} | ${call.sid}`
          );
        } catch (callError) {
          console.error(
            `❌ Call Failed (${lead.phone})`,
            callError.message
          );

          lead.callStatus = "failed";
          lead.retryCount =
            (lead.retryCount || 0) + 1;

          lead.lastCallAt = new Date();

          await lead.save();
        }
      } catch (campaignError) {
        console.error(
          `❌ Campaign Error (${campaign.campaignName})`,
          campaignError.message
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ Campaign Worker Error:",
      error.message
    );
  } finally {
    isWorkerRunning = false;
  }
};

setInterval(campaignWorker, WORKER_INTERVAL);

setTimeout(() => {
  campaignWorker();
}, 5000);

console.log("✅ MongoDB Campaign Worker Started");

export default campaignWorker;