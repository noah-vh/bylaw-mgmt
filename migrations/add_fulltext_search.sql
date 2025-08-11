-- Full-text search migration for pdf_documents
-- Run this in Supabase SQL Editor in parts if it times out

-- Part 1: Enable extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Part 2: Add search vector column
ALTER TABLE pdf_documents 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Part 3: Create GIN index (run with CONCURRENTLY to avoid locking)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pdf_documents_search_vector 
ON pdf_documents USING gin(search_vector);

-- Part 4: Create update function
CREATE OR REPLACE FUNCTION update_search_vector() 
RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.filename, '')), 'B') ||
    setweight(to_tsvector('english', LEFT(COALESCE(NEW.content_text, ''), 50000)), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Part 5: Create trigger
DROP TRIGGER IF EXISTS update_search_vector_trigger ON pdf_documents;
CREATE TRIGGER update_search_vector_trigger 
BEFORE INSERT OR UPDATE ON pdf_documents
FOR EACH ROW 
EXECUTE FUNCTION update_search_vector();

-- Part 6: Update existing documents in batches
-- Run this multiple times until all documents are updated
UPDATE pdf_documents 
SET search_vector = 
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(filename, '')), 'B') ||
  setweight(to_tsvector('english', LEFT(COALESCE(content_text, ''), 50000)), 'C')
WHERE search_vector IS NULL
LIMIT 100;

-- Part 7: Create optimized search function
CREATE OR REPLACE FUNCTION search_documents_optimized(
  search_query text,
  max_results integer DEFAULT 100,
  result_offset integer DEFAULT 0,
  filter_municipality_ids integer[] DEFAULT NULL
)
RETURNS TABLE (
  id integer,
  municipality_id integer,
  title character varying,
  url character varying,
  filename character varying,
  file_size integer,
  date_found timestamp with time zone,
  content_analyzed boolean,
  is_relevant boolean,
  is_favorited boolean,
  categories jsonb,
  has_more boolean
) LANGUAGE sql STABLE AS $$
  WITH results AS (
    SELECT 
      pd.*,
      ts_rank(pd.search_vector, websearch_to_tsquery('english', search_query)) as rank
    FROM pdf_documents pd
    WHERE 
      pd.search_vector @@ websearch_to_tsquery('english', search_query)
      AND (filter_municipality_ids IS NULL OR pd.municipality_id = ANY(filter_municipality_ids))
    ORDER BY 
      rank DESC,
      pd.is_relevant DESC NULLS LAST,
      pd.date_found DESC
    LIMIT max_results + 1
    OFFSET result_offset
  )
  SELECT 
    id,
    municipality_id,
    title,
    url,
    filename,
    file_size,
    date_found,
    content_analyzed,
    is_relevant,
    is_favorited,
    categories,
    (COUNT(*) OVER()) > max_results as has_more
  FROM results
  LIMIT max_results;
$$;

-- Part 8: Create municipality counts function
CREATE OR REPLACE FUNCTION get_municipality_counts_for_search(
  search_query text
)
RETURNS TABLE (
  municipality_id integer,
  municipality_name character varying,
  document_count bigint
) LANGUAGE sql STABLE AS $$
  SELECT 
    m.id,
    m.name,
    COUNT(pd.id) as document_count
  FROM municipalities m
  LEFT JOIN pdf_documents pd ON pd.municipality_id = m.id
    AND pd.search_vector @@ websearch_to_tsquery('english', search_query)
  GROUP BY m.id, m.name
  HAVING COUNT(pd.id) > 0
  ORDER BY COUNT(pd.id) DESC;
$$;