#!/bin/bash

# Python Virtual Environment Setup Script for Bylaw Management System
# Sets up Python environment for offline-only operations (no AI/ML dependencies)

set -e  # Exit on any error

echo "🐍 Setting up Python Environment for Bylaw Management"
echo "===================================================="

# Configuration
VENV_DIR="python-env"
PYTHON_VERSION_MIN="3.8"
REQUIREMENTS_FILE="requirements-offline.txt"

# Check if Python is installed
check_python() {
    if command -v python3 &> /dev/null; then
        PYTHON_CMD="python3"
    elif command -v python &> /dev/null; then
        PYTHON_CMD="python"
    else
        echo "❌ Python is not installed. Please install Python ${PYTHON_VERSION_MIN}+ first."
        echo "   Visit: https://www.python.org/downloads/"
        exit 1
    fi
    
    # Check Python version
    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | cut -d' ' -f2)
    echo "📍 Found Python: $PYTHON_VERSION"
    
    # Basic version check (simplified)
    if [[ "$PYTHON_VERSION" < "3.8" ]]; then
        echo "⚠️  Warning: Python version may be too old. Recommended: 3.8+"
    fi
}

# Create virtual environment
create_venv() {
    echo "📦 Creating virtual environment..."
    
    if [ -d "$VENV_DIR" ]; then
        read -p "Virtual environment already exists. Recreate it? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "$VENV_DIR"
        else
            echo "✅ Using existing virtual environment"
            return 0
        fi
    fi
    
    $PYTHON_CMD -m venv "$VENV_DIR"
    echo "✅ Virtual environment created at $VENV_DIR"
}

# Create requirements file for offline operations
create_requirements() {
    if [ ! -f "$REQUIREMENTS_FILE" ]; then
        echo "📋 Creating requirements file for offline operations..."
        
        cat > "$REQUIREMENTS_FILE" << EOF
# Core PDF processing (offline-only requirements)
PyPDF2==3.0.1
pdfplumber==0.10.3
Pillow==10.0.1

# Database connectivity
psycopg2-binary==2.9.7

# Text processing
beautifulsoup4==4.12.2
lxml==4.9.3
requests==2.31.0

# Utilities
python-dotenv==1.0.0
pathlib==1.0.1

# Optional: Better PDF handling
pymupdf4llm==0.0.5
pymupdf==1.23.8

# Note: This setup is designed for OFFLINE operations only
# No AI/ML dependencies, no cloud services, no external APIs
# All processing is done locally using rule-based algorithms
EOF
        echo "✅ Created $REQUIREMENTS_FILE"
    else
        echo "📋 Using existing $REQUIREMENTS_FILE"
    fi
}

# Install requirements
install_requirements() {
    echo "⬇️  Installing Python packages..."
    
    # Activate virtual environment
    source "$VENV_DIR/bin/activate" || {
        echo "❌ Failed to activate virtual environment"
        exit 1
    }
    
    # Upgrade pip
    pip install --upgrade pip
    
    # Install requirements
    pip install -r "$REQUIREMENTS_FILE"
    
    echo "✅ Python packages installed successfully"
}

# Create environment configuration
create_env_config() {
    ENV_EXAMPLE_FILE=".env.example"
    ENV_FILE=".env.local"
    
    if [ ! -f "$ENV_EXAMPLE_FILE" ]; then
        echo "⚙️  Creating environment configuration template..."
        
        cat > "$ENV_EXAMPLE_FILE" << EOF
# Bylaw Management System - Environment Configuration
# Copy this file to .env.local and update with your values

# Database Configuration (Supabase)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# Database Direct Connection (for Python scripts)
SUPABASE_DB_HOST=your_db_host_here
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your_db_password_here

# Python Environment
PYTHON_VENV_PATH=./python-env
SCRAPERS_PATH=../bylaw_scrapers

# Processing Configuration
DEFAULT_BATCH_SIZE=10
DEFAULT_MAX_WORKERS=3
PROCESSING_TIMEOUT=300

# Scraper Configuration
SCRAPER_DELAY_SECONDS=2
SCRAPER_MAX_RETRIES=3
SCRAPER_USER_AGENT="BylawBot/1.0 (Municipal Document Collector)"

# Local Storage Paths
DOCUMENTS_STORAGE_PATH=./documents
LOGS_PATH=./logs
TEMP_PATH=./temp

# Feature Flags
ENABLE_OFFLINE_MODE=true
ENABLE_VERBOSE_LOGGING=false
ENABLE_DRY_RUN=false
EOF
        echo "✅ Created $ENV_EXAMPLE_FILE"
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        echo "📝 Creating local environment file..."
        cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
        echo "✅ Created $ENV_FILE - please update with your actual values"
    else
        echo "📝 Local environment file already exists"
    fi
}

# Create directory structure
create_directories() {
    echo "📁 Creating directory structure..."
    
    mkdir -p documents/{downloads,extracted,processed}
    mkdir -p logs/{scraping,extraction,analysis}
    mkdir -p temp
    mkdir -p scripts/python
    
    echo "✅ Directory structure created"
}

# Verify installation
verify_installation() {
    echo "🔍 Verifying installation..."
    
    # Activate virtual environment
    source "$VENV_DIR/bin/activate"
    
    # Test imports
    python3 -c "
import sys
import PyPDF2
import pdfplumber
import psycopg2
import requests
import bs4
print('✅ All required packages imported successfully')
print(f'🐍 Python version: {sys.version}')
"
    
    echo "✅ Installation verified successfully"
}

# Create helper script
create_helper_script() {
    HELPER_SCRIPT="scripts/python-helper.sh"
    
    cat > "$HELPER_SCRIPT" << EOF
#!/bin/bash
# Helper script to run Python commands in the virtual environment

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
VENV_PATH="\$SCRIPT_DIR/../python-env"

if [ ! -d "\$VENV_PATH" ]; then
    echo "❌ Virtual environment not found. Run: npm run setup-python"
    exit 1
fi

# Activate virtual environment and run command
source "\$VENV_PATH/bin/activate"
exec "\$@"
EOF
    
    chmod +x "$HELPER_SCRIPT"
    echo "✅ Created Python helper script at $HELPER_SCRIPT"
}

# Main installation process
main() {
    echo "Starting Python environment setup..."
    
    check_python
    create_venv
    create_requirements
    install_requirements
    create_env_config
    create_directories
    create_helper_script
    verify_installation
    
    echo ""
    echo "🎉 Python Environment Setup Complete!"
    echo "===================================="
    echo ""
    echo "Next steps:"
    echo "1. Update .env.local with your database credentials"
    echo "2. Test the CLI tools:"
    echo "   npm run scrape -- --help"
    echo "   npm run extract -- --help"
    echo "   npm run analyze -- --help"
    echo "   npm run process -- --help"
    echo ""
    echo "3. Run a test extraction:"
    echo "   npm run extract toronto -- --batch-size=1 --verbose"
    echo ""
    echo "4. Run full pipeline:"
    echo "   npm run process toronto"
    echo ""
    echo "📖 For more information, see the README.md file"
    echo ""
}

# Show help
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    echo "Python Environment Setup Script"
    echo ""
    echo "Usage: ./setup-python.sh [options]"
    echo ""
    echo "Options:"
    echo "  --help, -h    Show this help message"
    echo ""
    echo "This script sets up a Python virtual environment with all required"
    echo "dependencies for offline document processing (no AI/ML dependencies)."
    echo ""
    echo "What it does:"
    echo "- Creates a Python virtual environment"
    echo "- Installs PDF processing libraries (PyPDF2, pdfplumber)"
    echo "- Installs database connectivity (psycopg2)"
    echo "- Creates configuration templates"
    echo "- Sets up directory structure"
    echo "- Verifies installation"
    echo ""
    exit 0
fi

# Run main function
main