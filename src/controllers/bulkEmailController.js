import { sendResponse, sendError } from '../utils/helpers.js';
import { BulkEmailService } from '../services/BulkEmailService.js';

export const getDashboard = async (req, res) => {
  try {
    const dashboard = await BulkEmailService.getDashboard(req.user.company._id);
    sendResponse(res, 200, true, 'Bulk email dashboard fetched successfully', { dashboard });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const saveSettings = async (req, res) => {
  try {
    const settings = await BulkEmailService.saveSettings(req.user.company._id, req.user._id, req.body);
    sendResponse(res, 200, true, 'SMTP settings saved successfully', { settings });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const listTemplates = async (req, res) => {
  try {
    const dashboard = await BulkEmailService.getDashboard(req.user.company._id);
    sendResponse(res, 200, true, 'Templates fetched successfully', {
      templates: dashboard.templates,
      builtinTemplates: dashboard.builtinTemplates,
    });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const createTemplate = async (req, res) => {
  try {
    const template = await BulkEmailService.createTemplate(req.user.company._id, req.user._id, req.body);
    sendResponse(res, 201, true, 'Template created successfully', { template });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const template = await BulkEmailService.updateTemplate(req.user.company._id, req.params.templateId, req.user._id, req.body);
    sendResponse(res, 200, true, 'Template updated successfully', { template });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    await BulkEmailService.deleteTemplate(req.user.company._id, req.params.templateId, req.user._id);
    sendResponse(res, 200, true, 'Template deleted successfully');
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const listCampaigns = async (req, res) => {
  try {
    const campaigns = await BulkEmailService.listCampaigns(req.user.company._id);
    sendResponse(res, 200, true, 'Campaigns fetched successfully', { campaigns });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const createCampaign = async (req, res) => {
  try {
    const campaign = await BulkEmailService.createCampaign(req.user.company._id, req.user._id, req.body);

    if (campaign.status === 'sending') {
      const sentCampaign = await BulkEmailService.sendCampaign(req.user.company._id, campaign._id, req.user._id);
      sendResponse(res, 201, true, 'Campaign created and sent successfully', { campaign: sentCampaign });
      return;
    }

    sendResponse(res, 201, true, 'Campaign created successfully', { campaign });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    await BulkEmailService.deleteCampaign(req.user.company._id, req.params.campaignId, req.user._id);
    sendResponse(res, 200, true, 'Campaign deleted successfully');
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const sendCampaign = async (req, res) => {
  try {
    const campaign = await BulkEmailService.sendCampaign(req.user.company._id, req.params.campaignId, req.user._id);
    sendResponse(res, 200, true, 'Campaign sent successfully', { campaign });
  } catch (error) {
    sendError(res, 400, error.message, error);
  }
};

export const dispatchDueCampaigns = async (req, res) => {
  try {
    const results = await BulkEmailService.dispatchDueCampaigns();
    sendResponse(res, 200, true, 'Due campaigns dispatched', { results });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};

export const trackOpen = async (req, res) => {
  try {
    await BulkEmailService.trackOpen(req.params.campaignId, req.params.trackingId);
  } catch (error) {
    // Ignore errors for tracking pixels
  }
  
  // Return a 1x1 transparent PNG
  const transparentPixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': transparentPixel.length,
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
  });
  res.end(transparentPixel);
};

export const trackUnsubscribe = async (req, res) => {
  try {
    await BulkEmailService.trackUnsubscribe(req.params.campaignId, req.params.trackingId);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
          .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
          h1 { color: #0f172a; margin-top: 0; }
          p { color: #64748b; margin-bottom: 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Unsubscribed Successfully</h1>
          <p>You have been removed from this mailing list and will no longer receive these emails.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(400).send('Invalid or expired unsubscribe link.');
  }
};

export const getContacts = async (req, res) => {
  try {
    const contacts = await BulkEmailService.getContacts(req.user.company._id);
    sendResponse(res, 200, true, 'Contacts fetched successfully', { contacts });
  } catch (error) {
    sendError(res, 500, error.message, error);
  }
};