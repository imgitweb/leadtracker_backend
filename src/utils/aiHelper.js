import OpenAI from "openai";
import dotenv from "dotenv";
import Lead from "../models/Lead.js";

dotenv.config();

// Ensure OPENAI_API_KEY is in your .env
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate AI Reply based on Startup Data, Platform, and capture Leads dynamically.
 * @param {string} incomingMessage - Customer ka message ya comment
 * @param {Object} startupData - StartupData model se aane wala data object
 * @param {string} platform - "Instagram", "WhatsApp", "Facebook", or "Instagram Comment"
 * @param {string} postCaption - Post ka caption jisse AI ko context mile (Only for comments)
 * @param {Object} customerData - Customer details { phone, name, accountId }
 * @param {Array} previousChats - Array of previous chat messages for context
 */
export const generateAIReply = async (
  incomingMessage, 
  startupData, 
  platform = "Instagram", 
  postCaption = "", 
  customerData = {}, 
  previousChats = []
) => {
  try {
    // 1. System Prompt: Setting up the AI's role, context, and rules
    let systemPrompt = `
      You are an AI customer support and sales assistant for a business named "${startupData.businessName}".
      Industry: ${startupData.industry || "General"}
      Your tone of voice should be strictly: ${startupData.tone}.
      
      Here is the business context and what they do:
      ${startupData.description}
      
      Here is the FAQ and Knowledge Base to help you answer questions:
      ${startupData.faq}

      Contact Info: ${startupData.contactEmail || ""} | ${startupData.contactPhone || ""}
      Website: ${startupData.websiteUrl || ""}
      
      The customer is reaching out via ${platform}. 
      
      RULES FOR YOUR REPLY:
      1. Keep it conversational, helpful, and concise (suitable for a chat interface).
      2. Strictly answer based ONLY on the provided business context and FAQ. If the answer is not in the data, politely say you don't have that information and a human agent will connect soon.
      3. DO NOT use markdown formatting like asterisks (**) or hashes (#), as they look bad in standard chat apps. Plain text with basic emojis is best.
      4. CRITICAL INTENT ANALYSIS: Analyze the user's message and chat history. If the user shows strong buying interest, asks for pricing, requests a demo, or provides their contact details to be reached out to, you MUST use the "capture_lead" tool to log their details, while providing a helpful reply.
    `;

    // 🔥 NAYA: User ka Custom Prompt Yahan Inject Kiya Hai
    if (startupData.customPrompt && startupData.customPrompt.trim() !== "") {
      systemPrompt += `
      
      USER'S CUSTOM SYSTEM INSTRUCTIONS (FOLLOW THESE STRICTLY OVERRIDING DEFAULT BEHAVIOR IF NEEDED):
      ${startupData.customPrompt}
      `;
    }

    // DYNAMIC CONTEXT: Agar ye Instagram Comment hai, toh extra rules lagao
    if (platform === "Instagram Comment") {
      systemPrompt += `
      
      IMPORTANT INSTRUCTIONS FOR PUBLIC COMMENTS:
      1. The user is commenting on a post with this caption: "${postCaption}".
      2. Read the post caption to understand what the user is asking about.
      3. Keep your reply VERY short, friendly, and public (1-2 sentences max).
      4. Do not reveal private pricing or sensitive details publicly; ask them to check their DM instead if needed.
      `;
    }

    // Prepare Messages Array (Context + New Message)
    let messages = [
      { role: "system", content: systemPrompt },
      ...previousChats, 
      { role: "user", content: `Customer's message: "${incomingMessage}"\n\nYour response:` }
    ];

    // 2. Define Tools (Function Calling for Smart Leads)
    const tools = [
      {
        type: "function",
        function: {
          name: "capture_lead",
          description: "Trigger this ONLY when the user expresses clear interest in buying, requests a quote, provides their phone number, or wants to be contacted.",
          parameters: {
            type: "object",
            properties: {
              extractedName: { type: "string", description: "The user's real name if they mentioned it in the chat, otherwise empty." },
              extractedEmail: { type: "string", description: "The user's email if provided, otherwise empty." },
              extractedPhone: { type: "string", description: "The user's phone number if provided in the chat, otherwise empty." },
              priority: { type: "string", enum: ["Low", "Medium", "High"], description: "High if ready to buy or provided phone number. Medium if asking for pricing/details." },
              summary: { type: "string", description: "A short summary of what the user wants and if they provided contact info." },
              replyText: { type: "string", description: "The response message you want to send back to the user right now." }
            },
            required: ["priority", "summary", "replyText"],
          },
        },
      }
    ];

    // 3. Call OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      tools: tools,
      tool_choice: "auto",
      temperature: 0.7, 
    });

    const responseMessage = response.choices[0].message;
    let leadActionObj = null;

    // 4. Handle AI Lead Capture Decision (Tool Call)
    if (responseMessage.tool_calls) {
      const toolCall = responseMessage.tool_calls[0];
      
      if (toolCall.function.name === "capture_lead") {
        const args = JSON.parse(toolCall.function.arguments);
        console.log(`🔥 LEAD DETECTED from ${platform} [${args.priority}]: ${args.summary}`);

        try {
          // Normalize Phone Number for Search (Check AI extracted phone first, fallback to customerData)
          let rawPhone = args.extractedPhone || customerData.phone || "";
          let searchPhone = rawPhone.replace(/\D/g, '');
          if (searchPhone.length === 12 && searchPhone.startsWith('91')) {
            searchPhone = searchPhone.substring(2);
          }

          // Use extracted name if AI found one, otherwise use FB/IG profile name
          let finalName = args.extractedName || customerData.name || `${platform} User`;

          // Check for existing lead
          let existingLead = null;
          if (searchPhone) {
            existingLead = await Lead.findOne({ companyId: startupData.userId, phone: searchPhone });
          } else if (args.extractedEmail) {
            existingLead = await Lead.findOne({ companyId: startupData.userId, email: args.extractedEmail });
          }

          if (existingLead) {
            // 🟢 UPDATE EXISTING LEAD
            existingLead.priority = args.priority === "High" ? "High" : existingLead.priority;
            existingLead.status = "Qualified";
            existingLead.aiSummary = args.summary;
            if (finalName !== `${platform} User`) existingLead.name = finalName;
            
            if (!existingLead.platformDetails) existingLead.platformDetails = {};
            existingLead.platformDetails.whatsappRawNumber = rawPhone;

            existingLead.remarks.push({
              note: `🔥 Re-engaged via ${platform} Chat: ${args.summary}`,
              createdAt: new Date()
            });

            await existingLead.save();
            leadActionObj = { type: 'updated', lead: existingLead };
            console.log(`✅ Existing Lead [Source: ${existingLead.source}] Re-engaged!`);

          } else {
            // 🔵 CREATE NEW LEAD
            const newLead = new Lead({
              companyId: startupData.userId,
              status: "New",
              priority: args.priority,
              name: finalName,
              email: args.extractedEmail || "",
              phone: searchPhone, 
              source: `${platform} AI`,
              aiSummary: args.summary,
              platformDetails: {
                whatsappRawNumber: rawPhone,
                platformAccountId: customerData.accountId
              },
              data: {
                lastMessage: incomingMessage
              },
              tags: ["AI Generated", platform]
            });

            await newLead.save();
            leadActionObj = { type: 'created', lead: newLead };
            console.log("✅ New Smart Lead Created.");
          }
        } catch (dbErr) {
          console.error("Error handling lead in DB:", dbErr);
        }

        return {
          text: args.replyText.replace(/\*/g, '').trim(),
          leadAction: leadActionObj
        };
      }
    }

    // 5. Normal AI Reply (If no tool called)
    let cleanText = responseMessage.content ? responseMessage.content.replace(/\*/g, '').trim() : "I'm here to help!";
    return {
      text: cleanText,
      leadAction: null
    };

  } catch (error) {
    console.error(`AI Generation Error [${platform}]:`, error);
    return {
      text: "Thank you for reaching out! Our team is currently reviewing your message and will get back to you shortly.",
      leadAction: null
    };
  }
};






// import OpenAI from "openai";
// import dotenv from "dotenv";
// import Lead from "../models/Lead.js";

// dotenv.config();

// // Ensure OPENAI_API_KEY is in your .env
// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });

// /**
//  * Generate AI Reply based on Startup Data, Platform, and capture Leads dynamically.
//  * @param {string} incomingMessage - Customer ka message ya comment
//  * @param {Object} startupData - StartupData model se aane wala data object
//  * @param {string} platform - "Instagram", "WhatsApp", "Facebook", or "Instagram Comment"
//  * @param {string} postCaption - Post ka caption jisse AI ko context mile (Only for comments)
//  * @param {Object} customerData - Customer details { phone, name, accountId }
//  * @param {Array} previousChats - Array of previous chat messages for context
//  */
// export const generateAIReply = async (
//   incomingMessage, 
//   startupData, 
//   platform = "Instagram", 
//   postCaption = "", 
//   customerData = {}, 
//   previousChats = []
// ) => {
//   try {
//     // 1. System Prompt: Setting up the AI's role, context, and rules
//     let systemPrompt = `
//       You are an AI customer support and sales assistant for a business named "${startupData.businessName}".
//       Industry: ${startupData.industry || "General"}
//       Your tone of voice should be strictly: ${startupData.tone}.
      
//       Here is the business context and what they do:
//       ${startupData.description}
      
//       Here is the FAQ and Knowledge Base to help you answer questions:
//       ${startupData.faq}

//       Contact Info: ${startupData.contactEmail || ""} | ${startupData.contactPhone || ""}
//       Website: ${startupData.websiteUrl || ""}
      
//       The customer is reaching out via ${platform}. 
      
//       RULES FOR YOUR REPLY:
//       1. Keep it conversational, helpful, and concise (suitable for a chat interface).
//       2. Strictly answer based ONLY on the provided business context and FAQ. If the answer is not in the data, politely say you don't have that information and a human agent will connect soon.
//       3. DO NOT use markdown formatting like asterisks (**) or hashes (#), as they look bad in standard chat apps. Plain text with basic emojis is best.
//       4. CRITICAL INTENT ANALYSIS: Analyze the user's message and chat history. If the user shows strong buying interest, asks for pricing, requests a demo, or provides their contact details to be reached out to, you MUST use the "capture_lead" tool to log their details, while providing a helpful reply.
//     `;

//     // 🔥 DYNAMIC CONTEXT: Agar ye Instagram Comment hai, toh extra rules lagao
//     if (platform === "Instagram Comment") {
//       systemPrompt += `
//       IMPORTANT INSTRUCTIONS FOR PUBLIC COMMENTS:
//       1. The user is commenting on a post with this caption: "${postCaption}".
//       2. Read the post caption to understand what the user is asking about.
//       3. Keep your reply VERY short, friendly, and public (1-2 sentences max).
//       4. Do not reveal private pricing or sensitive details publicly; ask them to check their DM instead if needed.
//       `;
//     }

//     // Prepare Messages Array (Context + New Message)
//     let messages = [
//       { role: "system", content: systemPrompt },
//       ...previousChats, 
//       { role: "user", content: `Customer's message: "${incomingMessage}"\n\nYour response:` }
//     ];

//     // 2. Define Tools (Function Calling for Smart Leads)
//     const tools = [
//       {
//         type: "function",
//         function: {
//           name: "capture_lead",
//           description: "Trigger this ONLY when the user expresses clear interest in buying, requests a quote, or wants to be contacted.",
//           parameters: {
//             type: "object",
//             properties: {
//               extractedEmail: { type: "string", description: "The user's email if provided, otherwise empty." },
//               priority: { type: "string", enum: ["Low", "Medium", "High"], description: "High if ready to buy. Medium if asking for pricing/details." },
//               summary: { type: "string", description: "A short summary of what the user wants." },
//               replyText: { type: "string", description: "The response message you want to send back to the user right now." }
//             },
//             required: ["priority", "summary", "replyText"],
//           },
//         },
//       }
//     ];

//     // 3. Call OpenAI API
//     const response = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: messages,
//       tools: tools,
//       tool_choice: "auto",
//       temperature: 0.7, 
//     });

//     const responseMessage = response.choices[0].message;
//     let leadActionObj = null;

//     // 4. Handle AI Lead Capture Decision (Tool Call)
//     if (responseMessage.tool_calls) {
//       const toolCall = responseMessage.tool_calls[0];
      
//       if (toolCall.function.name === "capture_lead") {
//         const args = JSON.parse(toolCall.function.arguments);
//         console.log(`🔥 LEAD DETECTED from ${platform} [${args.priority}]: ${args.summary}`);

//         try {
//           // Normalize Phone Number for Search (Remove 91 if it's a 12 digit Indian number)
//           let searchPhone = customerData.phone ? customerData.phone.replace(/\D/g, '') : "";
//           if (searchPhone.length === 12 && searchPhone.startsWith('91')) {
//             searchPhone = searchPhone.substring(2);
//           }

//           // Check for existing lead (Re-engagement)
//           let existingLead = null;
//           if (searchPhone) {
//             existingLead = await Lead.findOne({ companyId: startupData.userId, phone: searchPhone });
//           }

//           if (existingLead) {
//             // 🟢 UPDATE EXISTING LEAD
//             existingLead.priority = args.priority === "High" ? "High" : existingLead.priority;
//             existingLead.status = "Qualified";
//             existingLead.aiSummary = args.summary;
            
//             if (!existingLead.platformDetails) existingLead.platformDetails = {};
//             existingLead.platformDetails.whatsappRawNumber = customerData.phone;

//             existingLead.remarks.push({
//               note: `🔥 Re-engaged via ${platform} Chat: ${args.summary}`,
//               createdAt: new Date()
//             });

//             await existingLead.save();
//             leadActionObj = { type: 'updated', lead: existingLead };
//             console.log(`✅ Existing Lead [Source: ${existingLead.source}] Re-engaged!`);

//           } else {
//             // 🔵 CREATE NEW LEAD
//             const newLead = new Lead({
//               companyId: startupData.userId,
//               status: "New",
//               priority: args.priority,
//               name: customerData.name || "WA User",
//               email: args.extractedEmail || "",
//               phone: searchPhone, 
//               source: `${platform} AI`,
//               aiSummary: args.summary,
//               platformDetails: {
//                 whatsappRawNumber: customerData.phone,
//                 platformAccountId: customerData.accountId
//               },
//               data: {
//                 lastMessage: incomingMessage
//               },
//               tags: ["AI Generated", platform]
//             });

//             await newLead.save();
//             leadActionObj = { type: 'created', lead: newLead };
//             console.log("✅ New Smart Lead Created.");
//           }
//         } catch (dbErr) {
//           console.error("Error handling lead in DB:", dbErr);
//         }

//         // Return extracted reply text and lead action
//         return {
//           text: args.replyText.replace(/\*/g, '').trim(),
//           leadAction: leadActionObj
//         };
//       }
//     }

//     // 5. Normal AI Reply (If no tool called)
//     let cleanText = responseMessage.content ? responseMessage.content.replace(/\*/g, '').trim() : "I'm here to help!";
//     return {
//       text: cleanText,
//       leadAction: null
//     };

//   } catch (error) {
//     console.error(`AI Generation Error [${platform}]:`, error);
//     return {
//       text: "Thank you for reaching out! Our team is currently reviewing your message and will get back to you shortly.",
//       leadAction: null
//     };
//   }
// };