import express from 'express';
import { protect } from '../middleware/auth.js';
import { authorize } from '../middleware/roles.js';
import { postGeminiWithRetry } from '../utils/geminiRetry.js';
import { auditTrail } from '../middleware/auditTrail.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
router.use(createRateLimiter({ windowMs: 5 * 60 * 1000, max: 80 }));

router.post('/gemini-analyze', protect, authorize('judge', 'lawyer', 'clerk', 'citizen'), auditTrail('AI_ANALYZE_TEXT', 'DOCUMENT'), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    // gemini-2.5-flash's free tier caps out at ~20 requests/day per project,
    // which real users would exhaust almost immediately. flash-lite has its
    // own separate, much higher daily quota and still supports structured
    // JSON output via responseSchema.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`;

    const schema = {
      type: 'OBJECT',
      properties: {
        judgeBrief: { type: 'STRING' },
        lawyerVersion: { type: 'STRING' },
        citizenSummary: { type: 'STRING' },
        identifiedSections: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              section: { type: 'STRING' },
              description: { type: 'STRING' }
            },
            required: ['section', 'description']
          }
        },
        legalProvisions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              provision: { type: 'STRING' },
              description: { type: 'STRING' }
            },
            required: ['provision', 'description']
          }
        },
        precedents: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              caseName: { type: 'STRING' },
              summary: { type: 'STRING' }
            },
            required: ['caseName', 'summary']
          }
        },
        outcomePrediction: { type: 'STRING' },
        evidenceSuggestion: { type: 'STRING' },
        timelineEstimate: { type: 'STRING' }
      },
      required: [
        'judgeBrief', 'lawyerVersion', 'citizenSummary',
        'identifiedSections', 'legalProvisions', 'precedents',
        'outcomePrediction', 'evidenceSuggestion', 'timelineEstimate'
      ]
    };

    const payload = {
      contents: [{ parts: [{ text }] }],
      systemInstruction: {
        parts: [{
          text: 'You are an expert legal AI assistant analyzing Indian legal documents. Respond ONLY with valid JSON adhering to the schema. Focus on IPC, CrPC, and Indian legal codes.'
        }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema
      }
    };

    const { data: result } = await postGeminiWithRetry(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.json({
      ...result,
      disclaimer: 'AI output is assistive only and must be reviewed by a legal professional before use.'
    });
  } catch (error) {
    const upstreamMessage = error.response?.data?.error?.message;
    console.error('Gemini API error:', upstreamMessage || error.message);
    res.status(error.response?.status || 500).json({
      error: upstreamMessage || error.message
    });
  }
});

export default router;
