-- Create scrapers table migration
-- This table tracks all scraper instances and their status

CREATE TABLE IF NOT EXISTS scrapers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'testing', 'validated', 'failed')),
  municipality_id INTEGER REFERENCES municipalities(id),
  module_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_tested TIMESTAMP WITH TIME ZONE,
  success_rate REAL DEFAULT 0,
  test_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  estimated_pages INTEGER,
  estimated_pdfs INTEGER,
  priority INTEGER DEFAULT 0
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_scrapers_municipality_id ON scrapers(municipality_id);
CREATE INDEX IF NOT EXISTS idx_scrapers_status ON scrapers(status);
CREATE INDEX IF NOT EXISTS idx_scrapers_name ON scrapers(name);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_scrapers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scrapers_updated_at_trigger
  BEFORE UPDATE ON scrapers
  FOR EACH ROW
  EXECUTE FUNCTION update_scrapers_updated_at();

-- Add comments for documentation
COMMENT ON TABLE scrapers IS 'Registry of all scraper instances with their validation status';
COMMENT ON COLUMN scrapers.name IS 'Unique identifier for the scraper (e.g., toronto_v2)';
COMMENT ON COLUMN scrapers.version IS 'Version identifier (V1, V2, Enhanced, New)';
COMMENT ON COLUMN scrapers.status IS 'Current validation status of the scraper';
COMMENT ON COLUMN scrapers.municipality_id IS 'Target municipality for this scraper';
COMMENT ON COLUMN scrapers.module_name IS 'Python module name for dynamic import';
COMMENT ON COLUMN scrapers.class_name IS 'Python class name for instantiation';
COMMENT ON COLUMN scrapers.success_rate IS 'Percentage of successful scraping attempts';
COMMENT ON COLUMN scrapers.priority IS 'Execution priority (higher = more priority)';