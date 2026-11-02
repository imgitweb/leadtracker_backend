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

export const getTwilioConfig = async () => {
  const sid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const token = (process.env.TWILIO_AUTH_TOKEN || "").trim();
  const caller = (process.env.TWILIO_PHONE_NUMBER || "").trim();

  let accountType = "Trial";
  let balance = "0.0 USD";
  let isTrialExpired = false;

  const twClient = getTwilioClient();
  if (twClient) {
    try {
      const [acc, bal] = await Promise.all([
        twClient.api.v2010.accounts(sid).fetch().catch(() => null),
        twClient.balance.fetch().catch(() => null),
      ]);
      if (acc) {
        accountType = acc.type || "Trial";
      }
      if (bal) {
        balance = `${bal.balance} ${bal.currency}`;
      }
    } catch (e) {
      // Continue gracefully if network/API fails
    }
  }

  return {
    accountSid: sid || "",
    authToken: token ? `${token.substring(0, 4)}••••••••${token.slice(-4)}` : "",
    callerId: caller || "",
    isConfigured: isTwilioConfigured(),
    accountType,
    balance,
    isTrialExpired: false,
  };
};

export default {
  getTwilioClient,
  isTwilioConfigured,
  getTwilioConfig,
};
