import { createDeepgramConnection } from "./deepgramService.js";
import { generateElevenLabsTTS } from "./elevenLabsService.js";
import {
  generateAiReply,
  generateSummary,
} from "./openaiService.js";

import CallingLead from "../models/CallingLead.js";

class AIConversationService {
  constructor() {
    this.sessions = new Map();
  }

  async createSession(callSid, lead) {
    const deepgram = createDeepgramConnection();

    this.sessions.set(callSid, {
      lead,
      deepgram,
      transcript: [],
    });

    return deepgram;
  }

  async processTranscript(callSid, transcript) {
    const session = this.sessions.get(callSid);

    if (!session) return null;

    session.transcript.push({
      role: "user",
      text: transcript,
      timestamp: new Date(),
    });

    const reply = await generateAiReply(
      session.lead.prompt,
      transcript
    );

    session.transcript.push({
      role: "assistant",
      text: reply,
      timestamp: new Date(),
    });

    const audio = await generateElevenLabsTTS(reply);

    return {
      text: reply,
      audio,
    };
  }

  async endSession(callSid) {
    const session = this.sessions.get(callSid);

    if (!session) return;

    const transcriptText = session.transcript
      .map((t) => `${t.role}: ${t.text}`)
      .join("\n");

    const summary = await generateSummary(transcriptText);

    await CallingLead.findOneAndUpdate(
      {
        exotelCallSid: callSid,
      },
      {
        transcript: session.transcript,
        aiSummary: summary,
        callStatus: "completed",
      }
    );

    if (session.deepgram.readyState === 1) {
      session.deepgram.close();
    }

    this.sessions.delete(callSid);
  }

  getSession(callSid) {
    return this.sessions.get(callSid);
  }
}

export default new AIConversationService();