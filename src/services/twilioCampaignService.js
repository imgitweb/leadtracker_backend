import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const cleanServerUrl = () => {
  return (process.env.SERVER_URL || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
};

const makeCampaignCall = async ({
  phone,
  leadId,
  campaignId,
}) => {
  try {
    if (!phone) {
      throw new Error("Phone number is required");
    }

    if (!leadId) {
      throw new Error("Lead ID is required");
    }

    if (!campaignId) {
      throw new Error("Campaign ID is required");
    }

    const serverUrl = cleanServerUrl();
    console.log("SERVER_URL:", process.env.SERVER_URL);
console.log("serverUrl:", serverUrl);

    const incomingCallUrl =
      `https://${serverUrl}/api/agent/incoming-call` +
      `?leadId=${encodeURIComponent(leadId)}` +
      `&campaignId=${encodeURIComponent(campaignId)}`;

      console.log("Incoming Call URL:", incomingCallUrl);

    const statusCallbackUrl =
      `https://${serverUrl}/api/campaigns/call-status`;

    const call = await client.calls.create({
      to: phone,
      from: process.env.TWILIO_PHONE_NUMBER,

      url: incomingCallUrl,
      method: "POST",

      statusCallback: statusCallbackUrl,
      statusCallbackMethod: "POST",

      statusCallbackEvent: [
        "initiated",
        "ringing",
        "answered",
        "completed",
      ],

      machineDetection: "Enable",
      asyncAmd: true,
      asyncAmdStatusCallback: statusCallbackUrl,
      asyncAmdStatusCallbackMethod: "POST",
    });

    console.log(
      `📞 Campaign Call Created | Phone: ${phone} | SID: ${call.sid}`
    );

    return call;
  } catch (error) {
    console.error(
      `❌ Twilio Call Failed | ${phone}`,
      error.message
    );

    throw error;
  }
};

export { makeCampaignCall };