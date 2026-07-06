import axios from 'axios';

const EMBEDDING_DIMENSIONS = 768;

// Generate a semantic embedding vector for text using Gemini.
// Returns null (never throws) so callers can treat embeddings as best-effort.
export async function getEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text || !text.trim()) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`;
    const { data } = await axios.post(url, {
      content: { parts: [{ text: text.substring(0, 8000) }] },
      outputDimensionality: EMBEDDING_DIMENSIONS
    }, { timeout: 15000 });

    return data?.embedding?.values || null;
  } catch (error) {
    console.error('Embedding generation failed:', error.response?.data?.error?.message || error.message);
    return null;
  }
}

export function cosineSimilarityVec(a, b) {
  if (!a || !b || a.length !== b.length) return null;

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return null;

  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function caseEmbeddingText(case_) {
  return [case_.title, case_.description, case_.summary].filter(Boolean).join('. ').substring(0, 8000);
}
