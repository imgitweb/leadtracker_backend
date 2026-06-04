import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import mongoStore from 'connect-mongo';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { Server } from 'socket.io';
import http from 'http';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Import database connection
import connectDB from './config/database.js';

// Import middleware
import { auditLog } from './middleware/auditLog.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { apiLimiter } from './config/rateLimiter.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import companyRoutes from './routes/company.js';
import contactRoutes from './routes/contact.js';
import leadRoutes from './routes/lead.js';
import formRoutes from './routes/forms.js';
import analyticsRoutes from './routes/analytics.js';
import knowledgeRepositoryRoutes from './routes/knowledgeRepository.js';
import superAdminRoutes from './superadmin/routes/superAdminRoutes.js';
import bulkEmailRoutes from './routes/bulkEmail.js';
import { CompanyModuleService } from './services/CompanyModuleService.js';
import { BulkEmailService } from './services/BulkEmailService.js';
import aiRoutes from "./routes/aiRoutes.js";
import chatRoutes from './routes/chatRoutes.js';
import supportTicketRoutes from './routes/supportTickets.js';

import instagramAuth from './routes/meta/instagramAuth.js';
import instagramDataRoutes from './routes/meta/instagramDataRoutes.js';

import facebookAuthRoutes from "./routes/meta/facebookAuthRoutes.js";
import facebookDataRoutes from "./routes/meta/facebookDataRoutes.js";
import facebookWebhookRoutes from "./routes/meta/facebookWebhookRoutes.js";

import whatsappAuthRoutes from "./routes/meta/whatsappAuthRoutes.js";
import whatsappDataRoutes from "./routes/meta/whatsappDataRoutes.js";
import whatsappWebhookRoutes from "./routes/meta/whatsappWebhookRoutes.js";


import webhookRoutes from "./routes/meta/webhookRoutes.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Connect to database
const server = http.createServer(app);


const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://localhost:5173", "https://cinfy.co", "https://crm.cinfy.co"],
    methods: ["GET", "POST"]
  }
});


app.set('socketio', io);



await connectDB();
await CompanyModuleService.syncSystemModules();
await CompanyModuleService.syncAllCompanies();

setInterval(() => {
  BulkEmailService.dispatchDueCampaigns().catch((error) => {
    console.error('Bulk email dispatcher error:', error.message);
  });
}, 60 * 1000);

// ============ MIDDLEWARE ============

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://localhost:5173",
    "https://localhost:5173/",
    "https://cinfy.co",
    "https://crm.cinfy.co",
    "http://app.yogshala.ai",
    "https://yogshala.ai",

  ],
  credentials: true,
}));

// Request logging
app.use(morgan('combined'));

// Body parser
// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Cookie parser
app.use(cookieParser(process.env.SESSION_SECRET));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: mongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600, // lazy session update
    }),
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);


// Rate limiting
// app.use('/api/', apiLimiter);

// Audit logging
app.use(auditLog);

// ============ ROUTES ============

app.get('/health', (req, res) => {
  res.json({
    status: 'API is running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/lead', leadRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/knowledge-repository', knowledgeRepositoryRoutes);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/bulk-email', bulkEmailRoutes);

app.use('/api/ai', aiRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/support-tickets', supportTicketRoutes);

app.use('/api/insta', instagramAuth);
app.use('/api/insta-data', instagramDataRoutes);
app.use("/api/webhook/instagram", webhookRoutes);

app.use("/api/fb/auth", facebookAuthRoutes);
app.use("/api/fb-data", facebookDataRoutes);
app.use("/api/webhook/facebook", facebookWebhookRoutes);

app.use("/api/wa/auth", whatsappAuthRoutes);
app.use("/api/wa-data", whatsappDataRoutes);
app.use("/api/webhook/whatsapp", whatsappWebhookRoutes);

// Error handling
app.use(notFound);
app.use(errorHandler);

// ============ SOCKET.IO CONNECTION ============
io.on('connection', (socket) => {
  console.log(`🟢 New Client Connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔴 Client Disconnected: ${socket.id}`);
  });
});


// ============ START SERVER ============

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   🚀 Cinfy Lead Tracker API Running   ║
  ║       Port: ${PORT}                    ║
  ║   Environment: ${process.env.NODE_ENV || 'development'}             ║
  ╚════════════════════════════════════════╝
  `);
});

export default app;
