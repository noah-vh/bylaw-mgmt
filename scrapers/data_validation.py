"""
Data Validation and Quality Assurance System
Provides comprehensive validation of scraped data for quality and consistency
"""

import re
import hashlib
import mimetypes
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Tuple, Set
from dataclasses import dataclass, field
from enum import Enum
from urllib.parse import urlparse, urljoin
import asyncio
import aiohttp
from pathlib import Path

try:
    import validators
    from bs4 import BeautifulSoup
except ImportError as e:
    print(f"Required dependencies not installed: {e}")
    raise


class ValidationLevel(Enum):
    """Validation severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class ValidationCategory(Enum):
    """Categories of validation checks"""
    URL_VALIDATION = "url_validation"
    CONTENT_VALIDATION = "content_validation"
    FILENAME_VALIDATION = "filename_validation"
    METADATA_VALIDATION = "metadata_validation"
    DUPLICATE_DETECTION = "duplicate_detection"
    ACCESSIBILITY_CHECK = "accessibility_check"
    RELEVANCE_SCORING = "relevance_scoring"
    DATA_INTEGRITY = "data_integrity"


@dataclass
class ValidationIssue:
    """Represents a validation issue"""
    level: ValidationLevel
    category: ValidationCategory
    code: str
    message: str
    field: Optional[str] = None
    expected: Optional[str] = None
    actual: Optional[str] = None
    suggestion: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'level': self.level.value,
            'category': self.category.value,
            'code': self.code,
            'message': self.message,
            'field': self.field,
            'expected': self.expected,
            'actual': self.actual,
            'suggestion': self.suggestion
        }


@dataclass
class ValidationResult:
    """Result of validation process"""
    is_valid: bool
    score: float  # 0.0 to 1.0
    issues: List[ValidationIssue] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def add_issue(self, issue: ValidationIssue):
        """Add a validation issue"""
        self.issues.append(issue)
        
        # Adjust validity based on issue level
        if issue.level in [ValidationLevel.ERROR, ValidationLevel.CRITICAL]:
            self.is_valid = False
    
    def get_issues_by_level(self, level: ValidationLevel) -> List[ValidationIssue]:
        """Get issues by severity level"""
        return [issue for issue in self.issues if issue.level == level]
    
    def get_issues_by_category(self, category: ValidationCategory) -> List[ValidationIssue]:
        """Get issues by category"""
        return [issue for issue in self.issues if issue.category == category]
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'is_valid': self.is_valid,
            'score': self.score,
            'issues': [issue.to_dict() for issue in self.issues],
            'metadata': self.metadata,
            'summary': {
                'total_issues': len(self.issues),
                'critical': len(self.get_issues_by_level(ValidationLevel.CRITICAL)),
                'errors': len(self.get_issues_by_level(ValidationLevel.ERROR)),
                'warnings': len(self.get_issues_by_level(ValidationLevel.WARNING)),
                'info': len(self.get_issues_by_level(ValidationLevel.INFO))
            }
        }


class DocumentValidator:
    """Validates scraped document data"""
    
    def __init__(self):
        self.pdf_extensions = {'.pdf'}
        self.valid_protocols = {'http', 'https'}
        self.max_filename_length = 255
        self.max_title_length = 500
        self.max_url_length = 2048
        
        # Common bylaw keywords for relevance scoring
        self.bylaw_keywords = {
            'high_relevance': [
                'bylaw', 'by-law', 'ordinance', 'regulation', 'zoning',
                'municipal code', 'city code', 'building code', 'fire code',
                'adu', 'accessory dwelling unit', 'secondary suite',
                'basement apartment', 'granny flat', 'in-law suite'
            ],
            'medium_relevance': [
                'policy', 'procedure', 'guideline', 'standard', 'requirement',
                'permit', 'license', 'approval', 'application', 'development'
            ],
            'low_relevance': [
                'meeting', 'agenda', 'minutes', 'report', 'study',
                'notice', 'announcement', 'newsletter'
            ]
        }
        
        # URL patterns that might indicate non-PDF content
        self.suspicious_url_patterns = [
            r'/search\?',
            r'/index\.',
            r'/home\.',
            r'/main\.',
            r'javascript:',
            r'mailto:'
        ]
    
    async def validate_document(self, doc_data: Dict[str, Any]) -> ValidationResult:
        """Validate a single document"""
        result = ValidationResult(is_valid=True, score=1.0)
        
        # Basic structure validation
        self._validate_structure(doc_data, result)
        
        # URL validation
        await self._validate_url(doc_data, result)
        
        # Filename validation
        self._validate_filename(doc_data, result)
        
        # Title validation
        self._validate_title(doc_data, result)
        
        # Content relevance scoring
        self._score_relevance(doc_data, result)
        
        # Calculate final score
        result.score = self._calculate_quality_score(result)
        
        return result
    
    def _validate_structure(self, doc_data: Dict[str, Any], result: ValidationResult):
        """Validate basic document structure"""
        required_fields = ['url', 'filename', 'title']
        
        for field in required_fields:
            if field not in doc_data or not doc_data[field]:
                result.add_issue(ValidationIssue(
                    level=ValidationLevel.CRITICAL,
                    category=ValidationCategory.DATA_INTEGRITY,
                    code='MISSING_REQUIRED_FIELD',
                    message=f'Required field "{field}" is missing or empty',
                    field=field,
                    suggestion=f'Ensure "{field}" is provided and not empty'
                ))
            elif not isinstance(doc_data[field], str):
                result.add_issue(ValidationIssue(
                    level=ValidationLevel.ERROR,
                    category=ValidationCategory.DATA_INTEGRITY,
                    code='INVALID_FIELD_TYPE',
                    message=f'Field "{field}" must be a string',
                    field=field,
                    expected='string',
                    actual=type(doc_data[field]).__name__
                ))
    
    async def _validate_url(self, doc_data: Dict[str, Any], result: ValidationResult):
        """Validate document URL"""
        url = doc_data.get('url', '')
        
        if not url:
            return
        
        # Basic URL format validation
        if not validators.url(url):
            result.add_issue(ValidationIssue(
                level=ValidationLevel.ERROR,
                category=ValidationCategory.URL_VALIDATION,
                code='INVALID_URL_FORMAT',
                message=f'URL has invalid format: {url}',
                field='url',
                actual=url
            ))
            return
        
        # Check URL length
        if len(url) > self.max_url_length:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.URL_VALIDATION,
                code='URL_TOO_LONG',
                message=f'URL exceeds maximum length of {self.max_url_length} characters',
                field='url',
                actual=str(len(url)),
                expected=f'<= {self.max_url_length}'
            ))
        
        # Parse URL components
        parsed = urlparse(url)
        
        # Check protocol
        if parsed.scheme not in self.valid_protocols:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.URL_VALIDATION,
                code='UNSUPPORTED_PROTOCOL',
                message=f'URL uses unsupported protocol: {parsed.scheme}',
                field='url',
                actual=parsed.scheme,
                expected='http or https'
            ))
        
        # Check for suspicious URL patterns
        for pattern in self.suspicious_url_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                result.add_issue(ValidationIssue(
                    level=ValidationLevel.WARNING,
                    category=ValidationCategory.URL_VALIDATION,
                    code='SUSPICIOUS_URL_PATTERN',
                    message=f'URL contains suspicious pattern that may not lead to a PDF: {pattern}',
                    field='url',
                    actual=url,
                    suggestion='Verify this URL actually points to a PDF document'
                ))
        
        # Check if URL ends with .pdf
        if not url.lower().endswith('.pdf'):
            result.add_issue(ValidationIssue(
                level=ValidationLevel.INFO,
                category=ValidationCategory.URL_VALIDATION,
                code='URL_NO_PDF_EXTENSION',
                message='URL does not end with .pdf extension',
                field='url',
                actual=url,
                suggestion='URLs ending with .pdf are more likely to be direct PDF links'
            ))
        
        # Try to verify URL accessibility (with timeout)
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.head(url) as response:
                    # Check HTTP status
                    if response.status >= 400:
                        result.add_issue(ValidationIssue(
                            level=ValidationLevel.WARNING,
                            category=ValidationCategory.ACCESSIBILITY_CHECK,
                            code='URL_NOT_ACCESSIBLE',
                            message=f'URL returned HTTP status {response.status}',
                            field='url',
                            actual=str(response.status),
                            expected='200-399'
                        ))
                    
                    # Check content type
                    content_type = response.headers.get('content-type', '').lower()
                    if content_type and 'pdf' not in content_type:
                        result.add_issue(ValidationIssue(
                            level=ValidationLevel.WARNING,
                            category=ValidationCategory.CONTENT_VALIDATION,
                            code='UNEXPECTED_CONTENT_TYPE',
                            message=f'URL does not return PDF content type: {content_type}',
                            field='url',
                            actual=content_type,
                            expected='application/pdf',
                            suggestion='Verify this URL actually points to a PDF document'
                        ))
                    
                    # Store metadata
                    result.metadata['http_status'] = response.status
                    result.metadata['content_type'] = content_type
                    result.metadata['content_length'] = response.headers.get('content-length')
        
        except asyncio.TimeoutError:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.ACCESSIBILITY_CHECK,
                code='URL_TIMEOUT',
                message='URL request timed out during accessibility check',
                field='url',
                suggestion='URL may be slow to respond or inaccessible'
            ))
        
        except Exception as e:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.INFO,
                category=ValidationCategory.ACCESSIBILITY_CHECK,
                code='URL_CHECK_FAILED',
                message=f'Could not verify URL accessibility: {str(e)}',
                field='url'
            ))
    
    def _validate_filename(self, doc_data: Dict[str, Any], result: ValidationResult):
        """Validate document filename"""
        filename = doc_data.get('filename', '')
        
        if not filename:
            return
        
        # Check filename length
        if len(filename) > self.max_filename_length:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.FILENAME_VALIDATION,
                code='FILENAME_TOO_LONG',
                message=f'Filename exceeds maximum length of {self.max_filename_length} characters',
                field='filename',
                actual=str(len(filename)),
                expected=f'<= {self.max_filename_length}'
            ))
        
        # Check for PDF extension
        if not any(filename.lower().endswith(ext) for ext in self.pdf_extensions):
            result.add_issue(ValidationIssue(
                level=ValidationLevel.ERROR,
                category=ValidationCategory.FILENAME_VALIDATION,
                code='INVALID_FILE_EXTENSION',
                message=f'Filename does not have a valid PDF extension: {filename}',
                field='filename',
                actual=Path(filename).suffix,
                expected=', '.join(self.pdf_extensions),
                suggestion='Ensure filename ends with .pdf'
            ))
        
        # Check for invalid filename characters
        invalid_chars = r'[<>:"/\\|?*]'
        if re.search(invalid_chars, filename):
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.FILENAME_VALIDATION,
                code='INVALID_FILENAME_CHARACTERS',
                message=f'Filename contains invalid characters: {filename}',
                field='filename',
                actual=filename,
                suggestion='Remove or replace characters: < > : " / \\ | ? *'
            ))
        
        # Check for very short or generic filenames
        name_without_ext = Path(filename).stem
        if len(name_without_ext) < 3:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.FILENAME_VALIDATION,
                code='FILENAME_TOO_SHORT',
                message=f'Filename is very short and may not be descriptive: {filename}',
                field='filename',
                actual=filename,
                suggestion='Use more descriptive filenames when possible'
            ))
        
        # Check for generic names
        generic_names = {'document', 'file', 'pdf', 'download', 'untitled'}
        if name_without_ext.lower() in generic_names:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.INFO,
                category=ValidationCategory.FILENAME_VALIDATION,
                code='GENERIC_FILENAME',
                message=f'Filename is generic and may not be descriptive: {filename}',
                field='filename',
                actual=filename
            ))
    
    def _validate_title(self, doc_data: Dict[str, Any], result: ValidationResult):
        """Validate document title"""
        title = doc_data.get('title', '')
        
        if not title:
            return
        
        # Check title length
        if len(title) > self.max_title_length:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.METADATA_VALIDATION,
                code='TITLE_TOO_LONG',
                message=f'Title exceeds maximum length of {self.max_title_length} characters',
                field='title',
                actual=str(len(title)),
                expected=f'<= {self.max_title_length}'
            ))
        
        # Check for very short titles
        if len(title.strip()) < 3:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.METADATA_VALIDATION,
                code='TITLE_TOO_SHORT',
                message=f'Title is very short and may not be descriptive: {title}',
                field='title',
                actual=title
            ))
        
        # Check for titles that are just URLs or filenames
        if validators.url(title.strip()):
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.METADATA_VALIDATION,
                code='TITLE_IS_URL',
                message='Title appears to be a URL rather than a descriptive title',
                field='title',
                actual=title,
                suggestion='Use the actual document title instead of the URL'
            ))
        
        # Check if title is same as filename
        filename = doc_data.get('filename', '')
        if title.strip().lower() == Path(filename).stem.lower():
            result.add_issue(ValidationIssue(
                level=ValidationLevel.INFO,
                category=ValidationCategory.METADATA_VALIDATION,
                code='TITLE_SAME_AS_FILENAME',
                message='Title is the same as filename',
                field='title',
                actual=title,
                suggestion='Consider using a more descriptive title if available'
            ))
    
    def _score_relevance(self, doc_data: Dict[str, Any], result: ValidationResult):
        """Score document relevance based on content"""
        title = doc_data.get('title', '').lower()
        filename = doc_data.get('filename', '').lower()
        text_content = f"{title} {filename}"
        
        relevance_score = 0.0
        matched_keywords = {'high': [], 'medium': [], 'low': []}
        
        # Check for high relevance keywords
        for keyword in self.bylaw_keywords['high_relevance']:
            if keyword.lower() in text_content:
                relevance_score += 3.0
                matched_keywords['high'].append(keyword)
        
        # Check for medium relevance keywords
        for keyword in self.bylaw_keywords['medium_relevance']:
            if keyword.lower() in text_content:
                relevance_score += 1.5
                matched_keywords['medium'].append(keyword)
        
        # Check for low relevance keywords
        for keyword in self.bylaw_keywords['low_relevance']:
            if keyword.lower() in text_content:
                relevance_score += 0.5
                matched_keywords['low'].append(keyword)
        
        # Normalize score (max possible is roughly 10-15 for highly relevant docs)
        normalized_score = min(relevance_score / 10.0, 1.0)
        
        result.metadata['relevance_score'] = normalized_score
        result.metadata['matched_keywords'] = matched_keywords
        
        # Add relevance feedback
        if normalized_score >= 0.7:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.INFO,
                category=ValidationCategory.RELEVANCE_SCORING,
                code='HIGH_RELEVANCE',
                message=f'Document appears highly relevant (score: {normalized_score:.2f})',
                field='relevance'
            ))
        elif normalized_score >= 0.3:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.INFO,
                category=ValidationCategory.RELEVANCE_SCORING,
                code='MEDIUM_RELEVANCE',
                message=f'Document appears moderately relevant (score: {normalized_score:.2f})',
                field='relevance'
            ))
        else:
            result.add_issue(ValidationIssue(
                level=ValidationLevel.WARNING,
                category=ValidationCategory.RELEVANCE_SCORING,
                code='LOW_RELEVANCE',
                message=f'Document may not be relevant (score: {normalized_score:.2f})',
                field='relevance',
                suggestion='Review document to ensure it contains relevant bylaw information'
            ))
    
    def _calculate_quality_score(self, result: ValidationResult) -> float:
        """Calculate overall quality score"""
        base_score = 1.0
        
        # Deduct points for issues
        for issue in result.issues:
            if issue.level == ValidationLevel.CRITICAL:
                base_score -= 0.4
            elif issue.level == ValidationLevel.ERROR:
                base_score -= 0.2
            elif issue.level == ValidationLevel.WARNING:
                base_score -= 0.1
            # INFO level issues don't reduce score
        
        # Add relevance score bonus
        relevance_score = result.metadata.get('relevance_score', 0.0)
        base_score += relevance_score * 0.2  # Max 20% bonus for relevance
        
        return max(0.0, min(1.0, base_score))


class DuplicateDetector:
    """Detects duplicate documents"""
    
    def __init__(self):
        self.url_hashes: Set[str] = set()
        self.content_hashes: Set[str] = set()
        self.title_similarity_threshold = 0.8
    
    def check_duplicates(self, documents: List[Dict[str, Any]]) -> Dict[str, List[int]]:
        """Check for duplicates in a list of documents"""
        duplicates = {
            'url_duplicates': [],
            'content_duplicates': [],
            'title_similarity': []
        }
        
        seen_urls = {}
        seen_content = {}
        
        for i, doc in enumerate(documents):
            url = doc.get('url', '')
            title = doc.get('title', '')
            filename = doc.get('filename', '')
            
            # Check URL duplicates
            url_hash = hashlib.md5(url.encode()).hexdigest()
            if url_hash in seen_urls:
                duplicates['url_duplicates'].append([seen_urls[url_hash], i])
            else:
                seen_urls[url_hash] = i
            
            # Check content duplicates (based on title + filename)
            content = f"{title}|{filename}"
            content_hash = hashlib.md5(content.encode()).hexdigest()
            if content_hash in seen_content:
                duplicates['content_duplicates'].append([seen_content[content_hash], i])
            else:
                seen_content[content_hash] = i
        
        return duplicates
    
    def similarity_score(self, text1: str, text2: str) -> float:
        """Calculate similarity score between two texts"""
        # Simple Jaccard similarity
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        
        if not words1 and not words2:
            return 1.0
        if not words1 or not words2:
            return 0.0
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        return len(intersection) / len(union)


class BatchValidator:
    """Validates batches of documents"""
    
    def __init__(self):
        self.document_validator = DocumentValidator()
        self.duplicate_detector = DuplicateDetector()
    
    async def validate_batch(
        self,
        documents: List[Dict[str, Any]],
        check_duplicates: bool = True
    ) -> Dict[str, Any]:
        """Validate a batch of documents"""
        results = {
            'total_documents': len(documents),
            'valid_documents': 0,
            'invalid_documents': 0,
            'average_score': 0.0,
            'validation_results': [],
            'duplicates': {},
            'summary': {
                'critical_issues': 0,
                'error_issues': 0,
                'warning_issues': 0,
                'info_issues': 0
            }
        }
        
        if not documents:
            return results
        
        # Validate each document
        validation_tasks = [
            self.document_validator.validate_document(doc)
            for doc in documents
        ]
        
        validation_results = await asyncio.gather(*validation_tasks, return_exceptions=True)
        
        total_score = 0.0
        
        for i, result in enumerate(validation_results):
            if isinstance(result, Exception):
                # Handle validation exceptions
                error_result = ValidationResult(
                    is_valid=False,
                    score=0.0,
                    issues=[ValidationIssue(
                        level=ValidationLevel.CRITICAL,
                        category=ValidationCategory.DATA_INTEGRITY,
                        code='VALIDATION_EXCEPTION',
                        message=f'Validation failed with exception: {str(result)}',
                        suggestion='Check document data format and retry'
                    )]
                )
                result = error_result
            
            results['validation_results'].append(result.to_dict())
            
            if result.is_valid:
                results['valid_documents'] += 1
            else:
                results['invalid_documents'] += 1
            
            total_score += result.score
            
            # Count issues by level
            for issue in result.issues:
                if issue.level == ValidationLevel.CRITICAL:
                    results['summary']['critical_issues'] += 1
                elif issue.level == ValidationLevel.ERROR:
                    results['summary']['error_issues'] += 1
                elif issue.level == ValidationLevel.WARNING:
                    results['summary']['warning_issues'] += 1
                elif issue.level == ValidationLevel.INFO:
                    results['summary']['info_issues'] += 1
        
        # Calculate average score
        results['average_score'] = total_score / len(documents) if documents else 0.0
        
        # Check for duplicates
        if check_duplicates:
            results['duplicates'] = self.duplicate_detector.check_duplicates(documents)
        
        return results
    
    def generate_quality_report(self, validation_results: Dict[str, Any]) -> str:
        """Generate a human-readable quality report"""
        report = []
        report.append("=== DOCUMENT QUALITY REPORT ===")
        report.append(f"Total Documents: {validation_results['total_documents']}")
        report.append(f"Valid Documents: {validation_results['valid_documents']}")
        report.append(f"Invalid Documents: {validation_results['invalid_documents']}")
        report.append(f"Average Quality Score: {validation_results['average_score']:.2f}")
        report.append("")
        
        summary = validation_results['summary']
        report.append("Issue Summary:")
        report.append(f"  Critical: {summary['critical_issues']}")
        report.append(f"  Errors: {summary['error_issues']}")
        report.append(f"  Warnings: {summary['warning_issues']}")
        report.append(f"  Info: {summary['info_issues']}")
        report.append("")
        
        # Duplicate summary
        duplicates = validation_results.get('duplicates', {})
        if duplicates:
            report.append("Duplicate Analysis:")
            report.append(f"  URL Duplicates: {len(duplicates.get('url_duplicates', []))}")
            report.append(f"  Content Duplicates: {len(duplicates.get('content_duplicates', []))}")
            report.append("")
        
        # Top issues
        all_issues = []
        for doc_result in validation_results['validation_results']:
            all_issues.extend(doc_result['issues'])
        
        if all_issues:
            issue_counts = {}
            for issue in all_issues:
                code = issue['code']
                issue_counts[code] = issue_counts.get(code, 0) + 1
            
            report.append("Most Common Issues:")
            sorted_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)
            for code, count in sorted_issues[:5]:
                report.append(f"  {code}: {count} occurrences")
        
        return "\n".join(report)


# Convenience functions
async def validate_document(doc_data: Dict[str, Any]) -> ValidationResult:
    """Validate a single document"""
    validator = DocumentValidator()
    return await validator.validate_document(doc_data)


async def validate_documents(documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Validate a list of documents"""
    validator = BatchValidator()
    return await validator.validate_batch(documents)


def generate_quality_report(validation_results: Dict[str, Any]) -> str:
    """Generate a quality report from validation results"""
    validator = BatchValidator()
    return validator.generate_quality_report(validation_results)
