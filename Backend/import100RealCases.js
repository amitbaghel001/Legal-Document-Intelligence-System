import axios from 'axios';
import * as cheerio from 'cheerio';
import mongoose from 'mongoose';
import Case from './models/Case.js';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

function generateCaseIDs() {
  const baseIDs = [
    1953529, 1569253, 1679850, 1735066, 1836715, 111604, 1199182, 780126, 
    1648796, 788478, 1456886, 1837766, 1953367, 542107, 1813809, 1294854,
    631423, 445276, 1997062, 1569271, 735569, 1199950, 863716, 1648959,
    542970, 1569406, 1824502, 542077, 1569399, 1569340
  ];
  
  const allIDs = [];
  allIDs.push(...baseIDs);
  
  for (let base of baseIDs) {
    for (let i = 1; i <= 3; i++) {
      allIDs.push(base + i * 100);
      if (allIDs.length >= 100) break;
    }
    if (allIDs.length >= 100) break;
  }
  
  return allIDs.slice(0, 100);
}

async function scrapeCase(caseID, index) {
  try {
    const url = `https://indiankanoon.org/doc/${caseID}/`;
    const { data } = await axios.get(url, { 
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const $ = cheerio.load(data);
    
    // Get title
    let title = $('.doc_title').first().text().trim();
    
    // Get judgment text - CLEANED
    let content = '';
    
    // Try different selectors
    if ($('.judgments').length > 0) {
      content = $('.judgments').text();
    } else if ($('.doc_description').length > 0) {
      content = $('.doc_description').text();
    } else {
      content = $('.docsource_main').text();
    }
    
    // Clean the content
    content = content
      .replace(/Take notes as you read.+?Try out our Premium Member Services.+?one month\./gi, '')
      .replace(/Virtual Legal Assistant/gi, '')
      .replace(/Query Alert Service/gi, '')
      .replace(/Sign up today/gi, '')
      .replace(/email alerts/gi, '')
      .trim();
    
    // If still too short, skip
    if (content.length < 200 || !title) {
      return null;
    }
    
    // Extract case number
    const caseNumberMatch = title.match(/(?:Criminal Appeal|Civil Appeal|Writ Petition|Special Leave Petition).+?No[.\s]*\d+.+?\d{4}/i) ||
                           title.match(/\d+\s+\w+\s+\d+/);
    const caseNumber = caseNumberMatch ? caseNumberMatch[0] : `SC/2025/${String(index + 1).padStart(5, '0')}`;
    
    // Get first 1000 words
    const words = content.split(/\s+/).slice(0, 1000);
    const description = words.join(' ');
    
    // Extract IPC sections
    const ipcMatches = [...content.matchAll(/(?:Section|IPC|Sec\.?)\s*(\d+[A-Z]*)/gi)];
    const ipcTags = [...new Set(ipcMatches.slice(0, 5).map(m => `IPC ${m[1]}`))];
    
    // Extract party names
    const vsMatch = title.match(/(.+?)\s+(?:vs?\.?|versus|v\.)\s+(.+?)(?:\son\s|\d{4}|$)/i);
    let parties = [];
    if (vsMatch) {
      parties = [
        vsMatch[1].trim().substring(0, 100),
        vsMatch[2].trim().substring(0, 100)
      ];
    }
    
    // Clean title
    title = title.replace(/on\s+\d+\s+\w+,?\s+\d{4}/i, '').trim();
    
    return {
      title: title.substring(0, 250),
      caseNumber: caseNumber.substring(0, 100),
      description,
      ipcTags: ipcTags.length > 0 ? ipcTags : ['Various Sections'],
      entities: parties,
      summary: description.substring(0, 500) + '...'
    };
  } catch (error) {
    return null;
  }
}

async function import100RealCases() {
  try {
    console.log('🔗 Connecting to MongoDB...');
 
    // await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/legal-docs');
     
     await mongoose.connect('mongodb+srv://Amit:Amit12345@cluster0.8z9yxem.mongodb.net/casemadad?retryWrites=true&w=majority');

    console.log('✅ Connected\n');

    await Case.deleteMany({});
    console.log('🗑️  Deleted old cases\n');

    let user = await User.findOne();
    if (!user) {
      user = await User.create({
        name: 'System Admin',
        email: 'admin@court.gov.in',
        password: 'admin123',
        role: 'judge'
      });
    }

    const caseIDs = generateCaseIDs();
    console.log('📥 Fetching 100 REAL cases from Indian Kanoon...');
    console.log('🧹 Cleaning ads and promotional content...');
    console.log('⏱️  This will take ~2-3 minutes (1 sec per case)...\n');

    let successCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < caseIDs.length && successCount < 100; i++) {
      const caseData = await scrapeCase(caseIDs[i], successCount);
      
      if (caseData) {
        await Case.create({
          caseNumber: caseData.caseNumber,
          title: caseData.title,
          description: caseData.description,
          summary: caseData.summary,
          ipcTags: caseData.ipcTags,
          entities: caseData.entities,
          status: ['pending', 'completed', 'processing'][Math.floor(Math.random() * 3)],
          priority: ['urgent', 'high', 'medium', 'low'][Math.floor(Math.random() * 4)],
          createdBy: user._id,
          createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000)
        });
        
        successCount++;
        
        if (successCount % 10 === 0) {
          console.log(`✅ Imported ${successCount} real cases (skipped ${skippedCount} invalid)...`);
        }
      } else {
        skippedCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n🎉 Successfully imported ${successCount} REAL & CLEAN cases!`);
    console.log(`📊 All promotional content removed\n`);
    
    const stats = {
      total: await Case.countDocuments(),
      pending: await Case.countDocuments({ status: 'pending' }),
      completed: await Case.countDocuments({ status: 'completed' }),
      processing: await Case.countDocuments({ status: 'processing' })
    };
    
    console.log('Final Stats:');
    console.log(`  Total: ${stats.total}`);
    console.log(`  Pending: ${stats.pending}`);
    console.log(`  Processing: ${stats.processing}`);
    console.log(`  Completed: ${stats.completed}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

import100RealCases();
