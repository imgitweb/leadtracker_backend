import express from "express";
import { verifyFbWebhook, handleFbWebhook } from "../../controllers/meta/facebookWebhookController.js";

const router = express.Router();

// 1. Meta webhook verification ke liye (GET Request)
// Jab aap Meta Dashboard me webhook verify karenge tab ye call hoga
router.get("/", verifyFbWebhook);

// 2. Meta se aane wale naye messages receive karne ke liye (POST Request)
// Jab bhi koi user aapke page par message karega, Meta yahan data bhejega
router.post("/", handleFbWebhook);

export default router;