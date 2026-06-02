import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getTickets,
  getTicketById,
  createTicket,
  updateTicket,
  deleteTicket,
  assignTicket,
} from '../controllers/supportTicketController.js';

const router = express.Router();

// All routes require JWT auth
router.use(protect);

// Collection routes
router.get('/', getTickets);
router.post('/', createTicket);

// Item routes
router.get('/:id', getTicketById);
router.patch('/:id', updateTicket);
router.delete('/:id', deleteTicket);

// Assign
router.post('/:id/assign', assignTicket);

export default router;
