"""
Comprehensive Logging and Monitoring System for Scrapers
Provides structured logging, metrics collection, and performance monitoring
"""

import logging
import logging.handlers
import json
import time
import threading
import traceback
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from collections import defaultdict, deque
import weakref
import psutil
import os


class LogLevel(Enum):
    """Enhanced log levels"""
    TRACE = 5
    DEBUG = logging.DEBUG
    INFO = logging.INFO
    WARNING = logging.WARNING
    ERROR = logging.ERROR
    CRITICAL = logging.CRITICAL
    PERFORMANCE = 25  # Custom level for performance metrics
    SECURITY = 35     # Custom level for security events


class EventType(Enum):
    """Types of events to log"""
    SCRAPER_START = "scraper_start"
    SCRAPER_END = "scraper_end"
    PAGE_FETCH = "page_fetch"
    PDF_FOUND = "pdf_found"
    ERROR = "error"
    WARNING = "warning"
    PERFORMANCE = "performance"
    SECURITY = "security"
    RESOURCE_USAGE = "resource_usage"
    RATE_LIMIT = "rate_limit"
    RETRY = "retry"
    VALIDATION = "validation"


@dataclass
class LogEvent:
    """Structured log event"""
    timestamp: datetime
    level: LogLevel
    event_type: EventType
    municipality_id: int
    scraper_name: str
    job_id: Optional[str] = None
    message: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    duration_ms: Optional[float] = None
    error: Optional[str] = None
    stack_trace: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        result['level'] = self.level.name
        result['event_type'] = self.event_type.value
        return result
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), default=str)


@dataclass
class PerformanceMetric:
    """Performance metric data point"""
    name: str
    value: float
    unit: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    tags: Dict[str, str] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'name': self.name,
            'value': self.value,
            'unit': self.unit,
            'timestamp': self.timestamp.isoformat(),
            'tags': self.tags
        }


class MetricsCollector:
    """Collects and aggregates performance metrics"""
    
    def __init__(self, max_history: int = 10000):
        self.max_history = max_history
        self.metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=max_history))
        self._lock = threading.Lock()
    
    def record(self, metric: PerformanceMetric):
        """Record a performance metric"""
        with self._lock:
            self.metrics[metric.name].append(metric)
    
    def get_metrics(self, name: str, time_window: Optional[timedelta] = None) -> List[PerformanceMetric]:
        """Get metrics for a given name"""
        with self._lock:
            metrics = list(self.metrics.get(name, []))
            
            if time_window:
                cutoff = datetime.utcnow() - time_window
                metrics = [m for m in metrics if m.timestamp >= cutoff]
            
            return metrics
    
    def get_summary(self, name: str, time_window: Optional[timedelta] = None) -> Dict[str, Any]:
        """Get summary statistics for a metric"""
        metrics = self.get_metrics(name, time_window)
        
        if not metrics:
            return {'count': 0}
        
        values = [m.value for m in metrics]
        
        return {
            'count': len(values),
            'min': min(values),
            'max': max(values),
            'avg': sum(values) / len(values),
            'latest': values[-1],
            'unit': metrics[-1].unit if metrics else None
        }
    
    def get_all_summaries(self, time_window: Optional[timedelta] = None) -> Dict[str, Dict[str, Any]]:
        """Get summaries for all metrics"""
        with self._lock:
            summaries = {}
            for name in self.metrics.keys():
                summaries[name] = self.get_summary(name, time_window)
            return summaries


class ResourceMonitor:
    """Monitor system resource usage"""
    
    def __init__(self, check_interval: float = 5.0):
        self.check_interval = check_interval
        self.process = psutil.Process()
        self.monitoring = False
        self._thread: Optional[threading.Thread] = None
        self.callbacks: List[Callable[[Dict[str, Any]], None]] = []
    
    def add_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Add callback for resource updates"""
        self.callbacks.append(callback)
    
    def start_monitoring(self):
        """Start resource monitoring in background thread"""
        if self.monitoring:
            return
        
        self.monitoring = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
    
    def stop_monitoring(self):
        """Stop resource monitoring"""
        self.monitoring = False
        if self._thread:
            self._thread.join(timeout=1)
    
    def _monitor_loop(self):
        """Main monitoring loop"""
        while self.monitoring:
            try:
                resources = self.get_current_usage()
                
                for callback in self.callbacks:
                    try:
                        callback(resources)
                    except Exception as e:
                        # Don't let callback errors stop monitoring
                        pass
                
                time.sleep(self.check_interval)
                
            except Exception as e:
                # Continue monitoring even if there are errors
                time.sleep(self.check_interval)
    
    def get_current_usage(self) -> Dict[str, Any]:
        """Get current resource usage"""
        try:
            memory_info = self.process.memory_info()
            cpu_percent = self.process.cpu_percent()
            
            # Get system-wide info
            system_memory = psutil.virtual_memory()
            system_cpu = psutil.cpu_percent()
            
            return {
                'timestamp': datetime.utcnow().isoformat(),
                'process': {
                    'pid': self.process.pid,
                    'memory_mb': memory_info.rss / 1024 / 1024,
                    'memory_percent': self.process.memory_percent(),
                    'cpu_percent': cpu_percent,
                    'num_threads': self.process.num_threads()
                },
                'system': {
                    'memory_percent': system_memory.percent,
                    'memory_available_mb': system_memory.available / 1024 / 1024,
                    'cpu_percent': system_cpu
                }
            }
        except Exception as e:
            return {
                'timestamp': datetime.utcnow().isoformat(),
                'error': str(e)
            }


class StructuredLogger:
    """Enhanced structured logger with metrics and monitoring"""
    
    def __init__(
        self,
        name: str,
        log_level: LogLevel = LogLevel.INFO,
        log_file: Optional[str] = None,
        max_file_size: int = 10 * 1024 * 1024,  # 10MB
        backup_count: int = 5,
        enable_console: bool = True,
        enable_metrics: bool = True,
        enable_resource_monitoring: bool = True
    ):
        self.name = name
        self.log_level = log_level
        
        # Set up Python logger
        self.logger = logging.getLogger(name)
        self.logger.setLevel(log_level.value)
        
        # Clear existing handlers
        self.logger.handlers.clear()
        
        # Add custom log levels
        logging.addLevelName(LogLevel.TRACE.value, 'TRACE')
        logging.addLevelName(LogLevel.PERFORMANCE.value, 'PERFORMANCE')
        logging.addLevelName(LogLevel.SECURITY.value, 'SECURITY')
        
        # Set up formatters
        self.json_formatter = self._create_json_formatter()
        self.console_formatter = self._create_console_formatter()
        
        # Add handlers
        if enable_console:
            self._add_console_handler()
        
        if log_file:
            self._add_file_handler(log_file, max_file_size, backup_count)
        
        # Initialize components
        self.metrics_collector = MetricsCollector() if enable_metrics else None
        self.resource_monitor = ResourceMonitor() if enable_resource_monitoring else None
        
        # Event storage for debugging
        self.recent_events: deque = deque(maxlen=1000)
        self._lock = threading.Lock()
        
        # Start resource monitoring
        if self.resource_monitor:
            self.resource_monitor.add_callback(self._on_resource_update)
            self.resource_monitor.start_monitoring()
        
        self.info("Structured logger initialized", {
            'name': name,
            'log_level': log_level.name,
            'metrics_enabled': enable_metrics,
            'resource_monitoring_enabled': enable_resource_monitoring
        })
    
    def _create_json_formatter(self) -> logging.Formatter:
        """Create JSON formatter for structured logging"""
        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_entry = {
                    'timestamp': datetime.fromtimestamp(record.created).isoformat(),
                    'level': record.levelname,
                    'logger': record.name,
                    'message': record.getMessage(),
                    'module': record.module,
                    'function': record.funcName,
                    'line': record.lineno
                }
                
                if hasattr(record, 'structured_data'):
                    log_entry.update(record.structured_data)
                
                if record.exc_info:
                    log_entry['exception'] = self.formatException(record.exc_info)
                
                return json.dumps(log_entry, default=str)
        
        return JsonFormatter()
    
    def _create_console_formatter(self) -> logging.Formatter:
        """Create human-readable console formatter"""
        return logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    def _add_console_handler(self):
        """Add console handler"""
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(self.console_formatter)
        self.logger.addHandler(console_handler)
    
    def _add_file_handler(self, log_file: str, max_size: int, backup_count: int):
        """Add rotating file handler"""
        # Ensure log directory exists
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        
        file_handler = logging.handlers.RotatingFileHandler(
            log_file,
            maxBytes=max_size,
            backupCount=backup_count
        )
        file_handler.setFormatter(self.json_formatter)
        self.logger.addHandler(file_handler)
    
    def _on_resource_update(self, resources: Dict[str, Any]):
        """Handle resource usage updates"""
        if self.metrics_collector:
            # Record resource metrics
            if 'process' in resources:
                process = resources['process']
                self.metrics_collector.record(PerformanceMetric(
                    name='memory_usage_mb',
                    value=process.get('memory_mb', 0),
                    unit='MB',
                    tags={'type': 'process'}
                ))
                
                self.metrics_collector.record(PerformanceMetric(
                    name='cpu_usage_percent',
                    value=process.get('cpu_percent', 0),
                    unit='%',
                    tags={'type': 'process'}
                ))
    
    def _log_event(self, event: LogEvent):
        """Log a structured event"""
        with self._lock:
            self.recent_events.append(event)
        
        # Create log record with structured data
        record = self.logger.makeRecord(
            name=self.logger.name,
            level=event.level.value,
            fn='',
            lno=0,
            msg=event.message,
            args=(),
            exc_info=None
        )
        
        # Add structured data
        record.structured_data = event.to_dict()
        
        self.logger.handle(record)
    
    def trace(self, message: str, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log trace level event"""
        self._log_event(LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.TRACE,
            event_type=EventType.SCRAPER_START,  # Default event type
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {}
        ))
    
    def debug(self, message: str, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log debug level event"""
        self._log_event(LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.DEBUG,
            event_type=EventType.SCRAPER_START,
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {}
        ))
    
    def info(self, message: str, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log info level event"""
        self._log_event(LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.INFO,
            event_type=EventType.SCRAPER_START,
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {}
        ))
    
    def warning(self, message: str, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log warning level event"""
        self._log_event(LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.WARNING,
            event_type=EventType.WARNING,
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {}
        ))
    
    def error(self, message: str, error: Exception = None, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log error level event"""
        event = LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.ERROR,
            event_type=EventType.ERROR,
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {}
        )
        
        if error:
            event.error = str(error)
            event.stack_trace = traceback.format_exc()
        
        self._log_event(event)
    
    def performance(self, message: str, duration_ms: float, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log performance event"""
        event = LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.PERFORMANCE,
            event_type=EventType.PERFORMANCE,
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {},
            duration_ms=duration_ms
        )
        
        self._log_event(event)
        
        # Record performance metric
        if self.metrics_collector:
            self.metrics_collector.record(PerformanceMetric(
                name='operation_duration',
                value=duration_ms,
                unit='ms',
                tags={
                    'operation': message,
                    'municipality_id': str(municipality_id),
                    'scraper_name': scraper_name
                }
            ))
    
    def security(self, message: str, data: Dict[str, Any] = None, municipality_id: int = 0, scraper_name: str = "", job_id: str = None):
        """Log security event"""
        self._log_event(LogEvent(
            timestamp=datetime.utcnow(),
            level=LogLevel.SECURITY,
            event_type=EventType.SECURITY,
            municipality_id=municipality_id,
            scraper_name=scraper_name,
            job_id=job_id,
            message=message,
            data=data or {}
        ))
    
    def get_recent_events(self, count: int = 100) -> List[Dict[str, Any]]:
        """Get recent log events"""
        with self._lock:
            events = list(self.recent_events)
            return [event.to_dict() for event in events[-count:]]
    
    def get_metrics_summary(self, time_window: Optional[timedelta] = None) -> Dict[str, Any]:
        """Get metrics summary"""
        if not self.metrics_collector:
            return {'metrics_disabled': True}
        
        return self.metrics_collector.get_all_summaries(time_window)
    
    def get_resource_usage(self) -> Dict[str, Any]:
        """Get current resource usage"""
        if not self.resource_monitor:
            return {'resource_monitoring_disabled': True}
        
        return self.resource_monitor.get_current_usage()
    
    def shutdown(self):
        """Shutdown logger and cleanup resources"""
        if self.resource_monitor:
            self.resource_monitor.stop_monitoring()
        
        # Close handlers
        for handler in self.logger.handlers:
            handler.close()
        
        self.info("Structured logger shutdown complete")


# Global logger instance
_global_logger: Optional[StructuredLogger] = None
_logger_lock = threading.Lock()


def get_logger(
    name: str = "scraper_system",
    log_level: LogLevel = LogLevel.INFO,
    log_file: Optional[str] = None
) -> StructuredLogger:
    """Get or create global structured logger"""
    global _global_logger
    
    with _logger_lock:
        if _global_logger is None:
            # Default log file location
            if log_file is None:
                log_dir = Path.cwd() / "logs"
                log_dir.mkdir(exist_ok=True)
                log_file = str(log_dir / "scraper_system.log")
            
            _global_logger = StructuredLogger(
                name=name,
                log_level=log_level,
                log_file=log_file,
                enable_console=True,
                enable_metrics=True,
                enable_resource_monitoring=True
            )
    
    return _global_logger


def shutdown_logging():
    """Shutdown global logger"""
    global _global_logger
    
    with _logger_lock:
        if _global_logger:
            _global_logger.shutdown()
            _global_logger = None
