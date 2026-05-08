import express from 'express';
import { getForms, createForm, updateForm, deleteForm } from '../controllers/formController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getForms)
  .post(createForm);

router.route('/:id')
  .put(updateForm)
  .delete(deleteForm);

export default router;
