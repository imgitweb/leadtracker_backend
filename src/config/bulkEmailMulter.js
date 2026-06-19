import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = 'uploads/bulk-email-attachments';

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'attachment-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const allowedTypes = /pdf|doc|docx|ppt|pptx|png|jpg|jpeg|xls|xlsx|csv|txt|zip/;

const fileFilter = (req, file, cb) => {
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (extname) {
    return cb(null, true);
  }

  return cb(new Error('Unsupported file type for email attachment. Please use standard document or image formats.'));
};

export const uploadEmailAttachments = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
  },
});

export default uploadEmailAttachments;
