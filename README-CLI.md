# Bylaw Management System - CLI Tools

## Overview

This system provides command-line tools for processing municipal bylaw documents through a complete pipeline: scraping, extraction, and analysis. All processing is done offline using rule-based algorithms (no AI/ML dependencies).

## Quick Start

1. **Setup Python Environment**
   ```bash
   npm run setup-python
   ```

2. **Configure Environment**
   - Copy `.env.example` to `.env.local`
   - Update database credentials and paths

3. **Run Your First Process**
   ```bash
   # Test with a single municipality
   npm run scrape toronto
   npm run extract toronto
   npm run analyze toronto
   
   # Or run the full pipeline
   npm run process toronto
   ```

## Available Commands

### Individual Tools

#### Scraping
```bash
# Scrape specific municipality
npm run scrape toronto

# Scrape multiple municipalities
npm run scrape toronto,ottawa,hamilton

# Scrape all municipalities
npm run scrape all

# Options
npm run scrape toronto -- --dry-run --verbose --max-pages=5
```

#### PDF Extraction
```bash
# Extract all pending documents
npm run extract

# Extract for specific municipality
npm run extract toronto

# Options
npm run extract -- --batch-size=20 --max-workers=4 --verbose
```

#### Content Analysis
```bash
# Analyze all pending documents
npm run analyze

# Analyze for specific municipality
npm run analyze toronto

# Options
npm run analyze -- --batch-size=15 --max-workers=3 --verbose
```

### Full Pipeline

```bash
# Run complete pipeline for all municipalities
npm run process

# Run for specific municipality
npm run process toronto

# Skip scraping (only extract and analyze)
npm run process -- --skip-scraping

# Dry run (preview without execution)
npm run process toronto -- --dry-run

# Custom batch sizes
npm run process -- --batch-size=10 --max-workers=2
```

## Configuration

### Environment Variables

Create `.env.local` with these required variables:

```bash
# Database Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Direct Database Connection (for Python scripts)
SUPABASE_DB_HOST=your_db_host
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your_password

# Processing Configuration
DEFAULT_BATCH_SIZE=10
DEFAULT_MAX_WORKERS=3
PROCESSING_TIMEOUT=300

# Scraper Configuration
SCRAPER_DELAY_SECONDS=2
SCRAPER_MAX_RETRIES=3
SCRAPER_USER_AGENT="BylawBot/1.0 (Municipal Document Collector)"
```

### Supported Municipalities

Current municipality mappings:
- `toronto` → toronto_scraper
- `ottawa` → ottawa_scraper  
- `hamilton` → hamilton_scraper
- `mississauga` → mississauga_scraper
- `brampton` → brampton_scraper
- `london` → london_scraper
- `markham` → markham_scraper
- `vaughan` → vaughan_scraper
- `kitchener` → kitchener_scraper
- `windsor` → windsor_scraper

## Processing Pipeline

### 1. Scraping Phase
- Downloads new bylaw documents from municipality websites
- Updates database with document metadata
- Stores PDF files locally for processing
- Respects rate limits and robots.txt

### 2. Extraction Phase
- Extracts text content from downloaded PDFs
- Uses pdfplumber (primary) and PyPDF2 (fallback)
- Handles complex layouts and scanned documents
- Updates database with extracted content

### 3. Analysis Phase
- Analyzes content for ADU (Accessory Dwelling Unit) relevance
- Uses keyword-based scoring algorithm
- Assigns confidence scores (0-100%)
- Updates database with relevance flags and scores

## Monitoring and Logs

### Log Files
- `logs/scraping/` - Scraper activity logs
- `logs/extraction/` - PDF extraction logs  
- `logs/analysis/` - Content analysis logs

### Status Tracking
Each document tracks its status through the pipeline:
- `download_status`: pending → processing → completed/failed
- `extraction_status`: pending → processing → completed/failed  
- `analysis_status`: pending → processing → completed/failed

## Troubleshooting

### Common Issues

1. **Python Environment Issues**
   ```bash
   # Recreate virtual environment
   rm -rf python-env
   npm run setup-python
   ```

2. **Database Connection Issues**
   - Verify `.env.local` credentials
   - Check database connectivity
   - Ensure firewall allows connections

3. **PDF Processing Failures**
   - Check PDF file integrity
   - Verify sufficient disk space
   - Review extraction logs

4. **Memory Issues**
   - Reduce batch sizes: `--batch-size=5`
   - Reduce workers: `--max-workers=1`
   - Process one municipality at a time

### Getting Help

```bash
# Show help for any command
npm run scrape -- --help
npm run extract -- --help
npm run analyze -- --help
npm run process -- --help
```

## Development

### Adding New Municipalities

1. Update `MUNICIPALITY_MAPPINGS` in all script files
2. Add scraper implementation in bylaw_scrapers repository
3. Test with dry-run mode first

### Customizing Analysis

Edit `scripts/python/analyze_content.py`:
- Modify `adu_keywords` dictionary
- Adjust scoring weights
- Change relevance threshold

### Performance Tuning

- **Scraping**: Adjust delays and retry counts
- **Extraction**: Tune batch sizes and worker counts
- **Analysis**: Optimize keyword matching algorithms

## Architecture

```
bylaw-mgmt/
├── scripts/
│   ├── scrape.js          # Scraper orchestration
│   ├── extract.js         # PDF extraction
│   ├── analyze.js         # Content analysis
│   ├── process.js         # Full pipeline
│   └── python/            # Python processing scripts
├── python-env/            # Virtual environment
├── documents/             # Local document storage
├── logs/                  # Processing logs
└── temp/                 # Temporary files
```

## Security & Privacy

- **Offline Processing**: No external APIs or cloud services
- **Local Storage**: All data processed locally
- **Respectful Scraping**: Honors robots.txt and rate limits
- **No Personal Data**: Processes only public documents

## Performance Benchmarks

Typical processing speeds (varies by document complexity):
- **Scraping**: 10-50 documents/minute per municipality
- **Extraction**: 20-100 documents/minute  
- **Analysis**: 50-200 documents/minute

## License

See main project LICENSE file.