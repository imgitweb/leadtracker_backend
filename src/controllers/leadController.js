import Lead from "../models/Lead.js";
import Company from "../models/Company.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import { sendResponse, sendError } from "../utils/helpers.js";
import AuditLog from "../models/AuditLog.js";
import Form from "../models/Form.js";
import SupportTicket from "../models/SupportTicket.js";

const ADMIN_ROLES = ["admin", "super_admin", "lead_manager"];

const isAdminUser = (user) =>
  ADMIN_ROLES.includes((user?.role || "").toLowerCase());

const buildLeadAccessQuery = (req) => {
  const query = { companyId: req.user.company._id };
  if (!isAdminUser(req.user)) {
    query.$or = [{ createdBy: req.user._id }, { assignedTo: req.user._id }];
  }

  return query;
};
// Get all leads for the current company
export const getLeads = async (req, res) => {
  try {
    const { formId } = req.query;
    const query = buildLeadAccessQuery(req);
    if (formId) {
      query.formId = formId;
    }

    const leads = await Lead.find(query)
      .populate("formId", "name")
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email")
      .populate("remarks.createdBy", "fullName email")
      .populate("followUps.createdBy", "fullName email")
      .sort({ updatedAt: -1, createdAt: -1 });

    // Backfill updatedBy for leads that were updated without updatedBy
    const missingUpdatedByLeads = leads.filter((l) => !l.updatedBy);

    if (missingUpdatedByLeads.length > 0) {
      const missingUpdatedByLeadIds = missingUpdatedByLeads.map((l) => l._id);
      const logs = await AuditLog.find({
        action: {
          $in: [
            "lead_updated",
            "lead_followup_added",
            "lead_remark_added",
            "lead_assigned",
          ],
        },
        $or: [
          {
            "details.leadId": {
              $in: [
                ...missingUpdatedByLeadIds,
                ...missingUpdatedByLeadIds.map(String),
              ],
            },
          },
          { resourceId: { $in: missingUpdatedByLeadIds } },
        ],
      })
        .sort({ createdAt: -1 })
        .populate("user", "fullName email")
        .lean();

      const leadUserMap = {};
      logs.forEach((log) => {
        const lid = String(log.details?.leadId || log.resourceId || "");
        if (lid && !leadUserMap[lid] && log.user) {
          leadUserMap[lid] = {
            _id: log.user._id,
            fullName: log.user.fullName,
            email: log.user.email,
          };
        }
      });

      // Find recent modifier in this company who performed lead updates
      let fallbackModifier = null;
      const recentModifierLog = await AuditLog.findOne({
        company: req.user.company._id,
        action: {
          $in: ["lead_updated", "lead_followup_added", "lead_remark_added"],
        },
      })
        .sort({ createdAt: -1 })
        .populate("user", "fullName email")
        .lean();

      if (recentModifierLog?.user) {
        fallbackModifier = {
          _id: recentModifierLog.user._id,
          fullName: recentModifierLog.user.fullName,
          email: recentModifierLog.user.email,
        };
      }

      for (const l of missingUpdatedByLeads) {
        let matchedUser = leadUserMap[String(l._id)];

        // Check follow-ups
        if (
          !matchedUser &&
          Array.isArray(l.followUps) &&
          l.followUps.length > 0
        ) {
          const lastF = l.followUps[l.followUps.length - 1];
          if (lastF?.createdBy?.fullName) {
            matchedUser = {
              _id: lastF.createdBy._id,
              fullName: lastF.createdBy.fullName,
              email: lastF.createdBy.email,
            };
          }
        }

        // Check remarks
        if (
          !matchedUser &&
          Array.isArray(l.remarks) &&
          l.remarks.length > 0
        ) {
          const lastR = l.remarks[l.remarks.length - 1];
          if (lastR?.createdBy?.fullName) {
            matchedUser = {
              _id: lastR.createdBy._id,
              fullName: lastR.createdBy.fullName,
              email: lastR.createdBy.email,
            };
          }
        }

        // If the lead was modified (has tags, status is not "New", or updatedAt != createdAt)
        if (!matchedUser && fallbackModifier) {
          const hasTags =
            Array.isArray(l.tags) && l.tags.filter(Boolean).length > 0;
          const isModifiedStatus = l.status && l.status !== "New";
          const isUpdated =
            l.updatedAt &&
            l.createdAt &&
            new Date(l.updatedAt).getTime() !== new Date(l.createdAt).getTime();

          if (hasTags || isModifiedStatus || isUpdated) {
            matchedUser = fallbackModifier;
          }
        }

        if (matchedUser) {
          l.updatedBy = matchedUser;
          Lead.updateOne(
            { _id: l._id },
            { $set: { updatedBy: matchedUser._id } },
          )
            .exec()
            .catch(() => {});
        }
      }
    }

    sendResponse(res, 200, true, "Leads fetched successfully", {
      contacts: leads,
    });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
// Create a new lead
export const createLead = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company._id);
    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    // Enforce Plan Limits
    const currentLeadsCount = await Lead.countDocuments({
      companyId: req.user.company._id,
    });
    if (currentLeadsCount >= company.maxLeads) {
      return sendError(
        res,
        403,
        `Monthly submission limit reached (${company.maxLeads} leads). Please upgrade your plan.`,
      );
    }

    const { formId, data, status, priority, tags, source } = req.body;
    const normalizedFormId =
      typeof formId === "string" ? formId.trim() : formId;
    const isApiKeyRequest = !!req.isApiKeyAuth;

    // API-key based lead ingestion must always include a valid formId.
    if (isApiKeyRequest && !normalizedFormId) {
      return sendError(res, 400, "formId is required");
    }

    // If formId is provided (or required for API key), validate format first.
    if (normalizedFormId) {
      if (
        normalizedFormId === "your_form_id_here" ||
        !mongoose.Types.ObjectId.isValid(normalizedFormId)
      ) {
        return sendError(
          res,
          400,
          isApiKeyRequest ? "formId is required" : "Invalid formId",
        );
      }

      // Validate form ownership within the same company.
      const form = await Form.findById(normalizedFormId);
      if (
        !form ||
        form.companyId.toString() !== req.user.company._id.toString()
      ) {
        return sendError(res, 400, "Invalid formId for this company");
      }
    }

    // Support both payload formats:
    // 1) { formId, data: { ...fields } }
    // 2) { formId, name, email, phone, ...customFields }
    const reservedKeys = new Set([
      "formId",
      "data",
      "status",
      "priority",
      "tags",
      "source",
      "api_key",
    ]);
    const flatData = Object.entries(req.body || {}).reduce(
      (acc, [key, value]) => {
        if (!reservedKeys.has(key)) acc[key] = value;
        return acc;
      },
      {},
    );

    const normalizedData = {
      ...(flatData || {}),
      ...(data && typeof data === "object" && !Array.isArray(data) ? data : {}),
    };

    // Helper to find common field names in normalized lead data
    const findValue = (keys) => {
      if (!normalizedData || typeof normalizedData !== "object") return null;
      const foundKey = Object.keys(normalizedData).find((k) =>
        keys.includes(k.toLowerCase()),
      );
      return foundKey ? normalizedData[foundKey] : null;
    };

    const leadData = {
      companyId: req.user.company._id,
      formId: normalizedFormId || undefined,
      data: normalizedData,
      status: status || "New",
      priority: priority || "Medium",
      createdBy: req.user._id,
      updatedBy: req.user._id,
      tags,
      source: source || (req.isApiKeyAuth ? "Website" : source),
      name: findValue(["name", "full name", "fullname", "username"]),
      email: findValue(["email", "email address", "mail"]),
      phone: findValue([
        "phone",
        "mobile",
        "contact",
        "telephone",
        "phone number",
      ]),
    };

    const lead = await Lead.create(leadData);

    // Audit Log
    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: req.isApiKeyAuth ? "api_lead_created" : "lead_created",
      status: "success",
      details: {
        leadId: lead._id,
        name: lead.name,
        authType: req.isApiKeyAuth ? "apiKey" : "jwt",
      },
    });

    sendResponse(res, 201, true, "Lead created successfully", {
      contact: lead,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
// Get single lead details
export const getLeadDetails = async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      ...buildLeadAccessQuery(req),
    })
      .populate("formId", "name")
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email")
      .populate("assignedTo", "fullName email")
      .populate("followUps.createdBy", "fullName email")
      .populate("remarks.createdBy", "fullName email");

    if (!lead) {
      return sendError(res, 404, "Lead not found");
    }
    sendResponse(res, 200, true, "Lead details fetched", { contact: lead });
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
// Update lead
export const updateLead = async (req, res) => {
  try {
    const updatePayload = {
      ...req.body,
      updatedBy: req.user._id,
      updatedAt: new Date(),
    };

    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      updatePayload,
      { new: true, runValidators: true },
    )
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email")
      .populate("assignedTo", "fullName email");

    if (!lead) {
      return sendError(res, 404, "Lead not found");
    }

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_updated",
      status: "success",
      resource: "Lead",
      resourceId: lead._id,
      details: {
        leadId: lead._id,
        name: lead.name,
        tags: lead.tags,
        status: lead.status,
      },
    });

    // ── Auto-create Support Ticket when status changes to 'Support' ──────────
    if (req.body.status === "Support") {
      const existingTicket = await SupportTicket.findOne({
        leadId: lead._id,
        companyId: req.user.company._id,
      });

      if (!existingTicket) {
        await SupportTicket.create({
          companyId: req.user.company._id,
          leadId: lead._id,
          subject: `Support: ${lead.name || lead.email || "Lead"}`,
          description: `Auto-created ticket for lead ${lead.name || lead.email || lead._id}. Please review and assign.`,
          category: "General",
          priority: lead.priority || "Medium",
          status: "Open",
          createdBy: req.user._id,
          assignedTo: lead.assignedTo || [],
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    sendResponse(res, 200, true, "Lead updated successfully", {
      contact: lead,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
// Delete lead
export const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findOneAndDelete({
      _id: req.params.id,
      companyId: req.user.company._id,
    });

    if (!lead) {
      return sendError(res, 404, "Lead not found");
    }

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_deleted",
      status: "success",
      details: { leadId: lead._id, name: lead.name },
    });

    sendResponse(res, 200, true, "Lead deleted successfully");
  } catch (error) {
    sendError(res, 500, error.message);
  }
};
// Add Remark
export const addRemark = async (req, res) => {
  try {
    const { note } = req.body;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      {
        $push: {
          remarks: { note, createdBy: req.user._id, createdAt: new Date() },
        },
        $set: {
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
      },
      { new: true },
    )
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email")
      .populate("remarks.createdBy", "fullName email");

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_remark_added",
      status: "success",
      resource: "Lead",
      resourceId: lead._id,
      details: { leadId: lead._id, note: note.substring(0, 50) },
    });

    sendResponse(res, 200, true, "Remark added", { contact: lead });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
// Update Lead Status
export const updateLeadStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      {
        status,
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
      { new: true },
    )
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email");

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_updated",
      status: "success",
      resource: "Lead",
      resourceId: lead._id,
      details: { leadId: lead._id, field: "status", value: status },
    });

    sendResponse(res, 200, true, "Status updated", { contact: lead });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
// Update Lead Priority
export const updateLeadPriority = async (req, res) => {
  try {
    const { priority } = req.body;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      {
        priority,
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
      { new: true },
    )
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email");

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_updated",
      status: "success",
      resource: "Lead",
      resourceId: lead._id,
      details: { leadId: lead._id, field: "priority", value: priority },
    });

    sendResponse(res, 200, true, "Priority updated", { contact: lead });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
// Add Follow Up
export const addFollowUp = async (req, res) => {
  try {
    const { note, nextFollowUpDate } = req.body;
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      {
        $push: {
          followUps: {
            note,
            nextFollowUpDate,
            createdBy: req.user._id,
            date: new Date(),
          },
        },
        $set: {
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!lead) return sendError(res, 404, "Lead not found");

    await lead.populate([
      { path: "formId", select: "name" },
      { path: "createdBy", select: "fullName email" },
      { path: "updatedBy", select: "fullName email" },
      { path: "assignedTo", select: "fullName email" },
      { path: "followUps.createdBy", select: "fullName email" },
      { path: "remarks.createdBy", select: "fullName email" },
    ]);

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_followup_added",
      status: "success",
      resource: "Lead",
      resourceId: lead._id,
      details: { leadId: lead._id, nextDate: nextFollowUpDate },
    });

    sendResponse(res, 200, true, "Follow-up added", { contact: lead });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
// Assign Lead
export const assignLead = async (req, res) => {
  try {
    const { userIds } = req.body; // Array of user IDs

    // Verify all users belong to the same company
    const users = await User.find({
      _id: { $in: userIds },
      company: req.user.company._id,
    });

    if (users.length !== userIds.length) {
      return sendError(
        res,
        400,
        "One or more users do not belong to your company",
      );
    }

    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      {
        assignedTo: userIds,
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
      { new: true },
    )
      .populate("createdBy", "fullName email")
      .populate("updatedBy", "fullName email")
      .populate("assignedTo", "fullName email");

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_assigned",
      status: "success",
      details: { leadId: lead._id, assignedCount: userIds.length },
    });

    sendResponse(res, 200, true, "Lead assigned successfully", {
      contact: lead,
    });
  } catch (error) {
    sendError(res, 400, error.message);
  }
};
