import express from "express";
import {
  getCalls,
  getCallById,
  getCallTranscript,
  getCallAnalysis,
} from "../controllers/callController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", getCalls);
router.get("/:id", getCallById);
router.get("/:id/transcript", getCallTranscript);
router.get("/:id/analysis", getCallAnalysis);

export default router;
