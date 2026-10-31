import FacebookAccount from "../../models/FacebookAccount.js";
import Lead from "../../models/Lead.js";
import User from "../../models/User.js";
import { syncLeadsForPage, subscribePageLeadgen } from "../../services/metaLeadSyncService.js";

/**
 * Manual / On-Demand Sync: Fetches past leads from all lead forms across connected Facebook Pages
 */
export const syncMetaLeads = async (req, res) => {
  try {
    const companyId = req.user?.company?._id || req.user?.company;
    const userId = req.user?._id;
    const io = req.app.get("socketio");
    const { pageId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: "Company ID not found for current user." });
    }

    // Find linked pages for this company
    const pageFilter = {
      $or: [{ company: companyId }, { userId }],
      page_id: { $exists: true, $ne: null },
    };

    if (pageId) {
      pageFilter.page_id = pageId;
    }

    const pages = await FacebookAccount.find(pageFilter);

    if (!pages || pages.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No connected Facebook Pages found. Please connect your Facebook Business Page first.",
      });
    }

    let totalFormsScanned = 0;
    let totalFetched = 0;
    let totalSynced = 0;
    let totalSkipped = 0;
    const pageResults = [];

    for (const pageRecord of pages) {
      const syncResult = await syncLeadsForPage({
        pageRecord,
        companyId,
        userId,
        io,
      });

      totalFormsScanned += syncResult.formsScanned || 0;
      totalFetched += syncResult.totalFetched || 0;
      totalSynced += syncResult.syncedCount || 0;
      totalSkipped += syncResult.skippedCount || 0;
      pageResults.push(syncResult);
    }

    return res.status(200).json({
      success: true,
      message: `Sync completed: ${totalSynced} new leads added, ${totalSkipped} duplicates skipped.`,
      summary: {
        totalPages: pages.length,
        totalForms: totalFormsScanned,
        totalFetched,
        syncedCount: totalSynced,
        skippedCount: totalSkipped,
      },
      pageResults,
    });
  } catch (error) {
    console.error("[syncMetaLeads] Error:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to sync Meta leads: " + (error.response?.data?.error?.message || error.message),
    });
  }
};

/**
 * Get Meta Leads sync stats for current company
 */
export const getMetaLeadsStats = async (req, res) => {
  try {
    const companyId = req.user?.company?._id || req.user?.company;
    const userId = req.user?._id;

    const [totalMetaLeads, recentLeads, connectedPages] = await Promise.all([
      Lead.countDocuments({ companyId, source: "Facebook Ads" }),
      Lead.find({ companyId, source: "Facebook Ads" })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email phone createdAt metaDetails"),
      FacebookAccount.find({
        $or: [{ company: companyId }, { userId }],
        page_id: { $exists: true, $ne: null },
      }).select("page_id page_name page_profile_picture updatedAt"),
    ]);

    return res.status(200).json({
      success: true,
      totalMetaLeads,
      connectedPagesCount: connectedPages.length,
      connectedPages,
      recentLeads,
    });
  } catch (error) {
    console.error("[getMetaLeadsStats] Error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch Meta leads stats.",
    });
  }
};

