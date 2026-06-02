import express from 'express';
import { protect } from '../middleware/auth.js';
import { uploadKnowledgeDocument } from '../config/knowledgeRepositoryMulter.js';
import {
  createDocument,
  createFolder,
  deleteItem,
  getTree,
  updateItem,
} from '../controllers/knowledgeRepositoryController.js';

const router = express.Router();

router.use(protect);

router.get('/tree', getTree);
router.post('/folders', createFolder);
router.post('/documents', uploadKnowledgeDocument.single('file'), createDocument);
router.patch('/:id', updateItem);
router.delete('/:id', deleteItem);

export default router;