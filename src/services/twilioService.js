import twilio from "twilio";
import { getTwilioClient, isTwilioConfigured } from "../config/twilio.js";
import dotenv from "dotenv";
dotenv.config();

const VoiceResponse = twilio.twiml.VoiceResponse;

export const initiateTwilioOutboundCall = async ({
  to,
  from,
  callRecordId,
  publicBaseUrl,
  recordCall = false,
}) => {
  if (!isTwilioConfigured()) {
    throw new Error("Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are not configured.");
  }

  const client = getTwilioClient();
  const callerNumber = from || process.env.TWILIO_PHONE_NUMBER;

  if (!callerNumber) {
    throw new Error("Twilio Caller ID (from number) is missing.");
  }

  const baseUrl = (publicBaseUrl || process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("PUBLIC_BASE_URL or APP_URL is required for Twilio webhooks to connect.");
  }

  const voiceUrl = `${baseUrl}/api/twilio/voice?callRecordId=${callRecordId}`;
  const statusCallbackUrl = `${baseUrl}/api/twilio/call-status?callRecordId=${callRecordId}`;
  const recordingStatusCallbackUrl = `${baseUrl}/api/twilio/recording-status?callRecordId=${callRecordId}`;

  const callParams = {
    url: voiceUrl,
    to,
    from: callerNumber,
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    statusCallbackMethod: "POST",
    timeLimit: 600, // 10 minutes max call safety limit
  };

  if (recordCall) {
    callParams.record = true;
    callParams.recordingStatusCallback = recordingStatusCallbackUrl;
  }

  console.log(`📞 Initiating Twilio call to ${to} from ${callerNumber}...`);
  const twilioCall = await client.calls.create(callParams);
  console.log(`✅ Twilio call created! SID: ${twilioCall.sid}`);

  return twilioCall;
};

/**
 * Builds conversational TwiML with Speech Gather
 */
export const buildConversationalTwiML = ({
  speechText,
  actionUrl,
  language = "hi-IN",
  voice = "Polly.Aditi",
  isEndCall = false,
}) => {
  const response = new VoiceResponse();

  if (isEndCall) {
    if (speechText) {
      response.say({ voice, language }, speechText);
    }
    response.hangup();
    return response.toString();
  }

  // Gather speech input from the user after AI speaks
  const gather = response.gather({
    input: "speech",
    action: actionUrl,
    method: "POST",
    language,
    speechTimeout: "auto",
    speechModel: "phone_call",
    timeout: 3,
  });

  if (speechText) {
    gather.say({ voice, language }, speechText);
  }

  // Fallback if user doesn't say anything
  response.say(
    { voice, language },
    language.startsWith("hi")
      ? "Kya aap sun pa rahe hain? Kripya bataiye."
      : "Are you still there? Please let me know."
  );

  // Second gather attempt
  const retryGather = response.gather({
    input: "speech",
    action: actionUrl,
    method: "POST",
    language,
    speechTimeout: "auto",
    timeout: 3,
  });

  // If still no response, hang up politely
  response.say(
    { voice, language },
    language.startsWith("hi")
      ? "Aapki aawaz nahi aa rahi hai. Hum baad mein call karenge. Dhanyawad."
      : "I couldn't hear any response. We will connect later. Thank you."
  );
  response.hangup();

  return response.toString();
};

export default {
  initiateTwilioOutboundCall,
  buildConversationalTwiML,
};
