"""
Dynamic Configuration Management System
Provides flexible configuration management for scrapers with hot reloading
"""

import json
import yaml
import os
import threading
import time
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable, Union
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
import logging
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class ConfigFormat(Enum):
    """Supported configuration formats"""
    JSON = "json"
    YAML = "yaml"
    ENV = "env"


class ConfigScope(Enum):
    """Configuration scope levels"""
    GLOBAL = "global"
    SCRAPER = "scraper"
    MUNICIPALITY = "municipality"
    JOB = "job"


@dataclass
class ScraperConfig:
    """Configuration for individual scrapers"""
    # Resource limits
    max_concurrent_requests: int = 10
    max_memory_mb: int = 512
    request_timeout_seconds: int = 30
    rate_limit_requests_per_second: float = 2.0
    max_response_size_mb: int = 100
    
    # Retry configuration
    max_retries: int = 3
    base_delay: float = 1.0
    max_delay: float = 60.0
    exponential_base: float = 2.0
    jitter: bool = True
    backoff_strategy: str = "exponential"
    
    # Scraping behavior
    respect_robots_txt: bool = True
    user_agent: str = "Mozilla/5.0 (compatible; MunicipalScraper/1.0)"
    enable_javascript: bool = False
    enable_cookies: bool = True
    follow_redirects: bool = True
    max_redirects: int = 5
    
    # Data processing
    validate_documents: bool = True
    check_duplicates: bool = True
    min_document_size_bytes: int = 1024
    max_document_size_mb: int = 50
    
    # Logging and monitoring
    log_level: str = "INFO"
    enable_performance_monitoring: bool = True
    enable_resource_monitoring: bool = True
    log_requests: bool = False
    
    # Custom scraper settings
    custom_headers: Dict[str, str] = field(default_factory=dict)
    url_patterns: Dict[str, str] = field(default_factory=dict)
    css_selectors: Dict[str, str] = field(default_factory=dict)
    xpath_expressions: Dict[str, str] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ScraperConfig':
        """Create from dictionary"""
        # Filter out unknown fields
        valid_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered_data = {k: v for k, v in data.items() if k in valid_fields}
        return cls(**filtered_data)


@dataclass
class MunicipalityConfig:
    """Configuration for specific municipalities"""
    municipality_id: int
    name: str
    scraper_name: str
    base_url: str
    search_url: str
    
    # Schedule configuration
    schedule_enabled: bool = False
    schedule_frequency: str = "daily"  # daily, weekly, monthly
    schedule_time: str = "02:00"  # HH:MM format
    schedule_timezone: str = "UTC"
    
    # Municipality-specific overrides
    scraper_config_overrides: Dict[str, Any] = field(default_factory=dict)
    
    # Filtering and processing
    filter_keywords: List[str] = field(default_factory=list)
    exclude_patterns: List[str] = field(default_factory=list)
    priority_keywords: List[str] = field(default_factory=list)
    
    # Contact and metadata
    contact_email: Optional[str] = None
    website_url: Optional[str] = None
    notes: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'MunicipalityConfig':
        """Create from dictionary"""
        return cls(**data)


class ConfigFileWatcher(FileSystemEventHandler):
    """Watches configuration files for changes"""
    
    def __init__(self, config_manager: 'ConfigManager'):
        self.config_manager = config_manager
        self.last_modified = {}
    
    def on_modified(self, event):
        if event.is_directory:
            return
        
        file_path = Path(event.src_path)
        
        # Check if it's a config file we're watching
        if file_path.suffix.lower() in ['.json', '.yaml', '.yml', '.env']:
            # Debounce rapid file changes
            current_time = time.time()
            last_modified = self.last_modified.get(file_path, 0)
            
            if current_time - last_modified > 1.0:  # 1 second debounce
                self.last_modified[file_path] = current_time
                self.config_manager._reload_config_file(file_path)


class ConfigManager:
    """Manages dynamic configuration for scrapers"""
    
    def __init__(
        self,
        config_dir: Optional[str] = None,
        enable_hot_reload: bool = True,
        logger: Optional[logging.Logger] = None
    ):
        self.config_dir = Path(config_dir or "config")
        self.enable_hot_reload = enable_hot_reload
        self.logger = logger or self._setup_logger()
        
        # Configuration storage
        self.global_config: Dict[str, Any] = {}
        self.scraper_configs: Dict[str, ScraperConfig] = {}
        self.municipality_configs: Dict[int, MunicipalityConfig] = {}
        
        # Callbacks for config changes
        self.change_callbacks: List[Callable[[str, Dict[str, Any]], None]] = []
        
        # File watching
        self.observer: Optional[Observer] = None
        self._lock = threading.Lock()
        
        # Ensure config directory exists
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        # Load initial configuration
        self._load_all_configs()
        
        # Start file watching if enabled
        if self.enable_hot_reload:
            self._start_file_watcher()
        
        self.logger.info(f"Configuration manager initialized with directory: {self.config_dir}")
    
    def _setup_logger(self) -> logging.Logger:
        """Set up logger for config manager"""
        logger = logging.getLogger("config_manager")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def _start_file_watcher(self):
        """Start watching configuration files for changes"""
        try:
            self.observer = Observer()
            event_handler = ConfigFileWatcher(self)
            self.observer.schedule(event_handler, str(self.config_dir), recursive=True)
            self.observer.start()
            self.logger.info("Configuration file watcher started")
        except Exception as e:
            self.logger.warning(f"Failed to start config file watcher: {e}")
    
    def _stop_file_watcher(self):
        """Stop watching configuration files"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None
            self.logger.info("Configuration file watcher stopped")
    
    def _load_all_configs(self):
        """Load all configuration files"""
        with self._lock:
            # Load global config
            self._load_global_config()
            
            # Load scraper configs
            self._load_scraper_configs()
            
            # Load municipality configs
            self._load_municipality_configs()
    
    def _load_global_config(self):
        """Load global configuration"""
        global_config_file = self.config_dir / "global.yaml"
        
        if global_config_file.exists():
            try:
                with open(global_config_file, 'r') as f:
                    self.global_config = yaml.safe_load(f) or {}
                self.logger.info("Loaded global configuration")
            except Exception as e:
                self.logger.error(f"Failed to load global config: {e}")
                self.global_config = {}
        else:
            # Create default global config
            default_config = {
                'system': {
                    'max_concurrent_jobs': 5,
                    'log_level': 'INFO',
                    'enable_metrics': True,
                    'enable_monitoring': True
                },
                'database': {
                    'connection_timeout': 30,
                    'max_connections': 10
                },
                'api': {
                    'rate_limit': 100,
                    'timeout': 60
                }
            }
            
            self._save_config_file(global_config_file, default_config)
            self.global_config = default_config
    
    def _load_scraper_configs(self):
        """Load scraper-specific configurations"""
        scrapers_dir = self.config_dir / "scrapers"
        scrapers_dir.mkdir(exist_ok=True)
        
        # Load default scraper config
        default_config_file = scrapers_dir / "default.yaml"
        if not default_config_file.exists():
            default_config = ScraperConfig()
            self._save_config_file(default_config_file, default_config.to_dict())
        
        # Load all scraper config files
        for config_file in scrapers_dir.glob("*.yaml"):
            scraper_name = config_file.stem
            try:
                with open(config_file, 'r') as f:
                    config_data = yaml.safe_load(f) or {}
                
                self.scraper_configs[scraper_name] = ScraperConfig.from_dict(config_data)
                self.logger.debug(f"Loaded config for scraper: {scraper_name}")
            except Exception as e:
                self.logger.error(f"Failed to load config for scraper {scraper_name}: {e}")
    
    def _load_municipality_configs(self):
        """Load municipality-specific configurations"""
        municipalities_dir = self.config_dir / "municipalities"
        municipalities_dir.mkdir(exist_ok=True)
        
        # Load all municipality config files
        for config_file in municipalities_dir.glob("*.yaml"):
            try:
                with open(config_file, 'r') as f:
                    config_data = yaml.safe_load(f) or {}
                
                municipality_config = MunicipalityConfig.from_dict(config_data)
                self.municipality_configs[municipality_config.municipality_id] = municipality_config
                self.logger.debug(f"Loaded config for municipality: {municipality_config.name}")
            except Exception as e:
                self.logger.error(f"Failed to load municipality config from {config_file}: {e}")
    
    def _save_config_file(self, file_path: Path, config_data: Dict[str, Any]):
        """Save configuration to file"""
        try:
            with open(file_path, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False, indent=2)
            self.logger.debug(f"Saved config file: {file_path}")
        except Exception as e:
            self.logger.error(f"Failed to save config file {file_path}: {e}")
    
    def _reload_config_file(self, file_path: Path):
        """Reload a specific configuration file"""
        self.logger.info(f"Reloading configuration file: {file_path}")
        
        try:
            # Determine config type based on file location
            relative_path = file_path.relative_to(self.config_dir)
            
            if file_path.name == "global.yaml":
                self._load_global_config()
                self._notify_config_change("global", self.global_config)
            
            elif relative_path.parts[0] == "scrapers":
                scraper_name = file_path.stem
                with open(file_path, 'r') as f:
                    config_data = yaml.safe_load(f) or {}
                
                self.scraper_configs[scraper_name] = ScraperConfig.from_dict(config_data)
                self._notify_config_change(f"scraper.{scraper_name}", config_data)
            
            elif relative_path.parts[0] == "municipalities":
                with open(file_path, 'r') as f:
                    config_data = yaml.safe_load(f) or {}
                
                municipality_config = MunicipalityConfig.from_dict(config_data)
                self.municipality_configs[municipality_config.municipality_id] = municipality_config
                self._notify_config_change(f"municipality.{municipality_config.municipality_id}", config_data)
            
        except Exception as e:
            self.logger.error(f"Failed to reload config file {file_path}: {e}")
    
    def _notify_config_change(self, config_key: str, config_data: Dict[str, Any]):
        """Notify listeners of configuration changes"""
        for callback in self.change_callbacks:
            try:
                callback(config_key, config_data)
            except Exception as e:
                self.logger.warning(f"Config change callback failed: {e}")
    
    def add_change_callback(self, callback: Callable[[str, Dict[str, Any]], None]):
        """Add callback for configuration changes"""
        self.change_callbacks.append(callback)
    
    def get_global_config(self) -> Dict[str, Any]:
        """Get global configuration"""
        with self._lock:
            return self.global_config.copy()
    
    def get_scraper_config(self, scraper_name: str) -> ScraperConfig:
        """Get configuration for a specific scraper"""
        with self._lock:
            # Return scraper-specific config or default
            return self.scraper_configs.get(scraper_name, self.scraper_configs.get('default', ScraperConfig()))
    
    def get_municipality_config(self, municipality_id: int) -> Optional[MunicipalityConfig]:
        """Get configuration for a specific municipality"""
        with self._lock:
            return self.municipality_configs.get(municipality_id)
    
    def get_effective_config(
        self,
        scraper_name: str,
        municipality_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Get effective configuration by merging global, scraper, and municipality configs"""
        with self._lock:
            # Start with global config
            effective_config = self.global_config.copy()
            
            # Merge scraper config
            scraper_config = self.get_scraper_config(scraper_name)
            effective_config.update(scraper_config.to_dict())
            
            # Merge municipality-specific overrides
            if municipality_id:
                municipality_config = self.municipality_configs.get(municipality_id)
                if municipality_config and municipality_config.scraper_config_overrides:
                    effective_config.update(municipality_config.scraper_config_overrides)
            
            return effective_config
    
    def update_scraper_config(self, scraper_name: str, config_updates: Dict[str, Any]):
        """Update scraper configuration"""
        with self._lock:
            current_config = self.get_scraper_config(scraper_name)
            
            # Update config data
            config_dict = current_config.to_dict()
            config_dict.update(config_updates)
            
            # Validate and save
            updated_config = ScraperConfig.from_dict(config_dict)
            self.scraper_configs[scraper_name] = updated_config
            
            # Save to file
            config_file = self.config_dir / "scrapers" / f"{scraper_name}.yaml"
            self._save_config_file(config_file, config_dict)
            
            # Notify listeners
            self._notify_config_change(f"scraper.{scraper_name}", config_dict)
            
            self.logger.info(f"Updated configuration for scraper: {scraper_name}")
    
    def update_municipality_config(self, municipality_id: int, config_updates: Dict[str, Any]):
        """Update municipality configuration"""
        with self._lock:
            current_config = self.municipality_configs.get(municipality_id)
            
            if current_config:
                config_dict = current_config.to_dict()
                config_dict.update(config_updates)
            else:
                config_dict = config_updates
            
            # Validate and save
            updated_config = MunicipalityConfig.from_dict(config_dict)
            self.municipality_configs[municipality_id] = updated_config
            
            # Save to file
            config_file = self.config_dir / "municipalities" / f"{municipality_id}.yaml"
            self._save_config_file(config_file, config_dict)
            
            # Notify listeners
            self._notify_config_change(f"municipality.{municipality_id}", config_dict)
            
            self.logger.info(f"Updated configuration for municipality: {municipality_id}")
    
    def create_municipality_config(
        self,
        municipality_id: int,
        name: str,
        scraper_name: str,
        base_url: str,
        search_url: str,
        **kwargs
    ) -> MunicipalityConfig:
        """Create new municipality configuration"""
        config_data = {
            'municipality_id': municipality_id,
            'name': name,
            'scraper_name': scraper_name,
            'base_url': base_url,
            'search_url': search_url,
            **kwargs
        }
        
        municipality_config = MunicipalityConfig.from_dict(config_data)
        
        with self._lock:
            self.municipality_configs[municipality_id] = municipality_config
        
        # Save to file
        config_file = self.config_dir / "municipalities" / f"{municipality_id}.yaml"
        self._save_config_file(config_file, config_data)
        
        self.logger.info(f"Created configuration for new municipality: {name} (ID: {municipality_id})")
        return municipality_config
    
    def list_scrapers(self) -> List[str]:
        """List all configured scrapers"""
        with self._lock:
            return list(self.scraper_configs.keys())
    
    def list_municipalities(self) -> List[Dict[str, Any]]:
        """List all configured municipalities"""
        with self._lock:
            return [
                {
                    'id': config.municipality_id,
                    'name': config.name,
                    'scraper_name': config.scraper_name,
                    'schedule_enabled': config.schedule_enabled
                }
                for config in self.municipality_configs.values()
            ]
    
    def export_config(self, config_type: str = "all") -> Dict[str, Any]:
        """Export configuration for backup or migration"""
        with self._lock:
            export_data = {
                'export_timestamp': datetime.utcnow().isoformat(),
                'config_version': '1.0'
            }
            
            if config_type in ['all', 'global']:
                export_data['global'] = self.global_config
            
            if config_type in ['all', 'scrapers']:
                export_data['scrapers'] = {
                    name: config.to_dict()
                    for name, config in self.scraper_configs.items()
                }
            
            if config_type in ['all', 'municipalities']:
                export_data['municipalities'] = {
                    str(id): config.to_dict()
                    for id, config in self.municipality_configs.items()
                }
            
            return export_data
    
    def import_config(self, config_data: Dict[str, Any], overwrite: bool = False):
        """Import configuration from backup or migration"""
        with self._lock:
            if 'global' in config_data:
                if overwrite or not self.global_config:
                    self.global_config = config_data['global']
                    self._save_config_file(self.config_dir / "global.yaml", self.global_config)
            
            if 'scrapers' in config_data:
                for scraper_name, scraper_config in config_data['scrapers'].items():
                    if overwrite or scraper_name not in self.scraper_configs:
                        self.scraper_configs[scraper_name] = ScraperConfig.from_dict(scraper_config)
                        config_file = self.config_dir / "scrapers" / f"{scraper_name}.yaml"
                        self._save_config_file(config_file, scraper_config)
            
            if 'municipalities' in config_data:
                for municipality_id_str, municipality_config in config_data['municipalities'].items():
                    municipality_id = int(municipality_id_str)
                    if overwrite or municipality_id not in self.municipality_configs:
                        self.municipality_configs[municipality_id] = MunicipalityConfig.from_dict(municipality_config)
                        config_file = self.config_dir / "municipalities" / f"{municipality_id}.yaml"
                        self._save_config_file(config_file, municipality_config)
        
        self.logger.info("Configuration import completed")
    
    def shutdown(self):
        """Shutdown configuration manager"""
        self._stop_file_watcher()
        self.logger.info("Configuration manager shutdown complete")


# Global configuration manager instance
_config_manager: Optional[ConfigManager] = None
_config_lock = threading.Lock()


def get_config_manager(config_dir: Optional[str] = None) -> ConfigManager:
    """Get or create global configuration manager"""
    global _config_manager
    
    with _config_lock:
        if _config_manager is None:
            _config_manager = ConfigManager(config_dir=config_dir)
    
    return _config_manager


def shutdown_config_manager():
    """Shutdown global configuration manager"""
    global _config_manager
    
    with _config_lock:
        if _config_manager:
            _config_manager.shutdown()
            _config_manager = None
