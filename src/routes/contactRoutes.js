import express from "express";
import multer from "multer";
import {
  addContacts,
  importContacts,
  getContacts,
  getContactById,
  updateContact,
  optOutContact,
  deleteContact,
} from "../controllers/contactController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Memory storage for CSV / Excel uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

router.use(protect);

router.post("/", addContacts);
router.post("/import", upload.single("file"), importContacts);
router.get("/", getContacts);
router.get("/:id", getContactById);
router.patch("/:id", updateContact);
router.patch("/:id/opt-out", optOutContact);
router.delete("/:id", deleteContact);

export default router;
