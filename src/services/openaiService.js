import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateAiReply = async (prompt, message) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          prompt ||
          "You are a professional AI Call Agent. Reply naturally in Hindi and English.",
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  return response.choices[0].message.content;
};

export const generateSummary = async (conversation) => {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Summarize the phone conversation. Extract customer requirement, interest, budget, location and follow-up.",
      },
      {
        role: "user",
        content: conversation,
      },
    ],
  });

  return response.choices[0].message.content;
};