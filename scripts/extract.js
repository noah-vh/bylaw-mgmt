#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Batch PDF extraction script
 * Usage: npm run extract [municipality] [options]
 * Examples:
 *   npm run extract toronto
 *   npm run extract all
 *   npm run extract toronto -- --batch-size=10
 */

// Configuration
const PYTHON_VENV_PATH = path.join(__dirname, '..', 'python-env');
const EXTRACTION_SCRIPT = path.join(__dirname, 'python', 'extract_pdfs.py');

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

function validateExtractorPath() {
  if (!fs.existsSync(EXTRACTION_SCRIPT)) {
    console.log(`⚠️  Extraction script not found at ${EXTRACTION_SCRIPT}`);
    console.log('Creating extraction script...');
    createExtractionScript();
  }
}

function createExtractionScript() {
  const scriptDir = path.dirname(EXTRACTION_SCRIPT);
  if (!fs.existsSync(scriptDir)) {
    fs.mkdirSync(scriptDir, { recursive: true });
  }
  
  const extractionCode = `#!/usr/bin/env python3
"""
Batch PDF extraction script for bylaw documents
Extracts text content from downloaded PDFs and updates database
"""

import os
import sys
import argparse
import logging
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
import PyPDF2
import pdfplumber
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class PDFExtractor:
    def __init__(self, db_config):
        self.db_config = db_config
        self.connection = None
        
    def connect_db(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(**self.db_config)
            logger.info("Database connection established")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
            
    def get_pending_documents(self, municipality=None, limit=None):
        """Get documents that need text extraction"""
        cursor = self.connection.cursor(cursor_factory=RealDictCursor)
        
        query = '''
            SELECT d.id, d.title, d.filename, d.url, d.local_path,
                   m.name as municipality_name
            FROM pdf_documents d
            JOIN municipalities m ON d.municipality_id = m.id
            WHERE d.download_status = 'completed' 
            AND (d.extraction_status IS NULL OR d.extraction_status = 'pending')
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
        
    def extract_pdf_text(self, document):
        """Extract text from a single PDF document"""
        try:
            if not document['local_path'] or not os.path.exists(document['local_path']):
                return None, "PDF file not found locally"
                
            text_content = ""
            
            # Try pdfplumber first (better for complex layouts)
            try:
                with pdfplumber.open(document['local_path']) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text_content += page_text + "\\n\\n"
            except Exception as e:
                logger.warning(f"pdfplumber failed for {document['filename']}: {e}")
                
                # Fallback to PyPDF2
                try:
                    with open(document['local_path'], 'rb') as file:
                        pdf_reader = PyPDF2.PdfReader(file)
                        for page in pdf_reader.pages:
                            text_content += page.extract_text() + "\\n\\n"
                except Exception as e2:
                    return None, f"Both pdfplumber and PyPDF2 failed: {e2}"
            
            # Clean up text
            text_content = text_content.strip()
            if not text_content:
                return None, "No text content could be extracted"
                
            return text_content, None
            
        except Exception as e:
            return None, f"Extraction error: {str(e)}"
            
    def update_document_content(self, document_id, content, error_message=None):
        """Update document with extracted content or error"""
        cursor = self.connection.cursor()
        
        if content:
            cursor.execute('''
                UPDATE pdf_documents 
                SET content = %s, 
                    extraction_status = 'completed',
                    extraction_completed_at = NOW(),
                    extraction_error = NULL
                WHERE id = %s
            ''', (content, document_id))
            logger.info(f"Updated document {document_id} with extracted content")
        else:
            cursor.execute('''
                UPDATE pdf_documents 
                SET extraction_status = 'failed',
                    extraction_error = %s,
                    extraction_completed_at = NOW()
                WHERE id = %s
            ''', (error_message, document_id))
            logger.error(f"Failed to extract document {document_id}: {error_message}")
            
        self.connection.commit()
        
    def process_document(self, document):
        """Process a single document"""
        logger.info(f"Extracting: {document['title']}")
        
        # Update status to processing
        cursor = self.connection.cursor()
        cursor.execute('''
            UPDATE pdf_documents 
            SET extraction_status = 'processing'
            WHERE id = %s
        ''', (document['id'],))
        self.connection.commit()
        
        # Extract content
        content, error = self.extract_pdf_text(document)
        
        # Update with results
        self.update_document_content(document['id'], content, error)
        
        return {
            'id': document['id'],
            'title': document['title'],
            'success': content is not None,
            'error': error
        }
        
    def run_batch_extraction(self, municipality=None, batch_size=5, max_workers=2):
        """Run batch extraction process"""
        self.connect_db()
        
        documents = self.get_pending_documents(municipality, batch_size)
        
        if not documents:
            logger.info("No documents found for extraction")
            return []
            
        logger.info(f"Found {len(documents)} documents to process")
        
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
    parser = argparse.ArgumentParser(description='Batch PDF extraction tool')
    parser.add_argument('municipality', nargs='?', help='Municipality name (optional)')
    parser.add_argument('--batch-size', type=int, default=10, help='Number of documents to process')
    parser.add_argument('--max-workers', type=int, default=2, help='Maximum concurrent workers')
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
        extractor = PDFExtractor(db_config)
        results = extractor.run_batch_extraction(
            municipality=args.municipality,
            batch_size=args.batch_size,
            max_workers=args.max_workers
        )
        
        # Print summary
        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful
        
        print(f"\\n📊 EXTRACTION SUMMARY")
        print(f"====================")
        print(f"✅ Successful: {successful}")
        print(f"❌ Failed: {failed}")
        
        if failed > 0:
            print(f"\\n❌ Failed documents:")
            for result in results:
                if not result['success']:
                    print(f"  - {result['title']}: {result['error']}")
                    
        sys.exit(0 if failed == 0 else 1)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
`;
  
  fs.writeFileSync(EXTRACTION_SCRIPT, extractionCode);
  fs.chmodSync(EXTRACTION_SCRIPT, '755');
  console.log(`✅ Created extraction script at ${EXTRACTION_SCRIPT}`);
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

function runExtraction(municipalities, options = {}) {
  console.log(`🔄 Starting PDF extraction...`);
  
  const python = getActivePython();
  const args = [EXTRACTION_SCRIPT];
  
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
        PYTHONPATH: path.dirname(EXTRACTION_SCRIPT)
      }
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ PDF extraction completed successfully`);
        resolve({ success: true, code });
      } else {
        console.error(`❌ PDF extraction failed (exit code: ${code})`);
        reject(new Error(`Extraction failed with exit code: ${code}`));
      }
    });
    
    childProcess.on('error', (error) => {
      console.error(`❌ Failed to start extraction:`, error.message);
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
    maxWorkers: args.find(arg => arg.startsWith('--max-workers='))?.split('=')[1] || '2',
    verbose: args.includes('--verbose')
  };
  
  console.log('📄 PDF Extraction Tool');
  console.log('======================');
  
  try {
    validateExtractorPath();
    
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
    
    await runExtraction(municipalities, options);
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
PDF Extraction Tool

Usage: npm run extract [municipality] [options]

Arguments:
  municipality    Municipality name or comma-separated list (default: all)
                  Available: ${Object.keys(MUNICIPALITY_MAPPINGS).join(', ')}

Options:
  --batch-size=N    Number of documents to process in batch (default: 10)
  --max-workers=N   Maximum concurrent workers (default: 2)
  --verbose         Enable verbose logging
  --help, -h        Show this help message

Examples:
  npm run extract
  npm run extract toronto
  npm run extract toronto,ottawa
  npm run extract toronto -- --batch-size=20 --max-workers=4
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

module.exports = { runExtraction, MUNICIPALITY_MAPPINGS };