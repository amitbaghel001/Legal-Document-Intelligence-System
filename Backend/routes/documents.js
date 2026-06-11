import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import Document from '../models/Document.js';
import Case from '../models/Case.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
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

// Upload document
router.post('/upload', protect, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { caseId } = req.body;

    // Verify case exists
    const case_ = await Case.findById(caseId);
    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Create document record
    const document = await Document.create({
      filename: req.file.filename,
      originalName: req.file.originalname,
      filepath: req.file.path,
      filesize: req.file.size,
      mimetype: req.file.mimetype,
      caseId,
      uploadedBy: req.user._id,
      status: 'uploaded'
    });

    // Add document to case
    case_.documents.push(document._id);
    await case_.save();

    res.status(201).json(document);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process document with ML service
router.post('/process/:id', protect, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update status to processing
    document.status = 'processing';
    await document.save();

    // Call ML service (your friend's API)
    try {
      const mlResponse = await axios.post(process.env.ML_SERVICE_URL, {
        document_id: document._id,
        file_path: document.filepath,
        case_id: document.caseId
      }, {
        timeout: 60000 // 60 second timeout
      });

      // Update document with processed data
      document.processedData = {
        extractedText: mlResponse.data.extracted_text,
        summary: mlResponse.data.summary,
        ipcTags: mlResponse.data.ipc_tags,
        entities: mlResponse.data.entities,
        confidenceScore: mlResponse.data.confidence_score
      };
      document.status = 'completed';
      await document.save();

      // Update case with processed data
      const case_ = await Case.findById(document.caseId);
      if (case_) {
        case_.summary = mlResponse.data.summary;
        case_.ipcTags = mlResponse.data.ipc_tags;
        case_.entities = mlResponse.data.entities;
        case_.status = 'completed';
        await case_.save();
      }

      res.json(document);
    } catch (mlError) {
      document.status = 'failed';
      await document.save();
      throw new Error('ML processing failed: ' + mlError.message);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get document by ID
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

// Get all documents for a case
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

// Delete a document - IMPROVED VERSION
router.delete('/:id', protect, async (req, res) => {
  try {
    console.log('Delete request for document ID:', req.params.id);
    
    const document = await Document.findById(req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    console.log('Found document:', document.originalName);
    
    // Delete physical file (with error handling)
    try {
      if (document.filepath && fs.existsSync(document.filepath)) {
        fs.unlinkSync(document.filepath);
        console.log('✓ Deleted physical file');
      } else {
        console.log('⚠ Physical file not found (may have been deleted already)');
      }
    } catch (fileError) {
      console.error('Error deleting physical file:', fileError.message);
      // Continue even if file deletion fails
    }
    
    // Remove document reference from case
    try {
      if (document.caseId) {
        await Case.findByIdAndUpdate(document.caseId, {
          $pull: { documents: document._id }
        });
        console.log('✓ Removed document from case');
      }
    } catch (caseError) {
      console.error('Error updating case:', caseError.message);
      // Continue even if case update fails
    }
    
    // Delete document record from database
    await Document.findByIdAndDelete(req.params.id);
    console.log('✓ Deleted document record from database');
    
    res.json({ 
      success: true,
      message: 'Document deleted successfully'
    });
    
  } catch (error) {
    console.error('❌ Error in delete route:', error);
    res.status(500).json({ 
      error: 'Failed to delete document',
      details: error.message 
    });
  }
});

export default router;
