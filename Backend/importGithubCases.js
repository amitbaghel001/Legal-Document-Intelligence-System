import axios from 'axios';
import Case from './models/Case.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// GitHub raw data URLs for Indian Supreme Court cases
const GITHUB_URLS = [
  'https://raw.githubusercontent.com/OpenNyAI/judgement-search-dataset/main/judgments_data/supreme_court_sample.json',
  'https://gist.githubusercontent.com/anonymous/raw/sample-indian-cases.json'
];

// Fallback: Sample structured data if GitHub links don't work
const SAMPLE_CASES = [
  {
    case_id: 'SC/2020/12345',
    title: 'State of Maharashtra vs. Prakash Kumar - Theft Case',
    petitioner: 'State of Maharashtra',
    respondent: 'Prakash Kumar',
    court: 'Supreme Court of India',
    date: '2020-05-15',
    citation: 'AIR 2020 SC 1234',
    description: 'Criminal appeal against conviction under IPC Section 379 (theft). The appellant was convicted for stealing mobile phones worth Rs. 50,000. The High Court upheld the conviction. Supreme Court dismissed the appeal.',
    sections: ['IPC 379', 'IPC 380'],
    judgment: 'Appeal dismissed. Conviction upheld.'
  },
  {
    case_id: 'SC/2019/67890',
    title: 'Ram Singh vs. State of UP - Assault Case',
    petitioner: 'Ram Singh',
    respondent: 'State of Uttar Pradesh',
    court: 'Supreme Court of India',
    date: '2019-08-22',
    citation: 'AIR 2019 SC 5678',
    description: 'Criminal case involving assault and causing hurt to the victim. Charges under IPC 323 and 324. Medical evidence confirmed injuries. Trial court convicted the accused.',
    sections: ['IPC 323', 'IPC 324', 'IPC 341'],
    judgment: 'Conviction confirmed with reduced sentence.'
  },
  {
    case_id: 'SC/2021/11223',
    title: 'Kumar vs. Sharma - Property Dispute',
    petitioner: 'Rajesh Kumar',
    respondent: 'Vijay Sharma',
    court: 'Supreme Court of India',
    date: '2021-03-10',
    citation: 'AIR 2021 SC 2345',
    description: 'Civil dispute over property ownership of 500 sq yards land in Delhi. Both parties claimed rightful ownership based on sale deeds. Court examined title documents and revenue records.',
    sections: ['Transfer of Property Act Section 54', 'Registration Act'],
    judgment: 'Petition allowed in favor of petitioner.'
  },
  {
    case_id: 'SC/2018/33445',
    title: 'State vs. Mohan Lal - Cheating and Fraud',
    petitioner: 'State of Delhi',
    respondent: 'Mohan Lal',
    court: 'Supreme Court of India',
    date: '2018-11-05',
    citation: 'AIR 2018 SC 7890',
    description: 'Case of cheating and criminal breach of trust. Accused collected money from investors promising high returns. Failed to return money. Charged under IPC 420 and 406.',
    sections: ['IPC 420', 'IPC 406', 'IPC 120B'],
    judgment: 'Guilty. Sentenced to 5 years imprisonment.'
  },
  {
    case_id: 'SC/2020/55667',
    title: 'State of Bihar vs. Raju Kumar - Murder Case',
    petitioner: 'State of Bihar',
    respondent: 'Raju Kumar',
    court: 'Supreme Court of India',
    date: '2020-07-18',
    citation: 'AIR 2020 SC 3456',
    description: 'Murder case under IPC 302. Accused killed victim in property dispute. Evidence included eyewitness testimony and forensic reports. Trial court awarded death penalty, High Court commuted to life imprisonment.',
    sections: ['IPC 302', 'IPC 34'],
    judgment: 'Life imprisonment confirmed.'
  },
  {
    case_id: 'SC/2019/77889',
    title: 'Sunita Devi vs. State of Haryana - Dowry Death',
    petitioner: 'Sunita Devi (through legal heir)',
    respondent: 'State of Haryana',
    court: 'Supreme Court of India',
    date: '2019-12-08',
    citation: 'AIR 2019 SC 6789',
    description: 'Dowry death case under IPC 304B. Victim died within 7 years of marriage due to harassment for dowry. Medical evidence showed unnatural death. In-laws convicted by trial court.',
    sections: ['IPC 304B', 'IPC 498A', 'Dowry Prohibition Act'],
    judgment: 'Conviction upheld. 7 years rigorous imprisonment.'
  },
  {
    case_id: 'SC/2021/99001',
    title: 'State of Tamil Nadu vs. Ganesh - Rape Case',
    petitioner: 'State of Tamil Nadu',
    respondent: 'Ganesh',
    court: 'Supreme Court of India',
    date: '2021-02-14',
    citation: 'AIR 2021 SC 4567',
    description: 'Rape case under IPC 376. Victim identified accused. Medical examination confirmed assault. DNA evidence matched. Trial court convicted accused.',
    sections: ['IPC 376', 'IPC 506', 'POCSO Act'],
    judgment: 'Convicted. 10 years rigorous imprisonment.'
  },
  {
    case_id: 'SC/2018/22334',
    title: 'Workers Union vs. ABC Company - Labor Dispute',
    petitioner: 'Workers Union',
    respondent: 'ABC Manufacturing Company',
    court: 'Supreme Court of India',
    date: '2018-09-30',
    citation: 'AIR 2018 SC 8901',
    description: 'Industrial dispute regarding unfair termination of workers. Company terminated 50 workers without notice. Labor court ruled in favor of workers. Company appealed.',
    sections: ['Industrial Disputes Act 1947', 'Labor Laws'],
    judgment: 'Workers reinstated with back wages.'
  },
  {
    case_id: 'SC/2020/44556',
    title: 'Environment NGO vs. State - Pollution Case',
    petitioner: 'Green Earth Foundation',
    respondent: 'State of Gujarat',
    court: 'Supreme Court of India',
    date: '2020-06-25',
    citation: 'AIR 2020 SC 5678',
    description: 'Public Interest Litigation regarding industrial pollution affecting river water. Multiple factories discharging untreated waste. Environmental impact assessment conducted.',
    sections: ['Environment Protection Act', 'Water Pollution Act'],
    judgment: 'Factories ordered to install treatment plants.'
  },
  {
    case_id: 'SC/2019/66778',
    title: 'Consumer Forum vs. Telecom Company - Consumer Rights',
    petitioner: 'Amit Verma',
    respondent: 'XYZ Telecom Ltd',
    court: 'Supreme Court of India',
    date: '2019-10-12',
    citation: 'AIR 2019 SC 7891',
    description: 'Consumer complaint regarding deficient service and wrongful charges. Telecom company failed to resolve complaints. District forum ordered refund and compensation.',
    sections: ['Consumer Protection Act 2019'],
    judgment: 'Full refund with 12% interest and compensation.'
  }
];

async function downloadFromGitHub() {
  console.log('🔍 Attempting to download from GitHub repositories...\n');
  
  for (const url of GITHUB_URLS) {
    try {
      console.log(`Trying: ${url}`);
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data && Array.isArray(response.data)) {
        console.log(`✅ Successfully downloaded ${response.data.length} cases from GitHub!\n`);
        return response.data;
      }
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
  
  console.log('\n⚠️  Could not download from GitHub. Using built-in sample dataset of 10 cases.\n');
  return SAMPLE_CASES;
}

async function generateMoreCases(baseCases, totalNeeded) {
  console.log(`📝 Generating ${totalNeeded} cases from base dataset...\n`);
  
  const allCases = [];
  const multiplier = Math.ceil(totalNeeded / baseCases.length);
  
  for (let i = 0; i < multiplier && allCases.length < totalNeeded; i++) {
    for (let j = 0; j < baseCases.length && allCases.length < totalNeeded; j++) {
      const baseCase = baseCases[j];
      const uniqueId = `${Date.now()}-${allCases.length}`;
      
      allCases.push({
        ...baseCase,
        case_id: `SC/${new Date().getFullYear()}/${String(allCases.length + 1).padStart(5, '0')}`,
        title: `${baseCase.title} (${allCases.length + 1})`,
        date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      });
    }
  }
  
  return allCases.slice(0, totalNeeded);
}

async function importCasesToDatabase(cases, userId) {
  console.log(`📦 Importing ${cases.length} cases into database...\n`);
  
  let imported = 0;
  let failed = 0;
  
  for (const item of cases) {
    try {
      await Case.create({
        caseNumber: item.case_id || `SC/${Date.now()}-${imported}`,
        title: (item.title || item.case_name || 'Untitled Case').substring(0, 200),
        description: (item.description || item.summary || item.judgment || 'No description available').substring(0, 500),
        summary: (item.description || item.judgment || item.summary || '').substring(0, 1000),
        createdBy: userId,
        ipcTags: item.sections || [item.citation] || [],
        entities: [item.petitioner, item.respondent, item.court].filter(Boolean),
        status: 'completed',
        createdAt: item.date ? new Date(item.date) : new Date()
      });
      
      imported++;
      
      if (imported % 10 === 0) {
        console.log(`✅ Imported ${imported}/${cases.length} cases...`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Error importing case ${imported + failed}:`, error.message);
    }
  }
  
  return { imported, failed };
}

async function main() {
  try {
    console.log('🚀 Starting Import Process...\n');
    console.log('=' .repeat(50));
    
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...');
    // await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/legal-docs');
    await mongoose.connect('mongodb+srv://Amit:Amit12345@cluster0.8z9yxem.mongodb.net/casemadad?retryWrites=true&w=majority');

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get user ID (you'll need to replace this with actual user ID)
    console.log('👤 Looking for user...');
    const User = (await import('./models/User.js')).default;
    let user = await User.findOne();
    
    if (!user) {
      console.log('⚠️  No user found. Creating default user...');
      user = await User.create({
        name: 'System Admin',
        email: 'admin@legal-docs.com',
        password: 'admin123',
        role: 'judge'
      });
      console.log('✅ Created default user\n');
    } else {
      console.log(`✅ Found user: ${user.name}\n`);
    }
    
    // Ask how many cases to import
    console.log('📊 How many cases do you want to import?');
    console.log('   - Enter 10 for quick demo');
    console.log('   - Enter 50 for good demo');
    console.log('   - Enter 100 for impressive demo');
    console.log('   - Enter 500 for production-like demo\n');
    
    // For now, we'll import 100 cases (you can change this)
    const CASES_TO_IMPORT = 100;
    console.log(`📌 Importing ${CASES_TO_IMPORT} cases...\n`);
    
    // Download or use sample data
    let baseCases = await downloadFromGitHub();
    
    // Generate more cases if needed
    let allCases = baseCases;
    if (baseCases.length < CASES_TO_IMPORT) {
      allCases = await generateMoreCases(baseCases, CASES_TO_IMPORT);
    } else {
      allCases = baseCases.slice(0, CASES_TO_IMPORT);
    }
    
    // Import to database
    const result = await importCasesToDatabase(allCases, user._id);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 IMPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Successfully imported: ${result.imported} cases`);
    console.log(`❌ Failed: ${result.failed} cases`);
    console.log(`📈 Total in database: ${result.imported} cases`);
    console.log('='.repeat(50));
    console.log('\n🎉 Import completed successfully!');
    console.log('🌐 Open http://localhost:3000 to view cases\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the import
main();
