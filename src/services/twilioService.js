import twilio from "twilio";
import { getTwilioClient, isTwilioConfigured } from "../config/twilio.js";
import dotenv from "dotenv";
dotenv.config();

const VoiceResponse = twilio.twiml.VoiceResponse;

/**
 * Normalizes any raw phone number into strict E.164 format (+[countryCode][digits])
 */
export const sanitizePhoneNumber = (rawPhone, defaultCountryCode = "91") => {
  if (!rawPhone) return "";
  const cleaned = String(rawPhone).trim().replace(/[^0-9+]/g, "");
  if (!cleaned) return "";

  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return `+${defaultCountryCode}${cleaned}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    return `+${defaultCountryCode}${cleaned.slice(1)}`;
  }
  if (cleaned.length >= 11 && cleaned.length <= 15) {
    return `+${cleaned}`;
  }
  return `+${cleaned}`;
};

/**
 * Initiates an outbound voice call via Twilio Programmable Voice
 */
export const initiateTwilioOutboundCall = async ({
  to,
  from,
  callRecordId,
  publicBaseUrl,
  recordCall = false,
}) => {
  if (!isTwilioConfigured()) {
    throw new Error(
      "Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are missing or not configured in environment variables."
    );
  }

  const client = getTwilioClient();

  // Ensure From number is valid and does not use the old deprecated number
  const rawCaller = (from && from !== "+17372508034")
    ? from
    : (process.env.TWILIO_PHONE_NUMBER || "+17372212163");

  const callerNumber = sanitizePhoneNumber(rawCaller);
  if (!callerNumber) {
    throw new Error("Twilio Caller ID (from number) is missing or invalid.");
  }

  // Ensure To number is sanitized to E.164
  const targetNumber = sanitizePhoneNumber(to);
  if (!targetNumber) {
    throw new Error(`Target destination number ('to') is invalid: ${to}`);
  }

  // Resolve webhook base URL
  const baseUrl = (publicBaseUrl || process.env.PUBLIC_BASE_URL || process.env.APP_URL || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("PUBLIC_BASE_URL or APP_URL is required for Twilio webhooks to connect.");
  }

  const voiceUrl = `${baseUrl}/api/twilio/voice?callRecordId=${callRecordId}`;
  const statusCallbackUrl = `${baseUrl}/api/twilio/call-status?callRecordId=${callRecordId}`;
  const recordingStatusCallbackUrl = `${baseUrl}/api/twilio/recording-status?callRecordId=${callRecordId}`;

  const callParams = {
    url: voiceUrl,
    to: targetNumber,
    from: callerNumber,
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  };

  if (recordCall) {
    callParams.record = true;
    callParams.recordingStatusCallback = recordingStatusCallbackUrl;
  }

  console.log(`📞 [TwilioService] Initiating call to ${targetNumber} from ${callerNumber} (webhook: ${voiceUrl})...`);

  try {
    const twilioCall = await client.calls.create(callParams);
    console.log(`✅ [TwilioService] Call created successfully! SID: ${twilioCall.sid}, Status: ${twilioCall.status}`);
    return twilioCall;
  } catch (err) {
    console.error(`❌ [TwilioService] Failed to create call: Code ${err.code || 'N/A'}: ${err.message}`);
    
    // Provide user-friendly hints for common Twilio trial and permission errors
    if (err.code === 21608) {
      throw new Error(`Twilio Trial Account restriction: The number ${targetNumber} is not verified. Please verify it in Twilio Console or upgrade account.`);
    } else if (err.code === 21210 || err.code === 21212) {
      throw new Error(`Twilio Caller ID error: ${callerNumber} is not a valid incoming phone number for this account.`);
    }
    throw err;
  }
};

/**
 * Builds conversational TwiML with Speech Gather and multi-language support
 */
export const buildConversationalTwiML = ({
  speechText,
  actionUrl,
  language = "hi-IN",
  voice = "Polly.Aditi",
  isEndCall = false,
}) => {
  const response = new VoiceResponse();

  // Safe voice fallback
  const resolvedVoice = voice || (language.startsWith("hi") ? "Polly.Aditi" : "Polly.Joanna");

  if (isEndCall) {
    if (speechText) {
      response.say({ voice: resolvedVoice, language }, speechText);
    }
    response.hangup();
    return response.toString();
  }

  // Gather speech input from customer
  // IMPORTANT: Twilio 'speechModel: phone_call' is ONLY valid for en-US.
  // For hi-IN, en-IN, and other languages, speechModel must be 'default'.
  const gatherConfig = {
    input: "speech",
    action: actionUrl,
    method: "POST",
    language,
    speechTimeout: "auto",
    timeout: 5,
  };

  if (language === "en-US") {
    gatherConfig.speechModel = "phone_call";
  } else {
    gatherConfig.speechModel = "default";
  }

  const gather = response.gather(gatherConfig);

  if (speechText) {
    gather.say({ voice: resolvedVoice, language }, speechText);
  }

  // Fallback if user doesn't respond during the first gather window
  const fallbackText = language.startsWith("hi") || language === "en-IN"
    ? "Kya aap sun pa rahe hain? Kripya bataiye."
    : "Are you still there? Please let me know.";

  // Second retry gather with audible prompt
  const retryGather = response.gather(gatherConfig);
  retryGather.say({ voice: resolvedVoice, language }, fallbackText);

  // Polite goodbye only if user remains completely silent across both gathers
  const finalGoodbye = language.startsWith("hi") || language === "en-IN"
    ? "Aapki aawaz nahi aa rahi hai. Hum baad mein call karenge. Dhanyawad."
    : "I couldn't hear any response. We will connect with you later. Thank you.";

  response.say({ voice: resolvedVoice, language }, finalGoodbye);
  response.hangup();

  return response.toString();
};

export default {
  initiateTwilioOutboundCall,
  buildConversationalTwiML,
  sanitizePhoneNumber,
};
