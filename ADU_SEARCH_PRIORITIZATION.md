# Full-Text Search System with ADU Prioritization

## Overview
The bylaw management system uses **PostgreSQL full-text search with GIN indexes** to provide lightning-fast, comprehensive document search. The system combines text relevance with ADU (Additional Dwelling Unit) prioritization to ensure users find the most relevant documents for their search terms.

## 🚀 **System Performance**
- **27,501 documents** fully indexed (100% coverage)
- **Sub-second search responses** (200-500ms typical)
- **3x more results** than previous implementation
- **PostgreSQL GIN indexes** for optimal performance
- **Complete municipality filtering** with accurate counts

## Search Architecture

### **PostgreSQL Full-Text Search Engine**
The system uses `tsvector` columns with GIN indexes for maximum performance:

```sql
-- Core search vector structure
search_vector = 
  setweight(to_tsvector('english', title), 'A') ||          -- Highest weight
  setweight(to_tsvector('english', filename), 'B') ||       -- High weight  
  setweight(to_tsvector('english', content_text), 'C')      -- Content weight
```

### **Search Result Prioritization**

#### 1. **Primary Sort: Full-Text Relevance Score**
PostgreSQL `ts_rank()` provides relevance scoring:
- **High scores**: Strong matches in titles, filenames, and content
- **Medium scores**: Moderate text matches across document
- **Low scores**: Weak or distant text matches

#### 2. **Secondary Sort: ADU Relevance Boost**
ADU-relevant documents get priority within each relevance tier:
- `is_relevant = true`: ADU-relevant documents appear first
- `is_relevant = false`: General documents appear after

#### 3. **Tertiary Sort: ADU Category Score**
Documents with higher ADU/ARU Regulations scores rank higher:
- `categories['ADU/ARU Regulations']` provides granular scoring
- Scores range from 0 to 200+ indicating ADU content density
- Higher scores = more ADU-specific content

#### 4. **Final Sort: Recency**
Most recently found documents appear first when other factors are equal.

## Real-World Performance Examples

### **"Setback" Search Results**
A search for "setback" demonstrates the system's comprehensive coverage:

- **Total Results**: 3,048 documents (vs. 1,079 with previous system)
- **Coverage Improvement**: 182% increase in found documents
- **Municipality Distribution**:
  - Toronto: 510 documents
  - Mississauga: 219 documents  
  - Innisfil: 80 documents
  - Caledon: 49 documents
  - Vaughan: 36 documents

### **Search Result Ranking Example**

For a query like "accessory dwelling unit":

1. **🏆 Highest Priority**: Title matches with ADU relevance
   - Document: "Accessory Dwelling Unit Guidelines" 
   - `ts_rank`: 0.8, `is_relevant`: true, `adu_score`: 150

2. **High Priority**: Content matches with strong ADU relevance
   - Document: "Zoning Bylaw - Residential Provisions"
   - `ts_rank`: 0.4, `is_relevant`: true, `adu_score`: 89

3. **Medium Priority**: Strong text match, no ADU relevance  
   - Document: "Building Code Requirements"
   - `ts_rank`: 0.6, `is_relevant`: false, `adu_score`: 0

4. **Lower Priority**: Moderate text match with ADU relevance
   - Document: "Development Standards"
   - `ts_rank`: 0.2, `is_relevant`: true, `adu_score`: 45

## Technical Implementation

### **Database Functions**

#### `search_documents_optimized()`
Core full-text search function with pagination and filtering:

```sql
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
)
```

#### `get_search_total_count()`
Efficient total count function for pagination:

```sql
SELECT COUNT(*)::integer
FROM pdf_documents pd
WHERE 
  pd.search_vector IS NOT NULL
  AND pd.search_vector @@ websearch_to_tsquery('english', search_query)
  AND (filter_municipality_ids IS NULL OR pd.municipality_id = ANY(filter_municipality_ids))
```

#### `get_municipality_counts_for_search()`
Accurate municipality filtering with real document counts:

```sql
SELECT 
  m.id,
  m.name,
  COUNT(pd.id) as document_count
FROM municipalities m
LEFT JOIN pdf_documents pd ON pd.municipality_id = m.id
  AND pd.search_vector @@ websearch_to_tsquery('english', search_query)
GROUP BY m.id, m.name
HAVING COUNT(pd.id) > 0
ORDER BY COUNT(pd.id) DESC
```

### **API Architecture**

#### `/api/search/global` Route
Enhanced API endpoint providing:
- **Full-text search results** with pagination
- **Real municipality counts** for accurate filtering
- **Total document counts** for proper pagination
- **Fast response times** (200-500ms)

#### Response Structure
```typescript
{
  query: "setback",
  results: {
    documents: [...],           // Paginated search results
    municipalityCounts: [       // Real counts for filtering
      {municipality_id: 2, municipality_name: "Toronto", document_count: 510},
      {municipality_id: 3, municipality_name: "Mississauga", document_count: 219}
    ]
  },
  meta: {
    total: 3048,               // Total matching documents
    pagination: {
      documentsTotal: 3048,    // Real total for pagination
      hasMore: true,           // More pages available
      offset: 0,
      limit: 100
    }
  }
}
```

### **Frontend Integration**

#### `useGlobalSearch()` Hook
React hook managing search state with:
- **Real-time search** with debouncing
- **Municipality filtering** with server-side counts
- **Pagination controls** with accurate totals
- **Performance optimized** with React Query caching

#### Municipality Filter UI
Smart filtering showing:
- **Real document counts** (e.g., "Toronto 510", not "Toronto 510+")
- **Accurate sorting** by search relevance, not page counts  
- **Server-side filtering** for consistent results across pages

### **Performance Optimizations**

#### Database Level
- **GIN indexes** on `search_vector` column for fast lookups
- **Trigger-based updates** for real-time search vector maintenance
- **Batched indexing** for large document sets
- **Query optimization** with ranked results and efficient pagination

#### Application Level  
- **React Query caching** for search results and municipality data
- **Optimistic pagination** with "has more" detection
- **Parallel API calls** for search + municipality counts
- **Background indexing** for new documents

## Testing the Implementation

### **Database Testing**
```sql
-- Test full-text search performance
EXPLAIN ANALYZE 
SELECT * FROM search_documents_optimized('setback', 100, 0, NULL);

-- Test municipality counts
SELECT * FROM get_municipality_counts_for_search('setback');

-- Test search coverage
SELECT COUNT(*) FROM pdf_documents 
WHERE search_vector @@ websearch_to_tsquery('english', 'setback');
```

### **API Testing**  
```bash
# Test search endpoint
curl "localhost:3000/api/search/global?q=setback&limit=100"

# Test municipality filtering
curl "localhost:3000/api/search/global?q=setback&municipalityIds[]=2"

# Test pagination
curl "localhost:3000/api/search/global?q=setback&limit=100&offset=100"
```

### **Expected Performance**
- **Search queries**: < 500ms response time
- **Total results**: 3,048 documents for "setback" 
- **Municipality counts**: Accurate real-time counts
- **Pagination**: Smooth navigation through all results