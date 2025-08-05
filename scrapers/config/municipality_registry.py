"""
Municipality Registry - Configuration management for all available scrapers

This module provides a centralized registry of all municipalities with their
scraper configurations, allowing for flexible selection and processing.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional, Set
from pathlib import Path
import importlib
import inspect


@dataclass
class MunicipalityConfig:
    """Configuration for a municipality scraper"""
    id: int
    name: str
    scraper_module: str
    scraper_class: str
    active: bool = True
    priority: int = 1
    base_url: str = ""
    search_url: str = ""
    estimated_pages: int = 10
    estimated_pdfs: int = 100
    notes: str = ""


class MunicipalityRegistry:
    """Registry of all available municipalities and their scrapers"""
    
    def __init__(self):
        self.municipalities: Dict[int, MunicipalityConfig] = {}
        self.scraper_classes: Dict[str, type] = {}
        self._initialize_registry()
    
    def _initialize_registry(self):
        """Initialize the registry with all available municipalities"""
        # Define all municipalities with their scraper configurations
        municipalities_data = [
            # ID, Name, Module, Class, Active, Priority, EstPages, EstPDFs
            (1, "City of Toronto", "toronto_v2", "TorontoScraperV2", True, 1, 20, 500),
            (2, "City of Ottawa", "ottawa_v2", "OttawaScraperV2", True, 1, 15, 300),
            (3, "City of Hamilton", "hamilton_v2", "HamiltonScraperV2", True, 1, 12, 200),
            (4, "City of Mississauga", "mississauga_v2", "MississaugaScraperV2", True, 1, 10, 150),
            (5, "City of Brampton", "brampton_v2", "BramptonScraperV2", True, 1, 8, 120),
            (6, "City of Markham", "markham_v2", "MarkhamScraperV2", True, 1, 8, 100),
            (7, "City of Vaughan", "vaughan_v2", "VaughanScraperV2", True, 1, 8, 100),
            (8, "City of Richmond Hill", "richmond_hill_v2", "RichmondHillScraperV2", True, 1, 6, 80),
            (9, "City of Oakville", "oakville_v2", "OakvilleScraperV2", True, 1, 6, 80),
            (10, "City of Burlington", "burlington_v2", "BurlingtonScraperV2", True, 1, 6, 80),
            (11, "Town of Milton", "milton_v2", "MiltonScraperV2", True, 1, 5, 60),
            (12, "City of Pickering", "pickering_v2", "PickeringScraperV2", True, 1, 5, 60),
            (13, "Town of Whitby", "whitby_v2", "WhitbyScraperV2", True, 1, 5, 60),
            (14, "City of Oshawa", "oshawa_v2", "OshawaScraperV2", True, 1, 5, 60),
            (15, "Town of Caledon", "caledon_v2", "CaledonScraperV2", True, 1, 4, 50),
            (16, "City of Kitchener", "kitchener_v2", "KitchenerScraperV2", True, 1, 8, 100),
            (17, "City of Barrie", "barrie_v2", "BarrieScraperV2", True, 1, 6, 80),
            (18, "City of Brantford", "brantford_v2", "BrantfordScraperV2", True, 1, 5, 60),
            (19, "City of Peterborough", "peterborough_v2", "PeterboroughScraperV2", True, 1, 5, 60),
            (20, "City of Niagara Falls", "niagarafalls_v2", "NiagaraFallsScraperV2", True, 1, 5, 60),
            (21, "City of Sudbury", "sudbury_v2", "SudburyScraperV2", True, 1, 6, 80),
            # Legacy scrapers (inactive by default)
            (101, "Ajax (Legacy)", "ajax", "AjaxScraper", False, 3, 5, 40),
        ]
        
        for data in municipalities_data:
            municipality_id, name, module, class_name, active, priority, est_pages, est_pdfs = data
            
            config = MunicipalityConfig(
                id=municipality_id,
                name=name,
                scraper_module=module,
                scraper_class=class_name,
                active=active,
                priority=priority,
                estimated_pages=est_pages,
                estimated_pdfs=est_pdfs
            )
            
            self.municipalities[municipality_id] = config
        
        # Auto-discover and validate scraper classes
        self._discover_scrapers()
    
    def _discover_scrapers(self):
        """Discover and validate available scraper classes"""
        scrapers_dir = Path(__file__).parent.parent
        
        for municipality_id, config in self.municipalities.items():
            try:
                # Try to import the module - use relative import for local scrapers
                try:
                    module = importlib.import_module(f'.{config.scraper_module}', package='scrapers')
                except ImportError:
                    # Fallback to absolute import
                    module = importlib.import_module(f'scrapers.{config.scraper_module}')
                
                # Find the scraper class
                scraper_class = getattr(module, config.scraper_class, None)
                if scraper_class:
                    self.scraper_classes[config.scraper_module] = scraper_class
                    
                    # Validate it's a proper scraper class
                    if hasattr(scraper_class, 'run_scrape'):
                        config.active = config.active  # Keep original active status
                    else:
                        print(f"Warning: {config.scraper_class} doesn't have run_scrape method")
                        config.active = False
                else:
                    print(f"Warning: Class {config.scraper_class} not found in {config.scraper_module}")
                    config.active = False
                    
            except ImportError as e:
                print(f"Warning: Could not import {config.scraper_module}: {e}")
                config.active = False
            except Exception as e:
                print(f"Warning: Error loading {config.scraper_module}: {e}")
                config.active = False
    
    def get_municipality(self, municipality_id: int) -> Optional[MunicipalityConfig]:
        """Get municipality configuration by ID"""
        return self.municipalities.get(municipality_id)
    
    def get_municipality_by_name(self, name: str) -> Optional[MunicipalityConfig]:
        """Get municipality configuration by name (case-insensitive)"""
        name_lower = name.lower()
        for config in self.municipalities.values():
            if config.name.lower() == name_lower:
                return config
        return None
    
    def get_all_municipalities(self, active_only: bool = True) -> List[MunicipalityConfig]:
        """Get all municipalities, optionally filtered by active status"""
        municipalities = list(self.municipalities.values())
        if active_only:
            municipalities = [m for m in municipalities if m.active]
        return sorted(municipalities, key=lambda x: (x.priority, x.name))
    
    def get_active_ids(self) -> Set[int]:
        """Get set of all active municipality IDs"""
        return {m.id for m in self.municipalities.values() if m.active}
    
    def get_scraper_class(self, municipality_id: int) -> Optional[type]:
        """Get the scraper class for a municipality"""
        config = self.get_municipality(municipality_id)
        if not config or not config.active:
            return None
        return self.scraper_classes.get(config.scraper_module)
    
    def parse_municipality_selection(self, selection: str) -> Set[int]:
        """
        Parse municipality selection string into set of IDs
        
        Supported formats:
        - "all" -> all active municipalities
        - "1,2,3" -> specific IDs  
        - "toronto,ottawa" -> by name
        - "1-5" -> range of IDs
        """
        if not selection or selection.lower() == "all":
            return self.get_active_ids()
        
        municipality_ids = set()
        
        # Split by comma and process each part
        parts = [part.strip() for part in selection.split(',')]
        
        for part in parts:
            if not part:
                continue
                
            # Check if it's a range (e.g., "1-5")
            if '-' in part and not part.replace('-', '').replace(' ', '').isalpha():
                try:
                    start, end = part.split('-', 1)
                    start_id = int(start.strip())
                    end_id = int(end.strip())
                    for i in range(start_id, end_id + 1):
                        if i in self.municipalities:
                            municipality_ids.add(i)
                except ValueError:
                    print(f"Warning: Invalid range format: {part}")
                continue
            
            # Check if it's a numeric ID
            try:
                municipality_id = int(part)
                if municipality_id in self.municipalities:
                    municipality_ids.add(municipality_id)
                else:
                    print(f"Warning: Municipality ID {municipality_id} not found")
                continue
            except ValueError:
                pass
            
            # Check if it's a municipality name
            config = self.get_municipality_by_name(part)
            if config:
                municipality_ids.add(config.id)
            else:
                print(f"Warning: Municipality '{part}' not found")
        
        return municipality_ids
    
    def validate_municipalities(self, municipality_ids: Set[int]) -> Set[int]:
        """Validate and filter municipality IDs to only include active ones"""
        valid_ids = set()
        for municipality_id in municipality_ids:
            config = self.get_municipality(municipality_id)
            if config and config.active:
                valid_ids.add(municipality_id)
            else:
                print(f"Warning: Municipality {municipality_id} is not active or not found")
        return valid_ids
    
    def get_summary(self) -> Dict:
        """Get summary statistics of the registry"""
        all_municipalities = list(self.municipalities.values())
        active_municipalities = [m for m in all_municipalities if m.active]
        
        return {
            'total_municipalities': len(all_municipalities),
            'active_municipalities': len(active_municipalities),
            'inactive_municipalities': len(all_municipalities) - len(active_municipalities),
            'total_scrapers_loaded': len(self.scraper_classes),
            'estimated_total_pages': sum(m.estimated_pages for m in active_municipalities),
            'estimated_total_pdfs': sum(m.estimated_pdfs for m in active_municipalities)
        }
    
    def list_municipalities(self, active_only: bool = True) -> str:
        """Get a formatted list of municipalities for display"""
        municipalities = self.get_all_municipalities(active_only)
        
        lines = []
        lines.append(f"Available Municipalities ({'Active' if active_only else 'All'}):")
        lines.append("=" * 50)
        
        for config in municipalities:
            status = "✓" if config.active else "✗"
            lines.append(f"{status} {config.id:2d}. {config.name}")
            if not active_only or not config.active:
                lines.append(f"      Module: {config.scraper_module}")
                lines.append(f"      Est. Pages: {config.estimated_pages}, PDFs: {config.estimated_pdfs}")
        
        return "\n".join(lines)


# Global registry instance
_registry_instance: Optional[MunicipalityRegistry] = None


def get_registry() -> MunicipalityRegistry:
    """Get the global municipality registry instance"""
    global _registry_instance
    if _registry_instance is None:
        _registry_instance = MunicipalityRegistry()
    return _registry_instance


def main():
    """Test the registry"""
    registry = get_registry()
    
    print(registry.list_municipalities())
    print("\nRegistry Summary:")
    summary = registry.get_summary()
    for key, value in summary.items():
        print(f"  {key}: {value}")
    
    # Test parsing
    test_selections = ["all", "1,2,3", "toronto,ottawa", "1-5"]
    for selection in test_selections:
        ids = registry.parse_municipality_selection(selection)
        print(f"\n'{selection}' -> {sorted(ids)}")


if __name__ == "__main__":
    main()