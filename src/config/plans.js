/**
 * Centralized Plan Configuration
 * Defines limits for each subscription tier.
 * Use Number.MAX_SAFE_INTEGER for unlimited.
 */
export const PLANS = {
  free: {
    name: 'Free',
    maxUsers: 5,
    maxLeads: 250,
  },
  pro: {
    name: 'Pro',
    maxUsers: 20,
    maxLeads: 2000,
  },
  enterprise: {
    name: 'Enterprise',
    maxUsers: 999999, // Practically unlimited
    maxLeads: 999999, // Practically unlimited
  },
};
