"""
Bylaw Management Scrapers - Offline Municipality Scrapers

This package provides offline-only municipality scrapers for bylaw document collection.
All Redis/SSE dependencies have been removed for local operation.
"""

from .config.municipality_registry import get_registry
from .utils.output_manager import OutputManager
from .municipality_processor import MunicipalityProcessor
from .batch_coordinator import BatchCoordinator
from .local_runner import LocalRunner

__all__ = [
    'get_registry',
    'OutputManager', 
    'MunicipalityProcessor',
    'BatchCoordinator',
    'LocalRunner'
]