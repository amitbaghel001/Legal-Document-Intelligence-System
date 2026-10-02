import mongoose from 'mongoose';
import { encryptText, decryptText } from '../utils/cryptoFields.js';

const caseSchema = new mongoose.Schema({
  caseNumber: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    set: encryptText,
    get: decryptText
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'closed', 'scheduled'],
    default: 'pending'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  documents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }],
  summary: {
    type: String,
    set: encryptText,
    get: decryptText
  },
  ipcTags: [String],
  entities: [String],
  embedding: [Number],
  aiConfidence: {
    type: Number,
    default: null
  },
  humanReviewRequired: {
    type: Boolean,
    default: false
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent']
  },
  scheduledDate: Date,
  scheduledTime: String,
  courtRoom: String,
  estimatedDuration: Number,
  assignedJudge: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  previousHearings: [{
    date: Date,
    notes: String,
    duration: Number
  }],
  timelineEvents: [{
    eventType: String,
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

caseSchema.set('toJSON', { getters: true });
caseSchema.set('toObject', { getters: true });

export default mongoose.model('Case', caseSchema);
