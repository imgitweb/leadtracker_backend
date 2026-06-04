export const MODULE_DEFINITIONS = Object.freeze([
  { key: 'analytics', label: 'Analytics', description: 'Charts and insights', defaultEnabled: true },
  { key: 'leads', label: 'Leads', description: 'Lead list and detail pages', defaultEnabled: true },
  { key: 'forms', label: 'Forms', description: 'Form management and submissions', defaultEnabled: true },
  { key: 'inbox', label: 'Inbox', description: 'Messaging and omnichannel inbox', defaultEnabled: true },
  { key: 'automation', label: 'Automation', description: 'Workflow and automation builder', defaultEnabled: true },
  { key: 'settings', label: 'Settings', description: 'Company and user settings', defaultEnabled: true },
  { key: 'integrations', label: 'Integrations', description: 'Linked accounts and channels', defaultEnabled: true },
  { key: 'bulk_email', label: 'Bulk Email', description: 'SMTP-driven email campaigns and templates', defaultEnabled: true, group: 'Communication' },
  { key: 'ai_integration', label: 'AI Integration', description: 'AI setup and auto-reply tools', defaultEnabled: true },
  { key:"instagram_leads", label: "Instagram Leads", description: "Manage Instagram lead generation", defaultEnabled: true },
  { key:"facebook_leads", label: "Facebook Leads", description: "Manage Facebook lead generation", defaultEnabled: true },
  { key:"whatsapp_leads", label: "WhatsApp Leads", description: "Manage WhatsApp lead generation", defaultEnabled: true },
  { key: 'users', label: 'Users', description: 'Team and user management', defaultEnabled: true },
  { key: 'company_settings', label: 'Company Settings', description: 'Workspace configuration', defaultEnabled: true },
  { key: 'api_keys', label: 'API Keys', description: 'API key management', defaultEnabled: true },
  { key: 'referral_program', label: 'Referral Program', description: 'Referral tracking', defaultEnabled: true },
  { key: 'support_tickets', label: 'Support Tickets', description: 'Support ticket management', defaultEnabled: true },
  { key: 'profile', label: 'Profile', description: 'Own profile page', defaultEnabled: true },
]);

export const MODULE_KEYS = MODULE_DEFINITIONS.map((module) => module.key);
