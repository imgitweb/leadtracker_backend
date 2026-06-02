import SupportTicket from '../models/SupportTicket.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { sendResponse, sendError, getPagination } from '../utils/helpers.js';

const ADMIN_ROLES = ['admin', 'super_admin'];
const isAdminUser = (user) => ADMIN_ROLES.includes((user?.role || '').toLowerCase());

// ─── Scope helper ─────────────────────────────────────────────────────────────
const buildTicketQuery = (req, extra = {}) => {
  const query = { companyId: req.user.company._id, ...extra };
  if (!isAdminUser(req.user)) {
    query.$or = [
      { createdBy: req.user._id },
      { assignedTo: req.user._id },
    ];
  }
  return query;
};

// ─── GET /api/support-tickets ────────────────────────────────────────────────
export const getTickets = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, priority, category, search, leadId, assignedTo } = req.query;
    const { skip, limit: lim } = getPagination(page, limit);

    const query = { companyId: req.user.company._id };

    // Access control for non-admins
    const accessOr = isAdminUser(req.user)
      ? null
      : [{ createdBy: req.user._id }, { assignedTo: req.user._id }];

    if (status && status !== 'all') query.status = status;
    if (priority && priority !== 'all') query.priority = priority;
    if (category && category !== 'all') query.category = category;
    if (leadId) query.leadId = leadId;
    if (assignedTo && assignedTo !== 'all') {
      if (assignedTo === 'unassigned') {
        query.assignedTo = { $size: 0 };
      } else {
        query.assignedTo = assignedTo;
      }
    }

    // Build $and conditions to avoid $or conflicts
    const andConditions = [];
    if (accessOr) andConditions.push({ $or: accessOr });
    if (search && search.trim()) {
      andConditions.push({
        $or: [
          { subject: { $regex: search.trim(), $options: 'i' } },
          { description: { $regex: search.trim(), $options: 'i' } },
        ],
      });
    }
    if (andConditions.length > 0) query.$and = andConditions;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .populate('createdBy', 'fullName email')
        .populate('assignedTo', 'fullName email')
        .populate('leadId', 'name email phone status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(lim),
      SupportTicket.countDocuments(query),
    ]);

    return sendResponse(res, 200, true, 'Tickets fetched successfully', {
      tickets,
      total,
      page: parseInt(page),
      perPage: lim,
      totalPages: Math.ceil(total / lim),
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch tickets', error);
  }
};

// ─── GET /api/support-tickets/:id ────────────────────────────────────────────
export const getTicketById = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne(buildTicketQuery(req, { _id: req.params.id }))
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .populate('leadId', 'name email phone status priority');

    if (!ticket) return sendError(res, 404, 'Ticket not found');

    return sendResponse(res, 200, true, 'Ticket fetched', { ticket });
  } catch (error) {
    return sendError(res, 500, 'Failed to fetch ticket', error);
  }
};

// ─── POST /api/support-tickets ───────────────────────────────────────────────
export const createTicket = async (req, res) => {
  try {
    const { subject, description, category, priority, status, leadId, assignedTo } = req.body;

    if (!subject?.trim()) return sendError(res, 400, 'Subject is required');

    const ticket = await SupportTicket.create({
      companyId: req.user.company._id,
      createdBy: req.user._id,
      subject: subject.trim(),
      description: description?.trim() || '',
      category: category || 'General',
      priority: priority || 'Medium',
      status: status || 'Open',
      leadId: leadId || null,
      assignedTo: assignedTo
        ? (Array.isArray(assignedTo) ? assignedTo : [assignedTo])
        : [],
    });

    await ticket.populate([
      { path: 'createdBy', select: 'fullName email' },
      { path: 'assignedTo', select: 'fullName email' },
      { path: 'leadId', select: 'name email phone status' },
    ]);

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'ticket_created',
      status: 'success',
      details: { ticketId: ticket._id, subject: ticket.subject },
    });

    return sendResponse(res, 201, true, 'Ticket created successfully', { ticket });
  } catch (error) {
    return sendError(res, 400, 'Failed to create ticket', error);
  }
};

// ─── PATCH /api/support-tickets/:id ──────────────────────────────────────────
export const updateTicket = async (req, res) => {
  try {
    const allowed = ['subject', 'description', 'category', 'priority', 'status', 'assignedTo', 'meta'];
    const update = {};
    allowed.forEach((key) => {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    });

    // Normalize assignedTo to array of ObjectIds
    if (update.assignedTo !== undefined) {
      update.assignedTo = Array.isArray(update.assignedTo)
        ? update.assignedTo
        : (update.assignedTo ? [update.assignedTo] : []);
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      buildTicketQuery(req, { _id: req.params.id }),
      update,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .populate('leadId', 'name email phone status');

    if (!ticket) return sendError(res, 404, 'Ticket not found');

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'ticket_updated',
      status: 'success',
      details: { ticketId: ticket._id, subject: ticket.subject },
    });

    return sendResponse(res, 200, true, 'Ticket updated successfully', { ticket });
  } catch (error) {
    return sendError(res, 400, 'Failed to update ticket', error);
  }
};

// ─── DELETE /api/support-tickets/:id ─────────────────────────────────────────
export const deleteTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findOneAndDelete(
      buildTicketQuery(req, { _id: req.params.id })
    );

    if (!ticket) return sendError(res, 404, 'Ticket not found');

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'ticket_deleted',
      status: 'success',
      details: { ticketId: ticket._id, subject: ticket.subject },
    });

    return sendResponse(res, 200, true, 'Ticket deleted successfully');
  } catch (error) {
    return sendError(res, 500, 'Failed to delete ticket', error);
  }
};

// ─── POST /api/support-tickets/:id/assign ────────────────────────────────────
export const assignTicket = async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return sendError(res, 400, 'userIds array is required');
    }

    // Verify all users belong to same company
    const users = await User.find({ _id: { $in: userIds }, company: req.user.company._id });
    if (users.length !== userIds.length) {
      return sendError(res, 400, 'One or more users do not belong to your company');
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      buildTicketQuery(req, { _id: req.params.id }),
      { assignedTo: userIds },
      { new: true }
    )
      .populate('createdBy', 'fullName email')
      .populate('assignedTo', 'fullName email')
      .populate('leadId', 'name email phone status');

    if (!ticket) return sendError(res, 404, 'Ticket not found');

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: 'ticket_assigned',
      status: 'success',
      details: { ticketId: ticket._id, assignedCount: userIds.length },
    });

    return sendResponse(res, 200, true, 'Ticket assigned successfully', { ticket });
  } catch (error) {
    return sendError(res, 400, 'Failed to assign ticket', error);
  }
};

export default { getTickets, getTicketById, createTicket, updateTicket, deleteTicket, assignTicket };
