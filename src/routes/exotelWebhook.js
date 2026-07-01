import express from "express";
import exotelWebhookService from "../services/exotelWebhookService.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    await exotelWebhookService.handleWebhook(req.body);

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;