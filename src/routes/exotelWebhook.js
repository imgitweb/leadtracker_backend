import express from "express";
import exotelWebhookService from "../services/exotelWebhookService.js";
import exotelController from "../controllers/exotelController.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Exotel Webhook is running",
  });
});


router.post("/connect", exotelController.connect);


router.post("/status", exotelController.status);


router.post("/", async (req, res) => {
  try {
    console.log("========== EXOTEL WEBHOOK ==========");
    console.log(req.body);

    await exotelWebhookService.handleWebhook(req.body);

    return res.status(200).json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    console.error("Exotel Webhook Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;