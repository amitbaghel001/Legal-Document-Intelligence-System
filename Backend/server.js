// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

// NOW import everything else
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import caseRoutes from './routes/cases.js';
import documentRoutes from './routes/documents.js';
import similarCasesRoutes from './routes/similarCases.js';
import aiAnalysisRoutes from './routes/aiAnalysis.js';
import schedulingRoutes from './routes/scheduling.js';
import geminiRoutes from './routes/gemini.js';
import opsRoutes from './routes/ops.js';
import mongoose from 'mongoose';
import fs from 'fs';
import { createRateLimiter } from './middleware/rateLimit.js';

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://justicelenz.netlify.app',
    'https://casemadad.netlify.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(createRateLimiter({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || `${15 * 60 * 1000}`, 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10)
}));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/cases', similarCasesRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/ai', aiAnalysisRoutes);
app.use('/api/ai', geminiRoutes);
app.use('/api/ops', opsRoutes);

// Health check (main route)
app.get('/', (req, res) => {
  res.json({ message: 'Backend running successfully 🚀' });
});

app.get('/health/dependencies', createRateLimiter({ windowMs: 60 * 1000, max: 30 }), async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoConnected = mongoState === 1;
  const uploadDirExists = fs.existsSync('uploads');
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  const status = mongoConnected && uploadDirExists ? 200 : 503;
  res.status(status).json({
    status: status === 200 ? 'ok' : 'degraded',
    dependencies: {
      mongodb: mongoConnected ? 'connected' : 'disconnected',
      geminiApiKey: geminiConfigured ? 'configured' : 'missing',
      uploadStorage: uploadDirExists ? 'available' : 'missing'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

// Dynamic Port for Render
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
