/**
 * Bidirectional Synonym System for Enhanced Search
 * 
 * This module provides comprehensive synonym expansion for search queries,
 * automatically finding related terms to improve search results.
 */

// Define all synonym groups
const SYNONYM_GROUPS = [
  // ADU/Dwelling Types
  ['ADU', 'accessory dwelling unit', 'garden suite', 'laneway house', 'granny flat', 
   'secondary suite', 'ARU', 'accessory residential unit', 'coach house', 
   'backyard suite', 'carriage house', 'garage suite', 'in-law suite', 'inlaw suite',
   'basement apartment', 'basement suite', 'lower level unit', 'tiny home', 
   'tiny house', 'micro home', 'small dwelling', 'parent suite'],
  
  // General Dwelling Terms
  ['dwelling', 'residence', 'residential', 'living unit', 'home', 'house', 'unit'],
  
  // Structure Terms
  ['structure', 'building', 'construction', 'edifice'],
  
  // Accessory/Additional Terms
  ['accessory', 'additional', 'secondary', 'supplementary'],
  
  // Setback Terms
  ['setback', 'yard requirement', 'separation', 'distance from property line'],
  
  // Lot/Property Terms
  ['lot', 'property', 'parcel', 'site'],
  
  // Coverage Terms
  ['coverage', 'lot coverage', 'building coverage', 'site coverage'],
  ['footprint', 'building footprint', 'ground coverage'],
  
  // Area Terms
  ['floor area', 'gross floor area', 'GFA', 'floor space'],
  ['area', 'size', 'dimensions', 'square footage', 'square meters'],
  
  // Height Terms
  ['height', 'tall', 'elevation', 'vertical', 'vertical distance'],
  ['storey', 'story', 'floor', 'level'],
  
  // Maximum/Minimum Terms
  ['maximum', 'max', 'greatest', 'highest', 'peak', 'tallest', 'limit', 'cap'],
  ['minimum', 'min', 'least', 'lowest', 'smallest', 'floor'],
  
  // Measurement Units - Distance
  ['meter', 'metre', 'm', 'meters', 'metres'],
  ['foot', 'feet', 'ft', "'"],
  ['yard', 'yd', 'yards'],
  
  // Measurement Units - Area
  ['square meter', 'square metre', 'sq m', 'm2', 'm²', 'sqm'],
  ['square foot', 'square feet', 'sq ft', 'sf', 'ft2', 'ft²', 'sqft'],
  
  // Legal/Permission Terms
  ['permit', 'permission', 'authorization', 'approval', 'license'],
  ['regulation', 'bylaw', 'by-law', 'code', 'ordinance', 'rule', 'provision'],
  ['requirement', 'required', 'must', 'shall', 'mandatory', 'necessary'],
  ['allowed', 'permitted', 'permissible', 'may', 'can', 'allowable'],
  ['prohibited', 'not permitted', 'not allowed', 'forbidden', 'banned', 'restricted'],
  ['exception', 'exemption', 'variance', 'waiver'],
  ['compliance', 'conform', 'conformity', 'accordance', 'compliant'],
  
  // Action Terms
  ['build', 'construct', 'erect', 'establish', 'create', 'develop'],
  ['renovate', 'alter', 'modify', 'change', 'remodel', 'retrofit'],
  ['demolish', 'tear down', 'remove', 'destroy', 'raze'],
  ['add', 'addition', 'extend', 'expand', 'enlarge', 'extension'],
  ['convert', 'change use', 'transform', 'repurpose', 'conversion']
];

/**
 * Build bidirectional synonym map from synonym groups
 * Each term maps to ALL terms in its group (including itself)
 */
function buildBidirectionalMap(groups: string[][]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  
  groups.forEach(group => {
    group.forEach(term => {
      // Each term maps to ALL terms in its group (including itself)
      map[term.toLowerCase()] = group.map(t => t.toLowerCase());
    });
  });
  
  return map;
}

// Create the bidirectional synonym map (computed once)
const SYNONYM_MAP = buildBidirectionalMap(SYNONYM_GROUPS);

/**
 * Expand a search query by replacing terms with their synonyms
 * Uses PostgreSQL-compatible websearch syntax
 * 
 * @param searchQuery - The original search query
 * @returns Expanded query with synonyms using websearch syntax
 */
export function expandQuery(searchQuery: string): string {
  if (!searchQuery || searchQuery.trim().length === 0) {
    return searchQuery;
  }

  // Use PostgreSQL websearch syntax with OR operators
  const words = searchQuery.toLowerCase().split(/\s+/);
  const expandedParts: string[] = [];
  
  words.forEach(word => {
    // Clean the word of punctuation for synonym lookup
    const cleanWord = word.replace(/[^\w\s'-]/g, '');
    
    if (cleanWord && SYNONYM_MAP[cleanWord]) {
      const synonyms = SYNONYM_MAP[cleanWord];
      
      // Get key synonyms (single words only for simplicity)
      const keyTerms = [cleanWord, ...synonyms.filter(term => 
        !term.includes(' ') && 
        term.length > 2 && 
        term !== cleanWord
      ).slice(0, 4)]; // Original word + top 4 synonyms
      
      // Use websearch OR syntax: (term1 OR term2 OR term3)
      expandedParts.push(`(${keyTerms.join(' OR ')})`);
    } else {
      // Keep original word if no synonyms found
      expandedParts.push(cleanWord);
    }
  });
  
  // Join multiple words with AND
  return expandedParts.join(' ');
}

/**
 * Get all synonyms for a given term
 * 
 * @param term - The term to find synonyms for
 * @returns Array of all synonyms (including the original term)
 */
export function getSynonyms(term: string): string[] {
  const cleanTerm = term.toLowerCase().trim();
  return SYNONYM_MAP[cleanTerm] || [cleanTerm];
}

/**
 * Check if two terms are synonyms of each other
 * 
 * @param term1 - First term
 * @param term2 - Second term  
 * @returns True if the terms are in the same synonym group
 */
export function areSynonyms(term1: string, term2: string): boolean {
  const synonyms1 = getSynonyms(term1);
  const cleanTerm2 = term2.toLowerCase().trim();
  return synonyms1.includes(cleanTerm2);
}

/**
 * Get statistics about the synonym system
 * 
 * @returns Object containing synonym system statistics
 */
export function getSynonymStats(): {
  totalGroups: number;
  totalTerms: number;
  averageGroupSize: number;
  largestGroup: string[];
} {
  const totalGroups = SYNONYM_GROUPS.length;
  const totalTerms = Object.keys(SYNONYM_MAP).length;
  const averageGroupSize = Math.round(totalTerms / totalGroups * 100) / 100;
  
  // Find largest group
  let largestGroup: string[] = [];
  SYNONYM_GROUPS.forEach(group => {
    if (group.length > largestGroup.length) {
      largestGroup = group;
    }
  });

  return {
    totalGroups,
    totalTerms,
    averageGroupSize,
    largestGroup
  };
}

// Export the synonym map for advanced use cases
export { SYNONYM_MAP };