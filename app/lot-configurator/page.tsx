"use client"

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { 
  Calculator, 
  Download, 
  Home, 
  Ruler, 
  Move, 
  Zap, 
  CheckCircle, 
  AlertTriangle,
  RotateCcw,
  Info,
  MapPin
} from 'lucide-react'
import type { MunicipalityWithBylawData, BylawValidationResult, BylawViolation } from '@/lib/municipality-bylaw-types'

interface Config {
  lotWidth: number
  lotDepth: number
  frontSetback: number
  rearSetback: number
  sideSetback: number
  aduWidth: number
  aduDepth: number
  units: 'imperial' | 'metric'
}

interface Obstacle {
  id: string
  type: string
  width: number
  depth: number
  x: number
  y: number
}

export default function LotConfigurator() {
  const [config, setConfig] = useState<Config>({
    lotWidth: 100,
    lotDepth: 120,
    frontSetback: 10,
    rearSetback: 5,
    sideSetback: 4,
    aduWidth: 20,
    aduDepth: 24,
    units: 'imperial'
  })

  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [aduPosition, setAduPosition] = useState({ x: 50, y: 60 })
  const [selectedElement, setSelectedElement] = useState<{type: 'adu' | 'obstacle', id?: string} | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [dragPositions, setDragPositions] = useState<{adu?: {x: number, y: number}, obstacles?: Record<string, {x: number, y: number}>}>({})
  const lastUpdateRef = useRef(0)
  
  // Municipality selection and bylaw data
  const [municipalities, setMunicipalities] = useState<MunicipalityWithBylawData[]>([])
  const [selectedMunicipality, setSelectedMunicipality] = useState<number | null>(null)
  const [bylawValidation, setBylawValidation] = useState<BylawValidationResult>({
    isValid: true,
    violations: [],
    warnings: []
  })
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false)

  // Conversion constants
  const FEET_TO_METERS = 0.3048
  const SQFT_TO_SQM = 0.092903

  // Unit conversion functions
  const toDisplay = useCallback((value: number, isArea = false) => {
    if (config.units === 'metric') {
      if (isArea) {
        return Math.round(value * SQFT_TO_SQM)
      }
      return (value * FEET_TO_METERS).toFixed(1)
    }
    return Math.round(value * 10) / 10 // Round to 1 decimal place for consistency
  }, [config.units])
  
  // Convert feet to feet and inches format
  const toFeetAndInches = (feet: number): string => {
    const roundedFeet = Math.round(feet * 10) / 10 // Round to 1 decimal place first
    const wholeFeet = Math.floor(roundedFeet)
    const inches = Math.round((roundedFeet - wholeFeet) * 12)
    if (inches === 0) return `${wholeFeet}'`
    if (inches === 12) return `${wholeFeet + 1}'`
    return `${wholeFeet}' ${inches}"`
  }
  
  // Parse feet and inches string to decimal feet
  const fromFeetAndInches = (value: string): number => {
    const match = value.match(/(\d+)'?\s*(\d+)?"?/)
    if (!match) return 0
    const feet = parseInt(match[1]) || 0
    const inches = parseInt(match[2]) || 0
    return feet + inches / 12
  }

  const getUnitLabel = useCallback((isArea = false) => {
    if (config.units === 'metric') {
      return isArea ? 'sq m' : 'm'
    }
    return isArea ? 'sq ft' : 'ft'
  }, [config.units])

  const updateConfigValue = (key: keyof Config, value: number | string) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  // Load municipalities with bylaw data
  useEffect(() => {
    const loadMunicipalities = async () => {
      setLoadingMunicipalities(true)
      try {
        const response = await fetch('/api/municipalities/with-bylaw-data?hasData=true')
        if (response.ok) {
          const result = await response.json()
          setMunicipalities(result.data)
        } else {
          console.error('Failed to load municipalities')
        }
      } catch (error) {
        console.error('Error loading municipalities:', error)
      } finally {
        setLoadingMunicipalities(false)
      }
    }

    loadMunicipalities()
  }, [])

  // Get selected municipality data
  const selectedMunicipalityData = municipalities.find(m => m.id === selectedMunicipality)

  // Apply bylaw constraints when municipality is selected
  const applyBylawConstraints = useCallback(() => {
    if (!selectedMunicipalityData?.bylaw_data) return

    const bylawData = selectedMunicipalityData.bylaw_data
    
    // Apply setback constraints
    if (bylawData.front_setback_min_ft && bylawData.front_setback_min_ft > config.frontSetback) {
      updateConfigValue('frontSetback', bylawData.front_setback_min_ft)
    }
    if (bylawData.rear_setback_standard_ft && bylawData.rear_setback_standard_ft > config.rearSetback) {
      updateConfigValue('rearSetback', bylawData.rear_setback_standard_ft)
    }
    if (bylawData.side_setback_interior_ft && bylawData.side_setback_interior_ft > config.sideSetback) {
      updateConfigValue('sideSetback', bylawData.side_setback_interior_ft)
    }

    // Apply ADU size constraints
    if (bylawData.detached_adu_max_size_sqft) {
      const maxArea = bylawData.detached_adu_max_size_sqft
      const currentArea = config.aduWidth * config.aduDepth
      if (currentArea > maxArea) {
        // Proportionally reduce ADU size
        const scaleFactor = Math.sqrt(maxArea / currentArea)
        updateConfigValue('aduWidth', Math.floor(config.aduWidth * scaleFactor))
        updateConfigValue('aduDepth', Math.floor(config.aduDepth * scaleFactor))
      }
    }
  }, [selectedMunicipalityData, config])

  const calculateMetrics = useCallback(() => {
    const lotArea = config.lotWidth * config.lotDepth
    const buildableAreaSize = Math.max(0, (config.lotWidth - 2 * config.sideSetback) * 
                             (config.lotDepth - config.frontSetback - config.rearSetback))
    const aduArea = config.aduWidth * config.aduDepth
    const coverage = ((aduArea / lotArea) * 100)

    return {
      lotArea,
      buildableAreaSize,
      aduArea,
      coverage
    }
  }, [config])

  // Validate against bylaw requirements
  const validateAgainstBylaws = useCallback(() => {
    if (!selectedMunicipalityData?.bylaw_data) {
      setBylawValidation({ isValid: true, violations: [], warnings: [] })
      return
    }

    const bylawData = selectedMunicipalityData.bylaw_data
    const violations: BylawViolation[] = []
    const warnings: any[] = []

    // Check setbacks
    if (bylawData.front_setback_min_ft && config.frontSetback < bylawData.front_setback_min_ft) {
      violations.push({
        type: 'setback',
        message: 'Front setback is below minimum requirement',
        requirement: `Minimum ${bylawData.front_setback_min_ft} ft`,
        current_value: config.frontSetback,
        required_value: bylawData.front_setback_min_ft
      })
    }

    if (bylawData.rear_setback_standard_ft && config.rearSetback < bylawData.rear_setback_standard_ft) {
      violations.push({
        type: 'setback',
        message: 'Rear setback is below minimum requirement',
        requirement: `Minimum ${bylawData.rear_setback_standard_ft} ft`,
        current_value: config.rearSetback,
        required_value: bylawData.rear_setback_standard_ft
      })
    }

    if (bylawData.side_setback_interior_ft && config.sideSetback < bylawData.side_setback_interior_ft) {
      violations.push({
        type: 'setback',
        message: 'Side setback is below minimum requirement',
        requirement: `Minimum ${bylawData.side_setback_interior_ft} ft`,
        current_value: config.sideSetback,
        required_value: bylawData.side_setback_interior_ft
      })
    }

    // Check ADU size
    const aduArea = config.aduWidth * config.aduDepth
    if (bylawData.detached_adu_max_size_sqft && aduArea > bylawData.detached_adu_max_size_sqft) {
      violations.push({
        type: 'size',
        message: 'ADU size exceeds maximum allowed',
        requirement: `Maximum ${bylawData.detached_adu_max_size_sqft} sq ft`,
        current_value: aduArea,
        required_value: bylawData.detached_adu_max_size_sqft
      })
    }

    if (bylawData.detached_adu_min_size_sqft && aduArea < bylawData.detached_adu_min_size_sqft) {
      violations.push({
        type: 'size',
        message: 'ADU size is below minimum requirement',
        requirement: `Minimum ${bylawData.detached_adu_min_size_sqft} sq ft`,
        current_value: aduArea,
        required_value: bylawData.detached_adu_min_size_sqft
      })
    }

    // Check lot coverage
    const metrics = calculateMetrics()
    if (bylawData.max_lot_coverage_percent && metrics.coverage > bylawData.max_lot_coverage_percent) {
      violations.push({
        type: 'coverage',
        message: 'Lot coverage exceeds maximum allowed',
        requirement: `Maximum ${bylawData.max_lot_coverage_percent}%`,
        current_value: metrics.coverage,
        required_value: bylawData.max_lot_coverage_percent
      })
    }

    // Check parking (warning)
    if (bylawData.adu_parking_spaces_required > 0) {
      warnings.push({
        type: 'consideration',
        message: `This municipality requires ${bylawData.adu_parking_spaces_required} parking space(s) for ADUs`,
        details: 'Consider parking requirements in your planning'
      })
    }

    setBylawValidation({
      isValid: violations.length === 0,
      violations,
      warnings
    })
  }, [selectedMunicipalityData, config, calculateMetrics])

  // Re-validate when config or municipality changes
  useEffect(() => {
    validateAgainstBylaws()
  }, [validateAgainstBylaws])

  const getCoverageStatus = (coverage: number) => {
    if (coverage < 35) return 'success'
    if (coverage < 50) return 'warning'
    return 'danger'
  }

  const checkAduValidPlacement = useCallback(() => {
    const buildableLeft = config.sideSetback
    const buildableTop = config.frontSetback
    const buildableRight = config.lotWidth - config.sideSetback
    const buildableBottom = config.lotDepth - config.rearSetback

    const aduLeft = aduPosition.x
    const aduTop = aduPosition.y
    const aduRight = aduPosition.x + config.aduWidth
    const aduBottom = aduPosition.y + config.aduDepth

    // Check if ADU is within buildable area
    const withinBuildable = aduLeft >= buildableLeft && 
                           aduTop >= buildableTop && 
                           aduRight <= buildableRight && 
                           aduBottom <= buildableBottom

    // Check for obstacle collisions
    const hasCollision = obstacles.some(obstacle => {
      const obsLeft = obstacle.x
      const obsTop = obstacle.y
      const obsRight = obstacle.x + obstacle.width
      const obsBottom = obstacle.y + obstacle.depth

      return !(aduRight <= obsLeft || 
               aduLeft >= obsRight || 
               aduBottom <= obsTop || 
               aduTop >= obsBottom)
    })

    return withinBuildable && !hasCollision
  }, [config, aduPosition, obstacles])

  const addObstacle = (type: string) => {
    const sizes: Record<string, { width: number; height: number }> = {
      tree: { width: 15, height: 15 },
      rock: { width: 10, height: 10 },
      structure: { width: 25, height: 20 },
      shed: { width: 12, height: 12 },
      pool: { width: 20, height: 30 },
      fence: { width: 40, height: 3 },
      other: { width: 15, height: 15 }
    }

    const size = sizes[type] || { width: 15, height: 15 }
    const newObstacle: Obstacle = {
      id: Date.now().toString(),
      type,
      width: size.width,
      depth: size.height,
      x: Math.random() * (config.lotWidth - size.width),
      y: Math.random() * (config.lotDepth - size.height)
    }

    setObstacles(prev => [...prev, newObstacle])
  }

  const removeObstacle = (id: string) => {
    setObstacles(prev => prev.filter(obs => obs.id !== id))
  }

  const clearObstacles = () => {
    setObstacles([])
  }

  // Calculate scale factor for visualization
  const scale = 2.5

  // Mouse event handlers for drag and resize
  const handleAduMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragOffset({
      x: mouseX - (aduPosition.x * scale),
      y: mouseY - (aduPosition.y * scale)
    })
    setSelectedElement({ type: 'adu' })
  }, [aduPosition, scale])

  const handleObstacleMouseDown = useCallback((e: React.MouseEvent, obstacle: Obstacle) => {
    e.preventDefault()
    e.stopPropagation()
    
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    setIsDragging(true)
    setDragOffset({
      x: mouseX - (obstacle.x * scale),
      y: mouseY - (obstacle.y * scale)
    })
    setSelectedElement({ type: 'obstacle', id: obstacle.id })
  }, [scale])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, elementId: string, elementType: 'adu' | 'obstacle') => {
    e.preventDefault()
    e.stopPropagation()
    
    const rect = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    setIsResizing(true)
    
    if (elementType === 'adu') {
      setResizeStart({
        x: mouseX,
        y: mouseY,
        width: config.aduWidth,
        height: config.aduDepth
      })
    } else {
      const obstacle = obstacles.find(o => o.id === elementId)
      if (obstacle) {
        setResizeStart({
          x: mouseX,
          y: mouseY,
          width: obstacle.width,
          height: obstacle.depth
        })
      }
    }
    
    setSelectedElement({ type: elementType, id: elementType === 'obstacle' ? elementId : undefined })
  }, [config.aduWidth, config.aduDepth, obstacles])

  // Global mouse move and up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizing) return
      
      e.preventDefault()
      
      const visualizer = document.querySelector('[data-visualizer="true"]') as HTMLElement
      if (!visualizer) return
      
      const rect = visualizer.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      if (isDragging && selectedElement) {
        const rawX = (mouseX - dragOffset.x) / scale
        const rawY = (mouseY - dragOffset.y) / scale
        
        // Get element dimensions for boundary checking
        let elementWidth = 0, elementDepth = 0
        if (selectedElement.type === 'adu') {
          elementWidth = config.aduWidth
          elementDepth = config.aduDepth
        } else {
          const obstacle = obstacles.find(o => o.id === selectedElement.id)
          if (obstacle) {
            elementWidth = obstacle.width
            elementDepth = obstacle.depth
          }
        }
        
        // Apply boundary constraints
        const newX = Math.max(0, Math.min(config.lotWidth - elementWidth, rawX))
        const newY = Math.max(0, Math.min(config.lotDepth - elementDepth, rawY))
        
        // Update visual position immediately but throttle input updates
        if (selectedElement.type === 'adu') {
          setDragPositions(prev => ({ ...prev, adu: { x: newX, y: newY } }))
        } else if (selectedElement.id) {
          setDragPositions(prev => ({ 
            ...prev, 
            obstacles: { ...prev.obstacles, [selectedElement.id!]: { x: newX, y: newY } }
          }))
        }
        
        // Throttle actual state updates to reduce jarring number changes
        const now = Date.now()
        if (now - lastUpdateRef.current > 100) { // Update every 100ms
          lastUpdateRef.current = now
          requestAnimationFrame(() => {
            if (selectedElement.type === 'adu') {
              setAduPosition({ x: newX, y: newY })
            } else if (selectedElement.id) {
              setObstacles(prev => prev.map(obs => 
                obs.id === selectedElement.id 
                  ? { ...obs, x: newX, y: newY }
                  : obs
              ))
            }
          })
        }
      }
      
      if (isResizing && selectedElement) {
        const deltaX = mouseX - resizeStart.x
        const deltaY = mouseY - resizeStart.y
        
        const newWidth = Math.max(5, resizeStart.width + (deltaX / scale))
        const newHeight = Math.max(5, resizeStart.height + (deltaY / scale))
        
        // Update size with requestAnimationFrame for smoother performance
        requestAnimationFrame(() => {
          if (selectedElement.type === 'adu') {
            updateConfigValue('aduWidth', Math.round(newWidth))
            updateConfigValue('aduDepth', Math.round(newHeight))
          } else if (selectedElement.id) {
            setObstacles(prev => prev.map(obs => 
              obs.id === selectedElement.id 
                ? { ...obs, width: Math.round(newWidth), depth: Math.round(newHeight) }
                : obs
            ))
          }
        })
      }
    }
    
    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault()
      
      // Final position update when dragging ends
      if (isDragging && selectedElement && dragPositions) {
        if (selectedElement.type === 'adu' && dragPositions.adu) {
          setAduPosition(dragPositions.adu)
        } else if (selectedElement.id && dragPositions.obstacles?.[selectedElement.id]) {
          const finalPos = dragPositions.obstacles[selectedElement.id]
          setObstacles(prev => prev.map(obs => 
            obs.id === selectedElement.id 
              ? { ...obs, x: finalPos.x, y: finalPos.y }
              : obs
          ))
        }
      }
      
      setIsDragging(false)
      setIsResizing(false)
      setDragPositions({})
    }
    
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove, { passive: false })
      document.addEventListener('mouseup', handleMouseUp, { passive: false })
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, selectedElement, dragOffset, resizeStart, scale, config.lotWidth, config.lotDepth, config.aduWidth, config.aduDepth, obstacles, updateConfigValue])

  const exportConfiguration = () => {
    const timestamp = new Date()
    const metrics = calculateMetrics()
    
    const data = {
      property: {
        lotWidth: config.lotWidth,
        lotDepth: config.lotDepth,
        lotArea: metrics.lotArea
      },
      setbacks: {
        front: config.frontSetback,
        rear: config.rearSetback,
        sides: config.sideSetback
      },
      adu: {
        width: config.aduWidth,
        depth: config.aduDepth,
        area: metrics.aduArea,
        position: aduPosition
      },
      obstacles: obstacles.map(o => ({
        type: o.type,
        width: o.width,
        depth: o.depth,
        position: { x: o.x, y: o.y }
      })),
      analysis: {
        buildableArea: metrics.buildableAreaSize,
        coverage: metrics.coverage.toFixed(1) + '%',
        isValid: checkAduValidPlacement(),
        obstacleCount: obstacles.length
      },
      timestamp: timestamp.toISOString()
    }

    // Export JSON
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lot-configuration-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const metrics = calculateMetrics()
  const coverageStatus = getCoverageStatus(metrics.coverage)
  const isValidPlacement = checkAduValidPlacement()
  const isBylawCompliant = bylawValidation.isValid
  const overallValid = isValidPlacement && isBylawCompliant

  return (
    <div className="container mx-auto px-4 py-6 h-screen flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Calculator className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Lot Configurator</h1>
              <p className="text-muted-foreground">
                Plan and visualize ADU placement on your property
              </p>
            </div>
          </div>
          {/* Header Metrics */}
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-lg font-bold font-mono">{toDisplay(metrics.lotArea, true).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total {getUnitLabel(true)}</div>
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="text-center">
              <div className="text-lg font-bold font-mono">{toDisplay(metrics.buildableAreaSize, true).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Buildable {getUnitLabel(true)}</div>
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="text-center">
              <div className="text-lg font-bold font-mono">{toDisplay(metrics.aduArea, true).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">ADU {getUnitLabel(true)}</div>
            </div>
            <div className="w-px h-8 bg-border"></div>
            <div className="text-center">
              <div className={`text-lg font-bold font-mono ${coverageStatus === 'success' ? 'text-green-600 dark:text-green-400' : coverageStatus === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                {metrics.coverage.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">Coverage</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 flex-1 min-h-0">
        {/* Control Panel */}
        <aside className="space-y-3 overflow-y-auto">
          {/* Configuration Settings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-4 w-4" />
                Property Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Unit Toggle */}
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Units</Label>
                <div className="flex border border-border rounded-md overflow-hidden">
                  <Button
                    variant={config.units === 'imperial' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => updateConfigValue('units', 'imperial')}
                    className="h-7 px-3 text-xs rounded-none border-0"
                  >
                    ft
                  </Button>
                  <Button
                    variant={config.units === 'metric' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => updateConfigValue('units', 'metric')}
                    className="h-7 px-3 text-xs rounded-none border-0"
                  >
                    m
                  </Button>
                </div>
              </div>

              {/* Municipality Selection */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Municipality</span>
                </div>
                <Select 
                  value={selectedMunicipality?.toString() || 'none'} 
                  onValueChange={(value) => {
                    const municipalityId = value !== 'none' ? parseInt(value) : null
                    setSelectedMunicipality(municipalityId)
                  }}
                  disabled={loadingMunicipalities}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder={loadingMunicipalities ? "Loading..." : "Select municipality"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Generic Settings)</SelectItem>
                    {municipalities.map((municipality) => (
                      <SelectItem key={municipality.id} value={municipality.id.toString()}>
                        {municipality.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMunicipalityData && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={applyBylawConstraints}
                      className="h-7 text-xs"
                    >
                      Apply Bylaw Rules
                    </Button>
                    {selectedMunicipalityData.bylaw_data?.bylaw_ordinance_number && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedMunicipalityData.bylaw_data.bylaw_ordinance_number}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Property Dimensions */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Property Dimensions</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Width</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {toDisplay(config.lotWidth)} {getUnitLabel()}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.lotWidth).toString()) : config.lotWidth}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('lotWidth', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 61 : 200}
                      min={config.units === 'metric' ? 9 : 30}
                      step={config.units === 'metric' ? 1.5 : 5}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Depth</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {toDisplay(config.lotDepth)} {getUnitLabel()}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.lotDepth).toString()) : config.lotDepth}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('lotDepth', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 61 : 200}
                      min={config.units === 'metric' ? 9 : 30}
                      step={config.units === 'metric' ? 1.5 : 5}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Setback Requirements */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Setbacks</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Front</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {toDisplay(config.frontSetback)} {getUnitLabel()}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.frontSetback).toString()) : config.frontSetback}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('frontSetback', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 9 : 30}
                      min={0}
                      step={config.units === 'metric' ? 0.3 : 1}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Rear</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {toDisplay(config.rearSetback)} {getUnitLabel()}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.rearSetback).toString()) : config.rearSetback}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('rearSetback', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 9 : 30}
                      min={0}
                      step={config.units === 'metric' ? 0.3 : 1}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Side Setbacks</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {toDisplay(config.sideSetback)} {getUnitLabel()}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.sideSetback).toString()) : config.sideSetback}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('sideSetback', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 6 : 20}
                      min={0}
                      step={config.units === 'metric' ? 0.3 : 1}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              </div>

              {/* ADU Specifications */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">ADU Size</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Width</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {config.units === 'imperial' ? toFeetAndInches(config.aduWidth) : `${toDisplay(config.aduWidth)} ${getUnitLabel()}`}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.aduWidth).toString()) : config.aduWidth}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('aduWidth', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 12 : 40}
                      min={config.units === 'metric' ? 3 : 10}
                      step={config.units === 'metric' ? 0.3 : 1}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs">Depth</Label>
                      <Badge variant="outline" className="font-mono text-xs h-5">
                        {config.units === 'imperial' ? toFeetAndInches(config.aduDepth) : `${toDisplay(config.aduDepth)} ${getUnitLabel()}`}
                      </Badge>
                    </div>
                    <input
                      type="range"
                      value={config.units === 'metric' ? parseFloat(toDisplay(config.aduDepth).toString()) : config.aduDepth}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        updateConfigValue('aduDepth', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                      }}
                      max={config.units === 'metric' ? 12 : 40}
                      min={config.units === 'metric' ? 3 : 10}
                      step={config.units === 'metric' ? 0.3 : 1}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-1">
                <Button onClick={exportConfiguration} className="w-full h-9">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Visualization */}
        <main className="flex flex-col min-h-0">

          {/* Canvas */}
          <Card className="flex-1 flex flex-col min-h-0 max-h-[calc(100vh-12rem)]">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Move className="h-4 w-4" />
                    Property Visualization
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Drag the ADU to reposition it on your lot
                  </CardDescription>
                </div>
                {/* Validation Status */}
                <div className="flex flex-col gap-2">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${overallValid ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'}`}>
                    {overallValid ? (
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    )}
                    <span className={`text-sm font-medium ${overallValid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                      {overallValid ? 'Valid Configuration' : 'Issues Found'}
                    </span>
                  </div>
                  
                  {/* Placement validation */}
                  {!isValidPlacement && (
                    <div className="text-xs text-red-600 dark:text-red-400">
                      • ADU placement violates setbacks
                    </div>
                  )}
                  
                  {/* Bylaw violations */}
                  {bylawValidation.violations.length > 0 && (
                    <div className="space-y-1">
                      {bylawValidation.violations.map((violation, index) => (
                        <div key={index} className="text-xs text-red-600 dark:text-red-400">
                          • {violation.message}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Warnings */}
                  {bylawValidation.warnings.length > 0 && (
                    <div className="space-y-1">
                      {bylawValidation.warnings.map((warning, index) => (
                        <div key={index} className="text-xs text-yellow-600 dark:text-yellow-400">
                          ⚠ {warning.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex justify-center items-center bg-muted/30 relative min-h-0 p-4">
              <div
                data-visualizer="true"
                className={`relative bg-background border-2 border-border rounded-lg shadow-lg overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-auto'}`}
                style={{
                  width: Math.min(700, config.lotWidth * scale) + 'px',
                  height: Math.min(500, config.lotDepth * scale) + 'px',
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, hsl(var(--border)) 19px, hsl(var(--border)) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, hsl(var(--border)) 19px, hsl(var(--border)) 20px)',
                  backgroundSize: '20px 20px'
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setSelectedElement(null)
                  }
                }}
              >
                {/* Buildable Area */}
                <div
                  className="absolute bg-green-50/80 border-2 border-dashed border-green-400 rounded dark:bg-green-950/30 dark:border-green-600"
                  style={{
                    left: config.sideSetback * scale + 'px',
                    top: config.frontSetback * scale + 'px',
                    width: Math.max(0, (config.lotWidth - 2 * config.sideSetback) * scale) + 'px',
                    height: Math.max(0, (config.lotDepth - config.frontSetback - config.rearSetback) * scale) + 'px'
                  }}
                />

                {/* Obstacles */}
                {obstacles.map((obstacle) => {
                  const icons: Record<string, string> = {
                    tree: '🌳',
                    rock: '🪨',
                    structure: '🏠',
                    shed: '🏚️',
                    pool: '🏊',
                    fence: '🚧',
                    other: '📦'
                  }

                  const isSelected = selectedElement?.type === 'obstacle' && selectedElement?.id === obstacle.id

                  return (
                    <div
                      key={obstacle.id}
                      className={`absolute border-2 text-xs font-semibold flex items-center justify-center select-none z-10 ${isDragging && selectedElement?.type === 'obstacle' && selectedElement?.id === obstacle.id ? 'cursor-grabbing' : 'cursor-grab'} ${isDragging && selectedElement?.type === 'obstacle' && selectedElement?.id === obstacle.id ? '' : 'transition-all'} ${
                        obstacle.type === 'tree' ? 'bg-green-500 border-green-700 rounded-full text-white' :
                        obstacle.type === 'rock' ? 'bg-gray-500 border-gray-700 rounded-lg text-white' :
                        obstacle.type === 'structure' ? 'bg-orange-500 border-orange-700 rounded-lg text-white' :
                        obstacle.type === 'shed' ? 'bg-purple-500 border-purple-700 rounded-lg text-white' :
                        obstacle.type === 'pool' ? 'bg-blue-500 border-blue-700 rounded-xl text-white' :
                        obstacle.type === 'fence' ? 'bg-red-500 border-red-700 rounded-lg text-white' :
                        'bg-yellow-500 border-yellow-700 rounded-lg text-white'
                      } ${isSelected ? 'outline outline-3 outline-blue-500 outline-offset-2' : 'hover:scale-105'}`}
                      style={{
                        left: obstacle.x * scale + 'px',
                        top: obstacle.y * scale + 'px',
                        width: obstacle.width * scale + 'px',
                        height: obstacle.depth * scale + 'px',
                        willChange: isDragging && selectedElement?.type === 'obstacle' && selectedElement?.id === obstacle.id ? 'transform' : 'auto'
                      }}
                      onMouseDown={(e) => handleObstacleMouseDown(e, obstacle)}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedElement({ type: 'obstacle', id: obstacle.id })
                      }}
                    >
                      {icons[obstacle.type] || icons.other}
                      
                      {/* Remove button */}
                      {isSelected && (
                        <button
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 border-2 border-white rounded-full text-white text-xs font-bold flex items-center justify-center hover:scale-110 transition-transform z-30"
                          onClick={(e) => {
                            e.stopPropagation()
                            removeObstacle(obstacle.id)
                          }}
                        >
                          ×
                        </button>
                      )}
                      
                      {/* Resize handle */}
                      {isSelected && (
                        <div
                          className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-se-resize z-30"
                          onMouseDown={(e) => handleResizeMouseDown(e, obstacle.id, 'obstacle')}
                        />
                      )}
                    </div>
                  )
                })}

                {/* ADU Unit */}
                <div
                  className={`absolute border-2 text-white text-sm font-semibold flex items-center justify-center select-none shadow-lg z-20 ${isDragging && selectedElement?.type === 'adu' ? 'cursor-grabbing' : 'cursor-grab'} ${isDragging && selectedElement?.type === 'adu' ? '' : 'transition-all'} ${
                    !overallValid ? 'bg-destructive border-destructive' : 'bg-primary border-primary'
                  } ${selectedElement?.type === 'adu' ? 'outline outline-3 outline-blue-500 outline-offset-2' : ''}`}
                  style={{
                    width: config.aduWidth * scale + 'px',
                    height: config.aduDepth * scale + 'px',
                    left: aduPosition.x * scale + 'px',
                    top: aduPosition.y * scale + 'px',
                    willChange: isDragging && selectedElement?.type === 'adu' ? 'transform' : 'auto'
                  }}
                  onMouseDown={(e) => handleAduMouseDown(e)}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedElement({ type: 'adu' })
                  }}
                >
                  ADU
                  
                  {/* Resize handle */}
                  {selectedElement?.type === 'adu' && (
                    <div
                      className="absolute -bottom-1 -right-1 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-se-resize z-30"
                      onMouseDown={(e) => handleResizeMouseDown(e, 'adu', 'adu')}
                    />
                  )}
                </div>
              </div>

              {/* Floating Obstacle Panel */}
              <div className="absolute top-3 right-3 bg-background border border-border rounded-lg shadow-lg p-3 w-36 z-50">
                <div className="text-xs font-semibold text-foreground mb-2">
                  Add Obstacles
                </div>
                <div className="space-y-1">
                  {[
                    { type: 'tree', icon: '🌳', label: 'Tree' },
                    { type: 'rock', icon: '🪨', label: 'Rock' },
                    { type: 'structure', icon: '🏠', label: 'Structure' },
                    { type: 'shed', icon: '🏚️', label: 'Shed' },
                    { type: 'pool', icon: '🏊', label: 'Pool' },
                    { type: 'fence', icon: '🚧', label: 'Fence' },
                    { type: 'other', icon: '📦', label: 'Other' }
                  ].map(({ type, icon, label }) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => addObstacle(type)}
                      className="w-full justify-start h-7 text-xs px-2"
                    >
                      <span className="mr-2">{icon}</span>
                      {label}
                    </Button>
                  ))}
                  {obstacles.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearObstacles}
                      className="w-full mt-2 text-muted-foreground h-7 text-xs px-2"
                    >
                      <RotateCcw className="mr-2 h-3 w-3" />
                      Clear All
                    </Button>
                  )}
                </div>
              </div>

              {/* Selected Element Info Panel */}
              {selectedElement && (
                <div className="absolute top-3 left-3 bg-background border border-border rounded-lg shadow-lg p-3 w-52 z-50">
                  <div className="text-xs font-semibold text-foreground mb-3">
                    {selectedElement.type === 'adu' ? 'ADU Properties' : 'Obstacle Properties'}
                  </div>
                  
                  {selectedElement.type === 'adu' ? (
                    <>
                      {/* ADU Size Controls */}
                      <div className="space-y-2 mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Label className="text-xs">Width</Label>
                            <input
                              type="text"
                              value={config.units === 'imperial' ? toFeetAndInches(config.aduWidth) : `${toDisplay(config.aduWidth)}m`}
                              onChange={(e) => {
                                const val = config.units === 'imperial' 
                                  ? fromFeetAndInches(e.target.value)
                                  : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                if (!isNaN(val) && val > 0) {
                                  updateConfigValue('aduWidth', Math.min(40, Math.max(10, val)))
                                }
                              }}
                              className="text-xs font-mono w-16 px-1 py-0.5 border rounded text-right ml-auto"
                            />
                          </div>
                          <input
                            type="range"
                            value={config.units === 'metric' ? parseFloat(toDisplay(config.aduWidth).toString()) : config.aduWidth}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value)
                              updateConfigValue('aduWidth', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                            }}
                            max={config.units === 'metric' ? 12 : 40}
                            min={config.units === 'metric' ? 3 : 10}
                            step={config.units === 'metric' ? 0.3 : 1}
                            className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Label className="text-xs">Depth</Label>
                            <input
                              type="text"
                              value={config.units === 'imperial' ? toFeetAndInches(config.aduDepth) : `${toDisplay(config.aduDepth)}m`}
                              onChange={(e) => {
                                const val = config.units === 'imperial' 
                                  ? fromFeetAndInches(e.target.value)
                                  : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                if (!isNaN(val) && val > 0) {
                                  updateConfigValue('aduDepth', Math.min(40, Math.max(10, val)))
                                }
                              }}
                              className="text-xs font-mono w-16 px-1 py-0.5 border rounded text-right ml-auto"
                            />
                          </div>
                          <input
                            type="range"
                            value={config.units === 'metric' ? parseFloat(toDisplay(config.aduDepth).toString()) : config.aduDepth}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value)
                              updateConfigValue('aduDepth', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                            }}
                            max={config.units === 'metric' ? 12 : 40}
                            min={config.units === 'metric' ? 3 : 10}
                            step={config.units === 'metric' ? 0.3 : 1}
                            className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>
                      
                      {/* ADU Position Controls */}
                      <div className="space-y-2 mb-3 border-t border-border pt-2">
                        <div className="text-xs font-semibold mb-1">Position</div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Label className="text-xs">X</Label>
                            <input
                              type="text"
                              value={config.units === 'imperial' ? toFeetAndInches(aduPosition.x) : `${toDisplay(aduPosition.x)}m`}
                              onChange={(e) => {
                                const val = config.units === 'imperial' 
                                  ? fromFeetAndInches(e.target.value)
                                  : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                if (!isNaN(val) && val >= 0) {
                                  setAduPosition(prev => ({ ...prev, x: Math.min(config.lotWidth - config.aduWidth, Math.max(0, val)) }))
                                }
                              }}
                              className="text-xs font-mono w-16 px-1 py-0.5 border rounded text-right ml-auto"
                            />
                          </div>
                          <input
                            type="range"
                            value={config.units === 'metric' ? parseFloat(toDisplay(aduPosition.x).toString()) : aduPosition.x}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value)
                              const newX = config.units === 'metric' ? val / FEET_TO_METERS : val
                              setAduPosition(prev => ({ ...prev, x: newX }))
                            }}
                            max={config.units === 'metric' ? parseFloat(toDisplay(config.lotWidth - config.aduWidth).toString()) : config.lotWidth - config.aduWidth}
                            min={0}
                            step={config.units === 'metric' ? 0.3 : 1}
                            className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Label className="text-xs">Y</Label>
                            <input
                              type="text"
                              value={config.units === 'imperial' ? toFeetAndInches(aduPosition.y) : `${toDisplay(aduPosition.y)}m`}
                              onChange={(e) => {
                                const val = config.units === 'imperial' 
                                  ? fromFeetAndInches(e.target.value)
                                  : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                if (!isNaN(val) && val >= 0) {
                                  setAduPosition(prev => ({ ...prev, y: Math.min(config.lotDepth - config.aduDepth, Math.max(0, val)) }))
                                }
                              }}
                              className="text-xs font-mono w-16 px-1 py-0.5 border rounded text-right ml-auto"
                            />
                          </div>
                          <input
                            type="range"
                            value={config.units === 'metric' ? parseFloat(toDisplay(aduPosition.y).toString()) : aduPosition.y}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value)
                              const newY = config.units === 'metric' ? val / FEET_TO_METERS : val
                              setAduPosition(prev => ({ ...prev, y: newY }))
                            }}
                            max={config.units === 'metric' ? parseFloat(toDisplay(config.lotDepth - config.aduDepth).toString()) : config.lotDepth - config.aduDepth}
                            min={0}
                            step={config.units === 'metric' ? 0.3 : 1}
                            className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>
                      
                      {/* ADU Info Display */}
                      <div className="space-y-1 text-xs border-t border-border pt-2">
                        <div className="flex justify-between">
                          <span>Area:</span>
                          <span className="font-mono">{toDisplay(config.aduWidth * config.aduDepth, true)} {getUnitLabel(true)}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    (() => {
                      const obstacle = obstacles.find(o => o.id === selectedElement.id)
                      return obstacle ? (
                        <>
                          {/* Obstacle Size Controls */}
                          <div className="space-y-2 mb-3">
                            <div className="flex justify-between items-center text-xs mb-2">
                              <span>Type:</span>
                              <span className="capitalize font-medium">{obstacle.type}</span>
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Width</Label>
                                <span className="text-xs font-mono">{toDisplay(obstacle.width)} {getUnitLabel()}</span>
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(obstacle.width).toString()) : obstacle.width}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  const newWidth = config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val
                                  setObstacles(prev => prev.map(obs => 
                                    obs.id === obstacle.id 
                                      ? { ...obs, width: newWidth }
                                      : obs
                                  ))
                                }}
                                max={config.units === 'metric' ? 15 : 50}
                                min={config.units === 'metric' ? 1.5 : 5}
                                step={config.units === 'metric' ? 0.3 : 1}
                                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <Label className="text-xs">Depth</Label>
                                <span className="text-xs font-mono">{toDisplay(obstacle.depth)} {getUnitLabel()}</span>
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(obstacle.depth).toString()) : obstacle.depth}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  const newDepth = config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val
                                  setObstacles(prev => prev.map(obs => 
                                    obs.id === obstacle.id 
                                      ? { ...obs, depth: newDepth }
                                      : obs
                                  ))
                                }}
                                max={config.units === 'metric' ? 15 : 50}
                                min={config.units === 'metric' ? 1.5 : 5}
                                step={config.units === 'metric' ? 0.3 : 1}
                                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                          </div>
                          
                          {/* Obstacle Position Controls */}
                          <div className="space-y-2 mb-3 border-t border-border pt-2">
                            <div className="text-xs font-semibold mb-1">Position</div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label className="text-xs">X</Label>
                                <input
                                  type="text"
                                  value={config.units === 'imperial' ? toFeetAndInches(obstacle.x) : `${toDisplay(obstacle.x)}m`}
                                  onChange={(e) => {
                                    const val = config.units === 'imperial' 
                                      ? fromFeetAndInches(e.target.value)
                                      : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                    if (!isNaN(val) && val >= 0) {
                                      setObstacles(prev => prev.map(obs => 
                                        obs.id === obstacle.id 
                                          ? { ...obs, x: Math.min(config.lotWidth - obs.width, Math.max(0, val)) }
                                          : obs
                                      ))
                                    }
                                  }}
                                  className="text-xs font-mono w-16 px-1 py-0.5 border rounded text-right ml-auto"
                                />
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(obstacle.x).toString()) : obstacle.x}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  const newX = config.units === 'metric' ? val / FEET_TO_METERS : val
                                  setObstacles(prev => prev.map(obs => 
                                    obs.id === obstacle.id 
                                      ? { ...obs, x: newX }
                                      : obs
                                  ))
                                }}
                                max={config.units === 'metric' ? parseFloat(toDisplay(config.lotWidth - obstacle.width).toString()) : config.lotWidth - obstacle.width}
                                min={0}
                                step={config.units === 'metric' ? 0.3 : 1}
                                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Label className="text-xs">Y</Label>
                                <input
                                  type="text"
                                  value={config.units === 'imperial' ? toFeetAndInches(obstacle.y) : `${toDisplay(obstacle.y)}m`}
                                  onChange={(e) => {
                                    const val = config.units === 'imperial' 
                                      ? fromFeetAndInches(e.target.value)
                                      : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                    if (!isNaN(val) && val >= 0) {
                                      setObstacles(prev => prev.map(obs => 
                                        obs.id === obstacle.id 
                                          ? { ...obs, y: Math.min(config.lotDepth - obs.depth, Math.max(0, val)) }
                                          : obs
                                      ))
                                    }
                                  }}
                                  className="text-xs font-mono w-16 px-1 py-0.5 border rounded text-right ml-auto"
                                />
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(obstacle.y).toString()) : obstacle.y}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  const newY = config.units === 'metric' ? val / FEET_TO_METERS : val
                                  setObstacles(prev => prev.map(obs => 
                                    obs.id === obstacle.id 
                                      ? { ...obs, y: newY }
                                      : obs
                                  ))
                                }}
                                max={config.units === 'metric' ? parseFloat(toDisplay(config.lotDepth - obstacle.depth).toString()) : config.lotDepth - obstacle.depth}
                                min={0}
                                step={config.units === 'metric' ? 0.3 : 1}
                                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                          </div>
                        </>
                      ) : null
                    })()
                  )}
                  
                  <div className="border-t border-border pt-2 mt-2">
                    <div className="text-xs text-muted-foreground">
                      Drag to move • Drag corner to resize
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}