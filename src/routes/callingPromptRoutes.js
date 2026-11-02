import express from "express";
import {
  getPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from "../controllers/callingPromptController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect);

router.get("/", getPrompts);
router.post("/", createPrompt);
router.put("/:id", updatePrompt);
router.delete("/:id", deletePrompt);

export default router;

