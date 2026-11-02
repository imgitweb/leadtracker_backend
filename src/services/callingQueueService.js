import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Call from "../models/Call.js";
import { initiateTwilioOutboundCall } from "./twilioService.js";
import { getTwilioClient } from "../config/twilio.js";

let isQueueProcessing = false;
let queueInterval = null;

/**
 * Process a single step for all running campaigns
 */
export const processCallingQueue = async (ioInstance = null) => {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  try {
    const runningCampaigns = await Campaign.find({ status: "running" });

    for (const campaign of runningCampaigns) {
      await processCampaignBatch(campaign, ioInstance);
    }
  } catch (error) {
    console.error("Calling Queue Processing Error:", error.message);
  } finally {
    isQueueProcessing = false;
  }
};

/**
 * Dispatches calls for a specific campaign according to its concurrency limits
 */
export const processCampaignBatch = async (campaign, ioInstance = null) => {
  try {
    const campaignId = campaign._id;

    // 1. Auto-sync in-flight calls directly with Twilio so finished calls are never left hanging
    const inFlightCalls = await Call.find({
      campaignId,
      status: { $in: ["queued", "initiated", "ringing", "in-progress"] },
      callSid: { $regex: /^CA/i },
    });

    for (const inFlight of inFlightCalls) {
      try {
        const twClient = getTwilioClient();
        if (twClient) {
          const liveCall = await twClient.calls(inFlight.callSid).fetch();
          if (["completed", "busy", "no-answer", "failed", "canceled"].includes(liveCall.status)) {
            const prevStatus = inFlight.status;
            inFlight.status = liveCall.status;
            inFlight.duration = parseInt(liveCall.duration || 0, 10);
            inFlight.endTime = new Date();
            await inFlight.save();

            if (inFlight.contactId) {
              await Contact.findByIdAndUpdate(inFlight.contactId, {
                callStatus: liveCall.status,
                lastCallTime: new Date(),
              });
            }

            if (prevStatus !== liveCall.status) {
              const field = liveCall.status === "completed" ? "callsCompleted" : "callsFailed";
              await Campaign.findByIdAndUpdate(campaignId, { $inc: { [field]: 1 } });
            }
          }
        }
      } catch (e) {
        // Ignore single call fetch errors and continue
      }
    }

    // 2. Count currently active calls for this campaign after live sync
    const activeCallsCount = await Call.countDocuments({
      campaignId,
      status: { $in: ["queued", "initiated", "ringing", "in-progress"] },
    });

    const maxConcurrent = campaign.maxConcurrentCalls || 2;
    const availableSlots = maxConcurrent - activeCallsCount;

    if (availableSlots <= 0) {
      // Concurrency limit reached, wait for current calls to complete
      return;
    }

    // Find next eligible contacts
    // Contacts that are pending OR failed/busy/no-answer with attempts < retryLimit
    const retryLimit = campaign.retryLimit || 1;

    const eligibleContacts = await Contact.find({
      campaignId,
      doNotCall: false,
      callStatus: { $in: ["pending", "busy", "no-answer"] },
      attempts: { $lte: retryLimit },
    })
      .sort({ attempts: 1, createdAt: 1 })
      .limit(availableSlots);

    if (eligibleContacts.length === 0) {
      // Check if there are any remaining calls in progress
      if (activeCallsCount === 0) {
        const refreshedCampaign = await Campaign.findById(campaignId);
        const completedCount = refreshedCampaign?.callsCompleted || 0;
        const failedCount = refreshedCampaign?.callsFailed || 0;

        if (completedCount === 0 && failedCount > 0) {
          campaign.status = "failed";
          console.warn(`⚠️ [CallingQueue] Campaign finished with failures: ${campaign.name} (${failedCount} calls failed, 0 completed).`);
        } else {
          campaign.status = "completed";
          console.log(`🎉 [CallingQueue] Campaign completed: ${campaign.name} (${completedCount} completed, ${failedCount} failed).`);
        }
        campaign.completedAt = new Date();
        await campaign.save();

        if (ioInstance) {
          ioInstance.emit("campaign_status_changed", {
            campaignId: campaign._id,
            status: campaign.status,
          });
        }
      }
      return;
    }

    // Dispatch calls for eligible contacts
    for (const contact of eligibleContacts) {
      try {
        // Mark contact as queued and increment attempts
        contact.callStatus = "queued";
        contact.attempts = (contact.attempts || 0) + 1;
        contact.lastCallTime = new Date();
        await contact.save();

        // Create pre-call record in DB
        const callRecord = await Call.create({
          contactId: contact._id,
          campaignId: campaign._id,
          company: campaign.company,
          callSid: `pending_${contact._id}_${Date.now()}`,
          fromNumber: (campaign.callerId && campaign.callerId !== "+17372508034") ? campaign.callerId : (process.env.TWILIO_PHONE_NUMBER || "+17372212163"),
          toNumber: contact.phone,
          status: "queued",
          startTime: new Date(),
        });

        // Fire outbound call via Twilio
        try {
          const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
          const twilioCall = await initiateTwilioOutboundCall({
            to: contact.phone,
            from: (campaign.callerId && campaign.callerId !== "+17372508034") ? campaign.callerId : (process.env.TWILIO_PHONE_NUMBER || "+17372212163"),
            callRecordId: callRecord._id.toString(),
            publicBaseUrl,
            recordCall: false,
          });

          // Update call record with actual Twilio Call SID
          callRecord.callSid = twilioCall.sid;
          callRecord.status = "initiated";
          await callRecord.save();

          contact.callStatus = "initiated";
          contact.lastCallSid = twilioCall.sid;
          await contact.save();

          await Campaign.findByIdAndUpdate(campaignId, {
            $inc: { callsInitiated: 1 },
          });

          if (ioInstance) {
            ioInstance.emit("call_initiated", {
              callId: callRecord._id,
              campaignId,
              contact: { name: contact.name, phone: contact.phone },
            });
          }
        } catch (twilioError) {
          console.error(`❌ [CallingQueue] Twilio call failed for ${contact.phone}: ${twilioError.message}`);

          // Mark call as failed in DB
          callRecord.status = "failed";
          callRecord.errorMessage = twilioError.message;
          callRecord.endTime = new Date();
          await callRecord.save();

          contact.callStatus = "failed";
          await contact.save();

          await Campaign.findByIdAndUpdate(campaignId, {
            $inc: { callsFailed: 1 },
          });

          if (ioInstance) {
            ioInstance.emit("call_failed", {
              callId: callRecord._id,
              campaignId,
              contact: { name: contact.name, phone: contact.phone },
              error: twilioError.message,
            });
          }
        }
      } catch (contactError) {
        console.error(`❌ [CallingQueue] Error processing contact ${contact._id}:`, contactError.message);
      }
    }
  } catch (error) {
    console.error("Process Campaign Batch Error:", error.message);
  }
};

/**
 * Start the background queue worker (Runs every 10 seconds)
 */
export const startCallingQueueWorker = (ioInstance = null) => {
  if (queueInterval) return;

  console.log("🚀 [CallingQueue] Background calling worker started (10s cycle).");
  queueInterval = setInterval(() => {
    processCallingQueue(ioInstance).catch((err) => {
      console.error("❌ [CallingQueue] Worker loop error:", err.message);
    });
  }, 10000);
};

/**
 * Stop the background queue worker
 */
export const stopCallingQueueWorker = () => {
  if (queueInterval) {
    clearInterval(queueInterval);
    queueInterval = null;
    console.log("🛑 [CallingQueue] Background calling worker stopped.");
  }
};

export default {
  processCallingQueue,
  processCampaignBatch,
  startCallingQueueWorker,
  stopCallingQueueWorker,
};
