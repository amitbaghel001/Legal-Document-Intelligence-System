import mongoose from 'mongoose';
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import Document from '../models/Document.js';
import Case from '../models/Case.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// 🆕 ENSURE UPLOADS FOLDER EXISTS BEFORE ANYTHING
const uploadsDir = path.join(process.cwd(), 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory at:', uploadsDir);
  } else {
    console.log('✅ Uploads directory exists at:', uploadsDir);
  }
} catch (error) {
  console.error('❌ Error creating uploads directory:', error);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Double check folder exists before each upload
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname;
    console.log('📁 Saving file as:', uniqueName);
    cb(null, uniqueName);
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
    console.log('📤 Upload request received');
    console.log('File:', req.file);
    console.log('Body:', req.body);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { caseId } = req.body;

    // Verify case exists
    const case_ = await Case.findById(caseId);
    if (!case_) {
      // Delete uploaded file if case doesn't exist
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
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

    console.log('✅ Document created:', document._id);

    // Add document to case
    case_.documents.push(document._id);
    await case_.save();

    res.status(201).json(document);
  } catch (error) {
    console.error('❌ Upload error:', error);
    // Clean up file if database save failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
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

    // Call ML service
    try {
      const mlResponse = await axios.post(process.env.ML_SERVICE_URL, {
        document_id: document._id,
        file_path: document.filepath,
        case_id: document.caseId
      }, {
        timeout: 60000
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

      // Update case
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

// Delete a document
router.delete('/:id', protect, async (req, res) => {
  try {
    console.log('🗑️ Delete request for document ID:', req.params.id);
    
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete physical file
    try {
      if (document.filepath && fs.existsSync(document.filepath)) {
        fs.unlinkSync(document.filepath);
        console.log('✅ Deleted physical file');
      }
    } catch (fileError) {
      console.error('⚠️ Error deleting file:', fileError.message);
    }

    // Remove from case
    try {
      if (document.caseId) {
        await Case.findByIdAndUpdate(document.caseId, {
          $pull: { documents: document._id }
        });
      }
    } catch (caseError) {
      console.error('⚠️ Error updating case:', caseError.message);
    }

    // Delete from database
    await Document.findByIdAndDelete(req.params.id);
    console.log('✅ Document deleted');

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
