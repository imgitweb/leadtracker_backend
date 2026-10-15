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
    const call = await Call.findById(callRecordId).populate("contactId").populate("campaignId");

    if (!call) {
      console.warn(`Call record not found: ${callRecordId}`);
      const twiml = buildConversationalTwiML({
        speechText: "Namaste. Thank you for answering.",
        actionUrl: "",
        isEndCall: true,
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

    // Formulate natural initial greeting
    let initialGreeting = "";
    if (language.startsWith("hi") || language === "en-IN") {
      initialGreeting = `Namaste! Kya main ${contactName} ji se baat kar raha hoon?`;
    } else {
      initialGreeting = `Hello, am I speaking with ${contactName}?`;
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

    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
    const actionUrl = `${publicBaseUrl}/api/twilio/process-speech?callRecordId=${call._id}`;

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
    const call = await Call.findById(callRecordId).populate("contactId").populate("campaignId");

    if (!call) {
      res.type("text/xml");
      return res.send(buildConversationalTwiML({ speechText: "Thank you. Goodbye.", isEndCall: true }));
    }

    const campaign = call.campaignId;
    const language = campaign?.language || "hi-IN";
    const voice = campaign?.voice || "Polly.Aditi";
    const contactName = call.contactId?.name || "Customer";
    const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
    const actionUrl = `${publicBaseUrl}/api/twilio/process-speech?callRecordId=${call._id}`;

    // If user said something
    if (SpeechResult && SpeechResult.trim()) {
      console.log(`🗣️ User said: "${SpeechResult}"`);

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
      const history = transcriptDoc?.messages || [];

      // 3. Generate response using OpenAI GPT-3.5 Turbo
      const aiResponse = await generateConversationalResponse({
        systemPrompt: campaign?.systemPrompt || campaign?.prompt,
        conversationHistory: history,
        userSpeech: SpeechResult.trim(),
        contactName,
        language,
      });

      console.log(`🤖 AI replying: "${aiResponse.reply}" (shouldEndCall: ${aiResponse.shouldEndCall})`);

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
