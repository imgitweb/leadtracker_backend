/**
 * Centralized Plan Configuration & Pricing
 * In Indian Rupees (INR) + Feature Entitlements
 */
export const PLANS = {
  free: {
    key: 'free',
    name: 'Free Starter',
    price: 0,
    priceFormatted: '₹0',
    billingPeriod: 'month',
    maxUsers: 5,
    maxLeads: 250,
    features: [
      '5 Team Member Logins',
      '250 Leads Storage',
      'Basic Lead Pipeline Board',
      'Web Form Lead Capture',
      'Email Support',
    ],
    solutionsIncluded: ['crm', 'leads'],
  },
  pro: {
    key: 'pro',
    name: 'Pro Growth',
    price: 2499,
    priceFormatted: '₹2,499',
    billingPeriod: 'month',
    maxUsers: 20,
    maxLeads: 2500,
    features: [
      '20 Team Members',
      '2,500 Total Leads Storage',
      'Official WhatsApp Cloud API & Inbox',
      'Meta Facebook & Instagram Ads Sync',
      'AI Keyword Auto-Replies & Triggers',
      'Bulk Messaging & Broadcasts',
      'Priority Support',
    ],
    solutionsIncluded: ['whatsapp', 'meta', 'crm', 'leads', 'ai_integration'],
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise Scale',
    price: 6999,
    priceFormatted: '₹6,999',
    billingPeriod: 'month',
    maxUsers: 999999, // Practically unlimited
    maxLeads: 999999, // Practically unlimited
    features: [
      'Unlimited Team Members',
      'Unlimited Leads & Contacts Storage',
      'Autonomous AI Voice Calling Agent',
      'Bulk Cold Email Deliverability Engine',
      'Official WhatsApp API & Broadcasts',
      'Facebook & Instagram Lead Ads Sync',
      'Multi-Channel AI Auto-Reply Workflows',
      'Dedicated Account Manager & SLA',
    ],
    solutionsIncluded: ['whatsapp', 'meta', 'calling', 'email', 'crm', 'leads', 'ai_integration', 'website'],
  },
};
