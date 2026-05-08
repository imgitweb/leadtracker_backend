import AuditLog from '../models/AuditLog.js';

// Create audit log
export const auditLog = async (req, res, next) => {
  // Skip audit logs for GET and non-authenticated routes
  if (req.method === 'GET' || !req.user) {
    return next();
  }

  // Store original send method
  const originalSend = res.send;

  res.send = function (data) {
    // Only log if request was successful
    if (res.statusCode < 400) {
      // Extract action from request
      let action = 'unknown_action';
      const method = req.method;
      const route = req.baseUrl;

      if (method === 'POST' && route.includes('/auth/login')) action = 'user_login';
      else if (method === 'POST' && route.includes('/auth/register')) action = 'user_created';
      else if (method === 'PUT' && route.includes('/profile')) action = 'profile_updated';
      else if (method === 'POST' && route.includes('/avatar')) action = 'avatar_uploaded';
      else if (method === 'PUT' && route.includes('/password')) action = 'password_changed';
      else if (method === 'POST' && route.includes('/teams')) action = 'team_created';
      else if (method === 'PUT' && route.includes('/teams')) action = 'team_updated';
      else if (method === 'DELETE' && route.includes('/teams')) action = 'team_deleted';
      else if (method === 'POST' && route.includes('/members')) action = 'team_member_added';

      // Create audit log asynchronously (don't block response)
      if (req.user && req.user.company) {
        AuditLog.create({
          user: req.user._id,
          company: req.user.company._id,
          action,
          resource: req.baseUrl,
          resourceId: req.params.id || null,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          status: 'success',
        }).catch((err) => console.error('Audit log error:', err.message));
      }
    }

    // Call original send method
    res.send = originalSend;
    res.send(data);
  };

  next();
};
