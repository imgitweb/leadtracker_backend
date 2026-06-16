import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ES Modules mein __dirname banane ka tareeqa
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dhyan dein: Agar aapka middleware folder 'src/middleware' mein hai, 
// toh root ke 'uploads' folder tak jaane ke liye '../../uploads' use karna padega.
// Agar aapka structure alag hai, toh path.join adjust kar lijiye.
const uploadDir = path.join(__dirname, "../../uploads"); 

// Folder nahi hai toh create karein
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Unique filename generate karna: timestamp + original extension
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

export const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});