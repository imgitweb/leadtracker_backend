import mongoose from "mongoose";
import Lead from "../models/Lead.js";
import Form from "../models/Form.js";
import { sendResponse, sendError, getPagination } from "../utils/helpers.js";

const ADMIN_ROLES = ["admin", "super_admin", "lead_manager"];

const isAdminUser = (user) =>
  ADMIN_ROLES.includes((user?.role || "").toLowerCase());

const buildLeadScopeMatch = (req, extraMatch = {}) => {
  const match = {
    companyId: req.user.company._id,
    ...extraMatch,
  };

  if (!isAdminUser(req.user)) {
    match.$or = [{ createdBy: req.user._id }, { assignedTo: req.user._id }];
  }

  return match;
};

export const getCompanyAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company._id;
    // Ensure we have a proper ObjectId instance for aggregation matches
    const companyObjectId =
      companyId && companyId._bsontype === "ObjectID"
        ? companyId
        : new mongoose.Types.ObjectId(companyId);

    const { page = 1, limit = 10, days = 7 } = req.query;
    const { skip, limit: lim } = getPagination(page, limit);

    // Basic counts
    const totalLeads = await Lead.countDocuments(buildLeadScopeMatch(req));
    const activeFormsCount = await Form.countDocuments({
      companyId: companyObjectId,
      isActive: true,
    });

    // ─── Per-Status Counts (for stat cards) ───────────────────────────────
    const newLeads = await Lead.countDocuments(
      buildLeadScopeMatch(req, { status: "New" }),
    );
    const qualifiedLeads = await Lead.countDocuments(
      buildLeadScopeMatch(req, { status: "Qualified" }),
    );
    const openCases = await Lead.countDocuments(
      buildLeadScopeMatch(req, { status: "Support" }),
    );
    const inConversation = await Lead.countDocuments(
      buildLeadScopeMatch(req, { status: "Contacted" }),
    );
    const convertedLeads = await Lead.countDocuments(
      buildLeadScopeMatch(req, { status: "Converted" }),
    );
    const lostLeads = await Lead.countDocuments(
      buildLeadScopeMatch(req, { status: "Lost" }),
    );

    // ─── Leads by Status (grouped) ─────────────────────────────────────────
    const leadsByStatusAgg = await Lead.aggregate([
      { $match: buildLeadScopeMatch(req) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const leadsByStatus = leadsByStatusAgg.reduce((acc, cur) => {
      acc[cur._id] = cur.count;
      return acc;
    }, {});

    // ─── Leads by Source ────────────────────────────────────────────────────
    const leadsBySourceAgg = await Lead.aggregate([
      { $match: buildLeadScopeMatch(req) },
      {
        $group: {
          _id: { $ifNull: ["$source", "Organic"] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);
    const leadsBySource = leadsBySourceAgg.map((item) => ({
      source: item._id || "Organic",
      count: item.count,
    }));

    // ─── Submissions per day (new leads + qualified per day) ───────────────
    const daysInt = Math.max(1, parseInt(days));
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (daysInt - 1));
    startDate.setHours(0, 0, 0, 0);

    const submissionsByDayAgg = await Lead.aggregate([
      { $match: buildLeadScopeMatch(req, { createdAt: { $gte: startDate } }) },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          qualified: {
            $sum: {
              $cond: [{ $eq: ["$status", "Qualified"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Build ordered array for the last N days (fill zeros)
    const submissionsByDay = [];
    for (let i = 0; i < daysInt; i++) {
      const d = new Date();
      d.setDate(d.getDate() - (daysInt - 1) + i);
      const key = d.toISOString().split("T")[0];
      const found = submissionsByDayAgg.find((x) => x._id === key);
      submissionsByDay.push({
        date: key,
        count: found ? found.count : 0,
        qualified: found ? found.qualified : 0,
      });
    }

    // ─── Upcoming follow-ups (paginated) ───────────────────────────────────
    const followUpPipeline = [
      { $match: buildLeadScopeMatch(req) },
      { $unwind: "$followUps" },
      {
        $match: { "followUps.nextFollowUpDate": { $exists: true, $ne: null } },
      },
      {
        $project: {
          _id: 0,
          leadId: "$_id",
          leadName: "$name",
          leadEmail: "$email",
          leadPhone: "$phone",
          nextFollowUpDate: "$followUps.nextFollowUpDate",
          note: "$followUps.note",
          followUpCreatedBy: "$followUps.createdBy",
        },
      },
      { $sort: { nextFollowUpDate: 1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: lim }],
        },
      },
    ];

    const followUpResult = await Lead.aggregate(followUpPipeline);
    const totalFollowUps = followUpResult[0]?.metadata?.[0]?.total || 0;
    const followUps = followUpResult[0]?.data || [];

    // ─── Open Tickets ──────────────────────────────────────────────────────
    let openTickets = 0;
    try {
      const SupportTicketModel = (await import("../models/SupportTicket.js"))
        .default;
      openTickets = await SupportTicketModel.countDocuments(
        isAdminUser(req.user)
          ? { companyId, status: { $ne: "Closed" } }
          : {
              companyId,
              status: { $ne: "Closed" },
              $or: [{ createdBy: req.user._id }, { assignedTo: req.user._id }],
            },
      );
    } catch (e) {
      openTickets = 0;
    }

    return sendResponse(res, 200, true, "Analytics fetched successfully", {
      // ── Totals ──
      totalLeads,
      websiteTotalLeads: totalLeads,
      activeFormsCount,
      openTickets,

      // ── Status counts (stat cards) ──
      newLeads,
      qualifiedLeads,
      openCases,
      inConversation,
      convertedLeads,
      lostLeads,

      // ── Grouped data ──
      leadsByStatus,
      leadsBySource,
      submissionsByDay,

      // ── Follow-ups ──
      upcomingFollowUps: followUps,
      totalFollowUps,

      page: parseInt(page),
      perPage: parseInt(limit),
    });
  } catch (error) {
    console.error("Analytics error", error);
    return sendError(res, 500, "Failed to fetch analytics", error);
  }
};

export default { getCompanyAnalytics };
