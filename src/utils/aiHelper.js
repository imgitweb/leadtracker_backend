import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure GEMINI_API_KEY is in your .env
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generate AI Reply based on Startup Data and Platform
 * @param {string} incomingMessage - Customer ka message ya comment
 * @param {Object} startupData - StartupData model se aane wala data object
 * @param {string} platform - "Instagram", "WhatsApp", "Facebook", or "Instagram Comment"
 * @param {string} postCaption - Post ka caption jisse AI ko context mile (Only for comments)
 */
export const generateAIReply = async (incomingMessage, startupData, platform = "Instagram", postCaption = "") => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Base System Prompt
    let prompt = `
      You are an AI customer support assistant for a business named "${startupData.businessName}".
      Your tone of voice should be strictly: ${startupData.tone}.
      
      Here is the business context and what they do:
      ${startupData.description}
      
      Here is the FAQ and Knowledge Base to help you answer questions:
      ${startupData.faq}
      
      The customer is reaching out via ${platform}. 
      Rules for your reply:
      1. Keep it conversational, helpful, and concise (suitable for a chat interface).
      2. Strictly answer based ONLY on the provided business context and FAQ. If the answer is not in the data, politely say you don't have that information and a human agent will connect soon.
      3. DO NOT use markdown formatting like asterisks (**) or hashes (#), as they look bad in standard chat apps. Plain text with basic emojis is best.
    `;

    // 🔥 DYNAMIC CONTEXT: Agar ye Instagram Comment hai, toh extra rules lagao
    if (platform === "Instagram Comment") {
      prompt += `
      IMPORTANT INSTRUCTIONS FOR PUBLIC COMMENTS:
      1. The user is commenting on a post with this caption: "${postCaption}".
      2. Read the post caption to understand what the user is asking about.
      3. Keep your reply VERY short, friendly, and public (1-2 sentences max).
      4. Do not reveal private pricing or sensitive details publicly; ask them to check their DM instead if needed.
      `;
    }

    // Attach Customer Message
    prompt += `
      Customer's message: "${incomingMessage}"
      
      Your response:
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    // Extra safety: Remove markdown formatting just in case the AI ignores the instruction
    let cleanText = response.text().replace(/\*/g, '').trim();
    
    return cleanText;
  } catch (error) {
    console.error(`AI Generation Error [${platform}]:`, error);
    // Safe Fallback message
    return "Thank you for reaching out! Our team is currently reviewing your message and will get back to you shortly."; 
  }
};