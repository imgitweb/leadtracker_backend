import fs from "fs";
import path from "path";
import twilio from "twilio";
import { fileURLToPath } from "url";
import { generateElevenLabsTTS } from "../services/elevenLabsService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const escapeXml = (unsafe = "") => {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const getServerUrl = (req) => {
  return (process.env.SERVER_URL || req.headers.host || "")
    .replace(/^https?:\/\//, "")
    .replace(/^wss?:\/\//, "")
    .replace(/\/$/, "");
};

const handleIncomingCall = async (req, res) => {
  try {
    res.type("text/xml");

    const serverUrl = getServerUrl(req);

    const callerPhone =
      req.body?.From ||
      req.query?.From ||
      "";

    const leadId =
      req.query?.leadId || "";

    const campaignId =
      req.query?.campaignId || "";

    console.log("📞 Incoming Call");
    console.log("📱 Phone:", callerPhone);
    console.log("🎯 Lead:", leadId);
    console.log("📢 Campaign:", campaignId);

    const twiml = `
<Response>
  <Connect>
    <Stream url="wss://${serverUrl}/media-stream">
      <Parameter
        name="phone"
        value="${escapeXml(callerPhone)}"
      />
      <Parameter
        name="leadId"
        value="${escapeXml(leadId)}"
      />
      <Parameter
        name="campaignId"
        value="${escapeXml(campaignId)}"
      />
    </Stream>
  </Connect>
</Response>
`;

    return res.status(200).send(twiml);
  } catch (error) {
    console.error(
      "❌ Incoming Call Error:",
      error.message
    );

    return res
      .status(500)
      .type("text/xml")
      .send(`
      <Response>
        <Say> 
          Internal server error occurred.
        </Say>
      </Response>
`);
  }
};

const makeCall = async (req, res) => {
  try {
    const phone =
      req.body?.to ||
      process.env.TEST_PHONE_NUMBER;

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const serverUrl = (
      process.env.SERVER_URL || ""
    ).replace(/\/$/, "");

    const call = await client.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
      url: `${serverUrl}/api/agent/incoming-call`,
      method: "POST",
    });

    return res.status(200).json({
      success: true,
      message: "Test call started",
      callSid: call.sid,
    });
  } catch (error) {
    console.error(
      "❌ Test Call Error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Call failed",
      error: error.message,
    });
  }
};

const testElevenLabsVoice = async (req, res) => {
  try {
    const text =
      req.body?.text ||
      "Hello, this is a voice test from Cinfy AI.";

    const audioBase64 =
      await generateElevenLabsTTS(text);

    if (!audioBase64) {
      throw new Error(
        "No audio returned from ElevenLabs"
      );
    }

    const audioBuffer = Buffer.from(
      audioBase64,
      "base64"
    );

    const filePath = path.join(
      __dirname,
      "../test-elevenlabs.mp3"
    );

    fs.writeFileSync(filePath, audioBuffer);

    return res.json({
      success: true,
      message: "Voice generated successfully",
      file: "test-elevenlabs.mp3",
    });
  } catch (error) {
    console.error(
      "❌ ElevenLabs Test Error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Voice generation failed",
      error: error.message,
    });
  }
};

export {
  handleIncomingCall,
  makeCall,
  testElevenLabsVoice,
};