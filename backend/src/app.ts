import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './lib/http';
import { auth } from './middleware/auth';
import authRoutes from './routes/auth';
import masterRoutes from './routes/master';
import clientRoutes from './routes/clients';
import appointmentRoutes from './routes/appointments';
import reportRoutes from './routes/reports';
import billingRoutes from './routes/billing';
import crmRoutes from './routes/crm';
import importRoutes from './routes/import';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '12mb' })); // documents are uploaded as base64

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', auth, masterRoutes, clientRoutes, appointmentRoutes, billingRoutes, crmRoutes, importRoutes, reportRoutes);
app.use(errorHandler);

export default app;
