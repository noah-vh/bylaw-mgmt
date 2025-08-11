-- Script to categorize all uncategorized documents with content
-- This will process documents in batches of 500 to avoid timeouts

DO $$
DECLARE
    batch_result RECORD;
    total_processed INTEGER := 0;
    total_relevant INTEGER := 0;
    total_irrelevant INTEGER := 0;
    remaining INTEGER;
    batch_num INTEGER := 0;
BEGIN
    -- Check how many documents need processing
    SELECT COUNT(*) INTO remaining
    FROM pdf_documents 
    WHERE content_text IS NOT NULL 
    AND content_text != ''
    AND categories IS NULL;
    
    RAISE NOTICE 'Starting categorization of % documents', remaining;
    
    -- Process in batches
    WHILE remaining > 0 LOOP
        batch_num := batch_num + 1;
        
        -- Process batch of 500
        SELECT * INTO batch_result FROM categorize_all_documents(500);
        
        -- Update totals
        total_processed := total_processed + batch_result.processed;
        total_relevant := total_relevant + batch_result.relevant;
        total_irrelevant := total_irrelevant + batch_result.irrelevant;
        
        -- Check remaining
        SELECT COUNT(*) INTO remaining
        FROM pdf_documents 
        WHERE content_text IS NOT NULL 
        AND content_text != ''
        AND categories IS NULL;
        
        -- Log progress
        RAISE NOTICE 'Batch %: Processed % documents (% relevant, % irrelevant). Remaining: %', 
            batch_num, batch_result.processed, batch_result.relevant, batch_result.irrelevant, remaining;
        
        -- Exit if no documents were processed (safety check)
        EXIT WHEN batch_result.processed = 0;
    END LOOP;
    
    RAISE NOTICE 'Categorization complete! Total processed: %, Relevant: %, Irrelevant: %', 
        total_processed, total_relevant, total_irrelevant;
END $$;

-- Show final statistics
SELECT 
  COUNT(*) as total_documents,
  COUNT(CASE WHEN categories IS NOT NULL THEN 1 END) as categorized_documents,
  COUNT(CASE WHEN categories IS NULL THEN 1 END) as uncategorized_documents,
  COUNT(CASE WHEN is_relevant = true THEN 1 END) as relevant_documents,
  COUNT(CASE WHEN is_relevant = false THEN 1 END) as irrelevant_documents,
  COUNT(CASE WHEN has_aru_provisions = true THEN 1 END) as aru_provision_documents
FROM pdf_documents;