import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import Document from '../models/Document.js';
import Case from '../models/Case.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roles.js';
import { scanUploadedFile } from '../middleware/fileSecurity.js';
import { auditTrail } from '../middleware/auditTrail.js';

const router = express.Router();
const MAX_PROCESS_ATTEMPTS = 3;

function addTimelineEvent(document, state, message) {
  if (!document.processingTimeline) document.processingTimeline = [];
  document.processingTimeline.push({ state, message, at: new Date() });
}

async function processDocumentInBackground(documentId, attempt = 1) {
  const document = await Document.findById(documentId);
  if (!document) return;

  try {
    document.status = 'processing';
    document.processingAttempts = attempt;
    addTimelineEvent(document, 'processing', `Processing attempt ${attempt}`);
    await document.save();

    const mlResponse = await axios.post(
      process.env.ML_SERVICE_URL,
      {
        document_id: document._id,
        file_path: document.filepath,
        case_id: document.caseId
      },
      { timeout: 60000 }
    );

    document.processedData = {
      extractedText: mlResponse.data.extracted_text,
      summary: mlResponse.data.summary,
      ipcTags: mlResponse.data.ipc_tags,
      entities: mlResponse.data.entities,
      confidenceScore: mlResponse.data.confidence_score,
      explainabilityNotes: [
        'Generated from ML service extracted text and legal entity matching.',
        'Human validation recommended for filing-critical decisions.'
      ]
    };
    document.status = 'completed';
    addTimelineEvent(document, 'completed', 'Document processing completed');
    await document.save();

    const case_ = await Case.findById(document.caseId);
    if (case_) {
      case_.summary = mlResponse.data.summary;
      case_.ipcTags = mlResponse.data.ipc_tags;
      case_.entities = mlResponse.data.entities;
      case_.status = 'completed';
      case_.updatedAt = Date.now();
      if (!case_.timelineEvents) case_.timelineEvents = [];
      case_.timelineEvents.push({
        eventType: 'DOCUMENT_PROCESSED',
        notes: `Document ${document.originalName} processed`,
        createdAt: new Date()
      });
      await case_.save();
    }
  } catch (error) {
    document.status = 'failed';
    addTimelineEvent(document, 'failed', `Processing failed: ${error.message}`);
    await document.save();

    if (attempt < MAX_PROCESS_ATTEMPTS) {
      const delay = 2000 * attempt;
      setTimeout(() => {
        processDocumentInBackground(documentId, attempt + 1).catch((err) => {
          console.error('Retry processing error:', err.message);
        });
      }, delay);
    }
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files are allowed'));
    }
  }
});

router.post(
  '/upload',
  protect,
  authorize('judge', 'lawyer', 'clerk'),
  upload.single('document'),
  auditTrail('UPLOAD_DOCUMENT', 'DOCUMENT', (req, res) => res.locals.documentId),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const scanResult = scanUploadedFile(req.file.path);
      if (!scanResult.safe) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: scanResult.reason });
      }

      const { caseId } = req.body;
      const case_ = await Case.findById(caseId);
      if (!case_) {
        return res.status(404).json({ error: 'Case not found' });
      }

      const document = await Document.create({
        filename: req.file.filename,
        originalName: req.file.originalname,
        filepath: req.file.path,
        filesize: req.file.size,
        mimetype: req.file.mimetype,
        caseId,
        uploadedBy: req.user._id,
        status: 'uploaded',
        processingTimeline: [{ state: 'uploaded', message: 'Document uploaded', at: new Date() }]
      });
      res.locals.documentId = document._id;

      case_.documents.push(document._id);
      case_.timelineEvents.push({
        eventType: 'DOCUMENT_UPLOADED',
        notes: `Document ${document.originalName} uploaded`,
        createdBy: req.user._id
      });
      await case_.save();

      res.status(201).json(document);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/process/:id',
  protect,
  authorize('judge', 'lawyer', 'clerk'),
  auditTrail('PROCESS_DOCUMENT', 'DOCUMENT'),
  async (req, res) => {
    try {
      const document = await Document.findById(req.params.id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      document.status = 'queued';
      addTimelineEvent(document, 'queued', 'Document added to processing queue');
      await document.save();

      processDocumentInBackground(document._id).catch((error) => {
        console.error('Background processing failure:', error.message);
      });

      res.status(202).json({
        success: true,
        message: 'Document queued for AI processing',
        documentId: document._id
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/retry/:id',
  protect,
  authorize('judge', 'lawyer', 'clerk'),
  auditTrail('RETRY_DOCUMENT_PROCESSING', 'DOCUMENT'),
  async (req, res) => {
    try {
      const document = await Document.findById(req.params.id);
      if (!document) return res.status(404).json({ error: 'Document not found' });
      if (document.status !== 'failed') {
        return res.status(400).json({ error: 'Only failed documents can be retried' });
      }

      document.status = 'queued';
      addTimelineEvent(document, 'queued', 'Retry requested by user');
      await document.save();
      processDocumentInBackground(document._id).catch((error) => {
        console.error('Retry processing failure:', error.message);
      });

      res.json({ success: true, message: 'Retry started' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/:id', protect, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('caseId', 'caseNumber title');

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/case/:caseId', protect, async (req, res) => {
  try {
    const documents = await Document.find({ caseId: req.params.caseId })
      .populate('uploadedBy', 'name email')
      .sort({ uploadedAt: -1 });

    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete(
  '/:id',
  protect,
  authorize('judge', 'clerk'),
  auditTrail('DELETE_DOCUMENT', 'DOCUMENT'),
  async (req, res) => {
    try {
      const document = await Document.findById(req.params.id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      try {
        if (document.filepath && fs.existsSync(document.filepath)) {
          fs.unlinkSync(document.filepath);
        }
      } catch (fileError) {
        console.error('Error deleting physical file:', fileError.message);
      }

      if (document.caseId) {
        await Case.findByIdAndUpdate(document.caseId, {
          $pull: { documents: document._id },
          $push: {
            timelineEvents: {
              eventType: 'DOCUMENT_DELETED',
              notes: `Document ${document.originalName} deleted`,
              createdBy: req.user._id
            }
          }
        });
      }

      await Document.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to delete document',
        details: error.message
      });
    }
  }
);

export default router;

