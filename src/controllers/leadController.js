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
  const query = {
    companyId: req.user.company._id,
    $nor: [
      { name: { $regex: /^test$/i } },
      { phone: { $in: ["+1", "+91", ""] } },
    ],
  };
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
      .sort({ createdAt: -1 });
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
    const lead = await Lead.findOneAndUpdate(
      { _id: req.params.id, companyId: req.user.company._id },
      req.body,
      { new: true, runValidators: true },
    );

    if (!lead) {
      return sendError(res, 404, "Lead not found");
    }

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_updated",
      status: "success",
      details: { leadId: lead._id, name: lead.name },
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
          remarks: { note, createdBy: req.user._id },
        },
      },
      { new: true },
    );

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_remark_added",
      status: "success",
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
      { status },
      { new: true },
    );

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_updated",
      status: "success",
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
      { priority },
      { new: true },
    );

    if (!lead) return sendError(res, 404, "Lead not found");

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_updated",
      status: "success",
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
          },
        },
      },
      { new: true },
    );

    if (!lead) return sendError(res, 404, "Lead not found");

    await lead.populate([
      { path: "formId", select: "name" },
      { path: "createdBy", select: "fullName email" },
      { path: "assignedTo", select: "fullName email" },
      { path: "followUps.createdBy", select: "fullName email" },
      { path: "remarks.createdBy", select: "fullName email" },
    ]);

    await AuditLog.create({
      user: req.user._id,
      company: req.user.company._id,
      action: "lead_followup_added",
      status: "success",
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
      { assignedTo: userIds },
      { new: true },
    );

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
