import axios from 'axios';
import { sendResponse, sendError } from '../utils/helpers.js';
import OpenAI from 'openai';

/**
 * POST /api/chat
 * Body: { message: "User's spoken/typed text" }
 * Returns: JSON with { answer: "AI Text", audio: "base64_string" }
 */
export const processChat = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return sendError(res, 400, 'Message is required');
    }

    // ==========================================
    // 0. INITIALIZE OPENAI (Inside function to avoid .env load issues)
    // ==========================================
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API Key is missing in .env file!");
      return sendError(res, 500, 'Server configuration error');
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // ==========================================
    // 1. AI TEXT GENERATION (OpenAI GPT-3.5)
    // ==========================================
    let aiResponseText = "";
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful, friendly, and warm virtual assistant . Always reply in the exact same language the user uses (e.g., if they speak Hindi, reply in Hindi; if English, reply in English). Keep your answers very short, simple, and conversational because they will be converted to voice."
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 150, // Short response ensure karne ke liye
        temperature: 0.7, // Thoda natural aur creative tone ke liye
      });

      aiResponseText = completion.choices[0].message.content.trim();
    } catch (openAiError) {
      console.error("OpenAI API Error:", openAiError.message);
      aiResponseText = "Sorry, I am having a little trouble thinking right now. Please try again.";
    }

    // ==========================================
    // 2. TEXT TO SPEECH (ElevenLabs API)
    // ==========================================
    let base64Audio = null;
    const VOICE_ID = 'RDWdsTU6N02BFftbIEAp'; // Aapka Custom Voice ID

    if (process.env.ELEVENLABS_API_KEY) {
      try {
        const audioResponse = await axios.post(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
          {
            text: aiResponseText,
            model_id: 'eleven_multilingual_v2', 
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          },
          {
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY,
              'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer' 
          }
        );

        base64Audio = Buffer.from(audioResponse.data, 'binary').toString('base64');
        
      } catch (audioError) {
        const errMsg = audioError?.response?.data 
          ? Buffer.from(audioError.response.data).toString('utf8') 
          : audioError.message;
        console.error("ElevenLabs API Error:", errMsg);
      }
    } else {
      console.warn("WARNING: ELEVENLABS_API_KEY is not set in your .env file.");
    }

    // ==========================================
    // 3. SEND RESPONSE TO FRONTEND
    // ==========================================
    res.status(200).json({
      answer: aiResponseText,
      audio: base64Audio
    });

  } catch (error) {
    console.error('Chat processing error:', error);
    return sendError(res, 500, 'Failed to process chat request', error);
  }
};

export default { processChat };