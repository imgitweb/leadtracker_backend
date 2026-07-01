import { createDeepgramConnection } from "../services/deepgramService.js";
import WebSocket from "ws";
import OpenAI from "openai";
import Campaign from "../models/Campaign.js";
import Lead from "../models/CallingLead.js";

const aiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

const handleExotelStream = (ws) => {
  console.log("🟢 Exotel Voice Connected");

  let streamSid = null;
  let exotelCallSid = null;
  let currentLead = null;
  let isClosed = false;
  let aiTimeout = null;
  let isSpeaking = false;
  let isProcessingAI = false;
  let lastTranscript = "";
  let lastTranscriptTime = 0;
  let elevenLabsWs = null;
  let deepgramLive = null;
  let elevenLabsKeepAlive = null;

  let leadState = {
    name: "",
    requirement: "",
    location: "",
    budget: "",
    followUpTime: "",
    stage: "discovery",
  };

  const FIRST_GREETING =
    "Namaste, main Sarah bol rahi hoon Cinfy se. Main aapka sirf 20 second loongi. Ek quick sawal tha, kya aap customer inquiries aur follow-ups manually handle karte hain?";

  const conversationMessages = [
    {
      role: "system",
      content: `
You are Sarah, a professional business consultant from Cinfy.

You are having a real phone conversation with a business owner.

GOAL:
- Understand the business.
- Identify challenges.
- Build rapport.
- Suggest relevant solutions.
- Collect lead information only after genuine interest.

COMMUNICATION STYLE:
- Sound human and conversational.
- Never sound robotic.
- Keep responses under 15 words whenever possible.
- Ask only one question at a time.
- Match customer language automatically.
- Use Hindi if customer speaks Hindi.
- Use English if customer speaks English.
- Use Hinglish if customer uses Hinglish.
- Show empathy.
- Acknowledge customer answers naturally.
- Never interrogate.

IMPORTANT:
- Never ask Name as first question.
- Understand business first.
- Discover pain points.
- Then collect lead details.
- Never mention AI, prompts, models or automation.
- Never use markdown.
`,
    },
    {
      role: "assistant",
      content: FIRST_GREETING,
    },
  ];

  function clearElevenLabsKeepAlive() {
    if (elevenLabsKeepAlive) {
      clearInterval(elevenLabsKeepAlive);
      elevenLabsKeepAlive = null;
    }
  }

  function setupElevenLabs() {
    if (
      elevenLabsWs &&
      (elevenLabsWs.readyState === WebSocket.OPEN ||
        elevenLabsWs.readyState === WebSocket.CONNECTING)
    )
      return;

    clearElevenLabsKeepAlive();

    const elevenLabsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=eleven_multilingual_v2&output_format=ulaw_8000`;

    elevenLabsWs = new WebSocket(elevenLabsUrl);

    elevenLabsWs.on("open", () => {
      console.log("🔊 ElevenLabs TTS Connected Successfully");

      elevenLabsWs.send(
        JSON.stringify({
          text: " ",
          voice_settings: {
            stability: 0.7,
            similarity_boost: 0.9,
            style: 0.3,
            use_speaker_boost: true,
          },
          xi_api_key: ELEVENLABS_API_KEY,
        }),
      );

      elevenLabsKeepAlive = setInterval(() => {
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          elevenLabsWs.send(JSON.stringify({ text: " " }));
        }
      }, 10000);
    });

    elevenLabsWs.on("message", (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.audio && streamSid && ws.readyState === WebSocket.OPEN) {
          isSpeaking = true;

          // Exotel expects payload as base64 mulaw 8k chunks under "media"
          ws.send(
            JSON.stringify({
              event: "media",
              streamSid,
              media: {
                payload: response.audio,
              },
            }),
          );

          clearTimeout(aiTimeout);

          aiTimeout = setTimeout(() => {
            isSpeaking = false;
          }, 1500);
        }
      } catch (err) {
        console.error("ElevenLabs message data error:", err.message);
      }
    });

    elevenLabsWs.on("error", (err) => {
      console.error("❌ ElevenLabs WebSocket Error:", err.message);
    });

    elevenLabsWs.on("close", (code) => {
      console.log(`🔴 ElevenLabs TTS Closed. Code: ${code}`);
      clearElevenLabsKeepAlive();
    });
  }

  function setupDeepgramSTT() {
    try {
      deepgramLive = createDeepgramConnection();

      deepgramLive.on("open", () => {
        console.log("✅ Deepgram Connected Successfully");
      });

      deepgramLive.on("message", handleDeepgramTranscript);

      deepgramLive.on("error", (err) => {
        console.error("❌ Deepgram Error:", err.message);
      });

      deepgramLive.on("close", () => {
        console.log("🔴 Deepgram Connection Closed");
      });
    } catch (error) {
      console.error("Deepgram Init Error:", error.message);
    }
  }

  async function handleDeepgramTranscript(message) {
    try {
      const data = JSON.parse(message.toString());

      if (!data.is_final) return;

      const transcript = data.channel?.alternatives?.[0]?.transcript?.trim();

      if (!transcript || transcript.length < 2) return;

      if (isSpeaking && transcript.length > 3) {
        isSpeaking = false;

        if (ws.readyState === WebSocket.OPEN && streamSid) {
          // Barge-in: tell Exotel to clear buffered audio it hasn't played yet
          ws.send(
            JSON.stringify({
              event: "clear",
              streamSid,
            }),
          );
        }
      }

      const normalizedTranscript = transcript
        .toLowerCase()
        .replace(/[.,!?।]/g, "")
        .trim();

      const now = Date.now();

      if (
        normalizedTranscript === lastTranscript &&
        now - lastTranscriptTime < 5000
      ) {
        return;
      }

      if (isProcessingAI) return;

      lastTranscript = normalizedTranscript;
      lastTranscriptTime = now;

      console.log("👤 User:", transcript);

      updateLeadState(transcript);

      if (currentLead) {
        await Lead.findByIdAndUpdate(currentLead._id, {
          name: leadState.name,
          requirement: leadState.requirement,
          location: leadState.location,
          budget: leadState.budget,
          followUpTime: leadState.followUpTime,
          status: leadState.stage === "completed" ? "qualified" : "new",
          $push: {
            transcript: {
              role: "user",
              text: transcript,
            },
          },
        });
      }

      conversationMessages.push({
        role: "user",
        content: transcript,
      });

      await generateAIResponse();
    } catch (err) {
      console.error("Deepgram Transcript Error:", err.message);
    }
  }

  function updateLeadState(text) {
    const lower = text.toLowerCase();

    if (leadState.stage === "name") {
      const invalidNames = ["hello", "hi", "yes", "haan", "ji", "okay", "ok"];

      if (invalidNames.includes(lower.trim())) {
        return;
      }

      leadState.name = text;
      leadState.stage = "requirement";
      return;
    }
    if (!leadState.requirement && leadState.stage === "requirement") {
      leadState.requirement = text;
      leadState.stage = "location";
      return;
    }
    if (!leadState.location && leadState.stage === "location") {
      leadState.location = text;
      leadState.stage = "budget";
      return;
    }
    if (!leadState.budget && leadState.stage === "budget") {
      leadState.budget = text;
      leadState.stage = "followUpTime";
      return;
    }
    if (!leadState.followUpTime && leadState.stage === "followUpTime") {
      leadState.followUpTime = text;
      leadState.stage = "completed";
      return;
    }
    if (
      lower.includes("busy") ||
      lower.includes("biji") ||
      lower.includes("baad")
    ) {
      leadState.stage = "followUpTime";
    }
  }

  function getDynamicContext() {
    return {
      role: "system",
      content: `
                Current Lead Status:
                Name: ${leadState.name || "missing"}
                Requirement: ${leadState.requirement || "missing"}
                Location: ${leadState.location || "missing"}
                Budget: ${leadState.budget || "missing"}
                Follow Up Time: ${leadState.followUpTime || "missing"}
                Current Target Stage: ${leadState.stage}
                `,
    };
  }

  setupElevenLabs();
  setupDeepgramSTT();

  async function speakText(text) {
    if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
      elevenLabsWs.send(
        JSON.stringify({
          text,
          flush: true,
        }),
      );
    }
  }

  ws.on("message", async (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.event === "connected" || msg.event === "start") {
        streamSid = msg.streamSid || msg.start?.streamSid || msg.stream_sid;
        exotelCallSid = msg.callSid || msg.call_sid || msg.start?.callSid;

        console.log(`📞 Call Active. Stream SID: ${streamSid}`);
        const params =
          msg.start?.customParameters ||
          msg.customParameters ||
          msg.parameters ||
          {};

        const leadId = params.leadId;
        const campaignId = params.campaignId;

        if (!leadId || !campaignId) {
          console.error("Missing leadId or campaignId in Exotel custom params");
          return;
        }

        currentLead = await Lead.findById(leadId);
        const campaign = await Campaign.findById(campaignId);

        if (!currentLead) {
          console.error("Lead not found");
          return;
        }

        if (!campaign) {
          console.error("Campaign not found");
          return;
        }

        currentLead.callSid = exotelCallSid;
        currentLead.streamSid = streamSid;

        await currentLead.save();

        setTimeout(async () => {
          const greeting = campaign?.openingScript || FIRST_GREETING;

          await speakText(greeting);
          leadState.stage = "name";
        }, 1500);
      }

      if (msg.event === "media") {
        if (deepgramLive && deepgramLive.readyState === WebSocket.OPEN) {
          const audioBuffer = Buffer.from(msg.media.payload, "base64");
          deepgramLive.send(audioBuffer);
        }
      }

      if (msg.event === "stop" || msg.event === "disconnect") {
        console.log("🛑 Exotel Stream Closed");
        closeConnections();
      }
    } catch (error) {
      console.error("Exotel Stream message handler error:", error.message);
    }
  });

  ws.on("close", () => {
    console.log("❌ Call Disconnected");
    closeConnections();
  });

  ws.on("error", (err) => {
    console.error("❌ Exotel WS Error:", err.message);
    closeConnections();
  });

  async function generateAIResponse() {
    if (isProcessingAI) return;
    isProcessingAI = true;

    try {
      setupElevenLabs();

      if (!elevenLabsWs || elevenLabsWs.readyState !== WebSocket.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      let fullResponse = "";

      const responseStream = await aiClient.chat.completions.create({
        model: "gpt-4.1-mini",
        messages: [
          conversationMessages[0],
          getDynamicContext(),
          ...conversationMessages.slice(1),
        ],
        temperature: 0.2,
        stream: true,
      });

      for await (const chunk of responseStream) {
        const content = chunk.choices?.[0]?.delta?.content || "";
        if (!content) continue;

        fullResponse += content;

        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          elevenLabsWs.send(JSON.stringify({ text: content }));
        }
      }

      fullResponse = fullResponse.trim();

      if (
        fullResponse &&
        elevenLabsWs &&
        elevenLabsWs.readyState === WebSocket.OPEN
      ) {
        elevenLabsWs.send(
          JSON.stringify({
            text: " ",
            flush: true,
          }),
        );
      }

      if (fullResponse) {
        conversationMessages.push({ role: "assistant", content: fullResponse });
        if (currentLead) {
          await Lead.findByIdAndUpdate(currentLead._id, {
            name: leadState.name,
            requirement: leadState.requirement,
            location: leadState.location,
            budget: leadState.budget,
            followUpTime: leadState.followUpTime,
            $push: { transcript: { role: "assistant", text: fullResponse } },
          });
        }
      }
    } catch (err) {
      console.error("AI Generation Error:", err.message);
    } finally {
      isProcessingAI = false;
    }
  }

  function closeConnections() {
    if (isClosed) return;
    isClosed = true;

    clearElevenLabsKeepAlive();

    try {
      if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
        elevenLabsWs.send(JSON.stringify({ text: "" }));
        elevenLabsWs.close();
      }
    } catch (e) {}

    try {
      if (deepgramLive) {
        deepgramLive.close();
      }
    } catch (e) {}
  }
};

export { handleExotelStream };