import nodemailer from 'nodemailer';
import Company from '../models/Company.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import crypto from 'crypto';
import EmailSmtpConfig from '../models/EmailSmtpConfig.js';
import EmailTemplate from '../models/EmailTemplate.js';
import EmailCampaign from '../models/EmailCampaign.js';
import AuditLog from '../models/AuditLog.js';

const BUILTIN_TEMPLATES = [
  {
    key: 'welcome',
    name: 'Welcome Sequence',
    subject: 'Welcome, {{name}}',
    htmlBody: '<p>Hi {{name}},</p><p>Thanks for connecting with us. We are sharing a quick update for you.</p><p>Regards,<br/>{{companyName}}</p>',
    textBody: 'Hi {{name}},\n\nThanks for connecting with us. We are sharing a quick update for you.\n\nRegards,\n{{companyName}}',
    description: 'A simple welcome style email for new outreach.',
  },
  {
    key: 'followup',
    name: 'Follow-up Reminder',
    subject: 'Following up on your enquiry, {{name}}',
    htmlBody: '<p>Hello {{name}},</p><p>I wanted to follow up on your enquiry and see if you need any help.</p><p>Best,<br/>{{companyName}}</p>',
    textBody: 'Hello {{name}},\n\nI wanted to follow up on your enquiry and see if you need any help.\n\nBest,\n{{companyName}}',
    description: 'Follow up with engaged leads or existing contacts.',
  },
  {
    key: 'announcement',
    name: 'Announcement Blast',
    subject: 'News from {{companyName}}',
    htmlBody: '<p>Hi {{name}},</p><p>We have an update we want to share with you today.</p><p>Stay tuned,<br/>{{companyName}}</p>',
    textBody: 'Hi {{name}},\n\nWe have an update we want to share with you today.\n\nStay tuned,\n{{companyName}}',
    description: 'For product launches, offers, and announcements.',
  },
];

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

const normalizeString = (value) => String(value || '').trim();
const normalizeEmail = (value) => normalizeString(value).toLowerCase();

const isValidEmail = (value) => /^\S+@\S+\.\S+$/.test(normalizeEmail(value));

const renderTemplate = (value, recipient = {}, companyName = '') => {
  const source = {
    companyName,
    ...recipient,
    ...recipient.customData,
  };

  return String(value || '').replace(PLACEHOLDER_PATTERN, (_, token) => {
    const matchKey = Object.keys(source).find((key) => key.toLowerCase() === token.toLowerCase());
    const replacement = matchKey ? source[matchKey] : '';
    return replacement === undefined || replacement === null ? '' : String(replacement);
  });
};

const getBuiltInTemplate = (templateKey) => BUILTIN_TEMPLATES.find((template) => template.key === templateKey);

const buildTransport = (smtpConfig) => nodemailer.createTransport({
  host: smtpConfig.host,
  port: Number(smtpConfig.port),
  secure: Boolean(smtpConfig.secure),
  auth: {
    user: smtpConfig.username,
    pass: smtpConfig.password,
  },
});

const normalizeRecipients = (recipients = []) => {
  const seen = new Set();

  return recipients
    .map((recipient) => ({
      name: normalizeString(recipient?.name),
      email: normalizeEmail(recipient?.email),
      phone: normalizeString(recipient?.phone),
      leadId: recipient?.leadId || null,
      userId: recipient?.userId || null,
      source: normalizeString(recipient?.source || 'manual') || 'manual',
      customData: recipient?.customData && typeof recipient.customData === 'object' ? recipient.customData : {},
    }))
    .filter((recipient) => {
      if (!recipient.email || !isValidEmail(recipient.email)) return false;
      if (seen.has(recipient.email)) return false;
      seen.add(recipient.email);
      return true;
    });
};

const resolveTemplateSelection = async (companyId, payload = {}) => {
  const templateId = payload.templateId || null;

  if (templateId) {
    const template = await EmailTemplate.findOne({ _id: templateId, companyId, isActive: true }).lean();
    if (!template) {
      throw new Error('Template not found');
    }

    return {
      templateId: template._id,
      name: template.name,
      subject: payload.subject || template.subject,
      htmlBody: payload.htmlBody || template.htmlBody,
      textBody: payload.textBody || template.textBody || '',
    };
  }

  if (payload.subject && payload.htmlBody) {
    return {
      templateId: null,
      name: 'Custom Email',
      subject: payload.subject,
      htmlBody: payload.htmlBody,
      textBody: payload.textBody || '',
    };
  }

  throw new Error('Select a template or provide subject and HTML body to continue');
};

const createCampaignDraft = async (companyId, creatorId, payload = {}) => {
  const name = normalizeString(payload.name);
  if (!name) {
    throw new Error('Campaign name is required');
  }

  const selection = await resolveTemplateSelection(companyId, payload);
  const company = await Company.findById(companyId).select('name').lean();
  const companyName = company?.name || 'Your Company';
  const recipients = normalizeRecipients(payload.recipients || []);
  const ccRecipients = normalizeRecipients(payload.ccRecipients || []);
  const bccRecipients = normalizeRecipients(payload.bccRecipients || []);

  if (recipients.length === 0) {
    throw new Error('At least one valid recipient is required');
  }

  const scheduleAt = payload.scheduleAt ? new Date(payload.scheduleAt) : null;
  const shouldSendImmediately = payload.sendNow === true || !scheduleAt || Number.isNaN(scheduleAt.getTime()) || scheduleAt <= new Date();

  const newCampaign = await EmailCampaign.create({
    companyId,
    smtpConfigId: payload.smtpConfigId || null,
    templateId: selection.templateId,
    name,
    subjectSnapshot: renderTemplate(selection.subject, { name: 'Recipient' }, companyName),
    htmlSnapshot: selection.htmlBody,
    textSnapshot: selection.textBody,
    audienceSource: normalizeString(payload.audienceSource || 'manual') || 'manual',
    recipients,
    ccRecipients,
    bccRecipients,
    attachments: payload.attachments || [],
    recipientCount: recipients.length,
    scheduleAt: shouldSendImmediately ? null : scheduleAt,
    status: shouldSendImmediately ? 'sending' : 'scheduled',
    createdBy: creatorId,
  });

  await AuditLog.create({
    user: creatorId,
    company: companyId,
    action: 'email_campaign_created',
    resource: 'EmailCampaign',
    resourceId: newCampaign._id,
    description: `Created email campaign: ${name}`,
  });

  return newCampaign;
};

export class BulkEmailService {
  static getBuiltinTemplates() {
    return BUILTIN_TEMPLATES;
  }

  static async getDashboard(companyId) {
    const builtinCount = await EmailTemplate.countDocuments({ companyId, isBuiltin: true });
    
    if (builtinCount === 0) {
      const builtinsToInsert = BUILTIN_TEMPLATES.map((t) => ({
        companyId,
        name: t.name,
        subject: t.subject,
        htmlBody: t.htmlBody,
        textBody: t.textBody,
        description: t.description,
        isBuiltin: true,
        category: 'general',
        isActive: true,
      }));
      await EmailTemplate.insertMany(builtinsToInsert);
    }

    const [smtpConfig, templates, campaigns, leadCount, userCount] = await Promise.all([
      EmailSmtpConfig.findOne({ companyId }).lean(),
      EmailTemplate.find({ companyId }).sort({ isBuiltin: 1, createdAt: -1 }).lean(),
      EmailCampaign.find({ companyId }).sort({ createdAt: -1 }).lean(),
      Lead.countDocuments({ companyId }),
      User.countDocuments({ company: companyId }),
    ]);

    const stats = campaigns.reduce((acc, campaign) => {
      acc.campaigns += 1;
      acc.recipients += campaign.recipientCount || 0;
      acc.sent += campaign.sentCount || 0;
      acc.failed += campaign.failedCount || 0;
      acc.opened += campaign.readCount || 0;
      acc.unsubscribed += campaign.unsubscribeCount || 0;
      if (campaign.status === 'scheduled') acc.scheduled += 1;
      if (campaign.status === 'sent' || campaign.status === 'partially_sent') acc.completed += 1;
      return acc;
    }, { campaigns: 0, recipients: 0, sent: 0, failed: 0, scheduled: 0, completed: 0, opened: 0, unsubscribed: 0 });

    return {
      smtpConfig,
      templates,
      campaigns,
      audience: {
        leads: leadCount,
        users: userCount,
      },
      stats,
    };
  }

  static async saveSettings(companyId, userId, payload = {}) {
    const requiredFields = ['host', 'port', 'username', 'password', 'fromName', 'fromEmail'];
    const missingField = requiredFields.find((field) => !normalizeString(payload[field]));
    if (missingField) {
      throw new Error(`SMTP ${missingField} is required`);
    }

    const port = Number(payload.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error('SMTP port must be a valid number');
    }

    const record = await EmailSmtpConfig.findOneAndUpdate(
      { companyId },
      {
        companyId,
        providerName: normalizeString(payload.providerName) || 'Custom SMTP',
        host: normalizeString(payload.host),
        port,
        secure: Boolean(payload.secure),
        username: normalizeString(payload.username),
        password: normalizeString(payload.password),
        fromName: normalizeString(payload.fromName),
        fromEmail: normalizeEmail(payload.fromEmail),
        replyTo: normalizeEmail(payload.replyTo) || '',
        isActive: payload.isActive !== false,
        updatedBy: userId,
        lastTestedAt: payload.lastTestedAt || null,
        lastTestStatus: payload.lastTestStatus || null,
      },
      { upsert: true, new: true, runValidators: true }
    );

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'email_smtp_updated',
      resource: 'EmailSmtpConfig',
      resourceId: record._id,
      description: 'Updated SMTP configuration settings',
    });

    return record.toObject();
  }

  static async createTemplate(companyId, userId, payload = {}) {
    const name = normalizeString(payload.name);
    const subject = normalizeString(payload.subject);
    const htmlBody = normalizeString(payload.htmlBody);

    if (!name || !subject || !htmlBody) {
      throw new Error('Template name, subject, and HTML body are required');
    }

    const template = await EmailTemplate.create({
      companyId,
      name,
      subject,
      htmlBody,
      textBody: normalizeString(payload.textBody),
      description: normalizeString(payload.description),
      category: normalizeString(payload.category) || 'general',
      variables: Array.isArray(payload.variables) ? payload.variables.filter(Boolean) : [],
      createdBy: userId,
    });

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'email_template_created',
      resource: 'EmailTemplate',
      resourceId: template._id,
      description: `Created email template: ${name}`,
    });

    return template.toObject();
  }

  static async updateTemplate(companyId, templateId, userId, payload = {}) {
    const template = await EmailTemplate.findOneAndUpdate(
      { _id: templateId, companyId, isBuiltin: { $ne: true } },
      {
        ...(payload.name !== undefined ? { name: normalizeString(payload.name) } : {}),
        ...(payload.subject !== undefined ? { subject: normalizeString(payload.subject) } : {}),
        ...(payload.htmlBody !== undefined ? { htmlBody: normalizeString(payload.htmlBody) } : {}),
        ...(payload.textBody !== undefined ? { textBody: normalizeString(payload.textBody) } : {}),
        ...(payload.description !== undefined ? { description: normalizeString(payload.description) } : {}),
        ...(payload.category !== undefined ? { category: normalizeString(payload.category) || 'general' } : {}),
        ...(payload.variables !== undefined ? { variables: Array.isArray(payload.variables) ? payload.variables.filter(Boolean) : [] } : {}),
        ...(payload.isActive !== undefined ? { isActive: Boolean(payload.isActive) } : {}),
        updatedBy: userId,
      },
      { new: true, runValidators: true }
    );

    if (!template) {
      throw new Error('Template not found');
    }

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'email_template_updated',
      resource: 'EmailTemplate',
      resourceId: template._id,
      description: `Updated email template: ${template.name}`,
    });

    return template.toObject();
  }

  static async deleteTemplate(companyId, templateId, userId) {
    const deleted = await EmailTemplate.findOneAndDelete({ _id: templateId, companyId, isBuiltin: { $ne: true } });
    if (!deleted) {
      throw new Error('Template not found');
    }

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'email_template_deleted',
      resource: 'EmailTemplate',
      resourceId: deleted._id,
      description: `Deleted email template: ${deleted.name}`,
    });

    return deleted.toObject();
  }

  static async listCampaigns(companyId) {
    return EmailCampaign.find({ companyId }).sort({ createdAt: -1 }).lean();
  }

  static async createCampaign(companyId, userId, payload = {}) {
    return createCampaignDraft(companyId, userId, payload);
  }

  static async deleteCampaign(companyId, campaignId, userId) {
    const deleted = await EmailCampaign.findOneAndDelete({ _id: campaignId, companyId });
    if (!deleted) {
      throw new Error('Campaign not found');
    }

    await AuditLog.create({
      user: userId,
      company: companyId,
      action: 'email_campaign_deleted',
      resource: 'EmailCampaign',
      resourceId: deleted._id,
      description: `Deleted email campaign: ${deleted.name}`,
    });

    return deleted.toObject();
  }

  static async trackOpen(campaignId, trackingId) {
    await EmailCampaign.updateOne(
      { 
        _id: campaignId, 
        sendLog: { 
          $elemMatch: { trackingId: trackingId, openedAt: null } 
        } 
      },
      { 
        $set: { 'sendLog.$.openedAt': new Date() },
        $inc: { readCount: 1 }
      }
    );
  }

  static async trackUnsubscribe(campaignId, trackingId) {
    // If they unsubscribed, they must have opened the email
    await this.trackOpen(campaignId, trackingId);

    const result = await EmailCampaign.updateOne(
      { 
        _id: campaignId, 
        sendLog: { 
          $elemMatch: { trackingId: trackingId, unsubscribedAt: null } 
        } 
      },
      { 
        $set: { 'sendLog.$.unsubscribedAt': new Date() },
        $inc: { unsubscribeCount: 1 }
      }
    );
    if (result.matchedCount === 0) {
      throw new Error('Already unsubscribed or invalid link');
    }
  }

  static async sendCampaign(companyId, campaignId, userId = null) {
    const campaign = await EmailCampaign.findOne({ _id: campaignId, companyId });
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const smtpConfig = await EmailSmtpConfig.findOne({ companyId, isActive: true }).lean();
    if (!smtpConfig) {
      throw new Error('SMTP settings not configured');
    }

    const company = await Company.findById(companyId).select('name').lean();
    const companyName = company?.name || smtpConfig.fromName || 'Your Company';
    const transport = buildTransport(smtpConfig);
    
    let sendLog = campaign.sendLog || [];
    const alreadySentEmails = new Set(sendLog.map(l => l.email));
    const recipientsToProcess = campaign.recipients.filter(r => !alreadySentEmails.has(r.email));

    campaign.status = 'sending';
    campaign.errorMessage = '';
    await campaign.save();

    let sentCount = campaign.sentCount || 0;
    let failedCount = campaign.failedCount || 0;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';

    const BATCH_SIZE = 50;
    for (let i = 0; i < recipientsToProcess.length; i += BATCH_SIZE) {
      const batch = recipientsToProcess.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (recipient) => {
        const trackingId = crypto.randomUUID();
        try {
          const subject = renderTemplate(campaign.subjectSnapshot, recipient, companyName);
          let html = renderTemplate(campaign.htmlSnapshot, recipient, companyName);
          const text = renderTemplate(campaign.textSnapshot || '', recipient, companyName);

          const openTrackUrl = `${backendUrl}/api/bulk-email/track/open/${campaign._id}/${trackingId}.png`;
          const unsubTrackUrl = `${backendUrl}/api/bulk-email/track/unsubscribe/${campaign._id}/${trackingId}`;

          const wrappedHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f6f9fc; font-family: system-ui, -apple-system, sans-serif;">
  ${html}
  <div style="margin-top: 20px; padding: 20px; font-size: 12px; color: #666; text-align: center;">
    If you no longer wish to receive these emails, you can <a href="${unsubTrackUrl}" style="color: #0066cc; text-decoration: underline;">unsubscribe here</a>.
  </div>
  <img src="${openTrackUrl}" width="1" height="1" style="display:none; visibility:hidden; opacity:0;" alt="" />
</body>
</html>`;

          const mailOptions = {
            from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
            to: recipient.email,
            cc: (campaign.ccRecipients || []).map(r => r.email).filter(Boolean).join(', ') || undefined,
            bcc: (campaign.bccRecipients || []).map(r => r.email).filter(Boolean).join(', ') || undefined,
            subject,
            html: wrappedHtml,
            text: text || undefined,
            replyTo: smtpConfig.replyTo || undefined,
            headers: {
              'List-Unsubscribe': `<${unsubTrackUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
            }
          };

          if (campaign.attachments && campaign.attachments.length > 0) {
            mailOptions.attachments = campaign.attachments.map(att => ({
              filename: att.filename,
              path: att.path,
              contentType: att.mimetype
            }));
          }

          const result = await transport.sendMail(mailOptions);

          return { success: true, email: recipient.email, messageId: result.messageId || '', trackingId };
        } catch (error) {
          return { success: false, email: recipient.email, error: error.message, trackingId };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const batchLog = [];
      batchResults.forEach(res => {
        if (res.success) {
          sentCount += 1;
          batchLog.push({ email: res.email, status: 'sent', messageId: res.messageId, trackingId: res.trackingId, sentAt: new Date() });
        } else {
          failedCount += 1;
          batchLog.push({ email: res.email, status: 'failed', error: res.error, trackingId: res.trackingId, sentAt: new Date() });
        }
      });

      // Use updateOne to prevent VersionError if trackOpen/trackUnsubscribe run concurrently
      await EmailCampaign.updateOne(
        { _id: campaign._id },
        { 
          $set: { sentCount, failedCount },
          $push: { sendLog: { $each: batchLog } }
        }
      );
    }

    const finalStatus = failedCount === 0 ? 'sent' : (sentCount > 0 ? 'partially_sent' : 'failed');
    let errorMessage = campaign.errorMessage || '';
    if (failedCount > 0 && sentCount === 0) {
      errorMessage = 'All recipients failed to receive the campaign';
    }

    // Update final status and fetch the latest document
    const updatedCampaign = await EmailCampaign.findByIdAndUpdate(
      campaign._id,
      {
        $set: {
          lastDispatchedAt: new Date(),
          status: finalStatus,
          errorMessage,
          sentCount,
          failedCount
        }
      },
      { new: true }
    );

    const actionUserId = userId || updatedCampaign.createdBy;
    if (actionUserId) {
      await AuditLog.create({
        user: actionUserId,
        company: companyId,
        action: 'email_campaign_sent',
        resource: 'EmailCampaign',
        resourceId: updatedCampaign._id,
        description: `Sent email campaign: ${updatedCampaign.name} (${sentCount} sent, ${failedCount} failed)`,
      });
    }

    return updatedCampaign.toObject();
  }

  static async dispatchDueCampaigns() {
    const dueCampaigns = await EmailCampaign.find({
      status: 'scheduled',
      scheduleAt: { $lte: new Date() },
    }).sort({ scheduleAt: 1 });

    const results = [];
    for (const campaign of dueCampaigns) {
      const sentCampaign = await this.sendCampaign(campaign.companyId, campaign._id);
      results.push(sentCampaign);
    }

    return results;
  }

  static async getContacts(companyId) {
    const [leads, users] = await Promise.all([
      Lead.find({ companyId }).sort({ createdAt: -1 }).lean(),
      User.find({ company: companyId }).select('fullName email phone role status').sort({ createdAt: -1 }).lean(),
    ]);

    return {
      leads: leads.map((lead) => ({
        _id: lead._id,
        name: lead.name || lead.data?.name || lead.email || 'Lead',
        email: lead.email || '',
        phone: lead.phone || '',
        source: lead.source || 'lead',
        status: lead.status || 'New',
      })),
      users: users.map((user) => ({
        _id: user._id,
        name: user.fullName || user.email || 'User',
        email: user.email || '',
        phone: user.phone || '',
        role: user.role || 'user',
        status: user.status || 'active',
      })),
    };
  }

  static getBuiltinTemplateByKey(templateKey) {
    return getBuiltInTemplate(templateKey);
  }
}