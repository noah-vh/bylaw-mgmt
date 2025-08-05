#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Batch content analysis script
 * Usage: npm run analyze [municipality] [options]
 * Examples:
 *   npm run analyze toronto
 *   npm run analyze all
 *   npm run analyze toronto -- --batch-size=5
 */

// Configuration
const PYTHON_VENV_PATH = path.join(__dirname, '..', 'python-env');
const ANALYSIS_SCRIPT = path.join(__dirname, 'python', 'analyze_content.py');

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

function validateAnalyzerPath() {
  if (!fs.existsSync(ANALYSIS_SCRIPT)) {
    console.log(`⚠️  Analysis script not found at ${ANALYSIS_SCRIPT}`);
    console.log('Creating analysis script...');
    createAnalysisScript();
  }
}

function createAnalysisScript() {
  const scriptDir = path.dirname(ANALYSIS_SCRIPT);
  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
  }
  
  const analysisCode = `#!/usr/bin/env python3
"""
Batch content analysis script for bylaw documents
Analyzes document content for ADU relevance and assigns confidence scores
"""

import os
import sys
import argparse
import logging
import re
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ContentAnalyzer:
    def __init__(self, db_config):
        self.db_config = db_config
        self.connection = None
        
        # ADU-related keywords and phrases (weighted by importance)
        self.adu_keywords = {
            # Primary ADU terms (high weight)
            'accessory dwelling unit': 1.0,
            'adu': 1.0,
            'secondary dwelling unit': 1.0,
            'sdu': 1.0,
            'secondary suite': 0.9,
            'granny flat': 0.9,
            'laneway house': 0.9,
            'coach house': 0.8,
            'carriage house': 0.8,
            'garden suite': 0.8,
            'basement apartment': 0.7,
            'apartment unit': 0.6,
            
            # Related housing terms (medium weight)
            'affordable housing': 0.6,
            'housing density': 0.6,
            'multi-unit': 0.5,
            'duplex': 0.5,
            'triplex': 0.5,
            'fourplex': 0.5,
            'rental unit': 0.5,
            'dwelling unit': 0.4,
            'residential unit': 0.4,
            
            # Zoning and regulatory terms (medium weight)
            'zoning': 0.4,
            'residential zoning': 0.6,
            'r1 zoning': 0.5,
            'r2 zoning': 0.5,
            'single family': 0.4,
            'multi-family': 0.5,
            'permitted use': 0.3,
            'conditional use': 0.3,
            
            # Context terms (lower weight)
            'parking requirement': 0.3,
            'setback': 0.2,
            'lot coverage': 0.2,
            'height restriction': 0.2,
            'building permit': 0.3,
            'development permit': 0.3,
        }
        
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(**self.db_config)
            logger.info("Database connection established")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
            
    def get_pending_documents(self, municipality=None, limit=None):
        """Get documents that need content analysis"""
        cursor = self.connection.cursor(cursor_factory=RealDictCursor)
        
        query = '''
            SELECT d.id, d.title, d.content, d.filename,
                   m.name as municipality_name
            FROM pdf_documents d
            JOIN municipalities m ON d.municipality_id = m.id
            WHERE d.extraction_status = 'completed' 
            AND d.content IS NOT NULL
            AND (d.analysis_status IS NULL OR d.analysis_status = 'pending')
        '''
        params = []
        
        if municipality:
            query += ' AND LOWER(m.name) LIKE %s'
            params.append(f'%{municipality.lower()}%')
            
        query += ' ORDER BY d.date_found DESC'
        
        if limit:
            query += ' LIMIT %s'
            params.append(limit)
            
        cursor.execute(query, params)
        return cursor.fetchall()
        
    def analyze_content(self, content):
        """Analyze document content for ADU relevance"""
        if not content:
            return False, 0.0, "No content to analyze"
            
        # Convert to lowercase for analysis
        content_lower = content.lower()
        
        # Count keyword matches and calculate weighted score
        total_score = 0.0
        matches = []
        
        for keyword, weight in self.adu_keywords.items():
            # Count occurrences (case-insensitive)
            count = len(re.findall(r'\\b' + re.escape(keyword) + r'\\b', content_lower))
            if count > 0:
                # Apply diminishing returns for multiple occurrences
                keyword_score = weight * min(count, 3) / 3
                total_score += keyword_score
                matches.append({
                    'keyword': keyword,
                    'count': count,
                    'weight': weight,
                    'score': keyword_score
                })
        
        # Normalize score (0-1 range)
        # Max theoretical score is sum of all weights
        max_score = sum(self.adu_keywords.values())
        confidence = min(total_score / max_score, 1.0)
        
        # Determine relevance (threshold of 0.1)
        is_relevant = confidence >= 0.1
        
        # Create analysis summary
        analysis_summary = {
            'matches': matches,
            'total_matches': len(matches),
            'confidence': confidence,
            'is_relevant': is_relevant
        }
        
        return is_relevant, confidence, analysis_summary
        
    def update_document_analysis(self, document_id, is_relevant, confidence, analysis_data, error_message=None):
        """Update document with analysis results"""
        cursor = self.connection.cursor()
        
        if error_message:
            cursor.execute('''
                UPDATE pdf_documents 
                SET analysis_status = 'failed',
                    analysis_error = %s,
                    analysis_completed_at = NOW()
                WHERE id = %s
            ''', (error_message, document_id))
        else:
            cursor.execute('''
                UPDATE pdf_documents 
                SET is_adu_relevant = %s,
                    relevance_confidence = %s,
                    analysis_status = 'completed',
                    analysis_completed_at = NOW(),
                    analysis_error = NULL,
                    analysis_data = %s
                WHERE id = %s
            ''', (is_relevant, confidence, str(analysis_data), document_id))
            
        self.connection.commit()
        
    def process_document(self, document):
        """Process a single document"""
        logger.info(f"Analyzing: {document['title']}")
        
        # Update status to processing
        cursor = self.connection.cursor()
        cursor.execute('''
            UPDATE pdf_documents 
            SET analysis_status = 'processing'
            WHERE id = %s
        ''', (document['id'],))
        self.connection.commit()
        
        try:
            # Analyze content
            is_relevant, confidence, analysis_data = self.analyze_content(document['content'])
            
            # Update with results
            self.update_document_analysis(
                document['id'], 
                is_relevant, 
                confidence, 
                analysis_data
            )
            
            return {
                'id': document['id'],
                'title': document['title'],
                'success': True,
                'is_relevant': is_relevant,
                'confidence': confidence,
                'matches': len(analysis_data.get('matches', [])) if isinstance(analysis_data, dict) else 0
            }
            
        except Exception as e:
            error_msg = f"Analysis error: {str(e)}"
            self.update_document_analysis(document['id'], False, 0.0, None, error_msg)
            
            return {
                'id': document['id'],
                'title': document['title'],
                'success': False,
                'error': error_msg
            }
        
    def run_batch_analysis(self, municipality=None, batch_size=10, max_workers=3):
        """Run batch analysis process"""
        self.connect_db()
        
        documents = self.get_pending_documents(municipality, batch_size)
        
        if not documents:
            logger.info("No documents found for analysis")
            return []
            
        logger.info(f"Found {len(documents)} documents to analyze")
        
        results = []
        
        # Process documents with limited concurrency
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_doc = {
                executor.submit(self.process_document, doc): doc 
                for doc in documents
            }
            
            for future in as_completed(future_to_doc):
                doc = future_to_doc[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    logger.error(f"Document processing failed: {e}")
                    results.append({
                        'id': doc['id'],
                        'title': doc['title'],
                        'success': False,
                        'error': str(e)
                    })
                    
        return results

def main():
    parser = argparse.ArgumentParser(description='Batch content analysis tool')
    parser.add_argument('municipality', nargs='?', help='Municipality name (optional)')
    parser.add_argument('--batch-size', type=int, default=10, help='Number of documents to process')
    parser.add_argument('--max-workers', type=int, default=3, help='Maximum concurrent workers')
    parser.add_argument('--verbose', action='store_true', help='Enable verbose logging')
    
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
        
    # Database configuration from environment
    db_config = {
        'host': os.getenv('SUPABASE_DB_HOST', 'localhost'),
        'port': int(os.getenv('SUPABASE_DB_PORT', '5432')),
        'database': os.getenv('SUPABASE_DB_NAME', 'postgres'),
        'user': os.getenv('SUPABASE_DB_USER', 'postgres'),
        'password': os.getenv('SUPABASE_DB_PASSWORD', ''),
    }
    
    try:
        analyzer = ContentAnalyzer(db_config)
        results = analyzer.run_batch_analysis(
            municipality=args.municipality,
            batch_size=args.batch_size,
            max_workers=args.max_workers
        )
        
        # Print summary
        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful
        relevant = sum(1 for r in results if r.get('is_relevant', False))
        
        print(f"\\n📊 ANALYSIS SUMMARY")
        print(f"==================")
        print(f"✅ Analyzed: {successful}")
        print(f"❌ Failed: {failed}")
        print(f"🎯 ADU Relevant: {relevant}/{successful}")
        
        if failed > 0:
            print(f"\\n❌ Failed documents:")
            for result in results:
                if not result['success']:
                    print(f"  - {result['title']}: {result['error']}")
                    
        if successful > 0:
            avg_confidence = sum(r.get('confidence', 0) for r in results if r['success']) / successful
            print(f"\\n📈 Average confidence: {avg_confidence:.2%}")
            
        sys.exit(0 if failed == 0 else 1)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
`;
  
  fs.writeFileSync(ANALYSIS_SCRIPT, analysisCode);
  fs.chmodSync(ANALYSIS_SCRIPT, '755');
  console.log(`✅ Created analysis script at ${ANALYSIS_SCRIPT}`);
}

function parseMunicipalities(input) {
  if (!input || input === 'all') {
    return null; // null means all municipalities
  }
  
  return input.toLowerCase().split(',').map(m => m.trim()).filter(m => {
    if (!MUNICIPALITY_MAPPINGS[m]) {
      console.warn(`⚠️  Unknown municipality: ${m}`);
      return false;
    }
    return true;
  });
}

function runAnalysis(municipalities, options = {}) {
  console.log(`🔄 Starting content analysis...`);
  
  const python = getActivePython();
  const args = [ANALYSIS_SCRIPT];
  
  // Add municipality filter if specified
  if (municipalities && municipalities.length === 1) {
    args.push(municipalities[0]);
  }
  
  // Add options
  if (options.batchSize) args.push('--batch-size', options.batchSize);
  if (options.maxWorkers) args.push('--max-workers', options.maxWorkers);
  if (options.verbose) args.push('--verbose');
  
  return new Promise((resolve, reject) => {
    const childProcess = spawn(python, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        PYTHONPATH: path.dirname(ANALYSIS_SCRIPT)
      }
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Content analysis completed successfully`);
        resolve({ success: true, code });
      } else {
        console.error(`❌ Content analysis failed (exit code: ${code})`);
        reject(new Error(`Analysis failed with exit code: ${code}`));
      }
    });
    
    childProcess.on('error', (error) => {
      console.error(`❌ Failed to start analysis:`, error.message);
      reject(error);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const municipalityArg = args[0];
  
  // Parse command line options
  const options = {
    batchSize: args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '10',
    maxWorkers: args.find(arg => arg.startsWith('--max-workers='))?.split('=')[1] || '3',
    verbose: args.includes('--verbose')
  };
  
  console.log('🧠 Content Analysis Tool');
  console.log('========================');
  
  try {
    validateAnalyzerPath();
    
    const municipalities = parseMunicipalities(municipalityArg);
    
    if (municipalities && municipalities.length === 0) {
      console.error('❌ No valid municipalities specified');
      console.log('\\nAvailable municipalities:');
      Object.keys(MUNICIPALITY_MAPPINGS).forEach(m => {
        console.log(`  - ${m}`);
      });
      process.exit(1);
    }
    
    if (municipalities) {
      console.log(`📋 Processing municipalities: ${municipalities.join(', ')}`);
    } else {
      console.log(`📋 Processing all municipalities`);
    }
    
    console.log(`⚙️  Batch size: ${options.batchSize}, Max workers: ${options.maxWorkers}`);
    
    await runAnalysis(municipalities, options);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Content Analysis Tool

Usage: npm run analyze [municipality] [options]

Arguments:
  municipality    Municipality name or comma-separated list (default: all)
                  Available: ${Object.keys(MUNICIPALITY_MAPPINGS).join(', ')}

Options:
  --batch-size=N    Number of documents to process in batch (default: 10)
  --max-workers=N   Maximum concurrent workers (default: 3)
  --verbose         Enable verbose logging
  --help, -h        Show this help message

Examples:
  npm run analyze
  npm run analyze toronto
  npm run analyze toronto,ottawa
  npm run analyze toronto -- --batch-size=5 --max-workers=2
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

module.exports = { runAnalysis, MUNICIPALITY_MAPPINGS };