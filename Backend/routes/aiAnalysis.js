import express from 'express';
import Case from '../models/Case.js';
import Document from '../models/document.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Mock AI function - replace with actual ML service
function extractIPCWithContext(text) {
  const ipcPatterns = [
    { code: 'IPC 379', keywords: ['theft', 'stolen', 'stealing', 'took without permission'] },
    { code: 'IPC 323', keywords: ['assault', 'hurt', 'injured', 'beaten', 'physical violence'] },
    { code: 'IPC 302', keywords: ['murder', 'killed', 'death', 'homicide'] },
    { code: 'IPC 420', keywords: ['cheating', 'fraud', 'deceived', 'dishonestly'] },
    { code: 'IPC 498A', keywords: ['dowry', 'cruelty', 'harassment', 'married woman'] }
  ];
  
  const results = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  sentences.forEach((sentence, index) => {
    const lowerSentence = sentence.toLowerCase();
    
    ipcPatterns.forEach(pattern => {
      if (pattern.keywords.some(keyword => lowerSentence.includes(keyword))) {
        results.push({
          ipcCode: pattern.code,
          contextSentence: sentence.trim(),
          sentenceIndex: index,
          confidence: 0.85 + Math.random() * 0.15,
          highlightedText: sentence.trim()
        });
      }
    });
  });
  
  return results;
}

// Analyze case document
router.post('/analyze/:caseId', protect, async (req, res) => {
  try {
    const case_ = await Case.findById(req.params.caseId).populate('documents');
    
    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Get document text (mock - replace with actual OCR)
    const documentText = case_.description + ' ' + case_.summary;
    
    // Extract IPC sections with context
    const ipcAnalysis = extractIPCWithContext(documentText);
    
    // Extract entities
    const entities = extractEntities(documentText);
    
    // Update case with analysis
    case_.ipcTags = [...new Set(ipcAnalysis.map(item => item.ipcCode))];
    case_.entities = entities;
    case_.status = 'completed';
    
    // Store detailed analysis
    const analysisData = {
      ipcAnalysis,
      entities,
      analyzedAt: new Date(),
      summary: generateSmartSummary(documentText, ipcAnalysis)
    };
    
    case_.summary = analysisData.summary;
    await case_.save();
    
    res.json({
      success: true,
      analysis: analysisData,
      case: case_
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function extractEntities(text) {
  const entities = [];
  const words = text.split(/\s+/);
  
  // Simple pattern matching for entities (replace with NER model)
  const namePattern = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g;
  const matches = text.match(namePattern) || [];
  
  return [...new Set(matches)].slice(0, 10);
}

function generateSmartSummary(text, ipcAnalysis) {
  const ipcs = ipcAnalysis.map(item => item.ipcCode).join(', ');
  const keyContexts = ipcAnalysis.map(item => item.contextSentence).slice(0, 3).join(' ');
  
  return `This case involves charges under ${ipcs}. ${keyContexts.substring(0, 400)}...`;
}

export default router;
