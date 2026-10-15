import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const callerId = process.env.TWILIO_PHONE_NUMBER;

let client = null;

export const isTwilioConfigured = () => {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  return Boolean(sid && token && sid.startsWith("AC"));
};

export const getTwilioClient = () => {
  if (!isTwilioConfigured()) {
    console.warn("⚠️ Twilio credentials missing or invalid in environment variables.");
    return null;
  }

  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();

  if (!client) {
    client = twilio(sid, token);
  }
  return client;
};

export const getTwilioConfig = () => {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const caller = (process.env.TWILIO_PHONE_NUMBER || "").trim();

  return {
    accountSid: sid || "",
    authToken: token ? "••••••••" : "",
    callerId: caller || "",
    isConfigured: isTwilioConfigured(),
  };
};

export default {
  getTwilioClient,
  isTwilioConfigured,
  getTwilioConfig,
};
