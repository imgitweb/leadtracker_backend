import Transcript from "../models/Transcript.js";

/**
 * Appends a message to the call transcript
 */
export const appendMessageToTranscript = async ({
  callId,
  callSid,
  campaignId,
  contactId,
  speaker, // "AI Agent" | "User"
  text,
  language = "hi-IN",
}) => {
  try {
    const transcript = await Transcript.findOneAndUpdate(
      { callId },
      {
        $setOnInsert: {
          callId,
          callSid,
          campaignId,
          contactId,
          language,
        },
        $push: {
          messages: {
            speaker,
            text,
            timestamp: new Date(),
          },
        },
      },
      { upsert: true, new: true }
    );
    return transcript;
  } catch (error) {
    console.error("Error saving transcript message:", error.message);
    return null;
  }
};

/**
 * Retrieves the full transcript for a call
 */
export const getTranscriptByCallId = async (callId) => {
  return Transcript.findOne({ callId }).lean();
};

/**
 * Marks a transcript as complete
 */
export const finalizeTranscript = async (callId) => {
  return Transcript.findOneAndUpdate(
    { callId },
    { $set: { isComplete: true } },
    { new: true }
  );
};

export default {
  appendMessageToTranscript,
  getTranscriptByCallId,
  finalizeTranscript,
};
