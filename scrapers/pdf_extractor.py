#!/usr/bin/env python3
"""
Standalone PDF Text Extraction Tool

This script provides robust PDF text extraction with support for:
- URL or local file path input
- Multiple PDF extraction libraries (PyPDF2, pdfplumber as fallbacks)
- JSON output format
- Error handling and timeouts
- Command line interface

Usage:
    python pdf_extractor.py --url "https://example.com/doc.pdf"
    python pdf_extractor.py --file "/path/to/local.pdf"
    python pdf_extractor.py --url "https://example.com/doc.pdf" --timeout 120
"""

import argparse
import json
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, Any, Optional, Union
import hashlib
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

try:
    import requests
    import PyPDF2
    import pdfplumber
    from requests.adapters import HTTPAdapter
    from requests.packages.urllib3.util.retry import Retry
except ImportError as e:
    logger.error(f"Missing required dependency: {e}")
    logger.error("Install required packages: pip install requests PyPDF2 pdfplumber")
    sys.exit(1)


class PDFExtractor:
    """Robust PDF text extraction with multiple fallback methods."""
    
    def __init__(self, timeout: int = 60):
        self.timeout = timeout
        self.session = self._create_session()
    
    def _create_session(self) -> requests.Session:
        """Create requests session with retry strategy."""
        session = requests.Session()
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session
    
    def download_pdf(self, url: str) -> bytes:
        """Download PDF from URL with timeout and retry logic."""
        try:
            logger.info(f"Downloading PDF from: {url}")
            response = self.session.get(
                url,
                timeout=self.timeout,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            )
            response.raise_for_status()
            
            content_type = response.headers.get('content-type', '').lower()
            if 'pdf' not in content_type and not url.lower().endswith('.pdf'):
                logger.warning(f"Content type '{content_type}' may not be PDF")
            
            return response.content
            
        except requests.exceptions.Timeout:
            raise Exception(f"Timeout downloading PDF from {url}")
        except requests.exceptions.RequestException as e:
            raise Exception(f"Error downloading PDF: {str(e)}")
    
    def extract_with_pypdf2(self, pdf_data: bytes) -> str:
        """Extract text using PyPDF2."""
        logger.info("Attempting extraction with PyPDF2")
        text_parts = []
        
        try:
            import io
            pdf_file = io.BytesIO(pdf_data)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text.strip():
                        text_parts.append(page_text)
                except Exception as e:
                    logger.warning(f"Error extracting page {page_num}: {e}")
                    continue
            
            full_text = '\n'.join(text_parts)
            logger.info(f"PyPDF2 extracted {len(full_text)} characters from {len(pdf_reader.pages)} pages")
            return full_text
            
        except Exception as e:
            logger.error(f"PyPDF2 extraction failed: {e}")
            raise
    
    def extract_with_pdfplumber(self, pdf_data: bytes) -> str:
        """Extract text using pdfplumber (more accurate for complex layouts)."""
        logger.info("Attempting extraction with pdfplumber")
        text_parts = []
        
        try:
            import io
            pdf_file = io.BytesIO(pdf_data)
            
            with pdfplumber.open(pdf_file) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            text_parts.append(page_text)
                    except Exception as e:
                        logger.warning(f"Error extracting page {page_num}: {e}")
                        continue
            
            full_text = '\n'.join(text_parts)
            logger.info(f"pdfplumber extracted {len(full_text)} characters from {len(pdf.pages)} pages")
            return full_text
            
        except Exception as e:
            logger.error(f"pdfplumber extraction failed: {e}")
            raise
    
    def calculate_content_hash(self, text: str) -> str:
        """Calculate SHA-256 hash of text content."""
        return hashlib.sha256(text.encode('utf-8')).hexdigest()
    
    def extract_from_file(self, file_path: Union[str, Path]) -> Dict[str, Any]:
        """Extract text from local PDF file."""
        start_time = time.time()
        file_path = Path(file_path)
        
        if not file_path.exists():
            return {
                "success": False,
                "error": f"File not found: {file_path}",
                "extraction_time_seconds": 0
            }
        
        if not file_path.suffix.lower() == '.pdf':
            return {
                "success": False,
                "error": f"File is not a PDF: {file_path}",
                "extraction_time_seconds": 0
            }
        
        try:
            pdf_data = file_path.read_bytes()
            return self._extract_text_with_fallbacks(pdf_data, str(file_path), start_time)
            
        except Exception as e:
            return {
                "success": False,
                "error": f"Error reading file: {str(e)}",
                "extraction_time_seconds": time.time() - start_time
            }
    
    def extract_from_url(self, url: str) -> Dict[str, Any]:
        """Extract text from PDF URL."""
        start_time = time.time()
        
        try:
            pdf_data = self.download_pdf(url)
            return self._extract_text_with_fallbacks(pdf_data, url, start_time)
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "extraction_time_seconds": time.time() - start_time
            }
    
    def _extract_text_with_fallbacks(self, pdf_data: bytes, source: str, start_time: float) -> Dict[str, Any]:
        """Extract text with multiple fallback methods."""
        text = ""
        method_used = ""
        errors = []
        
        # Method 1: Try pdfplumber first (generally more accurate)
        try:
            text = self.extract_with_pdfplumber(pdf_data)
            method_used = "pdfplumber"
            if text.strip():
                logger.info("Successfully extracted text with pdfplumber")
            else:
                raise Exception("pdfplumber returned empty text")
        except Exception as e:
            errors.append(f"pdfplumber: {str(e)}")
            logger.warning(f"pdfplumber failed: {e}")
        
        # Method 2: Fallback to PyPDF2 if pdfplumber fails
        if not text.strip():
            try:
                text = self.extract_with_pypdf2(pdf_data)
                method_used = "PyPDF2"
                if text.strip():
                    logger.info("Successfully extracted text with PyPDF2")
                else:
                    raise Exception("PyPDF2 returned empty text")
            except Exception as e:
                errors.append(f"PyPDF2: {str(e)}")
                logger.error(f"PyPDF2 failed: {e}")
        
        # Check if we got any text
        if not text.strip():
            return {
                "success": False,
                "error": f"No text extracted from PDF. Errors: {'; '.join(errors)}",
                "extraction_time_seconds": time.time() - start_time,
                "methods_tried": ["pdfplumber", "PyPDF2"],
                "errors": errors
            }
        
        # Calculate metadata
        content_hash = self.calculate_content_hash(text)
        file_size = len(pdf_data)
        extraction_time = time.time() - start_time
        
        return {
            "success": True,
            "content_text": text,
            "content_hash": content_hash,
            "metadata": {
                "source": source,
                "file_size_bytes": file_size,
                "character_count": len(text),
                "word_count": len(text.split()),
                "line_count": len(text.splitlines()),
                "extraction_method": method_used,
                "extraction_time_seconds": round(extraction_time, 2)
            },
            "extraction_time_seconds": round(extraction_time, 2)
        }


def main():
    """Command line interface for PDF extraction."""
    parser = argparse.ArgumentParser(
        description="Extract text from PDF files",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python pdf_extractor.py --url "https://example.com/document.pdf"
  python pdf_extractor.py --file "/path/to/document.pdf"
  python pdf_extractor.py --url "https://example.com/doc.pdf" --timeout 120
        """
    )
    
    # Input source (mutually exclusive)
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument('--url', help='URL of PDF to extract')
    source_group.add_argument('--file', help='Local path to PDF file')
    
    # Options
    parser.add_argument('--timeout', type=int, default=60, 
                       help='Timeout in seconds for download/processing (default: 60)')
    parser.add_argument('--output', help='Output file path (default: stdout)')
    parser.add_argument('--pretty', action='store_true', 
                       help='Pretty-print JSON output')
    parser.add_argument('--verbose', '-v', action='store_true',
                       help='Enable verbose logging')
    
    args = parser.parse_args()
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    # Create extractor
    extractor = PDFExtractor(timeout=args.timeout)
    
    # Extract text
    if args.url:
        result = extractor.extract_from_url(args.url)
    else:
        result = extractor.extract_from_file(args.file)
    
    # Format output
    if args.pretty:
        output = json.dumps(result, indent=2, ensure_ascii=False)
    else:
        output = json.dumps(result, ensure_ascii=False)
    
    # Write output
    if args.output:
        try:
            with open(args.output, 'w', encoding='utf-8') as f:
                f.write(output)
            logger.info(f"Output written to {args.output}")
        except Exception as e:
            logger.error(f"Error writing output file: {e}")
            sys.exit(1)
    else:
        print(output)
    
    # Exit with appropriate code
    sys.exit(0 if result['success'] else 1)


if __name__ == '__main__':
    main()