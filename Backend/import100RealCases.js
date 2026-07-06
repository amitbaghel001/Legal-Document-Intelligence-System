import axios from 'axios';
import * as cheerio from 'cheerio';
import mongoose from 'mongoose';
import Case from './models/Case.js';
import User from './models/User.js';
import dotenv from 'dotenv';
import { getEmbedding, caseEmbeddingText } from './utils/embeddings.js';

dotenv.config();

// Gemini API Configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in the environment.');
  process.exit(1);
}
// gemini-2.5-flash's free tier is capped at ~20 requests/DAY per project
// (not per-minute) — a bulk import blows through that in the first dozen
// cases and every subsequent summary silently falls back. flash-lite has its
// own separate, much higher daily quota bucket.
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

// Generate diverse case IDs from Indian Kanoon
function generateCaseIDs() {
  const realCaseIDs = [
    // Supreme Court landmark cases
    1953529, 1569253, 1679850, 1735066, 1836715, 111604, 1199182, 780126,
    1648796, 788478, 1456886, 1837766, 1953367, 542107, 1813809, 1294854,
    631423, 445276, 1997062, 1569271, 735569, 1199950, 863716, 1648959,
    542970, 1569406, 1824502, 542077, 1569399, 1569340, 1823450, 1665396,
    1372870, 542060, 1199003, 1569178, 542138, 1679765, 1456920, 542091,
    1648891, 1824587, 542160, 1953440, 1569286, 735601, 1813850, 1648910,
    // High Court cases
    1687567, 1676543, 1891234, 1234567, 1456789, 1567890, 1678901, 1789012,
    1890123, 1901234, 1012345, 1123456, 1234560, 1345678, 1456780, 1567891,
    // Diverse case range
    500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 1200000,
    1300000, 1400000, 1500000, 1600000, 1700000, 1800000, 1900000, 2000000,
    // Recent cases (2020-2024)
    2100000, 2200000, 2300000, 2400000, 2500000, 2600000, 2700000, 2800000,
    2900000, 3000000, 3100000, 3200000, 3300000, 3400000, 3500000, 3600000
  ];
  
  // Shuffle to randomize and get 150 candidates
  return realCaseIDs.sort(() => Math.random() - 0.5).slice(0, 150);
}

// Generate AI-powered summary using Google Gemini
async function generateAISummary(caseText, caseTitle) {
  try {
    console.log('    🤖 Generating AI summary with Gemini 2.0...');
    
    const systemPrompt = `You are an expert legal case summarizer. Create a comprehensive 400-500 word summary of the following Indian legal case judgment.

Focus on these key elements:
1. **Facts of the Case**: Brief background and what happened
2. **Legal Issues**: The main questions of law involved
3. **Arguments**: Key arguments from both parties
4. **Court's Decision**: The ruling and reasoning
5. **Important Observations**: Any significant legal principles established

Case Title: ${caseTitle}

Provide ONLY the summary text in paragraph form, no additional formatting or headings.`;

    const payload = {
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\nCase Content (Judgment Text):\n${caseText.substring(0, 8000)}`
        }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800,
        topP: 0.9,
        // gemini-2.5-flash "thinks" before answering by default, and thinking
        // tokens count against maxOutputTokens — without disabling it, the
        // budget was consumed by reasoning and cut off before any visible text.
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    // One retry on transient failures:
    // - 429 = rate limited (RetryInfo gives a short wait; distinct from a
    //   daily-quota exhaustion, which fails the same way all day regardless)
    // - 503 = model temporarily overloaded ("high demand"), Google's own
    //   docs say this is transient and safe to retry after a short pause
    let response;
    try {
      response = await axios.post(GEMINI_API_URL, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 429 || status === 503) {
        let retrySeconds = 8;
        if (status === 429) {
          const retryInfo = err.response.data?.error?.details?.find(
            d => d['@type']?.includes('RetryInfo')
          );
          retrySeconds = retryInfo ? parseInt(retryInfo.retryDelay) || 8 : 8;
        }
        console.log(`    ⏳ ${status === 429 ? 'Rate limited' : 'Model overloaded'}, retrying in ${retrySeconds}s...`);
        await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
        response = await axios.post(GEMINI_API_URL, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        });
      } else {
        throw err;
      }
    }

    const summaryText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (summaryText && summaryText.length > 150) {
      console.log(`    ✅ AI summary generated (${summaryText.length} chars)`);
      return summaryText.trim();
    }

    throw new Error('AI response too short or invalid');

  } catch (error) {
    const upstreamMessage = error.response?.data?.error?.message || error.message;
    console.log(`    ⚠️  AI summary failed (${upstreamMessage}), using fallback`);
    return generateFallbackSummary(caseText, caseTitle);
  }
}

// Fallback extractive summary if AI fails
function generateFallbackSummary(content, title) {
  const cleanContent = content.replace(/\s+/g, ' ').trim();
  
  // Try to extract key sections
  const factsMatch = cleanContent.match(/(?:facts?|background|case history)[:\s]+(.*?)(?:held|order|judgment|conclusion)/is);
  const heldMatch = cleanContent.match(/(?:held|order|judgment|concluded?)[:\s]+(.*?)(?:dated|signed|judge|\d{4})/is);
  const issuesMatch = cleanContent.match(/(?:issue|question|matter)[:\s]+(.*?)(?:held|order|facts)/is);
  
  let summary = '';
  
  if (factsMatch && factsMatch[1]) {
    summary += 'Facts: ' + factsMatch[1].trim().substring(0, 300) + '... ';
  }
  
  if (issuesMatch && issuesMatch[1]) {
    summary += 'Issue: ' + issuesMatch[1].trim().substring(0, 200) + '... ';
  }
  
  if (heldMatch && heldMatch[1]) {
    summary += 'Held: ' + heldMatch[1].trim().substring(0, 300);
  }
  
  // If nothing found, use first meaningful sentences
  if (summary.length < 150) {
    const sentences = cleanContent.split(/[.!?]+/).filter(s => s.trim().length > 50);
    summary = sentences.slice(0, 5).join('. ') + '.';
  }
  
  return summary.substring(0, 1200) || `${title}. This case involves important legal principles. Full judgment details available in case description.`;
}

// Extract IPC sections with improved patterns
function extractIPCSections(content) {
  const ipcMatches = new Set();
  
  // Pattern 1: Section 302 IPC / Section 302 of IPC / Section 302 of the Indian Penal Code
  const pattern1 = content.matchAll(/Section\s+(\d+[A-Z]*)\s+(?:of\s+(?:the\s+)?)?(?:IPC|Indian Penal Code)/gi);
  for (const match of pattern1) {
    ipcMatches.add(`Section ${match[1]} IPC`);
  }
  
  // Pattern 2: IPC Section 420
  const pattern2 = content.matchAll(/IPC\s+Section\s+(\d+[A-Z]*)/gi);
  for (const match of pattern2) {
    ipcMatches.add(`Section ${match[1]} IPC`);
  }
  
  // Pattern 3: Sections 302, 304, 307 IPC
  const pattern3 = content.matchAll(/Sections?\s+([\d,\s&]+)\s+(?:of\s+(?:the\s+)?)?IPC/gi);
  for (const match of pattern3) {
    const sections = match[1].split(/[,&]/).map(s => s.trim()).filter(s => /^\d+/.test(s));
    sections.forEach(s => {
      const num = s.match(/\d+[A-Z]*/);
      if (num) ipcMatches.add(`Section ${num[0]} IPC`);
    });
  }
  
  // Pattern 4: U/S 379 IPC (Under Section)
  const pattern4 = content.matchAll(/U\/S\s+(\d+[A-Z]*)\s+IPC/gi);
  for (const match of pattern4) {
    ipcMatches.add(`Section ${match[1]} IPC`);
  }
  
  const result = Array.from(ipcMatches).slice(0, 8);
  return result.length > 0 ? result : ['Indian Penal Code'];
}

// Scrape individual case from Indian Kanoon
async function scrapeCase(caseID, index) {
  try {
    const url = `https://indiankanoon.org/doc/${caseID}/`;
    console.log(`    🌐 Fetching: ${url}`);
    
    const { data } = await axios.get(url, { 
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    
    const $ = cheerio.load(data);
    
    // Extract title
    // Note: try selectors in priority order individually. A combined selector's
    // .first() picks by DOM order, and the site header's <h1> (generic site name)
    // sits before .doc_title in the DOM, so it always won over the real title.
    let title = $('.doc_title').first().text().trim();
    if (!title || title.length < 10) {
      title = $('.doctitle').first().text().trim();
    }
    if (!title || title.length < 10) {
      title = $('h1').not('.sr-only').first().text().trim();
    }
    if (!title || title.length < 10) {
      title = $('title').text().replace(/Indian Kanoon\s*-\s*/gi, '').trim();
    }
    
    // Extract judgment content - Try multiple selectors
    let content = '';
    
    const selectors = [
      '.judgments',
      '.docsource_main',
      '#judgmentContent',
      '.doc_content',
      'div[style*="LINE-HEIGHT"]',
      'blockquote',
      '.docsource'
    ];
    
    for (const selector of selectors) {
      const elem = $(selector);
      if (elem.length > 0) {
        const text = elem.text();
        if (text.length > content.length) {
          content = text;
        }
      }
    }
    
    // Fallback: Get all paragraphs
    if (content.length < 1000) {
      content = $('p').map((i, el) => $(el).text()).get().join('\n\n');
    }
    
    // Clean content aggressively
    content = content
      .replace(/Take notes as you read.+?Try out our Premium Member Services.+?one month\./gis, '')
      .replace(/Virtual Legal Assistant/gi, '')
      .replace(/Query Alert Service/gi, '')
      .replace(/Sign up today/gi, '')
      .replace(/email alerts/gi, '')
      .replace(/Save your work with.+?Cloud/gi, '')
      .replace(/\[.*?\]/g, '') // Remove citations like [1], [2]
      .replace(/\s{2,}/g, ' ') // Collapse whitespace
      .trim();
    
    // Validation - Minimum content length
    if (content.length < 1000 || !title || title.length < 10) {
      console.log(`    ⚠️  Skipped: Content too short (${content.length} chars)`);
      return null;
    }
    
    // Extract case number with multiple patterns
    let caseNumber = null;
    
    // Pattern 1: Criminal Appeal No. 123 of 2020
    const caseNumPattern1 = title.match(/(?:Criminal Appeal|Civil Appeal|Writ Petition|Special Leave Petition|Criminal Writ|Transfer Petition|Criminal Misc|Misc Petition)\s+(?:No\.?|Number)?\s*(\d+)\s+(?:of|\/)\s+(\d{4})/i);
    if (caseNumPattern1) {
      caseNumber = caseNumPattern1[0];
    }
    
    // Pattern 2: [2020] 5 SCC 123
    const caseNumPattern2 = title.match(/\[(\d{4})\]\s+\d+\s+[A-Z]+\s+\d+/);
    if (!caseNumber && caseNumPattern2) {
      caseNumber = caseNumPattern2[0];
    }
    
    // Pattern 3: From content body
    const caseNumPattern3 = content.match(/(?:Case|Petition|Appeal)\s+No\.?\s*:?\s*(\d+[\/-]\d{4})/i);
    if (!caseNumber && caseNumPattern3) {
      caseNumber = caseNumPattern3[0];
    }
    
    // Fallback: Generate unique case number
    if (!caseNumber) {
      const year = 2020 + Math.floor(Math.random() * 5);
      const caseType = ['SC', 'CrA', 'CA', 'WP', 'SLP'][Math.floor(Math.random() * 5)];
      caseNumber = `${caseType}/${year}/${String(Math.floor(10000 + Math.random() * 90000))}`;
    }
    
    // Get FULL description (5000 words for comprehensive content)
    const words = content.split(/\s+/).slice(0, 5000);
    const description = words.join(' ');
    
    console.log(`    📝 Description: ${description.length} chars (${words.length} words)`);
    
    // Generate AI-powered summary
    const summary = await generateAISummary(content, title);
    
    // Extract IPC sections
    const ipcTags = extractIPCSections(content);
    console.log(`    ⚖️  IPC Sections: ${ipcTags.join(', ')}`);
    
    // Extract party names
    const vsMatch = title.match(/(.+?)\s+(?:vs?\.?|versus|v\.)\s+(.+?)(?:\son\s|\[|\d{4}|$)/i);
    let parties = [];
    if (vsMatch) {
      parties = [
        vsMatch[1].trim().substring(0, 150),
        vsMatch[2].trim().substring(0, 150)
      ];
      console.log(`    👥 Parties: ${parties.join(' vs ')}`);
    }
    
    // Clean title
    title = title
      .replace(/on\s+\d+\s+\w+,?\s+\d{4}/i, '')
      .replace(/\[.*?\]/g, '')
      .trim()
      .substring(0, 300);
    
    // Determine priority based on keywords
    let priority = 'medium';
    const urgentKeywords = ['murder', 'death penalty', 'capital punishment', 'life imprisonment', 'death sentence'];
    const highKeywords = ['bail', 'custody', 'arrest', 'detention', 'anticipatory bail'];
    
    const lowerContent = content.toLowerCase();
    if (urgentKeywords.some(kw => lowerContent.includes(kw))) {
      priority = 'urgent';
    } else if (highKeywords.some(kw => lowerContent.includes(kw))) {
      priority = 'high';
    } else if (Math.random() > 0.65) {
      priority = 'low';
    }
    
    console.log(`    🎯 Priority: ${priority}`);
    
    return {
      title,
      caseNumber,
      description,
      ipcTags,
      entities: parties,
      summary,
      priority
    };
    
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log(`    ⏱️  Timeout for Case ID ${caseID}`);
    } else {
      console.log(`    ❌ Error: ${error.message}`);
    }
    return null;
  }
}

// Main import function
async function import100RealCases() {
  try {
    console.log('\n🚀 Starting Case Import Process...\n');
    console.log('🔗 Connecting to MongoDB...');

    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI is not set in the environment.');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);

    console.log('✅ Connected to Database\n');

    const existingCount = await Case.countDocuments();
    console.log(`📊 Existing cases in database: ${existingCount}\n`);

    // Get or create admin user
    let user = await User.findOne({ role: 'judge' });
    if (!user) {
      user = await User.create({
        name: 'System Admin',
        email: 'admin@court.gov.in',
        password: 'admin123',
        role: 'judge'
      });
      console.log('👤 Created admin user\n');
    }

    const caseIDs = generateCaseIDs();
    console.log('═'.repeat(60));
    console.log('📥 IMPORTING 100 REAL CASES FROM INDIAN KANOON');
    console.log('═'.repeat(60));
    console.log('🤖 AI-powered summary generation (Google Gemini 2.0)');
    console.log('📝 Extended descriptions (5000 words per case)');
    console.log('🔍 Advanced IPC section extraction');
    console.log('⏱️  Estimated time: 5-7 minutes\n');

    let successCount = 0;
    let skippedCount = 0;
    let duplicateCount = 0;
    const seenCaseNumbers = new Set();

    for (let i = 0; i < caseIDs.length && successCount < 100; i++) {
      console.log(`\n[${ successCount + 1}/100] Processing Case ID: ${caseIDs[i]}`);
      console.log('─'.repeat(50));
      
      const caseData = await scrapeCase(caseIDs[i], successCount);
      
      if (caseData) {
        // Check for duplicate case numbers
        if (seenCaseNumbers.has(caseData.caseNumber)) {
          duplicateCount++;
          console.log(`    🔁 Duplicate case number: ${caseData.caseNumber}`);
          continue;
        }
        
        seenCaseNumbers.add(caseData.caseNumber);
        
        try {
          // Generate the semantic embedding up front so imported cases are
          // searchable/comparable immediately, without a separate manual
          // backfill step afterward.
          const embedding = await getEmbedding(caseEmbeddingText({
            title: caseData.title,
            description: caseData.description,
            summary: caseData.summary
          }));
          if (embedding) {
            console.log('    🧬 Embedding generated');
          } else {
            console.log('    ⚠️  Embedding failed, will need backfillEmbeddings.js later');
          }

          await Case.create({
            caseNumber: caseData.caseNumber,
            title: caseData.title,
            description: caseData.description,
            summary: caseData.summary,
            ipcTags: caseData.ipcTags,
            entities: caseData.entities,
            embedding: embedding || undefined,
            status: ['pending', 'completed', 'processing'][Math.floor(Math.random() * 3)],
            priority: caseData.priority,
            createdBy: user._id,
            createdAt: new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000) // Last 6 months
          });

          successCount++;
          console.log(`    ✅ Saved: ${caseData.caseNumber}`);
          console.log(`    📊 Progress: ${successCount}/100 (${Math.round(successCount/100*100)}%)`);

        } catch (error) {
          if (error.code === 11000) {
            duplicateCount++;
            console.log(`    🔁 Database duplicate: ${caseData.caseNumber}`);
          } else {
            console.error(`    ❌ Save error: ${error.message}`);
          }
        }
      } else {
        skippedCount++;
      }
      
      // Delay between requests (be respectful to Indian Kanoon)
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
    }

    console.log('\n' + '═'.repeat(60));
    console.log('🎉 IMPORT COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(60));
    console.log(`   ✅ Successful imports: ${successCount}`);
    console.log(`   ⚠️  Skipped (invalid): ${skippedCount}`);
    console.log(`   🔁 Duplicates avoided: ${duplicateCount}`);
    
    const stats = {
      total: await Case.countDocuments(),
      pending: await Case.countDocuments({ status: 'pending' }),
      completed: await Case.countDocuments({ status: 'completed' }),
      processing: await Case.countDocuments({ status: 'processing' })
    };
    
    console.log(`\n📈 FINAL DATABASE STATISTICS:`);
    console.log('─'.repeat(40));
    console.log(`   📁 Total Cases: ${stats.total}`);
    console.log(`   ⏳ Pending: ${stats.pending}`);
    console.log(`   🔄 Processing: ${stats.processing}`);
    console.log(`   ✅ Completed: ${stats.completed}`);
    console.log('═'.repeat(60) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the import
import100RealCases();
