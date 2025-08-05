'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface RelevanceScoreBadgeProps {
  score: number
  maxScore?: number
  showPercentage?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function RelevanceScoreBadge({
  score,
  maxScore = 100,
  showPercentage = true,
  size = 'md',
  className
}: RelevanceScoreBadgeProps) {
  const percentage = Math.round((score / maxScore) * 100)
  
  // Determine color based on score
  const getColorClass = () => {
    if (percentage >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    if (percentage >= 60) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    if (percentage >= 40) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    if (percentage >= 20) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
  }
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  }
  
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        getColorClass(),
        sizeClasses[size],
        className
      )}
    >
      {showPercentage ? `${percentage}%` : score}
    </span>
  )
}

interface RelevanceBarProps {
  score: number
  maxScore?: number
  height?: number
  showLabel?: boolean
  className?: string
}

export function RelevanceBar({
  score,
  maxScore = 100,
  height = 4,
  showLabel = false,
  className
}: RelevanceBarProps) {
  const percentage = Math.round((score / maxScore) * 100)
  
  // Determine color based on score
  const getBarColor = () => {
    if (percentage >= 80) return 'bg-green-500 dark:bg-green-600'
    if (percentage >= 60) return 'bg-blue-500 dark:bg-blue-600'
    if (percentage >= 40) return 'bg-yellow-500 dark:bg-yellow-600'
    if (percentage >= 20) return 'bg-orange-500 dark:bg-orange-600'
    return 'bg-gray-400 dark:bg-gray-600'
  }
  
  return (
    <div className={cn('relative', className)}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">Relevance</span>
          <span className="text-xs font-medium">{percentage}%</span>
        </div>
      )}
      <div 
        className="w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden"
        style={{ height: `${height}px` }}
      >
        <div
          className={cn(
            'h-full transition-all duration-300 ease-out',
            getBarColor()
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}

interface RelevanceIndicatorProps {
  score: number
  maxScore?: number
  variant?: 'badge' | 'bar' | 'both'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function RelevanceIndicator({
  score,
  maxScore = 100,
  variant = 'badge',
  size = 'md',
  className
}: RelevanceIndicatorProps) {
  if (variant === 'badge') {
    return (
      <RelevanceScoreBadge
        score={score}
        maxScore={maxScore}
        size={size}
        className={className}
      />
    )
  }
  
  if (variant === 'bar') {
    return (
      <RelevanceBar
        score={score}
        maxScore={maxScore}
        showLabel
        className={className}
      />
    )
  }
  
  // variant === 'both'
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <RelevanceScoreBadge
        score={score}
        maxScore={maxScore}
        size={size}
      />
      <RelevanceBar
        score={score}
        maxScore={maxScore}
        className="flex-1"
      />
    </div>
  )
}