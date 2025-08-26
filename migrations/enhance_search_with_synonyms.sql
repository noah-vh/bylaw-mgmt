-- Enhanced search function with better synonym support
-- This migration enhances the existing search function to better handle synonym expansion

-- Create an enhanced search function that handles complex OR queries better
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
  content_text text,
  is_relevant boolean,
  is_favorited boolean,
  categories jsonb,
  has_more boolean
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  parsed_query tsquery;
  fallback_query tsquery;
BEGIN
  -- Handle empty or very short queries
  IF search_query IS NULL OR LENGTH(TRIM(search_query)) < 2 THEN
    RETURN;
  END IF;

  BEGIN
    -- Try to parse the query as websearch (handles OR, AND, parentheses)
    parsed_query := websearch_to_tsquery('english', search_query);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      -- Fallback to plainto_tsquery for simpler parsing
      parsed_query := plainto_tsquery('english', search_query);
    EXCEPTION WHEN OTHERS THEN
      -- Final fallback - split and create basic OR query
      SELECT string_agg(word || ':*', ' | ')::tsquery
      INTO parsed_query
      FROM unnest(string_to_array(TRIM(search_query), ' ')) AS word
      WHERE LENGTH(TRIM(word)) > 0;
    END;
  END;

  -- Create a fallback plainto_tsquery for broader matching
  fallback_query := plainto_tsquery('english', search_query);

  RETURN QUERY
  WITH search_results AS (
    SELECT 
      pd.*,
      CASE 
        -- Highest rank for websearch query matches (handles synonyms with OR)
        WHEN pd.search_vector @@ parsed_query 
          THEN ts_rank(pd.search_vector, parsed_query) + 1.0
        -- Medium rank for plainto query matches
        WHEN pd.search_vector @@ fallback_query
          THEN ts_rank(pd.search_vector, fallback_query) + 0.5
        -- Lower rank for title/filename matches (fallback)
        WHEN pd.title ILIKE '%' || search_query || '%' OR pd.filename ILIKE '%' || search_query || '%'
          THEN 0.1
        ELSE 0
      END as rank,
      -- Check if there are more results beyond our limit
      (COUNT(*) OVER()) > (result_offset + max_results) as has_more_results
    FROM pdf_documents pd
    WHERE 
      (
        -- Try the parsed query first (best for synonym expansion)
        pd.search_vector @@ parsed_query OR
        -- Fallback to simpler query
        pd.search_vector @@ fallback_query OR
        -- Final fallback to ILIKE for partial matches
        pd.title ILIKE '%' || search_query || '%' OR 
        pd.filename ILIKE '%' || search_query || '%'
      )
      -- Apply municipality filter if provided
      AND (
        filter_municipality_ids IS NULL OR 
        pd.municipality_id = ANY(filter_municipality_ids)
      )
      -- Only include documents with content or metadata
      AND (pd.content_text IS NOT NULL OR pd.title IS NOT NULL)
  )
  SELECT 
    sr.id,
    sr.municipality_id,
    sr.title,
    sr.url,
    sr.filename,
    sr.file_size,
    sr.date_found,
    sr.content_text,
    sr.is_relevant,
    sr.is_favorited,
    sr.categories,
    sr.has_more_results
  FROM search_results sr
  WHERE sr.rank > 0
  ORDER BY 
    -- Prioritize relevant documents
    sr.is_relevant DESC NULLS LAST,
    -- Then by search rank
    sr.rank DESC,
    -- Then by date (newest first)
    sr.date_found DESC NULLS LAST
  OFFSET result_offset
  LIMIT max_results;
END;
$$;

-- Create a function to get search statistics (for debugging synonym expansion)
CREATE OR REPLACE FUNCTION get_search_debug_info(search_query text)
RETURNS TABLE (
  original_query text,
  parsed_as_websearch text,
  parsed_as_plainto text,
  estimated_results integer
) LANGUAGE plpgsql STABLE AS $$
DECLARE
  websearch_query tsquery;
  plainto_query tsquery;
  result_count integer;
BEGIN
  -- Try parsing as websearch
  BEGIN
    websearch_query := websearch_to_tsquery('english', search_query);
  EXCEPTION WHEN OTHERS THEN
    websearch_query := NULL;
  END;
  
  -- Try parsing as plainto
  BEGIN
    plainto_query := plainto_tsquery('english', search_query);
  EXCEPTION WHEN OTHERS THEN
    plainto_query := NULL;
  END;
  
  -- Get estimated result count
  SELECT COUNT(*)::integer
  INTO result_count
  FROM pdf_documents pd
  WHERE 
    (websearch_query IS NOT NULL AND pd.search_vector @@ websearch_query) OR
    (plainto_query IS NOT NULL AND pd.search_vector @@ plainto_query) OR
    pd.title ILIKE '%' || search_query || '%' OR 
    pd.filename ILIKE '%' || search_query || '%';
  
  RETURN QUERY SELECT
    search_query,
    COALESCE(websearch_query::text, 'FAILED TO PARSE'),
    COALESCE(plainto_query::text, 'FAILED TO PARSE'),
    result_count;
END;
$$;

-- Create an index to improve OR query performance (if not already exists)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pdf_documents_title_filename_gin
ON pdf_documents USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(filename, '')));

-- Analyze the table to update statistics
ANALYZE pdf_documents;