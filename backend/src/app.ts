import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { securityHeaders } from './middleware/security-headers.js';
import { requestId } from './middleware/request-id.js';
import { errorHandler } from './middleware/error-handler.js';

import healthRouter from './routes/health.js';
import adminAuthRouter from './routes/admin.auth.js';
import adminOverviewRouter from './routes/admin.overview.js';
import adminLicensesRouter from './routes/admin.licenses.js';
import adminCustomersRouter from './routes/admin.customers.js';
import adminDevelopersRouter from './routes/admin.developers.js';
import adminAuditRouter from './routes/admin.audit.js';
import licenseRouter from './routes/license.js';
import extensionRouter from './routes/extension.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

// Trust proxy for correct IP detection behind Render/Nginx
app.set('trust proxy', 1);

// Security headers
app.use(securityHeaders);

// Request ID middleware (must be early)
app.use(requestId);

// CORS
const allowedOrigins = [
  config.ADMIN_ORIGIN,
  ...config.EXTENSION_ORIGIN.split(',').map((s) => s.trim()),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. health checks, same-origin, curl)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
  }),
);

// Body parsing — 64 kB limit
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(cookieParser());

// Static admin dashboard
app.use(express.static(publicDir, { index: 'index.html' }));

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/admin/overview', adminOverviewRouter);
app.use('/api/admin/licenses', adminLicensesRouter);
app.use('/api/admin/customers', adminCustomersRouter);
app.use('/api/admin/developers', adminDevelopersRouter);
app.use('/api/admin/audit', adminAuditRouter);
app.use('/api/license', licenseRouter);
app.use('/api/extension', extensionRouter);

// SPA fallback for admin dashboard (hash-routed, so this handles direct URL access)
app.get('*', (_req, res) => {
  res.sendFile('index.html', { root: publicDir });
});

// Error handler — must be last
app.use(errorHandler);

export default app;
