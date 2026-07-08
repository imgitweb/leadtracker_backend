import exotelWebhookService from "../services/exotelWebhookService.js";

class ExotelController {
  /**
   * Called when Exotel connects a call
   */
  async connect(req, res) {
    try {
      console.log("========== EXOTEL CONNECT ==========");
      console.log("Headers:", req.headers);
      console.log("Body:", req.body);


      res.set("Content-Type", "text/xml");

      return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
        <Response>
            <Say>Connecting your call. Please wait.</Say>
        </Response>`);
    } catch (error) {
      console.error("Connect Error:", error);

      res.status(500).send("Internal Server Error");
    }
  }

  /**
   * Called by Exotel for call status updates
   */
  async status(req, res) {
    try {
      console.log("========== EXOTEL STATUS ==========");
      console.log(req.body);

      await exotelWebhookService.handleWebhook(req.body);

      return res.status(200).json({
        success: true,
      });
    } catch (error) {
      console.error("Status Error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

export default new ExotelController();
