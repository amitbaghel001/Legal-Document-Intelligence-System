import mongoose from 'mongoose';
import { encryptText, decryptText } from '../utils/cryptoFields.js';

const documentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  filepath: {
    type: String,
    required: true
  },
  filesize: Number,
  mimetype: String,
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Case',
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['uploaded', 'queued', 'processing', 'completed', 'failed'],
    default: 'uploaded'
  },
  processingAttempts: {
    type: Number,
    default: 0
  },
  processingTimeline: [{
    state: String,
    message: String,
    at: {
      type: Date,
      default: Date.now
    }
  }],
  version: {
    type: Number,
    default: 1
  },
  processedData: {
    extractedText: {
      type: String,
      set: encryptText,
      get: decryptText
    },
    summary: {
      type: String,
      set: encryptText,
      get: decryptText
    },
    ipcTags: [String],
    entities: [String],
    confidenceScore: Number,
    explainabilityNotes: [String]
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

documentSchema.set('toJSON', { getters: true });
documentSchema.set('toObject', { getters: true });

export default mongoose.model('Document', documentSchema);
