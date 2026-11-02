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

const hasFullLeadAccess = (user) => {
  if (isAdminUser(user)) return true;
  if (user?.moduleAccess?.leads === true) return true;
  return false;
};

const buildLeadAccessQuery = (req) => {
  const companyId = req.user?.company?._id || req.user?.company;
  const query = { companyId };
  if (!hasFullLeadAccess(req.user)) {
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
    // If bulk payload is posted to /api/contact, delegate to bulkCreateLeads
    if (Array.isArray(req.body) || Array.isArray(req.body?.leads)) {
      return bulkCreateLeads(req, res);
    }

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
      "rowNumber",
      "formId",
      "data",
      "status",
      "priority",
      "tags",
      "source",
      "api_key",
      "_id",
      "createdAt",
      "updatedAt",
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

    const rawName = findValue(["name", "full name", "fullname", "username"]);
    const rawEmail = findValue(["email", "email address", "mail"]);
    const rawPhone = findValue([
      "phone",
      "mobile",
      "contact",
      "telephone",
      "phone number",
    ]);

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
      name:
        rawName && typeof rawName === "string"
          ? rawName.trim()
          : rawName || req.body?.name || "",
      email:
        rawEmail && typeof rawEmail === "string"
          ? rawEmail.trim()
          : rawEmail || req.body?.email || "",
      phone:
        rawPhone && typeof rawPhone === "string"
          ? rawPhone.trim()
          : rawPhone || req.body?.phone || "",
    };

    // 🔍 Duplicate Check for Single Lead Creation
    let checkPhone = leadData.phone ? String(leadData.phone).replace(/\D/g, "") : "";
    if (checkPhone.length === 12 && checkPhone.startsWith("91")) {
      checkPhone = checkPhone.substring(2);
    } else if (checkPhone.length === 11 && checkPhone.startsWith("0")) {
      checkPhone = checkPhone.substring(1);
    }

    if (checkPhone) {
      const existingLeadWithPhone = await Lead.findOne({
        companyId: req.user.company._id,
        phone: checkPhone,
      });
      if (existingLeadWithPhone) {
        return sendError(
          res,
          409,
          `A lead with phone number ${checkPhone} already exists in CRM (${existingLeadWithPhone.name || "Unnamed"}).`
        );
      }
    }

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

// Bulk create leads (with strict duplicate checks & normalization)
export const bulkCreateLeads = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company._id);
    if (!company) {
      return sendError(res, 404, "Company not found");
    }

    const rawLeads = Array.isArray(req.body) ? req.body : req.body?.leads;
    if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
      return sendError(res, 400, "Leads array is required and must not be empty");
    }

    const globalSource = req.body?.source;
    const globalStatus = req.body?.status;
    const globalPriority = req.body?.priority;

    const reservedKeys = new Set([
      "rowNumber",
      "formId",
      "data",
      "status",
      "priority",
      "tags",
      "source",
      "api_key",
      "_id",
      "createdAt",
      "updatedAt",
    ]);

    const findVal = (obj, keys) => {
      if (!obj || typeof obj !== "object") return "";
      const foundKey = Object.keys(obj).find((k) =>
        keys.includes(k.toLowerCase()),
      );
      return foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null
        ? String(obj[foundKey]).trim()
        : "";
    };

    const normalizePhoneStr = (num) => {
      if (!num) return "";
      let clean = String(num).replace(/\D/g, "");
      if (clean.length === 12 && clean.startsWith("91")) {
        return clean.substring(2);
      }
      if (clean.length === 11 && clean.startsWith("0")) {
        return clean.substring(1);
      }
      return clean;
    };

    // 1. Extract all candidate phones and emails from incoming batch
    const candidatePhones = new Set();
    const candidateEmails = new Set();

    rawLeads.forEach((item) => {
      const flatData = Object.entries(item || {}).reduce((acc, [key, value]) => {
        if (!reservedKeys.has(key)) acc[key] = value;
        return acc;
      }, {});
      const normalizedData = {
        ...(flatData || {}),
        ...(item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {}),
      };

      const rawPhone =
        findVal(normalizedData, [
          "phone", "mobile", "contact", "telephone", "phone number", "mobilenumber", "phonenumber"
        ]) || (item.phone ? String(item.phone).trim() : "");
      const cleanPhone = normalizePhoneStr(rawPhone);
      if (cleanPhone) candidatePhones.add(cleanPhone);

      const rawEmail =
        findVal(normalizedData, ["email", "email address", "mail"]) ||
        (item.email ? String(item.email).trim() : "");
      if (rawEmail) candidateEmails.add(rawEmail.toLowerCase());
    });

    // 2. Query MongoDB in one fast query for already existing leads in this company
    const existingConditions = [];
    if (candidatePhones.size > 0) {
      existingConditions.push({ phone: { $in: Array.from(candidatePhones) } });
    }
    if (candidateEmails.size > 0) {
      existingConditions.push({ email: { $in: Array.from(candidateEmails) } });
    }

    let existingLeadsInDb = [];
    if (existingConditions.length > 0) {
      existingLeadsInDb = await Lead.find({
        companyId: req.user.company._id,
        $or: existingConditions,
      }).select("phone email name").lean();
    }

    const dbExistingPhones = new Set(
      existingLeadsInDb.map((l) => normalizePhoneStr(l.phone)).filter(Boolean)
    );
    const dbExistingEmails = new Set(
      existingLeadsInDb.map((l) => (l.email ? l.email.toLowerCase() : "")).filter(Boolean)
    );

    // Sets to prevent duplicates within the uploaded file itself
    const seenBatchPhones = new Set();
    const seenBatchEmails = new Set();

    const validDocs = [];
    const failures = [];
    let duplicateCount = 0;

    // 3. Process and filter rows
    rawLeads.forEach((item, index) => {
      const rowNumber = item.rowNumber || index + 2;
      const flatData = Object.entries(item || {}).reduce((acc, [key, value]) => {
        if (!reservedKeys.has(key)) acc[key] = value;
        return acc;
      }, {});

      const normalizedData = {
        ...(flatData || {}),
        ...(item.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : {}),
      };

      const name =
        findVal(normalizedData, ["name", "full name", "fullname", "username", "customername", "leadname"]) ||
        (item.name ? String(item.name).trim() : "");
      const email =
        findVal(normalizedData, ["email", "email address", "mail"]) ||
        (item.email ? String(item.email).trim() : "");
      const phone =
        findVal(normalizedData, ["phone", "mobile", "contact", "telephone", "phone number", "mobilenumber", "phonenumber"]) ||
        (item.phone ? String(item.phone).trim() : "");

      const cleanPhone = normalizePhoneStr(phone);
      const cleanEmail = email ? email.toLowerCase().trim() : "";

      if (!name) {
        failures.push({ row: rowNumber, message: "Lead name is required." });
        return;
      }

      if (!cleanPhone || cleanPhone.length < 8 || cleanPhone.length > 15) {
        failures.push({
          row: rowNumber,
          message: "Phone number must be between 8-15 digits.",
        });
        return;
      }

      // Check duplicate against Database
      if (dbExistingPhones.has(cleanPhone)) {
        duplicateCount++;
        failures.push({
          row: rowNumber,
          message: `Duplicate: Lead with phone ${cleanPhone} already exists in CRM.`,
        });
        return;
      }

      if (cleanEmail && dbExistingEmails.has(cleanEmail)) {
        duplicateCount++;
        failures.push({
          row: rowNumber,
          message: `Duplicate: Lead with email ${cleanEmail} already exists in CRM.`,
        });
        return;
      }

      // Check duplicate within the uploaded spreadsheet file
      if (seenBatchPhones.has(cleanPhone)) {
        duplicateCount++;
        failures.push({
          row: rowNumber,
          message: `Duplicate in file: Phone ${cleanPhone} repeated in spreadsheet.`,
        });
        return;
      }

      if (cleanEmail && seenBatchEmails.has(cleanEmail)) {
        duplicateCount++;
        failures.push({
          row: rowNumber,
          message: `Duplicate in file: Email ${cleanEmail} repeated in spreadsheet.`,
        });
        return;
      }

      // Track as seen in current batch
      seenBatchPhones.add(cleanPhone);
      if (cleanEmail) seenBatchEmails.add(cleanEmail);

      validDocs.push({
        companyId: req.user.company._id,
        data: normalizedData,
        status: item.status || globalStatus || "New",
        priority: item.priority || globalPriority || "Medium",
        createdBy: req.user._id,
        updatedBy: req.user._id,
        source: item.source || globalSource || "Website",
        name: name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
      });
    });

    // 4. Check Plan Limits against actual new leads to be inserted
    const currentLeadsCount = await Lead.countDocuments({
      companyId: req.user.company._id,
    });

    if (currentLeadsCount + validDocs.length > company.maxLeads) {
      const remaining = Math.max(0, company.maxLeads - currentLeadsCount);
      return sendError(
        res,
        403,
        `Monthly limit reached. You can only add ${remaining} more leads (${company.maxLeads} limit).`,
      );
    }

    let insertedCount = 0;
    if (validDocs.length > 0) {
      const inserted = await Lead.insertMany(validDocs, { ordered: false });
      insertedCount = inserted.length;

      await AuditLog.create({
        user: req.user._id,
        company: req.user.company._id,
        action: "bulk_leads_created",
        status: "success",
        details: {
          count: insertedCount,
          duplicatesSkipped: duplicateCount,
          totalSubmitted: rawLeads.length,
        },
      });
    }

    return sendResponse(
      res,
      201,
      true,
      `${insertedCount} leads created successfully${duplicateCount > 0 ? ` (${duplicateCount} duplicates skipped)` : ""}`,
      {
        total: rawLeads.length,
        success: insertedCount,
        duplicates: duplicateCount,
        failed: failures.length,
        failures,
      },
    );
  } catch (error) {
    return sendError(res, 500, error.message);
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
