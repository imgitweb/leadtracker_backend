import CallingLead from "../models/CallingLead.js";
import Campaign from "../models/Campaign.js";
import exotelService from "../services/exotelService.js";

const WORKER_INTERVAL = 3000;
const MAX_RETRIES = 3;
const DEFAULT_BATCH_SIZE = Number(process.env.CAMPAIGN_BATCH_SIZE) || 5;

let isWorkerRunning = false;

// Tracks the last time a batch was dispatched per campaign, so we can
// honor campaign.callGapSeconds as the gap *between batches* instead of
// firing a new batch every single 3s tick.
const lastBatchDispatchAt = new Map();

const campaignWorker = async () => {
  if (isWorkerRunning) return;

  isWorkerRunning = true;

  try {
    const now = new Date();

    const campaigns = await Campaign.find({ status: "running" });

    if (!campaigns.length) return;

    for (const campaign of campaigns) {
      try {
        // Campaign not started yet
        if (campaign.startTime && now < campaign.startTime) {
          continue;
        }

        // Campaign expired
        if (campaign.endTime && now > campaign.endTime) {
          campaign.status = "completed";
          campaign.completedAt = new Date();
          await campaign.save();

          console.log(`✅ Campaign completed by end time: ${campaign.campaignName}`);
          lastBatchDispatchAt.delete(String(campaign._id));
          continue;
        }

        // Pending Leads (anything still in flight or waiting)
        const pendingLeads = await CallingLead.countDocuments({
          campaignId: campaign._id,
          callStatus: { $in: ["pending", "queued", "processing", "calling"] },
        });

        if (pendingLeads === 0) {
          campaign.status = "completed";
          campaign.completedAt = new Date();
          await campaign.save();

          console.log(`✅ Campaign completed: ${campaign.campaignName}`);
          lastBatchDispatchAt.delete(String(campaign._id));
          continue;
        }

        // Respect callGapSeconds between batches
        const gapMs = (campaign.callGapSeconds || 60) * 1000;
        const lastDispatch = lastBatchDispatchAt.get(String(campaign._id));
        if (lastDispatch && now.getTime() - lastDispatch < gapMs) {
          continue; // not time for next batch yet
        }

        // Claim a batch of leads atomically (one at a time, since Mongo
        // doesn't support an atomic "claim N docs" op) and process them
        // in parallel.
        const batchSize = campaign.batchSize || DEFAULT_BATCH_SIZE;
        const claimedLeads = [];

        for (let i = 0; i < batchSize; i++) {
          const lead = await CallingLead.findOneAndUpdate(
            {
              campaignId: campaign._id,
              callStatus: "queued",
              retryCount: { $lt: MAX_RETRIES },
            },
            { $set: { callStatus: "processing" } },
            { sort: { createdAt: 1 }, new: true },
          );

          if (!lead) break; // no more queued leads
          claimedLeads.push(lead);
        }

        if (!claimedLeads.length) continue;

        lastBatchDispatchAt.set(String(campaign._id), now.getTime());

        console.log(
          `📞 Dispatching batch of ${claimedLeads.length} | Campaign: ${campaign.campaignName}`,
        );

        await Promise.all(
          claimedLeads.map(async (lead) => {
            try {
              const call = await exotelService.makeCall({
                phone: lead.phone,
                leadId: lead._id.toString(),
                campaignId: campaign._id.toString(),
                prompt: campaign.prompt,
                voice: campaign.voice,
              });

              lead.exotelCallSid = call.Sid;
              lead.callStatus = "calling";
              lead.callStartedAt = new Date();
              lead.lastCallAt = new Date();

              await lead.save();

              console.log(`✅ Call Started | ${lead.phone} | SID: ${call.Sid}`);
            } catch (callError) {
              console.error(
                `❌ Call Failed (${lead.phone})`,
                callError.response?.data || callError.message,
              );

              lead.callStatus = "failed";
              lead.retryCount = (lead.retryCount || 0) + 1;
              lead.lastCallAt = new Date();

              // requeue for retry instead of leaving it permanently failed
              if (lead.retryCount < MAX_RETRIES) {
                lead.callStatus = "queued";
              }

              await lead.save();
            }
          }),
        );
      } catch (campaignError) {
        console.error(`❌ Campaign Error (${campaign.campaignName})`, campaignError.message);
      }
    }
  } catch (error) {
    console.error("❌ Campaign Worker Error:", error.message);
  } finally {
    isWorkerRunning = false;
  }
};

// Run every 3 seconds
setInterval(campaignWorker, WORKER_INTERVAL);

// Initial Start
setTimeout(() => {
  campaignWorker();
}, 5000);

console.log("✅ Exotel Campaign Worker Started (parallel batch mode)");

export default campaignWorker;