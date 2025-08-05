#!/usr/bin/env python3
"""
Batch content analysis script for bylaw documents
Analyzes extracted text for ADU relevance and updates database
"""

import os
import sys
import argparse
import logging
from pathlib import Path
import psycopg2
from psycopg2.extras import RealDictCursor
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
import time
from difflib import SequenceMatcher

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ADUAnalyzer:
    def __init__(self, db_config):
        self.db_config = db_config
        self.connection = None
        
        # ADU-related keywords with scoring weights
        self.adu_keywords = {
            # High priority terms (10 points each)
            'priority': [
                'accessory dwelling unit',
                'adu',
                'ancillary residential unit',
                'secondary dwelling unit',
                'granny flat',
                'in-law suite',
                'coach house',
                'laneway house'
            ],
            
            # Include terms (5-8 points each)
            'include': [
                'secondary suite',
                'basement apartment',
                'garden suite',
                'carriage house',
                'detached unit',
                'additional residential unit',
                'rental unit',
                'second unit',
                'auxiliary unit',
                'accessory unit'
            ],
            
            # Context terms (2-3 points each)
            'context': [
                'zoning',
                'residential',
                'dwelling',
                'housing',
                'rental',
                'tenant',
                'occupancy',
                'building permit',
                'residential use',
                'housing option'
            ],
            
            # Exclude terms (negative points)
            'exclude': [
                'commercial use',
                'industrial',
                'business use',
                'non-residential',
                'institutional use'
            ]
        }
        
        # Scoring weights
        self.scoring_weights = {
            'priority': 10,
            'include': 6,
            'context': 3,
            'exclude': -5
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
        
    def fuzzy_match(self, text, keyword, threshold=0.8):
        """Check for fuzzy matches of keywords in text"""
        text_lower = text.lower()
        keyword_lower = keyword.lower()
        
        # Direct match
        if keyword_lower in text_lower:
            return True, 1.0
            
        # Fuzzy matching for slight variations
        words = re.findall(r'\b\w+\b', text_lower)
        keyword_words = keyword_lower.split()
        
        if len(keyword_words) == 1:
            # Single word fuzzy matching
            for word in words:
                similarity = SequenceMatcher(None, word, keyword_lower).ratio()
                if similarity >= threshold:
                    return True, similarity
        else:
            # Multi-word phrase matching
            text_phrases = []
            for i in range(len(words) - len(keyword_words) + 1):
                phrase = ' '.join(words[i:i + len(keyword_words)])
                text_phrases.append(phrase)
                
            for phrase in text_phrases:
                similarity = SequenceMatcher(None, phrase, keyword_lower).ratio()
                if similarity >= threshold:
                    return True, similarity
                    
        return False, 0.0
        
    def analyze_content(self, document):
        """Analyze document content for ADU relevance"""
        try:
            content = document['content']
            if not content:
                return None, "No content to analyze"
                
            matched_keywords = []
            total_score = 0
            
            # Analyze each keyword category
            for category, keywords in self.adu_keywords.items():
                weight = self.scoring_weights[category]
                
                for keyword in keywords:
                    is_match, confidence = self.fuzzy_match(content, keyword)
                    
                    if is_match:
                        # Count occurrences
                        keyword_lower = keyword.lower()
                        content_lower = content.lower()
                        
                        if keyword_lower in content_lower:
                            # Direct matches
                            count = content_lower.count(keyword_lower)
                        else:
                            # Fuzzy matches (count as 1)
                            count = 1
                            
                        match_score = weight * count * confidence
                        total_score += match_score
                        
                        matched_keywords.append({
                            'keyword': keyword,
                            'category': category,
                            'count': count,
                            'confidence': confidence,
                            'score': match_score
                        })
            
            # Calculate relevance percentage (normalize to 0-100)
            # Base score on presence of keywords and their weights
            max_possible_score = 100  # Reasonable maximum for scoring
            relevance_score = min(100, max(0, (total_score / max_possible_score) * 100))
            
            # Determine if document is relevant (threshold: 15%)
            is_relevant = relevance_score >= 15
            
            # Calculate confidence based on keyword diversity and scores
            unique_categories = len(set(kw['category'] for kw in matched_keywords))
            priority_matches = sum(1 for kw in matched_keywords if kw['category'] == 'priority')
            
            confidence = 0.5  # Base confidence
            if priority_matches > 0:
                confidence += 0.3
            if unique_categories >= 2:
                confidence += 0.2
            if len(matched_keywords) >= 5:
                confidence += 0.1
                
            confidence = min(1.0, confidence)
            
            return {
                'relevance_score': round(relevance_score, 2),
                'is_relevant': is_relevant,
                'confidence': round(confidence, 2),
                'matched_keywords': matched_keywords,
                'total_keywords': len(matched_keywords),
                'total_score': round(total_score, 2)
            }, None
            
        except Exception as e:
            return None, f"Analysis error: {str(e)}"
            
    def update_document_analysis(self, document_id, analysis_result, error_message=None):
        """Update document with analysis results or error"""
        cursor = self.connection.cursor()
        
        if analysis_result:
            cursor.execute('''
                UPDATE pdf_documents 
                SET relevance_score = %s,
                    is_relevant = %s,
                    confidence_score = %s,
                    analysis_status = 'completed',
                    analysis_completed_at = NOW(),
                    analysis_error = NULL,
                    matched_keywords = %s
                WHERE id = %s
            ''', (
                analysis_result['relevance_score'],
                analysis_result['is_relevant'],
                analysis_result['confidence'],
                str(analysis_result['matched_keywords']),  # Store as JSON string
                document_id
            ))
            logger.info(f"Updated document {document_id} with analysis results")
        else:
            cursor.execute('''
                UPDATE pdf_documents 
                SET analysis_status = 'failed',
                    analysis_error = %s,
                    analysis_completed_at = NOW()
                WHERE id = %s
            ''', (error_message, document_id))
            logger.error(f"Failed to analyze document {document_id}: {error_message}")
            
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
        
        # Analyze content
        analysis_result, error = self.analyze_content(document)
        
        # Update with results
        self.update_document_analysis(document['id'], analysis_result, error)
        
        return {
            'id': document['id'],
            'title': document['title'],
            'success': analysis_result is not None,
            'error': error,
            'relevance_score': analysis_result['relevance_score'] if analysis_result else 0,
            'is_relevant': analysis_result['is_relevant'] if analysis_result else False
        }
        
    def run_batch_analysis(self, municipality=None, batch_size=5, max_workers=3):
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
                    logger.error(f"Document analysis failed: {e}")
                    results.append({
                        'id': doc['id'],
                        'title': doc['title'],
                        'success': False,
                        'error': str(e),
                        'relevance_score': 0,
                        'is_relevant': False
                    })
                    
        return results

def main():
    parser = argparse.ArgumentParser(description='Batch content analysis tool')
    parser.add_argument('municipality', nargs='?', help='Municipality name (optional)')
    parser.add_argument('--batch-size', type=int, default=15, help='Number of documents to process')
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
        analyzer = ADUAnalyzer(db_config)
        results = analyzer.run_batch_analysis(
            municipality=args.municipality,
            batch_size=args.batch_size,
            max_workers=args.max_workers
        )
        
        # Print summary
        successful = sum(1 for r in results if r['success'])
        failed = len(results) - successful
        relevant_docs = sum(1 for r in results if r.get('is_relevant', False))
        
        print(f"\n📊 ANALYSIS SUMMARY")
        print(f"===================")
        print(f"✅ Successful: {successful}")
        print(f"❌ Failed: {failed}")
        print(f"🎯 Relevant documents: {relevant_docs}")
        
        if successful > 0:
            avg_relevance = sum(r.get('relevance_score', 0) for r in results if r['success']) / successful
            print(f"📈 Average relevance score: {avg_relevance:.1f}%")
        
        if failed > 0:
            print(f"\n❌ Failed documents:")
            for result in results:
                if not result['success']:
                    print(f"  - {result['title']}: {result['error']}")
                    
        sys.exit(0 if failed == 0 else 1)
        
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()