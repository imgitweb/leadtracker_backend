import axios from "axios";

const {
  EXOTEL_SID,
  EXOTEL_API_KEY,
  EXOTEL_API_TOKEN,
  EXOTEL_CALLER_ID,
  EXOTEL_BASE_URL,
  APP_URL,
} = process.env;

if (!EXOTEL_SID || !EXOTEL_API_KEY || !EXOTEL_API_TOKEN || !EXOTEL_CALLER_ID) {
  throw new Error("Missing Exotel environment variables.");
}

const exotel = axios.create({
  baseURL:
    EXOTEL_BASE_URL || `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}`,
  auth: {
    username: EXOTEL_API_KEY,
    password: EXOTEL_API_TOKEN,
  },
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
  },
  timeout: 30000,
});

class ExotelService {
  /**
   * Make Outbound Call
   */
  async makeCall({ phone, leadId, campaignId }) {
    try {
      const payload = new URLSearchParams();

      payload.append("From", EXOTEL_CALLER_ID);
      payload.append("To", phone);
      payload.append("CallerId", EXOTEL_CALLER_ID);

      payload.append(
        "Url",
        `${APP_URL}/api/exotel/webhook/connect?leadId=${leadId}&campaignId=${campaignId}`,
      );

      payload.append("StatusCallback", `${APP_URL}/api/exotel/webhook/status`);

      payload.append("StatusCallbackContentType", "application/json");

      const { data } = await exotel.post("/Calls/connect.json", payload);

      return data.Call;
    } catch (error) {
      console.error("========== EXOTEL MAKE CALL ==========");
      console.error("Status :", error.response?.status);
      console.error("Data :", error.response?.data);
      console.error("Message :", error.message);
      console.error("======================================");

      throw error;
    }
  }

  /**
   * Get Call Details
   */
  async getCall(callSid) {
    try {
      const { data } = await exotel.get(`/Calls/${callSid}.json`);

      return data.Call;
    } catch (error) {
      console.error("========== GET CALL ==========");
      console.error(error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Hangup Call
   */
  async hangup(callSid) {
    try {
      const payload = new URLSearchParams();

      payload.append("Status", "completed");

      const { data } = await exotel.post(`/Calls/${callSid}.json`, payload);

      return data.Call;
    } catch (error) {
      console.error("========== HANGUP ==========");
      console.error(error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Recording URL
   */
  async getRecording(callSid) {
    const call = await this.getCall(callSid);

    return {
      sid: call.Sid,
      recording: call.RecordingUrl,
      presigned: call.PreSignedRecordingUrl,
    };
  }

  /**
   * Call Status
   */
  async getStatus(callSid) {
    const call = await this.getCall(callSid);

    return {
      sid: call.Sid,
      status: call.Status,
      direction: call.Direction,
      duration: call.Duration,
      startTime: call.StartTime,
      endTime: call.EndTime,
      answeredBy: call.AnsweredBy,
      recording: call.RecordingUrl,
      price: call.Price,
    };
  }

  /**
   * Check API Credentials
   */
  async health() {
    try {
      const { data } = await exotel.get("/Calls.json");

      return {
        success: true,
        message: "Exotel Connected Successfully",
        totalCalls: data?.Calls?.length || 0,
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data || error.message,
      };
    }
  }
}

export default new ExotelService();
