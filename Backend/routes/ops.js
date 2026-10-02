import express from 'express';
import Document from '../models/Document.js';
import Case from '../models/Case.js';
import AuditLog from '../models/AuditLog.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roles.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
router.use(createRateLimiter({ windowMs: 5 * 60 * 1000, max: 60 }));

router.get('/metrics', protect, authorize('judge', 'clerk'), async (req, res) => {
  try {
    const [queuedDocs, failedDocs, processingDocs, totalCases, recentAuditCount] = await Promise.all([
      Document.countDocuments({ status: 'queued' }),
      Document.countDocuments({ status: 'failed' }),
      Document.countDocuments({ status: 'processing' }),
      Case.countDocuments(),
      AuditLog.countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
    ]);

    res.json({
      queue: {
        queued: queuedDocs,
        processing: processingDocs,
        failed: failedDocs
      },
      usage: {
        totalCases,
        auditEventsLast24h: recentAuditCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/audit-logs', protect, authorize('judge', 'clerk'), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const logs = await AuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actor', 'name email role');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
