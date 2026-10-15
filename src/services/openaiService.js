import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

let openaiClient = null;

const getOpenAIClient = () => {
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured in environment variables.");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: openaiApiKey });
  }
  return openaiClient;
};

/**
 * Generate conversational AI response for a phone call
 */
export const generateConversationalResponse = async ({
  systemPrompt,
  conversationHistory = [],
  userSpeech,
  contactName = "Customer",
  language = "hi-IN",
}) => {
  const openai = getOpenAIClient();

  const isHindiOrHinglish = language.startsWith("hi") || language === "en-IN";

  const systemInstructions = `
You are a friendly, polite, and professional AI Voice Calling Agent speaking on a live phone call with ${contactName}.

### Primary Objective and Instructions:
${systemPrompt || "You are calling on behalf of the company to check if the customer is interested in our services and answer basic questions."}

### Critical Calling Guidelines:
1. Keep your spoken responses VERY SHORT and NATURAL (1 to 2 sentences maximum, strictly under 35 words).
2. Spoken language: ${isHindiOrHinglish ? "Conversational Hinglish / Hindi with natural friendly tone." : "Natural professional English."}
3. Never recite long lists, bullet points, URLs, or markdown symbols. Remember this is spoken over the phone.
4. Listen carefully to user's reply:
   - If user says YES or asks what it is, give a quick 1-sentence value pitch and ask for their interest.
   - If user asks for WhatsApp details, agree warmly and confirm.
   - If user says they are busy or asks to call back later, politely confirm callback and say goodbye.
   - If user says "Not interested", "No", or "Don't call", politely apologize, thank them, and wrap up.
   - If user asks a question you don't know, politely offer to connect them with a human specialist.

Respond in JSON format:
{
  "reply": "your 1-2 sentence spoken response here",
  "shouldEndCall": boolean (true if conversation is naturally completed, user said goodbye, user is not interested, or user asked to stop calling),
  "detectedIntent": "interested" | "not_interested" | "callback" | "question" | "dnd" | "neutral"
}
`.trim();

  const formattedMessages = [
    { role: "system", content: systemInstructions },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    formattedMessages.push({
      role: msg.speaker === "AI Agent" ? "assistant" : "user",
      content: msg.text,
    });
  }

  // Add current user speech
  formattedMessages.push({
    role: "user",
    content: userSpeech,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: openaiModel,
      messages: formattedMessages,
      temperature: 0.6,
      max_tokens: 150,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return {
      reply: parsed.reply || "Ji, dhanyawad. Hum aapko jald hi update bhejte hain.",
      shouldEndCall: Boolean(parsed.shouldEndCall),
      detectedIntent: parsed.detectedIntent || "neutral",
    };
  } catch (error) {
    console.error("OpenAI generation error:", error.message);
    return {
      reply: isHindiOrHinglish
        ? "Ji bilkul, main samajh gaya. Hum aapko details WhatsApp par share kar denge. Dhanyawad!"
        : "Understood. We will send you more information shortly. Thank you and have a great day!",
      shouldEndCall: true,
      detectedIntent: "neutral",
    };
  }
};

export default {
  generateConversationalResponse,
};