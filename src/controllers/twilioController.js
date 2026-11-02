import mongoose from "mongoose";
import Call from "../models/Call.js";
import Contact from "../models/Contact.js";
import Campaign from "../models/Campaign.js";
import { buildConversationalTwiML } from "../services/twilioService.js";
import { generateConversationalResponse } from "../services/openaiService.js";
import { appendMessageToTranscript, getTranscriptByCallId, finalizeTranscript } from "../services/conversationService.js";
import { analyzeCall } from "../services/callAnalysisService.js";
import { processCallingQueue } from "../services/callingQueueService.js";

/**
 * 1. Initial Voice Webhook
 * Twilio hits this URL when the call is answered by the customer
 */
export const handleVoiceWebhook = async (req, res) => {
  const { callRecordId } = req.query;
  const { CallSid } = req.body;

  try {
    let call = null;
    if (callRecordId && mongoose.Types.ObjectId.isValid(callRecordId)) {
      call = await Call.findById(callRecordId).populate("contactId").populate("campaignId");
    }

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
    const safeCallId = call ? call._id.toString() : (callRecordId || "interactive_call");
    const actionUrl = `${publicBaseUrl}/api/twilio/process-speech?callRecordId=${safeCallId}`;

    if (!call) {
      console.warn(`Call record not found in DB for ID: ${callRecordId}. Starting interactive conversational AI flow.`);
      const initialGreeting = "Namaste ji! Main Cinfy Solutions se baat kar rahi hoon. Kya ek minute baat karne ka samay hoga aapke paas?";
      const twiml = buildConversationalTwiML({
        speechText: initialGreeting,
        actionUrl,
        language: "hi-IN",
        voice: "Polly.Aditi",
        isEndCall: false,
      });
      res.type("text/xml");
      return res.send(twiml);
    }

    // Update call status
    call.status = "in-progress";
    if (CallSid && call.callSid.startsWith("pending_")) {
      call.callSid = CallSid;
    }
    call.startTime = new Date();
    await call.save();

    if (call.contactId) {
      await Contact.findByIdAndUpdate(call.contactId._id, { callStatus: "in-progress" });
    }

    const contactName = call.contactId?.name || "Customer";
    const campaign = call.campaignId;
    const language = campaign?.language || "hi-IN";
    const voice = campaign?.voice || "Polly.Aditi";

    // Formulate natural human telecaller greeting
    let initialGreeting = "";
    if (language.startsWith("hi") || language === "en-IN") {
      const salutation = contactName && contactName !== "Customer" ? `${contactName} ji` : "ji";
      initialGreeting = `Namaste ${salutation}! Main Cinfy Solutions se baat kar rahi hoon. Kya ek minute baat karne ka samay hoga aapke paas?`;
    } else {
      const salutation = contactName && contactName !== "Customer" ? ` ${contactName}` : "";
      initialGreeting = `Hello${salutation}! I am calling from Cinfy Solutions. Do you have a quick minute to speak?`;
    }

    // Save initial greeting to transcript
    await appendMessageToTranscript({
      callId: call._id,
      callSid: call.callSid,
      campaignId: call.campaignId?._id,
      contactId: call.contactId?._id,
      speaker: "AI Agent",
      text: initialGreeting,
      language,
    });

    const twiml = buildConversationalTwiML({
      speechText: initialGreeting,
      actionUrl,
      language,
      voice,
      isEndCall: false,
    });

    res.type("text/xml");
    return res.send(twiml);
  } catch (error) {
    console.error("Error in handleVoiceWebhook:", error);
    const twiml = buildConversationalTwiML({
      speechText: "Namaste. We will connect with you shortly.",
      actionUrl: "",
      isEndCall: true,
    });
    res.type("text/xml");
    return res.send(twiml);
  }
};

/**
 * 2. Process Speech Webhook
 * Twilio hits this URL with SpeechResult when user speaks
 */
export const handleProcessSpeech = async (req, res) => {
  const { callRecordId } = req.query;
  const { SpeechResult } = req.body;

  try {
    let call = null;
    if (callRecordId && mongoose.Types.ObjectId.isValid(callRecordId)) {
      call = await Call.findById(callRecordId).populate("contactId").populate("campaignId");
    }

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
    const safeCallId = call ? call._id.toString() : (callRecordId || "interactive_call");
    const actionUrl = `${publicBaseUrl}/api/twilio/process-speech?callRecordId=${safeCallId}`;

    const campaign = call?.campaignId;
    const language = campaign?.language || "hi-IN";
    const voice = campaign?.voice || "Polly.Aditi";
    const contactName = call?.contactId?.name || "Customer";

    // If user said something
    if (SpeechResult && SpeechResult.trim()) {
      console.log(`🗣️ User said: "${SpeechResult}"`);

      let history = [];
      if (call) {
        // 1. Save user speech to transcript
        await appendMessageToTranscript({
          callId: call._id,
          callSid: call.callSid,
          campaignId: call.campaignId?._id,
          contactId: call.contactId?._id,
          speaker: "User",
          text: SpeechResult.trim(),
          language,
        });

        // 2. Fetch full conversation history
        const transcriptDoc = await getTranscriptByCallId(call._id);
        history = transcriptDoc?.messages || [];
      }

      // 3. Generate response using OpenAI GPT-3.5 Turbo
      const aiResponse = await generateConversationalResponse({
        systemPrompt: campaign?.systemPrompt || campaign?.prompt || "Aap ek polite aur helpful AI Voice Calling Agent hain Cinfy Solutions ki taraf se. Customer se Hindi/Hinglish mein natural tareeqe se baat karein, unke sawalon ka spasht jawab dein aur 1-2 sentence mein answer karein.",
        conversationHistory: history,
        userSpeech: SpeechResult.trim(),
        contactName,
        language,
      });

      console.log(`🤖 AI replying: "${aiResponse.reply}" (shouldEndCall: ${aiResponse.shouldEndCall})`);

      if (call) {
        // 4. Save AI reply to transcript
        await appendMessageToTranscript({
          callId: call._id,
          callSid: call.callSid,
          campaignId: call.campaignId?._id,
          contactId: call.contactId?._id,
          speaker: "AI Agent",
          text: aiResponse.reply,
          language,
        });
      }

      const twiml = buildConversationalTwiML({
        speechText: aiResponse.reply,
        actionUrl,
        language,
        voice,
        isEndCall: aiResponse.shouldEndCall,
      });

      res.type("text/xml");
      return res.send(twiml);
    }

    // If user was silent
    const silencePrompt = language.startsWith("hi")
      ? "Kya aapko meri aawaz aa rahi hai? Kripya bataiye."
      : "Could you please repeat that? I am listening.";

    const twiml = buildConversationalTwiML({
      speechText: silencePrompt,
      actionUrl,
      language,
      voice,
      isEndCall: false,
    });

    res.type("text/xml");
    return res.send(twiml);
  } catch (error) {
    console.error("Error in handleProcessSpeech:", error);
    const twiml = buildConversationalTwiML({
      speechText: "Dhanyawad. We will reach out to you later.",
      actionUrl: "",
      isEndCall: true,
    });
    res.type("text/xml");
    return res.send(twiml);
  }
};

/**
 * 3. Call Status Webhook
 * Twilio updates: initiated, ringing, answered, completed, busy, no-answer, failed
 */
export const handleCallStatus = async (req, res) => {
  const { callRecordId } = req.query;
  const { CallStatus, CallDuration, CallSid } = req.body;

  try {
    const call = await Call.findById(callRecordId);
    if (!call) {
      return res.status(200).send("OK");
    }

    const previousStatus = call.status;
    call.status = CallStatus || call.status;

    if (CallSid && call.callSid.startsWith("pending_")) {
      call.callSid = CallSid;
    }

    if (CallDuration) {
      call.duration = parseInt(CallDuration, 10);
    }

    const isTerminalStatus = ["completed", "busy", "no-answer", "failed", "canceled"].includes(CallStatus);

    if (isTerminalStatus) {
      call.endTime = new Date();
    }

    await call.save();

    // Update Contact status
    if (call.contactId) {
      await Contact.findByIdAndUpdate(call.contactId, {
        callStatus: CallStatus,
        lastCallTime: new Date(),
      });
    }

    // Update Campaign counters on terminal status
    if (isTerminalStatus && previousStatus !== CallStatus) {
      const updateData = {};
      if (CallStatus === "completed") {
        updateData.callsCompleted = 1;
      } else {
        updateData.callsFailed = 1;
      }
      await Campaign.findByIdAndUpdate(call.campaignId, { $inc: updateData });
    }

    // If call ended, trigger Transcript finalization and AI Analysis
    if (isTerminalStatus) {
      await finalizeTranscript(call._id);

      const io = req.app.get("socketio");

      // Analyze call in background
      analyzeCall(call._id, io).catch((err) => {
        console.error("Async call analysis error:", err.message);
      });

      // Trigger queue to dispatch next pending call
      processCallingQueue(io).catch((err) => {
        console.error("Queue dispatch trigger error:", err.message);
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Error in handleCallStatus:", error);
    return res.status(200).send("OK");
  }
};

/**
 * 4. Recording Status Callback
 */
export const handleRecordingStatus = async (req, res) => {
  const { callRecordId } = req.query;
  const { RecordingUrl } = req.body;

  try {
    if (RecordingUrl) {
      await Call.findByIdAndUpdate(callRecordId, {
        recordingUrl: RecordingUrl,
      });
    }
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Error in handleRecordingStatus:", error);
    return res.status(200).send("OK");
  }
};

export default {
  handleVoiceWebhook,
  handleProcessSpeech,
  handleCallStatus,
  handleRecordingStatus,
};
