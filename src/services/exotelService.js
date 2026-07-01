import axios from "axios";

const {
  EXOTEL_SID,
  EXOTEL_API_KEY,
  EXOTEL_API_TOKEN,
  EXOTEL_CALLER_ID,
  EXOTEL_FLOW_ID,
  EXOTEL_BASE_URL,
  APP_URL,
} = process.env;

const exotel = axios.create({
  baseURL:
    EXOTEL_BASE_URL ||
    `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}`,
  auth: {
    username: EXOTEL_API_KEY,
    password: EXOTEL_API_TOKEN,
  },
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
});

class ExotelService {
  /**
   * Outbound Call
   */
  async makeCall({
    phone,
    leadId,
    campaignId,
    prompt,
    voice,
  }) {
    try {
      const payload = new URLSearchParams();

      payload.append("From", EXOTEL_CALLER_ID);

      payload.append("To", phone);

      // AI App URL (Webhook/Flow)
      payload.append(
        "Url",
        `${APP_URL}/api/exotel/connect?leadId=${leadId}&campaignId=${campaignId}`
      );

      payload.append("CallerId", EXOTEL_CALLER_ID);

      payload.append("StatusCallback", `${APP_URL}/api/exotel/status`);

      payload.append("StatusCallbackContentType", "application/json");

      const { data } = await exotel.post(
        "/Calls/connect",
        payload
      );

      return data.Call;
    } catch (error) {
      console.error(
        "Exotel Make Call Error:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Get Call Details
   */
  async getCall(callSid) {
    try {
      const { data } = await exotel.get(`/Calls/${callSid}`);

      return data.Call;
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }

  /**
   * Hangup
   */
  async hangup(callSid) {
    try {
      const { data } = await exotel.post(
        `/Calls/${callSid}`,
        new URLSearchParams({
          Status: "completed",
        })
      );

      return data.Call;
    } catch (error) {
      console.error(error.message);
      throw error;
    }
  }

  /**
   * Recording URL
   */
  async getRecording(callSid) {
    const call = await this.getCall(callSid);

    return {
      recording: call.RecordingUrl,
      presigned: call.PreSignedRecordingUrl,
    };
  }

  /**
   * Status
   */
  async getStatus(callSid) {
    const call = await this.getCall(callSid);

    return {
      sid: call.Sid,
      status: call.Status,
      duration: call.Duration,
      answeredBy: call.AnsweredBy,
      price: call.Price,
      recording: call.RecordingUrl,
    };
  }
}

export default new ExotelService();