import express from 'express';
import axios from 'axios';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/gemini-analyze', protect, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return res.status(500).json({ error: 'Gemini API key not configured on server' });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`;

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

    const { data: result } = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
