import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

let openaiClient = null;

const getOpenAIClient = () => {
  if (!openaiApiKey) {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: openaiApiKey });
  }
  return openaiClient;
};

/**
 * Extracts key themes and pitch from user's custom system prompt
 */
const extractContextFromSystemPrompt = (systemPrompt = "") => {
  const promptLower = systemPrompt.toLowerCase();

  let domain = "Cinfy Solutions";
  let pitch = "Hum businesses ke liye automated CRM, WhatsApp growth aur smart customer lead solutions provide karte hain.";
  let offer = "Kya aap iske baare mein 1 minute mein short details dekhna chahenge?";

  if (promptLower.includes("real estate") || promptLower.includes("property") || promptLower.includes("2bhk") || promptLower.includes("flat")) {
    domain = "Real Estate Advisor";
    pitch = "Darasal humne contact kiya tha property inquiry ke regarding. Aap 2 BHK ya 3 BHK search kar rahe the?";
    offer = "Aapka preferred location aur budget kya hoga taaki main best options share kar sakoon?";
  } else if (promptLower.includes("demo") || promptLower.includes("appointment") || promptLower.includes("booking")) {
    domain = "Demo Coordinator";
    pitch = "Main kal ke scheduled live demo aur consultation ko confirm karne ke liye connect kar rahi hoon.";
    offer = "Kya aap kal 3 PM par 15 minute ke demo ke liye comfortable hain?";
  } else if (promptLower.includes("feedback") || promptLower.includes("review") || promptLower.includes("support")) {
    domain = "Customer Care";
    pitch = "Hamari service use karne ke liye shukriya! Bas 1 minute mein jaanna chahti thi ki aapka experience kaisa raha.";
    offer = "Kya sab kuch smoothly chal raha hai ya kisi cheez mein hamari help chahiye?";
  } else if (promptLower.includes("course") || promptLower.includes("coaching") || promptLower.includes("admission")) {
    domain = "Academic Counselor";
    pitch = "Darasal humne contact kiya tha certification aur career courses ke silsile mein.";
    offer = "Kya aap upcoming batch aur placement details jaan na chahenge?";
  }

  return { domain, pitch, offer };
};

/**
 * Intelligent, Human-like Conversational Fallback Engine
 * Talks like a real, polite Indian tele-caller (fluent Hinglish, ZERO robotic catchphrases)
 */
const getFallbackConversationalReply = (userSpeech, contactName = "ji", systemPrompt = "", conversationHistory = [], language = "hi-IN") => {
  const text = (userSpeech || "").toLowerCase().trim();
  const isHindi = language.startsWith("hi") || language === "en-IN";
  const userTurns = conversationHistory.filter((m) => m.speaker === "User").length;

  const { pitch, offer } = extractContextFromSystemPrompt(systemPrompt);

  // 1. Rejection / Opt-out ("Nahi chahiye", "Don't call", etc.)
  if (
    text.includes("not interested") ||
    text.includes("nahi chahiye") ||
    text.includes("mat karo") ||
    text.includes("don't call") ||
    text.includes("zarurat nahi") ||
    text.includes("galat number") ||
    text.includes("wrong number") ||
    text.includes("nahi lena")
  ) {
    return {
      reply: isHindi
        ? "Theek hai ji, koi baat nahi. Apna kimti samay dene ke liye bahut shukriya. Have a great day!"
        : "Understood. Thank you very much for your time. Have a wonderful day!",
      shouldEndCall: true,
      detectedIntent: "not_interested",
    };
  }

  // 2. Busy / Call back later ("Busy hoon", "Baad me call karo")
  if (
    text.includes("busy") ||
    text.includes("baad me") ||
    text.includes("baad mein") ||
    text.includes("meeting") ||
    text.includes("drive") ||
    text.includes("driving") ||
    text.includes("time nahi")
  ) {
    return {
      reply: isHindi
        ? "Koi baat nahi ji, aap busy lag rahe hain. Main aapko shaam ko convenient time par call kar lungi. Dhanyawad!"
        : "No problem at all. I can see you are busy. I will connect with you at a better time. Thank you!",
      shouldEndCall: true,
      detectedIntent: "callback",
    };
  }

  // 3. Goodbye / Hang up ("Bye", "Theek hai rakho", "Alvida")
  if (
    text.includes("bye") ||
    text.includes("alvida") ||
    text.includes("rakho") ||
    text.includes("phone kaato") ||
    text.includes("ok thank") ||
    text.includes("theek hai shukriya")
  ) {
    return {
      reply: isHindi
        ? "Shukriya ji! Aapse baat karke bahut accha laga. Take care, bye!"
        : "Thank you! It was great speaking with you. Take care and goodbye!",
      shouldEndCall: true,
      detectedIntent: "callback",
    };
  }

  // 4. WhatsApp / Details / Send request ("WhatsApp par bhej do", "Details bhej do")
  if (
    text.includes("whatsapp") ||
    text.includes("bhej do") ||
    text.includes("send") ||
    text.includes("share") ||
    text.includes("details") ||
    text.includes("brochure") ||
    text.includes("pdf")
  ) {
    return {
      reply: isHindi
        ? "Zaroor! Main agle do minute mein aapke isi number par WhatsApp ke zariye saari details aur demo link share kar rahi hoon. Aap check kar lijiye ga!"
        : "Absolutely! I am sending the complete brochure and demo link to your WhatsApp number right now. Please have a look!",
      shouldEndCall: true,
      detectedIntent: "interested",
    };
  }

  // 5. Pricing / Cost enquiry ("Price kya hai", "Kitne ka hai", "Charges")
  if (
    text.includes("price") ||
    text.includes("rate") ||
    text.includes("cost") ||
    text.includes("kitna") ||
    text.includes("charges") ||
    text.includes("paisa") ||
    text.includes("kharcha") ||
    text.includes("fees")
  ) {
    return {
      reply: isHindi
        ? "Hamare plans kaafi pocket-friendly hain, monthly ₹999 se start hote hain aur 3 din ka poora free trial bhi milta hai. Kya main details WhatsApp par share kar doon?"
        : "Our plans are very affordable starting from just ₹999 per month, including a 3-day free trial. Would you like me to share pricing on WhatsApp?",
      shouldEndCall: false,
      detectedIntent: "question",
    };
  }

  // 6. Natural First Response ("Haan boliye", "Kaun bol raha hai", "Kya kaam hai", "Hello")
  if (userTurns <= 1 || text.includes("kaun") || text.includes("kya kaam") || text.includes("batao") || text.includes("haan boliye") || text.includes("bolo")) {
    return {
      reply: isHindi
        ? `${pitch} ${offer}`
        : `We are reaching out regarding smart business automation. Would you be interested in a quick 1-minute overview?`,
      shouldEndCall: false,
      detectedIntent: "interested",
    };
  }

  // 7. General positive response ("Haan theek hai", "Acha", "Sahi hai", "Aur bataiye")
  if (text.includes("theek") || text.includes("accha") || text.includes("sahi") || text.includes("aur") || text.includes("features")) {
    return {
      reply: isHindi
        ? "Isme aapke saare leads ek jagah track hote hain aur automated WhatsApp reminders chale jaate hain. Kya aapka WhatsApp isi number par chal raha hai?"
        : "It organizes all your incoming leads and automatically sends follow-ups via WhatsApp. Is this your primary WhatsApp number?",
      shouldEndCall: false,
      detectedIntent: "interested",
    };
  }

  // 8. Natural Fallback - Human, respectful, no repetitive "main samajh gaya"
  return {
    reply: isHindi
      ? "Ji bilkul. Iski poori jankari aur demo main aapke WhatsApp par forward kar deti hoon taaki aap araam se dekh sakein. Chalega na?"
      : "Understood. I will share the complete details and walkthrough on your WhatsApp so you can review at your convenience. Sounds good?",
    shouldEndCall: false,
    detectedIntent: "neutral",
  };
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
  const isHindiOrHinglish = language.startsWith("hi") || language === "en-IN";

  // Try OpenAI first if configured
  try {
    const openai = getOpenAIClient();
    if (!openai) {
      throw new Error("OpenAI API key missing");
    }

    const systemInstructions = `
You are a highly skilled, polite, natural Indian sales representative speaking on a LIVE phone call with ${contactName}.

### Your Campaign Objective & Script:
${systemPrompt || "You are calling on behalf of Cinfy Solutions to briefly introduce CRM and WhatsApp lead automation and offer a free demo or WhatsApp info."}

### CRITICAL RULES TO SOUND LIKE A REAL HUMAN CALLER:
1. Speak in warm, fluent, conversational ${isHindiOrHinglish ? "Hinglish / Hindi" : "English"}.
2. Keep spoken replies VERY SHORT (1 to 2 sentences max, strictly under 25 words).
3. NEVER repeat robotic filler phrases like "Main samajh gaya", "Main samajh gayi", or "Aapki baat se sehmat hoon".
4. DO NOT repeat the customer's name in every single sentence. In a real phone call, you address them by name at most once.
5. Answer what the user specifically asked in a direct, natural, confident tone.
6. When the user agrees to receive info on WhatsApp or says they are interested, confirm warmly, say thank you, and set shouldEndCall=true.
7. If user is busy, reschedule politely, say goodbye, and set shouldEndCall=true.
8. If user is not interested, apologize respectfully, thank them, and set shouldEndCall=true.

Respond strictly in JSON format:
{
  "reply": "your 1-2 sentence spoken response here",
  "shouldEndCall": boolean,
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

    const completion = await openai.chat.completions.create({
      model: openaiModel,
      messages: formattedMessages,
      temperature: 0.6,
      max_tokens: 120,
      response_format: { type: "json_object" },
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return {
      reply: parsed.reply || (isHindiOrHinglish ? "Ji zaroor, main WhatsApp par saari details share kar deti hoon. Shukriya!" : "Sure, I will share the details on your WhatsApp. Thank you!"),
      shouldEndCall: Boolean(parsed.shouldEndCall),
      detectedIntent: parsed.detectedIntent || "neutral",
    };
  } catch (error) {
    console.warn("⚠️ [OpenAI] Failed to get response, using human-like fallback engine:", error.message);
    return getFallbackConversationalReply(userSpeech, contactName, systemPrompt, conversationHistory, language);
  }
};

export default {
  generateConversationalResponse,
};
