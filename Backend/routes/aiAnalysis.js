import express from 'express';
import mongoose from 'mongoose';
import Case from '../models/Case.js';
import Document from '../models/Document.js';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roles.js';
import { postGeminiWithRetry } from '../utils/geminiRetry.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
router.use(createRateLimiter({ windowMs: 5 * 60 * 1000, max: 60 }));

// gemini-2.5-flash's free tier caps out at ~20 requests/day per project;
// flash-lite has its own separate, much higher daily quota.
const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const analysisSchema = {
  type: 'OBJECT',
  properties: {
    ipcSections: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Specific statute sections genuinely applicable to this case (e.g. "IPC 302", "IPC 34", "CrPC 154"). Empty array if the case is purely civil with no criminal charges — never a generic placeholder like "Indian Penal Code".'
    },
    entities: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Names of parties, judges, or organizations mentioned in the text.'
    },
    summary: {
      type: 'STRING',
      description: 'A 150-250 word plain-language summary of the case: facts, issue, and outcome.'
    }
  },
  required: ['ipcSections', 'entities', 'summary']
};

// Analyze case document with Gemini: identifies real applicable statute
// sections and entities directly from the case text, rather than matching
// against a small hardcoded keyword list.
router.post('/analyze/:caseId', protect, authorize('judge', 'lawyer', 'clerk'), auditTrail('AI_ANALYZE_CASE', 'CASE', (req) => req.params.caseId), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.caseId)) {
      return res.status(400).json({ error: 'Invalid case ID' });
    }
    const case_ = await Case.findById(req.params.caseId).populate('documents');

    if (!case_) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const documentText = [case_.title, case_.description, case_.summary]
      .filter(Boolean)
      .join('\n\n')
      .substring(0, 8000);

    if (!documentText.trim()) {
      return res.status(400).json({ error: 'Case has no title, description, or summary to analyze' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: documentText }] }],
      systemInstruction: {
        parts: [{
          text: 'You are an expert Indian legal analyst. Read the case text and identify only the specific statute sections that are genuinely supported by the facts described — never guess or pad the list. If the case is purely civil (property, contract, service, family) with no criminal charges, return an empty ipcSections array.'
        }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: analysisSchema,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    const { data } = await postGeminiWithRetry(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) {
      throw new Error('Empty response from Gemini');
    }

    const analysis = JSON.parse(resultText);

    case_.ipcTags = analysis.ipcSections || [];
    case_.entities = analysis.entities || [];
    case_.summary = analysis.summary || case_.summary;
    case_.status = 'completed';
    const sectionCount = (analysis.ipcSections || []).length;
    const entityCount = (analysis.entities || []).length;
    const confidence = Math.min(0.98, 0.45 + (sectionCount * 0.1) + (entityCount * 0.05));
    case_.aiConfidence = Math.round(confidence * 100) / 100;
    case_.humanReviewRequired = confidence < 0.75;

    if (!case_.timelineEvents) case_.timelineEvents = [];
    case_.timelineEvents.push({
      eventType: 'AI_ANALYSIS',
      notes: `AI completed with confidence ${(case_.aiConfidence * 100).toFixed(0)}%`,
      createdBy: req.user._id
    });
    await case_.save();

    res.json({
      success: true,
      analysis,
      case: case_,
      explainability: {
        reason: 'Confidence is derived from extracted legal sections and named entities richness.',
        humanReviewRequired: case_.humanReviewRequired
      }
    });
  } catch (error) {
    const upstreamMessage = error.response?.data?.error?.message || error.message;
    console.error('AI analysis error:', upstreamMessage);
    res.status(error.response?.status || 500).json({ error: upstreamMessage });
  }
});

export default router;
