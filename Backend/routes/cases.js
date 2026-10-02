import express from 'express';
import mongoose from 'mongoose';
import Case from '../models/Case.js';
import User from '../models/User.js';
import '../models/Document.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roles.js';
import { validateCasePayload, validateCaseUpdatePayload } from '../middleware/validators.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getEmbedding, caseEmbeddingText } from '../utils/embeddings.js';

const router = express.Router();
router.use(createRateLimiter({ windowMs: 5 * 60 * 1000, max: 200 }));
const CASE_NUMBER_REGEX = /^[A-Za-z0-9/_-]{3,40}$/;

// Create case
router.post(
  '/create',
  protect,
  authorize('judge', 'lawyer', 'clerk'),
  validateCasePayload,
  auditTrail('CREATE_CASE', 'CASE', (req, res) => res.locals.caseId),
  async (req, res) => {
    try {
      const { caseNumber, title, description } = req.body;
      if (!CASE_NUMBER_REGEX.test(caseNumber)) {
        return res.status(400).json({ error: 'Invalid case number format' });
      }

      const caseExists = await Case.findOne({ caseNumber });
      if (caseExists) {
        return res.status(400).json({ error: 'Case number already exists' });
      }

      const newCase = await Case.create({
        caseNumber,
        title,
        description,
        createdBy: req.user._id
      });
      res.locals.caseId = newCase._id;

      const embedding = await getEmbedding(caseEmbeddingText(newCase));
      if (embedding) {
        newCase.embedding = embedding;
        await newCase.save();
      }

      res.status(201).json(newCase);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get all cases
router.get('/all', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.status && !['pending', 'processing', 'completed', 'closed', 'scheduled'].includes(req.query.status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }
    if (req.query.courtRoom) query.courtRoom = req.query.courtRoom;
    if (req.query.section) {
      const section = String(req.query.section).trim();
      if (!/^[A-Za-z0-9\s.-]{1,40}$/.test(section)) {
        return res.status(400).json({ error: 'Invalid section filter' });
      }
      query.ipcTags = { $in: [section] };
    }
    if (req.query.assignedJudge) {
      if (!mongoose.Types.ObjectId.isValid(req.query.assignedJudge)) {
        return res.status(400).json({ error: 'Invalid assignedJudge filter' });
      }
      query.assignedJudge = req.query.assignedJudge;
    }
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
    }

    const cases = await Case.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Case.countDocuments(query);

    res.json({
      cases,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalCases: total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single case
router.get('/:id', protect, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid case ID' });
    }
    const case_ = await Case.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('documents')
      .populate('assignedJudge', 'name email role')
      .populate('timelineEvents.createdBy', 'name role');

    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(case_);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update case
router.put(
  '/:id',
  protect,
  authorize('judge', 'lawyer', 'clerk'),
  validateCaseUpdatePayload,
  auditTrail('UPDATE_CASE', 'CASE'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid case ID' });
      }
      const { title, description, status, summary, ipcTags, entities, humanReviewRequired } = req.body;
      const case_ = await Case.findById(req.params.id);
      if (!case_) {
        return res.status(404).json({ error: 'Case not found' });
      }

      if (title !== undefined) case_.title = title;
      if (description !== undefined) case_.description = description;
      if (status !== undefined) case_.status = status;
      if (summary !== undefined) case_.summary = summary;
      if (ipcTags !== undefined) case_.ipcTags = ipcTags;
      if (entities !== undefined) case_.entities = entities;
      if (humanReviewRequired !== undefined) case_.humanReviewRequired = Boolean(humanReviewRequired);
      case_.updatedAt = Date.now();

      if (!case_.timelineEvents) case_.timelineEvents = [];
      case_.timelineEvents.push({
        eventType: 'CASE_UPDATED',
        notes: `Updated by ${req.user.role}`,
        createdBy: req.user._id
      });

      if (title !== undefined || description !== undefined || summary !== undefined) {
        const embedding = await getEmbedding(caseEmbeddingText(case_));
        if (embedding) {
          case_.embedding = embedding;
        }
      }

      await case_.save();
      res.json(case_);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Add timeline event
router.post(
  '/:id/timeline',
  protect,
  authorize('judge', 'lawyer', 'clerk'),
  auditTrail('ADD_TIMELINE_EVENT', 'CASE'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid case ID' });
      }
      const { eventType, notes } = req.body;
      if (!eventType || !notes) {
        return res.status(400).json({ error: 'eventType and notes are required' });
      }

      const case_ = await Case.findById(req.params.id);
      if (!case_) {
        return res.status(404).json({ error: 'Case not found' });
      }

      case_.timelineEvents.push({ eventType, notes, createdBy: req.user._id });
      case_.updatedAt = Date.now();
      await case_.save();
      res.status(201).json({ success: true, timelineEvents: case_.timelineEvents });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Assign owner
router.post(
  '/:id/assign',
  protect,
  authorize('judge', 'clerk'),
  auditTrail('ASSIGN_CASE', 'CASE'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid case ID' });
      }
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: 'Invalid userId' });
      }

      const assignee = await User.findById(userId);
      if (!assignee || !['judge', 'lawyer', 'clerk'].includes(assignee.role)) {
        return res.status(400).json({ error: 'Invalid assignee' });
      }

      const case_ = await Case.findById(req.params.id);
      if (!case_) return res.status(404).json({ error: 'Case not found' });

      case_.assignedJudge = assignee._id;
      case_.timelineEvents.push({
        eventType: 'ASSIGNED',
        notes: `Assigned to ${assignee.name} (${assignee.role})`,
        createdBy: req.user._id
      });
      case_.updatedAt = Date.now();
      await case_.save();

      res.json({ success: true, case: case_ });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Delete case
router.delete(
  '/:id',
  protect,
  authorize('judge', 'clerk'),
  auditTrail('DELETE_CASE', 'CASE'),
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: 'Invalid case ID' });
      }
      const case_ = await Case.findByIdAndDelete(req.params.id);

      if (!case_) {
        return res.status(404).json({ error: 'Case not found' });
      }

      res.json({ message: 'Case deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
