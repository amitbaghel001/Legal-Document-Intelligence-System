import mongoose from 'mongoose';

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
  description: String,
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
  summary: String,
  ipcTags: [String],
  entities: [String],
  embedding: [Number],
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('Case', caseSchema);
