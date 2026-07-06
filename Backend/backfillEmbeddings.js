import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Case from './models/Case.js';
import { getEmbedding, caseEmbeddingText } from './utils/embeddings.js';

dotenv.config();

async function backfillEmbeddings() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI is not set in the environment.');
      process.exit(1);
    }
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY is not set in the environment.');
      process.exit(1);
    }

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected\n');

    const cases = await Case.find({
      $or: [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }]
    });

    console.log(`📊 Found ${cases.length} case(s) without an embedding\n`);

    let done = 0;
    let failed = 0;

    for (const case_ of cases) {
      const embedding = await getEmbedding(caseEmbeddingText(case_));
      if (embedding) {
        case_.embedding = embedding;
        await case_.save();
        done++;
        console.log(`✅ [${done}/${cases.length}] Embedded: ${case_.caseNumber}`);
      } else {
        failed++;
        console.log(`⚠️  Skipped (embedding failed): ${case_.caseNumber}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log(`\n🎉 Done. Embedded: ${done}, Failed: ${failed}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

backfillEmbeddings();
