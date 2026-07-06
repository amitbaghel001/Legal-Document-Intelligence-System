import express from 'express';
import Case from '../models/Case.js';
import '../models/Document.js';
import { protect } from '../middleware/auth.js';
import { cosineSimilarityVec } from '../utils/embeddings.js';

const router = express.Router();

// Calculate Jaccard Similarity
function jaccardSimilarity(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return 0;
  
  const set1 = new Set(arr1.map(s => String(s).toLowerCase().trim()));
  const set2 = new Set(arr2.map(s => String(s).toLowerCase().trim()));
  
  // ✅ FIX: If both arrays only contain generic "Indian Penal Code", return 0
  if (set1.has('indian penal code') && set1.size === 1 && 
      set2.has('indian penal code') && set2.size === 1) {
    return 0;
  }
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

// Calculate Cosine Similarity for text
function cosineSimilarity(tokens1, tokens2) {
  if (!tokens1 || !tokens2 || tokens1.length === 0 || tokens2.length === 0) return 0;
  
  const freqMap1 = {};
  const freqMap2 = {};
  
  tokens1.forEach(token => freqMap1[token] = (freqMap1[token] || 0) + 1);
  tokens2.forEach(token => freqMap2[token] = (freqMap2[token] || 0) + 1);
  
  const allTokens = new Set([...tokens1, ...tokens2]);
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  allTokens.forEach(token => {
    const freq1 = freqMap1[token] || 0;
    const freq2 = freqMap2[token] || 0;
    
    dotProduct += freq1 * freq2;
    mag1 += freq1 * freq1;
    mag2 += freq2 * freq2;
  });
  
  if (mag1 === 0 || mag2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2));
}

// Tokenize text
function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3);
}

// Calculate multi-factor similarity
function calculateSimilarity(currentCase, compareCase) {
  try {
    // 1. IPC Tags Similarity
    const ipcSim = jaccardSimilarity(
      currentCase.ipcTags || [],
      compareCase.ipcTags || []
    );

    // 2. Entities Similarity
    const entitySim = jaccardSimilarity(
      currentCase.entities || [],
      compareCase.entities || []
    );

    // 3. Title Similarity
    const currentTitleTokens = tokenize(currentCase.title || '');
    const compareTitleTokens = tokenize(compareCase.title || '');
    const titleSim = cosineSimilarity(currentTitleTokens, compareTitleTokens);

    // 4. Meaning similarity: prefer Gemini semantic embeddings (captures meaning,
    // not just shared words). Fall back to word-overlap cosine on description
    // for older cases that don't have an embedding yet.
    const semanticSim = cosineSimilarityVec(currentCase.embedding, compareCase.embedding);
    const usingSemantic = semanticSim !== null;

    const meaningSim = usingSemantic
      ? Math.max(semanticSim, 0)
      : cosineSimilarity(
          tokenize((currentCase.description || '').substring(0, 2000)),
          tokenize((compareCase.description || '').substring(0, 2000))
        );

    // Weighted combination. Meaning (semantic or word-overlap) carries the most
    // weight since it best captures whether two cases are actually about the
    // same kind of dispute, not just sharing generic IPC tags.
    const rawScore = (
      (meaningSim * 0.45) +
      (ipcSim * 0.20) +
      (entitySim * 0.20) +
      (titleSim * 0.15)
    );

    // Convert to percentage
    const finalScore = Math.round(rawScore * 1000) / 10;

    return finalScore;

  } catch (error) {
    console.error('Similarity calculation error:', error);
    return 0;
  }
}

// Find similar cases
router.get('/:caseId/similar', protect, async (req, res) => {
  try {
    const currentCase = await Case.findById(req.params.caseId);
    if (!currentCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    console.log('Finding similar cases for:', currentCase.caseNumber);
    console.log('IPC Tags:', currentCase.ipcTags);
    console.log('Entities:', currentCase.entities);
    console.log('Title:', currentCase.title?.substring(0, 50) + '...');

    // Get all other cases
    const allCases = await Case.find({
      _id: { $ne: currentCase._id }
    }).select('caseNumber title description summary ipcTags entities status createdAt embedding');

    console.log(`Comparing against ${allCases.length} cases`);

    // Calculate similarity for each case
    const casesWithScores = allCases.map(case_ => {
      const similarityScore = calculateSimilarity(currentCase, case_);
      
      return {
        _id: case_._id,
        caseNumber: case_.caseNumber,
        title: case_.title,
        ipcTags: case_.ipcTags,
        entities: case_.entities,
        status: case_.status,
        createdAt: case_.createdAt,
        similarityScore: similarityScore
      };
    });

    // ✅ Filter: Only show cases with similarity >= 20%
    const relevantCases = casesWithScores
      .filter(c => c.similarityScore >= 20)
      .sort((a, b) => b.similarityScore - a.similarityScore)
      .slice(0, 10);

    console.log(`Found ${relevantCases.length} similar cases (>= 20% similarity)`);
    if (relevantCases.length > 0) {
      console.log('Top 3 matches:');
      relevantCases.slice(0, 3).forEach(c => {
        console.log(`  - ${c.caseNumber}: ${c.similarityScore}%`);
      });
    }

    res.json(relevantCases);
    
  } catch (error) {
    console.error('Similar cases error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
