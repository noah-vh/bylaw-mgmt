#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Node.js wrapper for Python bylaw scrapers
 * Usage: npm run scrape [municipality] [options]
 * Examples:
 *   npm run scrape toronto
 *   npm run scrape toronto,ottawa,hamilton
 *   npm run scrape all
 */

// Configuration
const PYTHON_VENV_PATH = path.join(__dirname, '..', 'python-env');
const SCRAPERS_PATH = path.join(__dirname, '..', '..', 'bylaw_scrapers');
const SCRAPER_SCRIPT = path.join(SCRAPERS_PATH, 'run_scraper.py');

// Municipality mappings - maps frontend names to scraper names
const MUNICIPALITY_MAPPINGS = {
  'toronto': 'toronto_scraper',
  'ottawa': 'ottawa_scraper', 
  'hamilton': 'hamilton_scraper',
  'mississauga': 'mississauga_scraper',
  'brampton': 'brampton_scraper',
  'london': 'london_scraper',
  'markham': 'markham_scraper',
  'vaughan': 'vaughan_scraper',
  'kitchener': 'kitchener_scraper',
  'windsor': 'windsor_scraper'
};

// Available scrapers (based on actual scraper implementations)
const AVAILABLE_SCRAPERS = Object.values(MUNICIPALITY_MAPPINGS);

function getActivePython() {
  const venvPython = path.join(PYTHON_VENV_PATH, 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  
  // Fallback to system python
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    return 'python3';
  } catch {
    try {
      execSync('python --version', { stdio: 'ignore' });
      return 'python';
    } catch {
      throw new Error('No Python installation found. Please install Python or run setup-python.sh');
    }
  }
}

function validateScraperPath() {
  if (!fs.existsSync(SCRAPERS_PATH)) {
    console.error(`❌ Scrapers directory not found: ${SCRAPERS_PATH}`);
    console.error('Please ensure the bylaw_scrapers repository is cloned at the expected location.');
    process.exit(1);
  }
  
  if (!fs.existsSync(SCRAPER_SCRIPT)) {
    console.error(`❌ Scraper script not found: ${SCRAPER_SCRIPT}`);
    console.error('Please ensure the scraper script exists in the bylaw_scrapers repository.');
    process.exit(1);
  }
}

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

function runScraper(municipality, options = {}) {
  const scraperName = MUNICIPALITY_MAPPINGS[municipality];
  if (!scraperName) {
    throw new Error(`No scraper found for municipality: ${municipality}`);
  }
  
  console.log(`🔄 Starting scraper for ${municipality} (${scraperName})...`);
  
  const python = getActivePython();
  const args = [SCRAPER_SCRIPT, scraperName];
  
  // Add options
  if (options.dryRun) args.push('--dry-run');
  if (options.verbose) args.push('--verbose');
  if (options.maxPages) args.push('--max-pages', options.maxPages);
  
  return new Promise((resolve, reject) => {
    const childProcess = spawn(python, args, {
      cwd: SCRAPERS_PATH,
      stdio: 'inherit',
      env: {
        ...process.env,
        PYTHONPATH: SCRAPERS_PATH
      }
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Scraper completed successfully for ${municipality}`);
        resolve({ municipality, success: true, code });
      } else {
        console.error(`❌ Scraper failed for ${municipality} (exit code: ${code})`);
        reject(new Error(`Scraper failed with exit code: ${code}`));
      }
    });
    
    process.on('error', (error) => {
      console.error(`❌ Failed to start scraper for ${municipality}:`, error.message);
      reject(error);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const municipalityArg = args[0] || 'all';
  
  // Parse command line options
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose'),
    maxPages: args.find(arg => arg.startsWith('--max-pages='))?.split('=')[1]
  };
  
  console.log('🚀 Bylaw Scraper Tool');
  console.log('====================');
  
  try {
    validateScraperPath();
    
    const municipalities = parseMunicipalities(municipalityArg);
    
    if (municipalities.length === 0) {
      console.error('❌ No valid municipalities specified');
      console.log('\nAvailable municipalities:');
      Object.keys(MUNICIPALITY_MAPPINGS).forEach(m => {
        console.log(`  - ${m}`);
      });
      process.exit(1);
    }
    
    console.log(`📋 Processing ${municipalities.length} municipality(ies): ${municipalities.join(', ')}`);
    
    if (options.dryRun) {
      console.log('🔍 DRY RUN MODE - No actual scraping will be performed');
    }
    
    const results = [];
    
    // Run scrapers sequentially to avoid overwhelming servers
    for (const municipality of municipalities) {
      try {
        const result = await runScraper(municipality, options);
        results.push(result);
      } catch (error) {
        results.push({ municipality, success: false, error: error.message });
        
        // Continue with other municipalities unless it's a critical error
        if (error.message.includes('Python installation')) {
          break;
        }
      }
    }
    
    // Summary
    console.log('\n📊 SCRAPING SUMMARY');
    console.log('==================');
    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;
    
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed municipalities:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`  - ${r.municipality}: ${r.error}`);
      });
    }
    
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Bylaw Scraper Tool

Usage: npm run scrape [municipality] [options]

Arguments:
  municipality    Municipality name or comma-separated list (default: all)
                  Available: ${Object.keys(MUNICIPALITY_MAPPINGS).join(', ')}

Options:
  --dry-run       Preview what would be scraped without actual execution
  --verbose       Enable verbose logging
  --max-pages=N   Limit scraping to N pages per municipality
  --help, -h      Show this help message

Examples:
  npm run scrape toronto
  npm run scrape toronto,ottawa,hamilton
  npm run scrape all
  npm run scrape toronto -- --dry-run --verbose
  npm run scrape ottawa -- --max-pages=5
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

module.exports = { runScraper, MUNICIPALITY_MAPPINGS };