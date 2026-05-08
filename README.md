# Cinfy Lead Tracker API

A complete, production-ready backend for a multi-tenant SaaS lead tracking platform built with Node.js, Express, and MongoDB.

## Features

✨ **Authentication & Authorization**
- JWT-based authentication
- Refresh tokens
- Cookie-based sessions
- Role-based access control (RBAC)

👤 **User Management**
- User registration and login
- Profile management
- Avatar uploads with Multer
- Password change functionality
- User status tracking

🏢 **Company/Workspace Management**
- Multi-tenant support
- Company settings
- API key generation and management
- Plan management (free/pro/enterprise)

👥 **Team Management**
- Create and manage teams
- Add/remove team members
- Role-based team permissions
- User invitations

📊 **Audit Logging**
- Comprehensive audit trail
- Action logging (login, profile updates, etc.)
- IP tracking and user agent logging

🔒 **Security Features**
- Password hashing with bcryptjs
- Rate limiting
- CORS protection
- Helmet for HTTP headers
- Input validation

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Authentication**: JWT + Sessions
- **File Upload**: Multer
- **Security**: Helmet, CORS, bcryptjs
- **Logging**: Morgan, Audit Logs

## Project Structure

```
lead_tracker_api/
├── src/
│   ├── config/              # Configuration files
│   │   ├── database.js      # MongoDB connection
│   │   ├── multer.js        # File upload config
│   │   └── rateLimiter.js   # Rate limiting
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Custom middleware
│   ├── models/              # MongoDB schemas
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── utils/               # Helper functions
│   └── server.js            # Main entry point
├── uploads/                 # User uploads
├── package.json
├── .env.example
└── .gitignore
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Update .env with your configuration
nano .env

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

See `.env.example` for all required variables:

```env
MONGO_URI=mongodb://localhost:27017/cinfy_lead_tracker
JWT_SECRET=your_secret_key
PORT=5000
FRONTEND_URL=http://localhost:5173
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `POST /api/auth/refresh-token` - Refresh JWT token
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile
- `PUT /api/users/change-password` - Change password
- `POST /api/users/avatar` - Upload avatar
- `GET /api/users/company-users` - Get company users (admin)
- `DELETE /api/users/:userId` - Delete user (admin)

### Teams
- `POST /api/teams` - Create team (admin)
- `GET /api/teams` - Get company teams
- `GET /api/teams/:teamId` - Get team details
- `PUT /api/teams/:teamId` - Update team (admin)
- `DELETE /api/teams/:teamId` - Delete team (admin)
- `POST /api/teams/:teamId/members` - Add member (admin)
- `DELETE /api/teams/:teamId/members` - Remove member (admin)
- `PUT /api/teams/:teamId/members/role` - Change member role (admin)
- `POST /api/teams/:teamId/invite` - Invite user (admin)

### Company
- `GET /api/company` - Get company details
- `PUT /api/company` - Update company settings (admin)
- `POST /api/company/api-keys` - Generate API key (admin)
- `GET /api/company/api-keys` - Get API keys
- `PUT /api/company/api-keys/:keyId` - Regenerate API key (admin)
- `DELETE /api/company/api-keys/:keyId` - Delete API key (admin)
- `GET /api/company/audit-logs` - Get audit logs (admin)

## Authentication Flow

1. **Register**: Create new company and user account
2. **Login**: Get JWT token + refresh token (stored in httpOnly cookies)
3. **API Calls**: Include JWT in Authorization header or cookies
4. **Token Refresh**: Use refresh token to get new JWT when expired
5. **Logout**: Clear cookies on client side

## Database Models

- **User** - User accounts with authentication
- **Company** - Multi-tenant companies/workspaces
- **Team** - Teams within a company
- **ApiKey** - API keys for external integrations
- **Invitation** - Pending user invitations
- **AuditLog** - Comprehensive action audit trail

## Security Considerations

✅ Passwords hashed with bcryptjs
✅ JWT tokens with expiration
✅ CORS enabled for specified frontend
✅ Rate limiting on sensitive routes
✅ Helmet for security headers
✅ HTTPOnly cookies for token storage
✅ Audit logging for all changes
✅ Role-based access control

## Development

```bash
# Run with auto-reload
npm run dev

# The server will start at http://localhost:5000
```

## Production Deployment

1. Set `NODE_ENV=production`
2. Use strong JWT_SECRET and SESSION_SECRET
3. Enable HTTPS/SSL
4. Use MongoDB Atlas or managed MongoDB
5. Set up environment variables securely
6. Use a process manager like PM2

```bash
# Using PM2
pm2 start src/server.js --name "cinfy-api"
```

## API Documentation

Full endpoint documentation available at:
- Base URL: `http://localhost:5000`
- Health check: `GET /health`

## License

ISC

## Support

For issues and questions, contact the development team.
# leadtracker_backend
