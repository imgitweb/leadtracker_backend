import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadsDir = 'uploads/knowledge-repository';

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'knowledge-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const allowedTypes = /pdf|doc|docx|ppt|pptx|png|jpg|jpeg|xls|xlsx|csv|txt/;

const fileFilter = (req, file, cb) => {
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  }

  return cb(new Error('Unsupported file type for knowledge repository documents'));
};

export const uploadKnowledgeDocument = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 20 * 1024 * 1024,
  },
});

export default uploadKnowledgeDocument;