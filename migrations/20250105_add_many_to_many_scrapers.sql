-- Add many-to-many scraper assignment support
-- This migration adds support for assigning multiple scrapers to each municipality

-- Add columns for many-to-many scraper relationships
ALTER TABLE municipalities 
ADD COLUMN IF NOT EXISTS assigned_scrapers TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS active_scraper TEXT;

-- Migrate existing scraper_name data to new structure
UPDATE municipalities 
SET 
  assigned_scrapers = CASE 
    WHEN scraper_name IS NOT NULL THEN ARRAY[scraper_name]
    ELSE '{}'::TEXT[]
  END,
  active_scraper = scraper_name
WHERE assigned_scrapers IS NULL;

-- Add helpful indexes for array operations
CREATE INDEX IF NOT EXISTS idx_municipalities_assigned_scrapers 
ON municipalities USING GIN (assigned_scrapers);

CREATE INDEX IF NOT EXISTS idx_municipalities_active_scraper 
ON municipalities (active_scraper);

-- Add constraint to ensure active_scraper is one of assigned_scrapers
-- Note: This constraint will be enforced at the application level for flexibility

-- Add comments for documentation
COMMENT ON COLUMN municipalities.assigned_scrapers IS 'Array of scraper names available to this municipality';
COMMENT ON COLUMN municipalities.active_scraper IS 'Currently active scraper for this municipality (must be one of assigned_scrapers)';

-- Keep the old scraper_name column for backward compatibility (can be removed later)
COMMENT ON COLUMN municipalities.scraper_name IS 'DEPRECATED: Use active_scraper instead. Kept for backward compatibility.';