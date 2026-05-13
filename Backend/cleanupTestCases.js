import mongoose from 'mongoose';
import Case from './models/Case.js';
import Document from './models/document.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

async function cleanupTestCases() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/legal-docs');
    console.log('✅ Connected\n');
    
    // Find test cases
    const testCases = await Case.find({
      $or: [
        { caseNumber: 'CIV/001' },
        { caseNumber: 'fjkf' },
        { title: 'XYZ' },
        { title: 'ffr' },
        { description: 'RANDOM CASE' }
      ]
    }).populate('documents');
    
    console.log(`Found ${testCases.length} test cases to delete\n`);
    
    for (const case_ of testCases) {
      console.log(`Deleting case: ${case_.caseNumber} - ${case_.title}`);
      
      // Delete associated documents
      for (const doc of case_.documents) {
        // Delete physical file
        if (fs.existsSync(doc.filepath)) {
          fs.unlinkSync(doc.filepath);
          console.log(`  ✓ Deleted file: ${doc.originalName}`);
        }
        
        // Delete document record
        await Document.findByIdAndDelete(doc._id);
        console.log(`  ✓ Deleted document record`);
      }
      
      // Delete case
      await Case.findByIdAndDelete(case_._id);
      console.log(`  ✓ Deleted case\n`);
    }
    
    // Show remaining cases
    const remaining = await Case.countDocuments();
    console.log(`\n✨ Cleanup complete!`);
    console.log(`📊 Remaining cases in database: ${remaining}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

cleanupTestCases();
