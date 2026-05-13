import express from 'express';
import Case from '../models/Case.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Create case
router.post('/create', protect, async (req, res) => {
  try {
    const { caseNumber, title, description } = req.body;

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

    res.status(201).json(newCase);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all cases - FIXED VERSION
router.get('/all', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;  // Changed from 10 to 100
    const skip = (page - 1) * limit;

    // Don't populate, just get cases directly
    const cases = await Case.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Case.countDocuments();

    console.log(`✅ Fetched ${cases.length} cases out of ${total} total`);

    res.json({
      cases,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalCases: total
    });
  } catch (error) {
    console.error('❌ Error fetching cases:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single case
router.get('/:id', protect, async (req, res) => {
  try {
    const case_ = await Case.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('documents');

    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(case_);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update case
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, description, status, summary, ipcTags, entities } = req.body;

    const case_ = await Case.findByIdAndUpdate(
      req.params.id,
      { title, description, status, summary, ipcTags, entities, updatedAt: Date.now() },
      { new: true }
    );

    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(case_);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete case
router.delete('/:id', protect, async (req, res) => {
  try {
    const case_ = await Case.findByIdAndDelete(req.params.id);

    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json({ message: 'Case deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
