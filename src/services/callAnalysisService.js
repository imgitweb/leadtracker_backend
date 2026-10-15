import OpenAI from "openai";
import CallAnalysis from "../models/CallAnalysis.js";
import Transcript from "../models/Transcript.js";
import Call from "../models/Call.js";
import Contact from "../models/Contact.js";
import Campaign from "../models/Campaign.js";
import dotenv from "dotenv";
dotenv.config();

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

const getOpenAI = () => {
  if (!openaiApiKey) return null;
  return new OpenAI({ apiKey: openaiApiKey });
};

/**
 * Analyzes call transcript with OpenAI GPT-3.5 Turbo
 */
export const analyzeCall = async (callId, ioInstance = null) => {
  try {
    // 1. Check if already analyzed (Idempotent check)
    const existingAnalysis = await CallAnalysis.findOne({ callId });
    if (existingAnalysis) {
      return existingAnalysis;
    }

    // 2. Fetch call & transcript
    const call = await Call.findById(callId);
    if (!call) {
      console.warn(`Call not found for analysis: ${callId}`);
      return null;
    }

    const transcriptDoc = await Transcript.findOne({ callId });
    const messages = transcriptDoc?.messages || [];

    // If call was not answered or no conversation took place
    if (messages.length === 0) {
      const defaultAnalysis = await CallAnalysis.create({
        callId,
        contactId: call.contactId,
        campaignId: call.campaignId,
        sentiment: "Neutral",
        responseCategory: call.status === "busy" ? "Callback Requested" : "Unclear",
        summary: `Call ended with status: ${call.status}. No speech recorded.`,
        mainRequirement: null,
        objection: null,
        followUpRequired: ["busy", "no-answer"].includes(call.status),
        suggestedNextAction: ["busy", "no-answer"].includes(call.status) ? "Retry call later" : "Review contact number",
      });

      await Call.findByIdAndUpdate(callId, { analysisStatus: "completed" });
      return defaultAnalysis;
    }

    // 3. Format conversation transcript for OpenAI
    const transcriptText = messages
      .map((m) => `${m.speaker}: ${m.text}`)
      .join("\n");

    const openai = getOpenAI();
    let analysisResult = {
      sentiment: "Neutral",
      responseCategory: "Unclear",
      summary: "Short conversation occurred.",
      mainRequirement: null,
      objection: null,
      followUpRequired: false,
      suggestedNextAction: "Review call recording",
    };

    if (openai) {
      const prompt = `
You are an expert sales and customer interaction analyst.
Analyze the following phone conversation transcript between an AI Agent and a customer:

=== TRANSCRIPT START ===
${transcriptText}
=== TRANSCRIPT END ===

Analyze carefully according to these strict rules:
1. "sentiment": MUST be one of ["Positive", "Negative", "Neutral"].
2. "responseCategory": MUST be strictly one of:
   - "Interested" (Customer explicitly showed interest in the offer/service or asked for details/WhatsApp)
   - "Not Interested" (Customer explicitly said no, declined, or hung up with refusal)
   - "Callback Requested" (Customer asked to call later, busy right now)
   - "Already Using Service" (Customer already has or uses this product)
   - "Wrong Number" (Not the intended recipient)
   - "Do Not Call" (Customer explicitly demanded to stop calling, remove their number, or threatened DND violation)
   - "Unclear" (Call dropped, silence, or unintelligible)
3. "summary": 1 to 2 clear sentences summarizing the customer's response.
4. "mainRequirement": What the user specifically asked for, or null.
5. "objection": Main objection or reluctance expressed, or null.
6. "followUpRequired": true if customer is interested or asked for a callback, false otherwise.
7. "suggestedNextAction": What should the sales agent or CRM system do next.

Return ONLY a valid JSON object matching this exact structure:
{
  "sentiment": "Positive" | "Negative" | "Neutral",
  "responseCategory": "Interested" | "Not Interested" | "Callback Requested" | "Already Using Service" | "Wrong Number" | "Do Not Call" | "Unclear",
  "summary": "string",
  "mainRequirement": "string or null",
  "objection": "string or null",
  "followUpRequired": boolean,
  "suggestedNextAction": "string"
}
`;

      const response = await openai.chat.completions.create({
        model: openaiModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
        response_format: { type: "json_object" },
      });

      const parsed = JSON.parse(response.choices[0].message.content);
      analysisResult = { ...analysisResult, ...parsed };
    }

    // 4. Save analysis to CallAnalysis model
    const savedAnalysis = await CallAnalysis.create({
      callId,
      contactId: call.contactId,
      campaignId: call.campaignId,
      sentiment: ["Positive", "Negative", "Neutral"].includes(analysisResult.sentiment)
        ? analysisResult.sentiment
        : "Neutral",
      responseCategory: [
        "Interested",
        "Not Interested",
        "Callback Requested",
        "Already Using Service",
        "Wrong Number",
        "Do Not Call",
        "Unclear",
      ].includes(analysisResult.responseCategory)
        ? analysisResult.responseCategory
        : "Unclear",
      summary: analysisResult.summary || "",
      mainRequirement: analysisResult.mainRequirement || null,
      objection: analysisResult.objection || null,
      followUpRequired: Boolean(analysisResult.followUpRequired),
      suggestedNextAction: analysisResult.suggestedNextAction || "",
      analyzedAt: new Date(),
    });

    // 5. Update Call model
    await Call.findByIdAndUpdate(callId, {
      analysisStatus: "completed",
      outcome: savedAnalysis.responseCategory,
    });

    // 6. Update Contact model
    const contactUpdate = {
      sentiment: savedAnalysis.sentiment,
      responseCategory: savedAnalysis.responseCategory,
    };

    if (savedAnalysis.responseCategory === "Do Not Call") {
      contactUpdate.doNotCall = true;
    }

    await Contact.findByIdAndUpdate(call.contactId, contactUpdate);

    // 7. Update Campaign aggregate metrics
    const campaignInc = {};
    if (savedAnalysis.sentiment === "Positive") campaignInc.positiveCount = 1;
    if (savedAnalysis.sentiment === "Negative") campaignInc.negativeCount = 1;
    if (savedAnalysis.sentiment === "Neutral") campaignInc.neutralCount = 1;
    if (savedAnalysis.responseCategory === "Interested") campaignInc.interestedCount = 1;

    if (Object.keys(campaignInc).length > 0) {
      await Campaign.findByIdAndUpdate(call.campaignId, { $inc: campaignInc });
    }

    // 8. Emit Socket.IO live update if available
    if (ioInstance) {
      ioInstance.emit("call_analysis_complete", {
        callId,
        campaignId: call.campaignId,
        analysis: savedAnalysis,
      });
    }

    return savedAnalysis;
  } catch (error) {
    console.error(`Call analysis error for ${callId}:`, error);
    await Call.findByIdAndUpdate(callId, { analysisStatus: "failed" });
    return null;
  }
};

export default {
  analyzeCall,
};
