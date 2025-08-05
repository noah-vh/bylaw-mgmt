#!/usr/bin/env node

const { runScraper } = require('./scrape');
const { runExtraction } = require('./extract');
const { runAnalysis } = require('./analyze');

/**
 * Full pipeline workflow script
 * Usage: npm run process [municipality] [options]
 * Examples:
 *   npm run process toronto
 *   npm run process all
 *   npm run process toronto -- --skip-scraping --batch-size=5
 */

// Municipality mappings
const MUNICIPALITY_MAPPINGS = {
  'toronto': 'toronto',
  'ottawa': 'ottawa', 
  'hamilton': 'hamilton',
  'mississauga': 'mississauga',
  'brampton': 'brampton',
  'london': 'london',
  'markham': 'markham',
  'vaughan': 'vaughan',
  'kitchener': 'kitchener',
  'windsor': 'windsor'
};

function parseMunicipalities(input) {
  if (!input || input === 'all') {
    return Object.keys(MUNICIPALITY_MAPPINGS);
  }
  
  return input.toLowerCase().split(',').map(m => m.trim()).filter(m => {
    if (!MUNICIPALITY_MAPPINGS[m]) {
      console.warn(`⚠️  Unknown municipality: ${m}`);
      return false;
    }
    return true;
  });
}

async function runFullPipeline(municipalities, options = {}) {
  const results = {
    scraping: [],
    extraction: null,
    analysis: null,
    errors: []
  };
  
  console.log('🚀 Starting Full Processing Pipeline');
  console.log('====================================');
  console.log(`📋 Processing: ${municipalities.join(', ')}`);
  
  const startTime = Date.now();
  
  try {
    // Phase 1: Scraping (if not skipped)
    if (!options.skipScraping) {
      console.log('\\n🕷️  PHASE 1: SCRAPING');
      console.log('====================');
      
      for (const municipality of municipalities) {
        try {
          console.log(`\\n🔄 Scraping ${municipality}...`);
          const scraperOptions = {
            dryRun: options.dryRun,
            verbose: options.verbose,
            maxPages: options.maxPages
          };
          
          const result = await runScraper(municipality, scraperOptions);
          results.scraping.push(result);
          
          // Small delay between municipalities to be respectful
          if (municipalities.length > 1) {
            console.log('⏳ Waiting 30 seconds before next municipality...');
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
          
        } catch (error) {
          results.errors.push(`Scraping ${municipality}: ${error.message}`);
          results.scraping.push({ municipality, success: false, error: error.message });
        }
      }
    } else {
      console.log('\\n⏭️  PHASE 1: SCRAPING (SKIPPED)');
      console.log('===============================');
    }
    
    // Phase 2: Extraction (if scraping was successful or skipped)
    const shouldExtract = options.skipScraping || results.scraping.some(r => r.success);
    
    if (shouldExtract) {
      console.log('\\n📄 PHASE 2: PDF EXTRACTION');
      console.log('===========================');
      
      try {
        const extractionOptions = {
          batchSize: options.batchSize || '20',
          maxWorkers: options.maxWorkers || '3',
          verbose: options.verbose
        };
        
        results.extraction = await runExtraction(
          municipalities.length === Object.keys(MUNICIPALITY_MAPPINGS).length ? null : municipalities,
          extractionOptions
        );
        
      } catch (error) {
        results.errors.push(`Extraction: ${error.message}`);
        console.error(`❌ Extraction phase failed: ${error.message}`);
      }
    } else {
      console.log('\\n⏭️  PHASE 2: PDF EXTRACTION (SKIPPED - No successful scraping)');
      console.log('===============================================================');
    }
    
    // Phase 3: Analysis (if extraction was successful)
    const shouldAnalyze = results.extraction?.success;
    
    if (shouldAnalyze) {
      console.log('\\n🧠 PHASE 3: CONTENT ANALYSIS');
      console.log('=============================');
      
      try {
        const analysisOptions = {
          batchSize: options.batchSize || '15',
          maxWorkers: options.maxWorkers || '4',
          verbose: options.verbose
        };
        
        results.analysis = await runAnalysis(
          municipalities.length === Object.keys(MUNICIPALITY_MAPPINGS).length ? null : municipalities,
          analysisOptions
        );
        
      } catch (error) {
        results.errors.push(`Analysis: ${error.message}`);
        console.error(`❌ Analysis phase failed: ${error.message}`);
      }
    } else {
      console.log('\\n⏭️  PHASE 3: CONTENT ANALYSIS (SKIPPED - No successful extraction)');
      console.log('================================================================');
    }
    
  } catch (error) {
    results.errors.push(`Pipeline: ${error.message}`);
  }
  
  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);
  
  // Final Summary
  console.log('\\n📊 PIPELINE SUMMARY');
  console.log('===================');
  console.log(`⏱️  Total duration: ${Math.floor(duration / 60)}m ${duration % 60}s`);
  
  if (!options.skipScraping) {
    const successfulScrapes = results.scraping.filter(r => r.success).length;
    const failedScrapes = results.scraping.length - successfulScrapes;
    console.log(`🕷️  Scraping: ${successfulScrapes} successful, ${failedScrapes} failed`);
  }
  
  if (results.extraction) {
    console.log(`📄 Extraction: ${results.extraction.success ? 'completed' : 'failed'}`);
  }
  
  if (results.analysis) {
    console.log(`🧠 Analysis: ${results.analysis.success ? 'completed' : 'failed'}`);
  }
  
  if (results.errors.length > 0) {
    console.log('\\n❌ Errors encountered:');
    results.errors.forEach(error => {
      console.log(`  - ${error}`);
    });
  }
  
  // Determine overall success
  const overallSuccess = results.errors.length === 0 && (
    options.skipScraping || results.scraping.some(r => r.success)
  );
  
  if (overallSuccess) {
    console.log('\\n🎉 Pipeline completed successfully!');
    return 0;
  } else {
    console.log('\\n💥 Pipeline completed with errors');
    return 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const municipalityArg = args[0] || 'all';
  
  // Parse command line options
  const options = {
    skipScraping: args.includes('--skip-scraping'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    batchSize: args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1],
    maxWorkers: args.find(arg => arg.startsWith('--max-workers='))?.split('=')[1],
    maxPages: args.find(arg => arg.startsWith('--max-pages='))?.split('=')[1]
  };
  
  try {
    const municipalities = parseMunicipalities(municipalityArg);
    
    if (municipalities.length === 0) {
      console.error('❌ No valid municipalities specified');
      console.log('\\nAvailable municipalities:');
      Object.keys(MUNICIPALITY_MAPPINGS).forEach(m => {
        console.log(`  - ${m}`);
      });
      process.exit(1);
    }
    
    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - Pipeline preview');
      console.log('==================================');
      console.log(`Municipalities: ${municipalities.join(', ')}`);
      console.log(`Skip scraping: ${options.skipScraping}`);
      console.log(`Batch size: ${options.batchSize || 'default'}`);
      console.log(`Max workers: ${options.maxWorkers || 'default'}`);
      console.log(`Max pages: ${options.maxPages || 'unlimited'}`);
      console.log('\\n✅ Dry run completed - no actual processing performed');
      process.exit(0);
    }
    
    const exitCode = await runFullPipeline(municipalities, options);
    process.exit(exitCode);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Full Processing Pipeline

Usage: npm run process [municipality] [options]

Arguments:
  municipality      Municipality name or comma-separated list (default: all)
                    Available: ${Object.keys(MUNICIPALITY_MAPPINGS).join(', ')}

Options:
  --skip-scraping   Skip the scraping phase (only run extraction & analysis)
  --dry-run         Preview pipeline without actual execution
  --batch-size=N    Number of documents to process in batches (default: varies by phase)
  --max-workers=N   Maximum concurrent workers (default: varies by phase)
  --max-pages=N     Limit scraping to N pages per municipality
  --verbose         Enable verbose logging
  --help, -h        Show this help message

Pipeline Phases:
  1. Scraping       Download new bylaw documents from municipality websites
  2. Extraction     Extract text content from downloaded PDFs
  3. Analysis       Analyze content for ADU relevance and confidence scoring

Examples:
  npm run process                           # Process all municipalities
  npm run process toronto                   # Process Toronto only
  npm run process toronto,ottawa,hamilton   # Process multiple municipalities
  npm run process -- --skip-scraping       # Skip scraping, only extract & analyze
  npm run process toronto -- --dry-run     # Preview what would be processed
  npm run process all -- --batch-size=10 --max-workers=2 --verbose
`);
  process.exit(0);
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { runFullPipeline, MUNICIPALITY_MAPPINGS };