import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// Ensure OPENAI_API_KEY is in your .env
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate AI Reply based on Startup Data and Platform
 * @param {string} incomingMessage - Customer ka message ya comment
 * @param {Object} startupData - StartupData model se aane wala data object
 * @param {string} platform - "Instagram", "WhatsApp", "Facebook", or "Instagram Comment"
 * @param {string} postCaption - Post ka caption jisse AI ko context mile (Only for comments)
 */
export const generateAIReply = async (incomingMessage, startupData, platform = "Instagram", postCaption = "") => {
  try {
    // System Prompt: Setting up the AI's role, context, and rules
    let systemPrompt = `
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
      systemPrompt += `
      IMPORTANT INSTRUCTIONS FOR PUBLIC COMMENTS:
      1. The user is commenting on a post with this caption: "${postCaption}".
      2. Read the post caption to understand what the user is asking about.
      3. Keep your reply VERY short, friendly, and public (1-2 sentences max).
      4. Do not reveal private pricing or sensitive details publicly; ask them to check their DM instead if needed.
      `;
    }

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Customer's message: "${incomingMessage}"\n\nYour response:` }
      ],
      temperature: 0.7, // Adjust this to make it more creative (1.0) or more strict (0.0)
    });

    // Extract the reply text
    const replyText = response.choices[0].message.content;
    
    // Extra safety: Remove markdown formatting just in case the AI ignores the instruction
    let cleanText = replyText.replace(/\*/g, '').trim();
    
    return cleanText;
  } catch (error) {
    console.error(`AI Generation Error [${platform}]:`, error);
    // Safe Fallback message
    return "Thank you for reaching out! Our team is currently reviewing your message and will get back to you shortly."; 
  }
};