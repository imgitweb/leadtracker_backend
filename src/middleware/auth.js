import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Company from '../models/Company.js';
import ApiKey from '../models/ApiKey.js';
import crypto from 'crypto';

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
  let token;

  // Get token from headers or cookies
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.token) {
    token = req.cookies.token;
  }

  // Check if token exists
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route',
    });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).populate('company');

    if (!req.user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if user is active
    if (req.user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: `Your account is ${req.user.status || 'inactive'}. Please contact support.`,
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route',
    });
  }
};

// Authorize specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

// Check company ownership or membership
export const checkCompanyAccess = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.companyId);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found',
      });
    }

    // Check if user is owner or member
    if (
      company.owner.toString() !== req.user._id.toString() &&
      !company.members.includes(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this company',
      });
    }

    req.company = company;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};
// Protect routes with API Key
export const apiKeyProtect = async (req, res, next) => {
  // Accept API key from multiple common locations to be tolerant of client variations:
  //  - x-api-key header
  //  - Authorization: ApiKey <key>
  //  - Authorization: <raw_key>
  //  - query param ?api_key=...
  //  - request body api_key
  let key = req.headers['x-api-key'] || req.get('x-api-key') || req.query?.api_key || req.body?.api_key;
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!key && authHeader && typeof authHeader === 'string') {
    // Common patterns: 'ApiKey sk_live_...', 'Bearer sk_live_...', or raw key
    if (authHeader.startsWith('ApiKey ')) {
      key = authHeader.split(' ')[1];
    } else if (authHeader.startsWith('Bearer ')) {
      // Some clients mistakenly use Bearer scheme for API keys
      key = authHeader.split(' ')[1];
    } else {
      // Treat entire Authorization value as the key (tolerant)
      key = authHeader;
    }
  }

  if (!key) {
    return res.status(401).json({
      success: false,
      message: 'API Key is required (x-api-key header, Authorization header, query param or body param)',
    });
  }

  try {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = await ApiKey.findOne({ keyHash, isActive: true }).populate(['user', 'company']);

    // Debug logs to aid troubleshooting (do not expose raw keys in logs)
    console.log('[apiKeyProtect] keyHash:', keyHash.slice(0, 8) + '...');
    console.log('[apiKeyProtect] apiKey found:', !!apiKey);

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive API Key',
      });
    }

    // Check expiration
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'API Key has expired',
      });
    }

    // Attach user and company to request
    req.user = apiKey.user;
    // Ensure req.user has company as a populated object jaisa JWT protect mein hota hai
    req.user.company = apiKey.company; 
    req.isApiKeyAuth = true;

    // Update last used
    apiKey.lastUsed = new Date();
    await apiKey.save();

    next();
  } catch (error) {
    console.error('API Key Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during API Key verification',
    });
  }
};
