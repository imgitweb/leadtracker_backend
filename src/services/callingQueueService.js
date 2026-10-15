import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Call from "../models/Call.js";
import { initiateTwilioOutboundCall } from "./twilioService.js";

let isQueueProcessing = false;
let queueInterval = null;

/**
 * Process a single step for all running campaigns
 */
export const processCallingQueue = async (ioInstance = null) => {
  if (isQueueProcessing) return;
  isQueueProcessing = true;

  try {
    // 1. Find all running campaigns
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

    // Count currently active calls for this campaign
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
        // All contacts processed and no active calls, campaign complete!
        campaign.status = "completed";
        campaign.completedAt = new Date();
        await campaign.save();

        console.log(`🎉 Campaign completed: ${campaign.name} (${campaign._id})`);

        if (ioInstance) {
          ioInstance.emit("campaign_status_changed", {
            campaignId: campaign._id,
            status: "completed",
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
          fromNumber: campaign.callerId || process.env.TWILIO_PHONE_NUMBER,
          toNumber: contact.phone,
          status: "queued",
          startTime: new Date(),
        });

        // Fire outbound call via Twilio
        try {
          const twilioCall = await initiateTwilioOutboundCall({
            to: contact.phone,
            from: campaign.callerId,
            callRecordId: callRecord._id.toString(),
            publicBaseUrl: process.env.PUBLIC_BASE_URL || process.env.APP_URL,
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
          console.error(`Twilio call failed for ${contact.phone}:`, twilioError.message);

          callRecord.status = "failed";
          callRecord.errorMessage = twilioError.message;
          callRecord.endTime = new Date();
          await callRecord.save();

          contact.callStatus = "failed";
          await contact.save();

          await Campaign.findByIdAndUpdate(campaignId, {
            $inc: { callsFailed: 1 },
          });
        }
      } catch (contactErr) {
        console.error(`Error dispatching call for contact ${contact._id}:`, contactErr.message);
      }
    }
  } catch (error) {
    console.error(`Error processing campaign ${campaign._id}:`, error.message);
  }
};

/**
 * Starts the calling queue background worker
 */
export const startCallingQueueWorker = (ioInstance = null) => {
  if (queueInterval) return;

  console.log("🚀 AI Calling Queue Worker Initialized (5s interval)");
  queueInterval = setInterval(() => {
    processCallingQueue(ioInstance).catch((err) => {
      console.error("Queue worker error:", err.message);
    });
  }, 5000);
};

export default {
  processCallingQueue,
  processCampaignBatch,
  startCallingQueueWorker,
};
