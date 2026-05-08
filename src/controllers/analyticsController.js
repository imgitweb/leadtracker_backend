import mongoose from 'mongoose';
import Lead from '../models/Lead.js';
import Form from '../models/Form.js';
import { sendResponse, sendError, getPagination } from '../utils/helpers.js';

const ADMIN_ROLES = ['admin', 'super_admin'];

const isAdminUser = (user) => ADMIN_ROLES.includes((user?.role || '').toLowerCase());

const buildLeadScopeMatch = (req, extraMatch = {}) => {
  const match = {
    companyId: req.user.company._id,
    ...extraMatch,
  };

  if (!isAdminUser(req.user)) {
    match.$or = [
      { createdBy: req.user._id },
      { assignedTo: req.user._id },
    ];
  }

  return match;
};

/**
 * GET /api/analytics
 * Query params:
 *  - page (default 1)
 *  - limit (default 10)
 *  - days (for chart range, default 7)
 *
 * Returns company-scoped aggregated analytics and paginated upcoming follow-ups
 */
export const getCompanyAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    // Ensure we have a proper ObjectId instance for aggregation matches
    const companyObjectId = (companyId && companyId._bsontype === 'ObjectID')
      ? companyId
      : new mongoose.Types.ObjectId(companyId);

    const { page = 1, limit = 10, days = 7 } = req.query;
    const { skip, limit: lim } = getPagination(page, limit);

    // Basic counts
    const totalLeads = await Lead.countDocuments(buildLeadScopeMatch(req));
    const activeFormsCount = await Form.countDocuments({ companyId: companyObjectId, isActive: true });

    // Leads by status
    const leadsByStatusAgg = await Lead.aggregate([
      { $match: buildLeadScopeMatch(req) },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const leadsByStatus = leadsByStatusAgg.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    // Submissions per day for last `days` days (default 7)
    const daysInt = Math.max(1, parseInt(days));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (daysInt - 1));
    startDate.setHours(0,0,0,0);

    const submissionsByDayAgg = await Lead.aggregate([
      { $match: buildLeadScopeMatch(req, { createdAt: { $gte: startDate } }) },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Build ordered array for the last N days (fill zeros)
    const submissionsByDay = [];
    for (let i = 0; i < daysInt; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (daysInt - 1) + i);
      const key = d.toISOString().split('T')[0];
      const found = submissionsByDayAgg.find(x => x._id === key);
      submissionsByDay.push({ date: key, count: found ? found.count : 0 });
    }

    // Upcoming follow-ups: unwind followUps and paginate, sorted by nextFollowUpDate asc
    const followUpPipeline = [
      { $match: buildLeadScopeMatch(req) },
      { $unwind: '$followUps' },
      { $match: { 'followUps.nextFollowUpDate': { $exists: true, $ne: null } } },
      { $project: {
        _id: 0,
        leadId: '$_id',
        leadName: '$name',
        leadEmail: '$email',
        leadPhone: '$phone',
        nextFollowUpDate: '$followUps.nextFollowUpDate',
        note: '$followUps.note',
        followUpCreatedBy: '$followUps.createdBy',
      } },
      { $sort: { nextFollowUpDate: 1 } },
      { $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: lim }]
      } },
    ];

    const followUpResult = await Lead.aggregate(followUpPipeline);
    const totalFollowUps = (followUpResult[0]?.metadata?.[0]?.total) || 0;
    const followUps = followUpResult[0]?.data || [];

    // Try to compute open tickets if there is a SupportTicket model present
    let openTickets = 0;
    try {
      // dynamic import to avoid hard dependency if model not present
      const SupportTicketModel = (await import('../models/SupportTicket.js')).default;
      openTickets = await SupportTicketModel.countDocuments(
        isAdminUser(req.user)
          ? { companyId, status: { $ne: 'Closed' } }
          : { companyId, status: { $ne: 'Closed' }, $or: [{ createdBy: req.user._id }, { assignedTo: req.user._id }] }
      );
    } catch (e) {
      // model not found -> default to 0
      openTickets = 0;
    }

    return sendResponse(res, 200, true, 'Analytics fetched successfully', {
      totalLeads,
      activeFormsCount,
      leadsByStatus,
      submissionsByDay,
      upcomingFollowUps: followUps,
      totalFollowUps,
      openTickets,
      page: parseInt(page),
      perPage: parseInt(limit),
    });
  } catch (error) {
    console.error('Analytics error', error);
    return sendError(res, 500, 'Failed to fetch analytics', error);
  }
};

export default { getCompanyAnalytics };
