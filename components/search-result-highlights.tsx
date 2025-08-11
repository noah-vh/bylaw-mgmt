'use client'

import React from 'react'

interface SearchResultHighlightsProps {
  text: string
  searchTerms: string[]
  maxLength?: number
  className?: string
}

export function SearchResultHighlights({
  text,
  searchTerms,
  maxLength = 200,
  className = ''
}: SearchResultHighlightsProps) {
  if (!text || searchTerms.length === 0) {
    return <span className={className}>{text || ''}</span>
  }

  // Create regex pattern for all search terms
  const escapedTerms = searchTerms.map(term => 
    term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  )
  const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'gi')

  // Find the first match position
  const firstMatch = text.search(pattern)
  
  // Calculate excerpt boundaries
  let startPos = 0
  let endPos = text.length
  let prefix = ''
  let suffix = ''

  if (maxLength && text.length > maxLength) {
    if (firstMatch !== -1) {
      // Center the excerpt around the first match
      startPos = Math.max(0, firstMatch - Math.floor(maxLength / 2))
      endPos = Math.min(text.length, startPos + maxLength)
      
      // Adjust to word boundaries
      if (startPos > 0) {
        const wordBoundary = text.lastIndexOf(' ', startPos)
        if (wordBoundary > startPos - 20) {
          startPos = wordBoundary + 1
        }
        prefix = '...'
      }
      
      if (endPos < text.length) {
        const wordBoundary = text.indexOf(' ', endPos)
        if (wordBoundary !== -1 && wordBoundary < endPos + 20) {
          endPos = wordBoundary
        }
        suffix = '...'
      }
    } else {
      // No match found, show beginning of text
      endPos = maxLength
      const wordBoundary = text.lastIndexOf(' ', endPos)
      if (wordBoundary > endPos - 20) {
        endPos = wordBoundary
      }
      suffix = '...'
    }
  }

  const excerpt = text.substring(startPos, endPos)
  
  // Split text and highlight matches
  const parts = excerpt.split(pattern)
  
  return (
    <span className={className}>
      {prefix}
      {parts.map((part, index) => {
        const isMatch = searchTerms.some(term => 
          part.toLowerCase() === term.toLowerCase()
        )
        
        if (isMatch) {
          return (
            <mark
              key={index}
              className="bg-yellow-200 dark:bg-yellow-300 text-black dark:text-black font-medium px-1 py-0.5 rounded shadow-sm"
            >
              {part}
            </mark>
          )
        }
        
        return <span key={index}>{part}</span>
      })}
      {suffix}
    </span>
  )
}

interface HighlightedFieldProps {
  label: string
  value: string
  searchTerms: string[]
  className?: string
}

export function HighlightedField({
  label,
  value,
  searchTerms,
  className = ''
}: HighlightedFieldProps) {
  return (
    <div className={className}>
      <span className="text-sm text-muted-foreground">{label}: </span>
      <SearchResultHighlights
        text={value}
        searchTerms={searchTerms}
        className="text-sm"
      />
    </div>
  )
}