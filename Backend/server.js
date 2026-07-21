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

// Debug line (you can remove this later)
console.log("MONGO_URI:", process.env.MONGO_URI);

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
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/cases', similarCasesRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/ai', aiAnalysisRoutes);
app.use('/api/ai', geminiRoutes);

// Health check (main route)
app.get('/', (req, res) => {
  res.json({ message: 'Backend running successfully 🚀' });
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
