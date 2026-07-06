import mongoose from 'mongoose';
import Case from './models/Case.js';
import dotenv from 'dotenv';

dotenv.config();

async function deleteAllCases() {
  try {
    console.log('🔗 Connecting to MongoDB...');

    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI is not set in the environment.');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);

    console.log('✅ Connected to Database\n');

    // Count before deletion
    const countBefore = await Case.countDocuments();
    console.log(`📊 Current cases in database: ${countBefore}\n`);

    if (countBefore === 0) {
      console.log('ℹ️  Database is already empty. Nothing to delete.\n');
      process.exit(0);
    }

    // Ask for confirmation
    console.log('⚠️  WARNING: This will delete ALL cases!');
    console.log('Press Ctrl+C now to cancel...\n');
    
    // Wait 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🗑️  Deleting all cases...\n');

    // Delete all cases
    const result = await Case.deleteMany({});

    console.log('✅ Deletion completed!\n');
    console.log(`📊 Results:`);
    console.log(`   - Cases before: ${countBefore}`);
    console.log(`   - Cases deleted: ${result.deletedCount}`);
    console.log(`   - Cases remaining: ${await Case.countDocuments()}\n`);

    console.log('🎉 Database cleaned successfully!\n');
    console.log('You can now run: node import100RealCases.js\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

deleteAllCases();
