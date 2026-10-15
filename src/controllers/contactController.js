import Contact from "../models/Contact.js";
import Campaign from "../models/Campaign.js";
import { processContactList } from "../utils/phoneValidator.js";
import { sendResponse, sendError, getPagination } from "../utils/helpers.js";
import * as xlsx from "xlsx";

/**
 * 1. Add single or multiple contacts to a campaign
 */
export const addContacts = async (req, res) => {
  try {
    const { campaignId, contacts } = req.body;

    if (!campaignId) {
      return sendError(res, 400, "Campaign ID is required");
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
      return sendError(res, 400, "At least one contact is required");
    }

    const companyId = req.user?.company?._id || req.user?.company;
    const { validContacts, invalidContacts, duplicates } = processContactList(contacts);

    if (validContacts.length === 0) {
      return sendError(res, 400, "No valid phone numbers found in input.", { invalidContacts });
    }

    const contactDocs = validContacts.map((c) => ({
      ...c,
      campaignId,
      company: companyId,
      callStatus: "pending",
    }));

    // Insert ignoring duplicates against existing in campaign
    let insertedCount = 0;
    try {
      const result = await Contact.insertMany(contactDocs, { ordered: false });
      insertedCount = result.length;
    } catch (insertErr) {
      // Handle partial duplicate errors gracefully
      insertedCount = insertErr.insertedDocs ? insertErr.insertedDocs.length : 0;
    }

    // Refresh campaign contact totals
    const totalContacts = await Contact.countDocuments({ campaignId });
    campaign.totalContacts = totalContacts;
    campaign.pendingCalls = totalContacts;
    await campaign.save();

    return sendResponse(res, 201, true, `Successfully added ${insertedCount} contacts.`, {
      added: insertedCount,
      invalid: invalidContacts.length,
      duplicates: duplicates.length,
    });
  } catch (error) {
    console.error("Add Contacts Error:", error);
    return sendError(res, 500, "Failed to add contacts", error);
  }
};

/**
 * 2. Import Contacts from CSV or Excel file buffer
 */
export const importContacts = async (req, res) => {
  try {
    const { campaignId } = req.body;
    const file = req.file;

    if (!campaignId) {
      return sendError(res, 400, "Campaign ID is required");
    }

    if (!file) {
      return sendError(res, 400, "Please upload a CSV or Excel file (.csv, .xlsx, .xls)");
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return sendError(res, 404, "Campaign not found");
    }

    // Parse workbook
    const workbook = xlsx.read(file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!rawRows || rawRows.length === 0) {
      return sendError(res, 400, "Uploaded file contains no data rows.");
    }

    const { validContacts, invalidContacts, duplicates } = processContactList(rawRows);
    const companyId = req.user?.company?._id || req.user?.company;

    const contactDocs = validContacts.map((c) => ({
      ...c,
      campaignId,
      company: companyId,
      callStatus: "pending",
    }));

    let insertedCount = 0;
    try {
      const result = await Contact.insertMany(contactDocs, { ordered: false });
      insertedCount = result.length;
    } catch (insertErr) {
      insertedCount = insertErr.insertedDocs ? insertErr.insertedDocs.length : 0;
    }

    const totalContacts = await Contact.countDocuments({ campaignId });
    campaign.totalContacts = totalContacts;
    campaign.pendingCalls = totalContacts;
    await campaign.save();

    return sendResponse(res, 200, true, `Successfully imported ${insertedCount} contacts.`, {
      totalRowsInFile: rawRows.length,
      importedCount: insertedCount,
      invalidCount: invalidContacts.length,
      duplicateCount: duplicates.length,
      invalidSamples: invalidContacts.slice(0, 10),
    });
  } catch (error) {
    console.error("Import Contacts Error:", error);
    return sendError(res, 500, "Failed to import contacts", error);
  }
};

/**
 * 3. List and filter contacts
 */
export const getContacts = async (req, res) => {
  try {
    const { campaignId, callStatus, sentiment, responseCategory, search = "", page = 1, limit = 20 } = req.query;
    const { skip, limit: parsedLimit } = getPagination(page, limit);

    const query = {};

    if (campaignId) query.campaignId = campaignId;
    if (callStatus && callStatus !== "all") query.callStatus = callStatus;
    if (sentiment && sentiment !== "all") query.sentiment = sentiment;
    if (responseCategory && responseCategory !== "all") query.responseCategory = responseCategory;

    if (search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { phone: { $regex: search.trim(), $options: "i" } },
        { email: { $regex: search.trim(), $options: "i" } },
      ];
    }

    const [contacts, total] = await Promise.all([
      Contact.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parsedLimit)
        .populate("campaignId", "name language callerId")
        .lean(),
      Contact.countDocuments(query),
    ]);

    return sendResponse(res, 200, true, "Contacts retrieved successfully", {
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    console.error("Get Contacts Error:", error);
    return sendError(res, 500, "Failed to fetch contacts", error);
  }
};

/**
 * 4. Get contact by ID
 */
export const getContactById = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findById(id).populate("campaignId").lean();

    if (!contact) {
      return sendError(res, 404, "Contact not found");
    }

    return sendResponse(res, 200, true, "Contact retrieved", { contact });
  } catch (error) {
    console.error("Get Contact Error:", error);
    return sendError(res, 500, "Failed to fetch contact", error);
  }
};

/**
 * 5. Update contact details
 */
export const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, doNotCall, callStatus } = req.body;

    const contact = await Contact.findByIdAndUpdate(
      id,
      {
        ...(name && { name }),
        ...(email !== undefined && { email }),
        ...(doNotCall !== undefined && { doNotCall }),
        ...(callStatus && { callStatus }),
      },
      { new: true }
    );

    if (!contact) {
      return sendError(res, 404, "Contact not found");
    }

    return sendResponse(res, 200, true, "Contact updated successfully", { contact });
  } catch (error) {
    console.error("Update Contact Error:", error);
    return sendError(res, 500, "Failed to update contact", error);
  }
};

/**
 * 6. Mark Do Not Call (DND Opt-Out)
 */
export const optOutContact = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByIdAndUpdate(
      id,
      { doNotCall: true, responseCategory: "Do Not Call" },
      { new: true }
    );

    if (!contact) {
      return sendError(res, 404, "Contact not found");
    }

    return sendResponse(res, 200, true, "Contact marked as Do Not Call (DND). Future calls will be prevented.", {
      contact,
    });
  } catch (error) {
    console.error("Opt-out Contact Error:", error);
    return sendError(res, 500, "Failed to opt-out contact", error);
  }
};

/**
 * 7. Delete contact
 */
export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const contact = await Contact.findByIdAndDelete(id);

    if (!contact) {
      return sendError(res, 404, "Contact not found");
    }

    // Update campaign counts
    await Campaign.findByIdAndUpdate(contact.campaignId, {
      $inc: { totalContacts: -1 },
    });

    return sendResponse(res, 200, true, "Contact deleted successfully");
  } catch (error) {
    console.error("Delete Contact Error:", error);
    return sendError(res, 500, "Failed to delete contact", error);
  }
};

export default {
  addContacts,
  importContacts,
  getContacts,
  getContactById,
  updateContact,
  optOutContact,
  deleteContact,
};
