import WebSocket from "ws";

const createDeepgramConnection = () => {
  const deepgramLive = new WebSocket(
    "wss://api.deepgram.com/v1/listen?" +
      new URLSearchParams({
        model: "nova-3",
        language: "multi",
        encoding: "mulaw",
        sample_rate: "8000",
        channels: "1",
        punctuate: "true",
        smart_format: "true",
        interim_results: "true",
        endpointing: "1500",
      }),
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      },
    }
  );

  return deepgramLive;
};

export { createDeepgramConnection };