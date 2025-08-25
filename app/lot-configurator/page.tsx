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
  MapPin,
  Settings,
  Building,
  ArrowUpDown,
  ArrowLeftRight,
  AlertCircle
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
  aduStories: number
  aduType: 'detached' | 'attached' | 'garage_conversion'
  separationFromMain: number
  units: 'imperial' | 'metric'
  mainBuildingWidth: number
  mainBuildingDepth: number
}

interface Obstacle {
  id: string
  type: string
  width: number
  depth: number
  x: number
  y: number
}

interface ADUPreset {
  id: string
  title: string
  dimensions: string
  squareFeet: number
  width: number
  depth: number
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
    aduStories: 1,
    aduType: 'detached',
    separationFromMain: 16.4, // 5m default for single story
    units: 'imperial',
    mainBuildingWidth: 30,
    mainBuildingDepth: 40
  })

  // ADU Presets based on modular units
  const aduPresets: ADUPreset[] = [
    { id: 'studio', title: 'Studio ADU', dimensions: '16\' × 20\'', squareFeet: 320, width: 16, depth: 20 },
    { id: '1br', title: '1 Bedroom ADU', dimensions: '20\' × 24\'', squareFeet: 480, width: 20, depth: 24 },
    { id: '1br-large', title: '1 Bedroom ADU (Large)', dimensions: '24\' × 28\'', squareFeet: 672, width: 24, depth: 28 },
    { id: '2br', title: '2 Bedroom ADU', dimensions: '28\' × 32\'', squareFeet: 896, width: 28, depth: 32 },
    { id: '2br-large', title: '2 Bedroom ADU (Large)', dimensions: '32\' × 36\'', squareFeet: 1152, width: 32, depth: 36 },
    { id: 'pre-approved', title: 'Pre-Approved Plans', dimensions: 'Various sizes', squareFeet: 0, width: 0, depth: 0 },
    { id: 'custom', title: 'Custom Size', dimensions: 'Set your own', squareFeet: 0, width: 20, depth: 24 }
  ]

  const [selectedAduPreset, setSelectedAduPreset] = useState<string>('1br')
  const [aduModule, setAduModule] = useState<'custom' | '1' | '2' | '3'>('custom')
  const [isModuleRotated, setIsModuleRotated] = useState(false)
  const [aduType, setAduType] = useState<'detached' | 'attached'>('detached')
  const [aduStories, setAduStories] = useState<1 | 2>(1)
  
  // Note: Removed circular dependency - local state (aduType, aduStories) is source of truth

  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [aduPosition, setAduPosition] = useState({ x: 50, y: 60 })
  const [selectedElement, setSelectedElement] = useState<{type: 'adu' | 'obstacle', id?: string} | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [dragPositions, setDragPositions] = useState<{adu?: {x: number, y: number}, obstacles?: Record<string, {x: number, y: number}>}>({})
  const lastUpdateRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Municipality selection and bylaw data
  const [municipalities, setMunicipalities] = useState<MunicipalityWithBylawData[]>([])
  const [selectedMunicipality, setSelectedMunicipality] = useState<number | null>(null)
  const [bylawValidation, setBylawValidation] = useState<BylawValidationResult>({
    isValid: true,
    violations: [],
    warnings: []
  })
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false)
  const [separationFromBylaws, setSeparationFromBylaws] = useState(false)
  const [setbacksFromBylaws, setSetbacksFromBylaws] = useState({
    front: false,
    rear: false,
    side: false
  })
  const [isApplyingBylaws, setIsApplyingBylaws] = useState(false)

  // Conversion constants
  const FEET_TO_METERS = 0.3048
  const SQFT_TO_SQM = 0.092903

  // Canvas size
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 400 })

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
    
    // Reset bylaw tracking when user manually changes values
    if (key === 'frontSetback') {
      setSetbacksFromBylaws(prev => ({ ...prev, front: false }))
    } else if (key === 'rearSetback') {
      setSetbacksFromBylaws(prev => ({ ...prev, rear: false }))
    } else if (key === 'sideSetback') {
      setSetbacksFromBylaws(prev => ({ ...prev, side: false }))
    }
  }

  // Load all municipalities (not just those with bylaw data)
  useEffect(() => {
    const loadMunicipalities = async () => {
      setLoadingMunicipalities(true)
      try {
        const response = await fetch('/api/municipalities/with-bylaw-data')
        if (response.ok) {
          const result = await response.json()
          console.log('API response:', result)
          console.log('Ajax municipality data:', result.data.find(m => m.id === 13))
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
    // Get fresh municipality data to avoid closure issues
    const currentMunicipalityData = municipalities.find(m => m.id === selectedMunicipality)
    console.log('applyBylawConstraints called for:', currentMunicipalityData?.name)
    console.log('bylaw_data exists:', !!currentMunicipalityData?.bylaw_data)
    
    if (!currentMunicipalityData?.bylaw_data) {
      console.log('No bylaw data found, returning early')
      return
    }

    const bylawData = currentMunicipalityData.bylaw_data
    console.log('Ajax bylaw data:', {
      front: bylawData.front_setback_min_ft,
      rear: bylawData.rear_setback_standard_ft,
      side: bylawData.side_setback_interior_ft
    })
    const changes: string[] = []
    let newSetbacksFromBylaws = { ...setbacksFromBylaws }
    
    // Apply setback constraints - update config state directly to avoid timing issues
    let configUpdates: any = {}
    
    if (bylawData.front_setback_min_ft) {
      configUpdates.frontSetback = bylawData.front_setback_min_ft
      newSetbacksFromBylaws.front = true
      changes.push(`Front setback set to: ${bylawData.front_setback_min_ft}'`)
    }
    
    if (bylawData.rear_setback_standard_ft) {
      configUpdates.rearSetback = bylawData.rear_setback_standard_ft
      newSetbacksFromBylaws.rear = true
      changes.push(`Rear setback set to: ${bylawData.rear_setback_standard_ft}'`)
    }
    
    if (bylawData.side_setback_interior_ft) {
      configUpdates.sideSetback = bylawData.side_setback_interior_ft
      newSetbacksFromBylaws.side = true
      changes.push(`Side setback set to: ${bylawData.side_setback_interior_ft}'`)
    }
    
    // Apply all config updates at once
    if (Object.keys(configUpdates).length > 0) {
      console.log('Applying bylaw config updates:', configUpdates)
      setConfig(prev => ({ ...prev, ...configUpdates }))
    }
    
    // Update setback tracking state
    console.log('Setting setbacksFromBylaws:', newSetbacksFromBylaws)
    setSetbacksFromBylaws(newSetbacksFromBylaws)
    
    // Apply separation distance for different story ADUs
    if (bylawData.distance_from_primary_ft && separationFromBylaws) {
      updateConfigValue('separationFromMain', bylawData.distance_from_primary_ft)
      changes.push(`Separation: ${config.separationFromMain}' → ${bylawData.distance_from_primary_ft}'`)
    } else if (!separationFromBylaws) {
      // Apply default separation based on ADU stories
      const defaultSeparation = config.aduStories >= 2 ? 24.6 : 16.4
      updateConfigValue('separationFromMain', defaultSeparation)
    }

    // Apply ADU type constraints
    if (bylawData.adu_types_allowed) {
      // Set to detached if only detached is allowed, or attached if only attached is allowed
      if (bylawData.adu_types_allowed.detached && !bylawData.adu_types_allowed.attached && aduType !== 'detached') {
        setAduType('detached')
        changes.push(`ADU type set to detached (required by bylaws)`)
      } else if (!bylawData.adu_types_allowed.detached && bylawData.adu_types_allowed.attached && aduType !== 'attached') {
        setAduType('attached')
        changes.push(`ADU type set to attached (required by bylaws)`)
      }
    }

    // Apply ADU size constraints
    if (bylawData.detached_adu_max_size_sqft && aduType === 'detached') {
      const maxArea = bylawData.detached_adu_max_size_sqft
      const currentArea = config.aduWidth * config.aduDepth
      if (currentArea > maxArea) {
        // Proportionally reduce ADU size
        const scaleFactor = Math.sqrt(maxArea / currentArea)
        updateConfigValue('aduWidth', Math.floor(config.aduWidth * scaleFactor))
        updateConfigValue('aduDepth', Math.floor(config.aduDepth * scaleFactor))
        changes.push(`ADU size reduced to meet maximum: ${currentArea} → ${Math.floor(config.aduWidth * scaleFactor) * Math.floor(config.aduDepth * scaleFactor)} sq ft`)
      }
    }

    // Apply height/story constraints
    if (bylawData.detached_adu_max_stories && aduType === 'detached' && bylawData.detached_adu_max_stories < aduStories) {
      setAduStories(bylawData.detached_adu_max_stories as 1 | 2)
      changes.push(`ADU stories reduced to ${bylawData.detached_adu_max_stories} (required by bylaws)`)
    }
    
    // Log changes if any were made
    if (changes.length > 0) {
      console.log('Applied bylaw constraints:', changes)
      // Could add a toast notification here
    }
  }, [municipalities, selectedMunicipality, config, updateConfigValue, setbacksFromBylaws, separationFromBylaws, aduType, aduStories])

  // Apply constraints for a specific municipality (avoids closure issues)
  const applyBylawConstraintsForMunicipality = useCallback((municipalityData: any) => {
    console.log('applyBylawConstraintsForMunicipality called for:', municipalityData?.name)
    console.log('bylaw_data exists:', !!municipalityData?.bylaw_data)
    
    const changes: string[] = []
    let configUpdates: any = {}
    
    // Always apply default separation based on current stories, then override if bylaw data exists
    const currentStories = config.aduStories || aduStories // Use config value first, fallback to state
    const defaultSeparation = currentStories >= 2 ? 24.6 : 16.4 // 7.5m for 2-story, 5m for 1-story
    configUpdates.separationFromMain = defaultSeparation
    changes.push(`Separation from residence set to default: ${defaultSeparation}' (${currentStories >= 2 ? '7.5m' : '5m'})`)
    
    if (!municipalityData?.bylaw_data) {
      console.log('No bylaw data found, using defaults only')
      // Apply the default separation
      if (Object.keys(configUpdates).length > 0) {
        console.log('Applying default config updates:', configUpdates)
        setConfig(prev => ({ ...prev, ...configUpdates }))
      }
      if (changes.length > 0) {
        console.log('Applied default constraints:', changes)
      }
      return
    }

    const bylawData = municipalityData.bylaw_data
    console.log('Bylaw data:', {
      front: bylawData.front_setback_min_ft,
      rear: bylawData.rear_setback_standard_ft,
      side: bylawData.side_setback_interior_ft
    })
    let newSetbacksFromBylaws = { ...setbacksFromBylaws }
    
    if (bylawData.front_setback_min_ft) {
      configUpdates.frontSetback = parseFloat(bylawData.front_setback_min_ft)
      newSetbacksFromBylaws.front = true
      changes.push(`Front setback set to: ${bylawData.front_setback_min_ft}'`)
    }
    
    if (bylawData.rear_setback_standard_ft) {
      configUpdates.rearSetback = parseFloat(bylawData.rear_setback_standard_ft)
      newSetbacksFromBylaws.rear = true
      changes.push(`Rear setback set to: ${bylawData.rear_setback_standard_ft}'`)
    }
    
    if (bylawData.side_setback_interior_ft) {
      configUpdates.sideSetback = parseFloat(bylawData.side_setback_interior_ft)
      newSetbacksFromBylaws.side = true
      changes.push(`Side setback set to: ${bylawData.side_setback_interior_ft}'`)
    }
    
    // Override default separation if bylaw specifies it
    if (bylawData.distance_from_primary_ft) {
      configUpdates.separationFromMain = parseFloat(bylawData.distance_from_primary_ft)
      // Update the changes message to show it's from bylaws, not default
      const defaultMessage = `Separation from residence set to default: ${configUpdates.separationFromMain}' (${aduStories >= 2 ? '7.5m' : '5m'})`
      const bylawMessage = `Separation from residence set to: ${bylawData.distance_from_primary_ft}' (bylaw requirement)`
      // Replace the default message with bylaw message
      const defaultIndex = changes.findIndex(c => c.includes('set to default'))
      if (defaultIndex !== -1) {
        changes[defaultIndex] = bylawMessage
      } else {
        changes.push(bylawMessage)
      }
    }
    
    // Apply all config updates at once
    if (Object.keys(configUpdates).length > 0) {
      console.log('Applying bylaw config updates:', configUpdates)
      setConfig(prev => ({ ...prev, ...configUpdates }))
    }
    
    // Update setback tracking state
    console.log('Setting setbacksFromBylaws:', newSetbacksFromBylaws)
    setSetbacksFromBylaws(newSetbacksFromBylaws)
    
    if (changes.length > 0) {
      console.log('Applied bylaw constraints:', changes)
    }
  }, [setbacksFromBylaws])

  // Update ADU dimensions when module selection changes
  useEffect(() => {
    if (aduModule !== 'custom') {
      const modulePresets = {
        '1': isModuleRotated 
          ? { width: 20, depth: 8.5 }    // Rotated Studio 1: 20′ × 8.5′
          : { width: 8.5, depth: 20 },   // Studio 1: 8.5′ × 20′ (170 sq ft)
        '2': isModuleRotated 
          ? { width: 17, depth: 20 }     // Rotated 1 Bedroom: 17′ × 20′
          : { width: 20, depth: 17 },    // 1 Bedroom: 20′ × 17′ (340 sq ft)
        '3': isModuleRotated 
          ? { width: 25.5, depth: 20 }   // Rotated 2 Bedroom: 25.5′ × 20′
          : { width: 20, depth: 25.5 }   // 2 Bedroom: 20′ × 25.5′ (510 sq ft)
      }
      const preset = modulePresets[aduModule]
      if (preset && (config.aduWidth !== preset.width || config.aduDepth !== preset.depth)) {
        setConfig(prev => ({
          ...prev,
          aduWidth: preset.width,
          aduDepth: preset.depth
        }))
      }
    }
  }, [aduModule, config.aduWidth, config.aduDepth, isModuleRotated])

  // Update config when aduType or aduStories changes
  useEffect(() => {
    setConfig(prev => {
      let updates: Partial<typeof prev> = {}
      let needsUpdate = false

      if (prev.aduType !== aduType) {
        updates.aduType = aduType
        needsUpdate = true
      }

      if (prev.aduStories !== aduStories) {
        updates.aduStories = aduStories
        needsUpdate = true
        
        // Update separation based on stories, but check if municipality has specific separation requirement
        const currentMunicipality = municipalities.find(m => m.id === selectedMunicipality)
        const hasBylawSeparation = currentMunicipality?.bylaw_data?.distance_from_primary_ft
        
        // Only update if no specific bylaw separation requirement exists
        if (!hasBylawSeparation) {
          const newSeparation = aduStories >= 2 ? 24.6 : 16.4
          if (prev.separationFromMain !== newSeparation) {
            updates.separationFromMain = newSeparation
          }
        }
      }

      return needsUpdate ? { ...prev, ...updates } : prev
    })
  }, [aduType, aduStories, municipalities, selectedMunicipality])

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
    console.log('validateAgainstBylaws called for:', selectedMunicipalityData?.name)
    console.log('selectedMunicipalityData:', selectedMunicipalityData)
    
    if (!selectedMunicipalityData?.bylaw_data) {
      console.log('No bylaw data, setting validation to valid')
      setBylawValidation({ isValid: true, violations: [], warnings: [] })
      return
    }

    const bylawData = selectedMunicipalityData.bylaw_data
    console.log('Found bylaw data:', bylawData)
    const violations: BylawViolation[] = []
    const warnings: any[] = []

    // Check setbacks (only if they're not automatically set from bylaws)
    if (bylawData.front_setback_min_ft && !setbacksFromBylaws.front && config.frontSetback < bylawData.front_setback_min_ft) {
      console.log('Front setback violation:', {
        current: config.frontSetback,
        required: bylawData.front_setback_min_ft,
        fromBylaws: setbacksFromBylaws.front
      })
      violations.push({
        type: 'setback',
        message: 'Front setback is below minimum requirement',
        requirement: `Minimum ${bylawData.front_setback_min_ft} ft`,
        current_value: config.frontSetback,
        required_value: bylawData.front_setback_min_ft
      })
    }

    if (bylawData.rear_setback_standard_ft && !setbacksFromBylaws.rear && config.rearSetback < bylawData.rear_setback_standard_ft) {
      violations.push({
        type: 'setback',
        message: 'Rear setback is below minimum requirement',
        requirement: `Minimum ${bylawData.rear_setback_standard_ft} ft`,
        current_value: config.rearSetback,
        required_value: bylawData.rear_setback_standard_ft
      })
    }

    if (bylawData.side_setback_interior_ft && !setbacksFromBylaws.side && config.sideSetback < bylawData.side_setback_interior_ft) {
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

    // Check if using default separation (risk reminder when no bylaw separation found)
    if (!bylawData.distance_from_primary_ft) {
      warnings.push({
        type: 'consideration',
        message: 'Using default separation distance from main dwelling',
        details: `Default: ${config.aduStories >= 2 ? '7.5m (24.6\')' : '5m (16.4\')'} - confirm separation requirement from municipal bylaws`
      })
    }

    setBylawValidation({
      isValid: violations.length === 0,
      violations,
      warnings
    })
  }, [selectedMunicipalityData, config, calculateMetrics])

  // Re-validate when config or municipality changes (but not during bylaw application)
  useEffect(() => {
    if (!isApplyingBylaws) {
      validateAgainstBylaws()
    }
  }, [validateAgainstBylaws, isApplyingBylaws])

  const getCoverageStatus = (coverage: number) => {
    if (coverage < 35) return 'success'
    if (coverage < 50) return 'warning'
    return 'danger'
  }

  const handleAduPresetChange = (presetId: string) => {
    setSelectedAduPreset(presetId)
    const preset = aduPresets.find(p => p.id === presetId)
    if (preset && preset.width > 0 && preset.depth > 0) {
      updateConfigValue('aduWidth', preset.width)
      updateConfigValue('aduDepth', preset.depth)
    }
  }

  const isUsingDefaultSeparation = () => {
    const defaultSeparation = config.aduStories >= 2 ? 24.6 : 16.4
    return !separationFromBylaws && Math.abs(config.separationFromMain - defaultSeparation) < 0.1
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

    // Check for object collisions
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

    // Check separation from primary residence
    const residence = obstacles.find(o => o.type === 'residence')
    let separationViolation = false
    if (residence) {
      const resLeft = residence.x - config.separationFromMain
      const resTop = residence.y - config.separationFromMain
      const resRight = residence.x + residence.width + config.separationFromMain
      const resBottom = residence.y + residence.depth + config.separationFromMain

      separationViolation = !(aduRight <= resLeft || 
                             aduLeft >= resRight || 
                             aduBottom <= resTop || 
                             aduTop >= resBottom)
    }

    return withinBuildable && !hasCollision && !separationViolation
  }, [config, aduPosition, obstacles])

  const addObstacle = (type: string) => {
    const sizes: Record<string, { width: number; height: number }> = {
      tree: { width: 15, height: 15 },
      rock: { width: 10, height: 10 },
      residence: { width: 25, height: 20 },
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
  const scale = 3.5

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
        
        // Apply boundary constraints - keep precise positioning for smooth dragging
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

  const generateDetailedReport = () => {
    const metrics = calculateMetrics()
    const report = {
      timestamp: new Date().toISOString(),
      municipality: selectedMunicipalityData?.name || 'None selected',
      property: {
        lotSize: `${toDisplay(config.lotWidth)} × ${toDisplay(config.lotDepth)} ${getUnitLabel()}`,
        lotArea: `${toDisplay(metrics.lotArea, true)} ${getUnitLabel(true)}`,
        buildableArea: `${toDisplay(metrics.buildableAreaSize, true)} ${getUnitLabel(true)}`
      },
      adu: {
        type: config.aduType,
        size: `${toDisplay(config.aduWidth)} × ${toDisplay(config.aduDepth)} ${getUnitLabel()}`,
        area: `${toDisplay(metrics.aduArea, true)} ${getUnitLabel(true)}`,
        stories: config.aduStories,
        position: `${toDisplay(aduPosition.x)}, ${toDisplay(aduPosition.y)} ${getUnitLabel()}`
      },
      setbacks: {
        front: `${toDisplay(config.frontSetback)} ${getUnitLabel()} ${setbacksFromBylaws.front ? '(from bylaws)' : '(manual)'}`,
        rear: `${toDisplay(config.rearSetback)} ${getUnitLabel()} ${setbacksFromBylaws.rear ? '(from bylaws)' : '(manual)'}`,
        side: `${toDisplay(config.sideSetback)} ${getUnitLabel()} ${setbacksFromBylaws.side ? '(from bylaws)' : '(manual)'}`
      },
      compliance: {
        isValid: bylawValidation.isValid,
        violations: bylawValidation.violations.length,
        warnings: bylawValidation.warnings.length,
        details: [...bylawValidation.violations, ...bylawValidation.warnings]
      },
      calculations: {
        lotCoverage: `${metrics.coverage.toFixed(1)}%`,
        separationDistance: `${toDisplay(config.separationFromMain)} ${getUnitLabel()}`
      }
    }
    return report
  }

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

  // Placeholder for missing variables/functions
  const issues: string[] = []
  const violations = bylawValidation.violations || []
  const handleCanvasClick = () => {}
  const handleMouseDown = () => {}
  const handleMouseMove = () => {}
  const handleMouseUp = () => {}

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
              <CardTitle className="flex items-center justify-between text-base">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Property Configuration
                </div>
                <div className="flex border border-border rounded-md overflow-hidden">
                  <Button
                    variant={config.units === 'imperial' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => updateConfigValue('units', 'imperial')}
                    className="h-6 px-2 text-xs rounded-none border-0"
                  >
                    ft
                  </Button>
                  <Button
                    variant={config.units === 'metric' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => updateConfigValue('units', 'metric')}
                    className="h-6 px-2 text-xs rounded-none border-0"
                  >
                    m
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">

              {/* Municipality Selection */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Municipality</span>
                </div>
                <Select 
                  value={selectedMunicipality?.toString() || 'none'} 
                  onValueChange={(value) => {
                    console.log('Municipality selected:', value)
                    const municipalityId = value !== 'none' ? parseInt(value) : null
                    console.log('Municipality ID:', municipalityId)
                    const selectedMuni = municipalities.find(m => m.id === municipalityId)
                    console.log('Selected municipality data:', selectedMuni)
                    setSelectedMunicipality(municipalityId)
                    if (municipalityId) {
                      console.log('Starting bylaw application process...')
                      // Automatically apply bylaw constraints when municipality is selected
                      setSeparationFromBylaws(true)
                      setIsApplyingBylaws(true)
                      // Wait for municipalities data to be loaded before applying bylaws
                      const waitForMunicipalities = () => {
                        console.log('waitForMunicipalities check - length:', municipalities.length)
                        const targetMuni = municipalities.find(m => m.id === municipalityId)
                        console.log('Target municipality found:', !!targetMuni, targetMuni?.name)
                        
                        if (municipalities.length > 0 && targetMuni) {
                          console.log('About to call applyBylawConstraints...')
                          // Call applyBylawConstraints with explicit municipality data to avoid closure issues
                          applyBylawConstraintsForMunicipality(targetMuni)
                          setTimeout(() => {
                            console.log('Setting isApplyingBylaws to false and validating...')
                            setIsApplyingBylaws(false)
                            validateAgainstBylaws()
                          }, 100)
                        } else {
                          // Municipalities still loading, check again
                          console.log('Still waiting for municipalities to load...')
                          setTimeout(waitForMunicipalities, 100)
                        }
                      }
                      setTimeout(waitForMunicipalities, 100)
                    } else {
                      setSeparationFromBylaws(false)
                      const defaultSeparation = config.aduStories >= 2 ? 24.6 : 16.4
                      updateConfigValue('separationFromMain', defaultSeparation)
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select municipality..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex justify-between items-center w-full">
                        <span className="font-medium">Manual Configuration</span>
                      </div>
                    </SelectItem>
                    {municipalities.map((muni) => (
                      <SelectItem key={muni.id} value={muni.id.toString()}>
                        <div className="flex justify-between items-center w-full">
                          <span className="font-medium">{muni.name}</span>
                          {muni.bylaw_data && (
                            <Badge variant="secondary" className="text-xs ml-2">
                              Bylaws
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Property Dimensions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Property Dimensions</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50/50 border border-dashed border-blue-200 px-2.5 py-1.5 rounded-md">
                    <Info className="h-3.5 w-3.5" />
                    <span>Validate via site visit</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Width</Label>
                      <input
                        type="text"
                        value={config.units === 'imperial' ? toFeetAndInches(config.lotWidth) : `${toDisplay(config.lotWidth)}m`}
                        onChange={(e) => {
                          const val = config.units === 'imperial' 
                            ? fromFeetAndInches(e.target.value)
                            : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                          if (!isNaN(val) && val > 0) {
                            updateConfigValue('lotWidth', Math.min(200, Math.max(30, val)))
                          }
                        }}
                        className="text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out"
                      />
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
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Depth</Label>
                      <input
                        type="text"
                        value={config.units === 'imperial' ? toFeetAndInches(config.lotDepth) : `${toDisplay(config.lotDepth)}m`}
                        onChange={(e) => {
                          const val = config.units === 'imperial' 
                            ? fromFeetAndInches(e.target.value)
                            : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                          if (!isNaN(val) && val > 0) {
                            updateConfigValue('lotDepth', Math.min(200, Math.max(30, val)))
                          }
                        }}
                        className="text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out"
                      />
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

              {/* ADU Configuration */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Home className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">ADU Configuration</span>
                </div>
                
                <Select value={aduModule} onValueChange={(value: 'custom' | '1' | '2' | '3') => {
                  setAduModule(value)
                  setIsModuleRotated(false) // Reset rotation when changing modules
                }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select module">
                      <div className="flex justify-between items-center w-full">
                        <span>
                          {aduModule === 'custom' && 'Custom'}
                          {aduModule === '1' && '1 Module'}
                          {aduModule === '2' && '2 Module'}
                          {aduModule === '3' && '3 Module'}
                        </span>
                        <span className="text-muted-foreground ml-2">
                          {aduModule === '1' && '8.5\' × 20\' (170 sq ft)'}
                          {aduModule === '2' && '20\' × 17\' (340 sq ft)'}
                          {aduModule === '3' && '20\' × 25.5\' (510 sq ft)'}
                        </span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom" className="w-full block">
                      <div className="flex justify-between items-center w-full pr-2">
                        <span>Custom</span>
                        <span className="text-muted-foreground text-xs"></span>
                      </div>
                    </SelectItem>
                    <SelectItem value="1" className="w-full block">
                      <div className="flex justify-between items-center w-full pr-2">
                        <span>1 Module</span>
                        <span className="text-muted-foreground text-xs">8.5' × 20' (170 sq ft)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="2" className="w-full block">
                      <div className="flex justify-between items-center w-full pr-2">
                        <span>2 Module</span>
                        <span className="text-muted-foreground text-xs">20' × 17' (340 sq ft)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="3" className="w-full block">
                      <div className="flex justify-between items-center w-full pr-2">
                        <span>3 Module</span>
                        <span className="text-muted-foreground text-xs">20' × 25.5' (510 sq ft)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                <div className="grid grid-cols-2 gap-2">
                  <Select value={aduType} onValueChange={(value: 'detached' | 'attached') => setAduType(value)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="detached">Detached</SelectItem>
                      <SelectItem value="attached">Attached</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={aduStories.toString()} onValueChange={(value: string) => setAduStories(parseInt(value) as 1 | 2)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Stories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Story</SelectItem>
                      <SelectItem value="2">2 Story</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {aduModule === 'custom' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
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
                          className="text-xs font-mono w-10 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out"
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
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    
                    <div>
                      <div className="flex items-center gap-1 mb-1">
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
                          className="text-xs font-mono w-10 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out"
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
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Setback Requirements */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Setbacks</span>
                  </div>
                  {selectedMunicipalityData?.bylaw_data && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50/50 border border-dashed border-blue-200 px-2.5 py-1.5 rounded-md">
                      <Info className="h-3.5 w-3.5" />
                      <span>Set by municipal bylaws</span>
                    </div>
                  )}
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Front</Label>
                      <input
                        type="text"
                        value={config.units === 'imperial' ? toFeetAndInches(config.frontSetback) : `${toDisplay(config.frontSetback)}m`}
                        onChange={(e) => {
                          const val = config.units === 'imperial' 
                            ? fromFeetAndInches(e.target.value)
                            : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                          if (!isNaN(val) && val >= 0) {
                            updateConfigValue('frontSetback', Math.min(30, Math.max(0, val)))
                          }
                        }}
                        disabled={selectedMunicipalityData?.bylaw_data?.front_setback_min_ft !== undefined}
                        className={`text-xs font-mono w-10 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out ${
                          selectedMunicipalityData?.bylaw_data?.front_setback_min_ft !== undefined 
                            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                            : ''
                        }`}
                      />
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
                      disabled={selectedMunicipalityData?.bylaw_data?.front_setback_min_ft !== undefined}
                      className={`w-full h-2 bg-muted rounded-lg appearance-none ${
                        selectedMunicipalityData?.bylaw_data?.front_setback_min_ft !== undefined
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer accent-primary'
                      }`}
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Rear</Label>
                      <input
                        type="text"
                        value={config.units === 'imperial' ? toFeetAndInches(config.rearSetback) : `${toDisplay(config.rearSetback)}m`}
                        onChange={(e) => {
                          const val = config.units === 'imperial' 
                            ? fromFeetAndInches(e.target.value)
                            : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                          if (!isNaN(val) && val >= 0) {
                            updateConfigValue('rearSetback', Math.min(30, Math.max(0, val)))
                          }
                        }}
                        disabled={selectedMunicipalityData?.bylaw_data?.rear_setback_standard_ft !== undefined}
                        className={`text-xs font-mono w-10 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out ${
                          selectedMunicipalityData?.bylaw_data?.rear_setback_standard_ft !== undefined 
                            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                            : ''
                        }`}
                      />
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
                      disabled={selectedMunicipalityData?.bylaw_data?.rear_setback_standard_ft !== undefined}
                      className={`w-full h-2 bg-muted rounded-lg appearance-none ${
                        selectedMunicipalityData?.bylaw_data?.rear_setback_standard_ft !== undefined
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer accent-primary'
                      }`}
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Side</Label>
                      <input
                        type="text"
                        value={config.units === 'imperial' ? toFeetAndInches(config.sideSetback) : `${toDisplay(config.sideSetback)}m`}
                        onChange={(e) => {
                          const val = config.units === 'imperial' 
                            ? fromFeetAndInches(e.target.value)
                            : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                          if (!isNaN(val) && val >= 0) {
                            updateConfigValue('sideSetback', Math.min(20, Math.max(0, val)))
                          }
                        }}
                        disabled={selectedMunicipalityData?.bylaw_data?.side_setback_interior_ft !== undefined}
                        className={`text-xs font-mono w-10 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out ${
                          selectedMunicipalityData?.bylaw_data?.side_setback_interior_ft !== undefined 
                            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                            : ''
                        }`}
                      />
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
                      disabled={selectedMunicipalityData?.bylaw_data?.side_setback_interior_ft !== undefined}
                      className={`w-full h-2 bg-muted rounded-lg appearance-none ${
                        selectedMunicipalityData?.bylaw_data?.side_setback_interior_ft !== undefined
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer accent-primary'
                      }`}
                    />
                  </div>
                </div>
                
                {/* Separation from Residence */}
                <div className="mt-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Label className="text-xs">Separation from Residence</Label>
                    <input
                      type="text"
                      value={config.units === 'imperial' ? toFeetAndInches(config.separationFromMain) : `${toDisplay(config.separationFromMain)}m`}
                      onChange={(e) => {
                        const val = config.units === 'imperial' 
                          ? fromFeetAndInches(e.target.value)
                          : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                        if (!isNaN(val) && val >= 0) {
                          updateConfigValue('separationFromMain', Math.min(50, Math.max(0, val)))
                        }
                      }}
                      className="text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out"
                    />
                  </div>
                  <input
                    type="range"
                    value={config.units === 'metric' ? parseFloat(toDisplay(config.separationFromMain).toString()) : config.separationFromMain}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      updateConfigValue('separationFromMain', config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                    }}
                    max={config.units === 'metric' ? 15 : 50}
                    min={0}
                    step={config.units === 'metric' ? 0.3 : 1}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
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

                {/* Objects */}
                {obstacles.map((obstacle) => {
                  const icons: Record<string, string> = {
                    tree: '🌳',
                    rock: '🪨',
                    residence: '🏠',
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
                        obstacle.type === 'residence' ? 'bg-orange-500 border-orange-700 rounded-lg text-white' :
                        obstacle.type === 'shed' ? 'bg-purple-500 border-purple-700 rounded-lg text-white' :
                        obstacle.type === 'pool' ? 'bg-blue-500 border-blue-700 rounded-xl text-white' :
                        obstacle.type === 'fence' ? 'bg-red-500 border-red-700 rounded-lg text-white' :
                        'bg-yellow-500 border-yellow-700 rounded-lg text-white'
                      } ${isSelected ? 'outline outline-3 outline-blue-500 outline-offset-2' : 'hover:scale-105'}`}
                      style={{
                        left: (dragPositions.obstacles?.[obstacle.id]?.x ?? obstacle.x) * scale + 'px',
                        top: (dragPositions.obstacles?.[obstacle.id]?.y ?? obstacle.y) * scale + 'px',
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

                {/* Separation boundaries for residences */}
                {obstacles.filter(o => o.type === 'residence').map((residence) => (
                  <div
                    key={`boundary-${residence.id}`}
                    className="absolute border border-orange-400 border-dashed pointer-events-none z-5"
                    style={{
                      left: (residence.x - config.separationFromMain) * scale + 'px',
                      top: (residence.y - config.separationFromMain) * scale + 'px',
                      width: (residence.width + 2 * config.separationFromMain) * scale + 'px',
                      height: (residence.depth + 2 * config.separationFromMain) * scale + 'px'
                    }}
                  />
                ))}

                {/* ADU Unit */}
                <div
                  className={`absolute border-2 text-white font-semibold flex items-center justify-center select-none shadow-lg rounded-lg z-20 ${isDragging && selectedElement?.type === 'adu' ? 'cursor-grabbing' : 'cursor-grab'} ${isDragging && selectedElement?.type === 'adu' ? '' : 'transition-all'} ${
                    !overallValid ? 'bg-red-500 border-red-700' : 'bg-blue-600 border-blue-800'
                  } ${selectedElement?.type === 'adu' ? 'outline outline-3 outline-blue-500 outline-offset-2' : 'hover:scale-105'} ${
                    config.aduWidth < 12 ? 'text-xs' : config.aduWidth < 18 ? 'text-sm' : 'text-base'
                  }`}
                  style={{
                    width: config.aduWidth * scale + 'px',
                    height: config.aduDepth * scale + 'px',
                    left: (dragPositions.adu?.x ?? aduPosition.x) * scale + 'px',
                    top: (dragPositions.adu?.y ?? aduPosition.y) * scale + 'px',
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

              {/* Validation Status */}
              <div className="absolute bottom-3 left-3 z-50">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border mb-2 ${overallValid ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'}`}>
                  {overallValid ? (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <span className={`text-sm font-medium ${overallValid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                    {overallValid ? 'Valid Configuration' : 'Issues Found'}
                  </span>
                </div>
                
                {/* Issues list */}
                {(!isValidPlacement || bylawValidation.violations.length > 0 || bylawValidation.warnings.length > 0) && (
                  <div className="space-y-1">
                    {/* Placement validation */}
                    {!isValidPlacement && (
                      <div className="text-xs text-red-600 dark:text-red-400">
                        • ADU placement violates setbacks
                      </div>
                    )}
                    
                    {/* Bylaw violations */}
                    {bylawValidation.violations.map((violation, index) => (
                      <div key={index} className="text-xs text-red-600 dark:text-red-400">
                        • {violation.message}
                      </div>
                    ))}
                    
                    {/* Warnings */}
                    {bylawValidation.warnings.map((warning, index) => (
                      <div key={index} className="text-xs text-yellow-600 dark:text-yellow-400">
                        ⚠ {warning.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating Objects Panel */}
              <div className="absolute top-1 right-3 bg-background border border-border rounded-lg shadow-lg p-3 w-36 z-50">
                <div className="text-xs font-semibold text-foreground mb-2">
                  Add Objects
                </div>
                <div className="space-y-1">
                  {[
                    { type: 'residence', icon: '🏠', label: 'Residence' },
                    { type: 'tree', icon: '🌳', label: 'Tree' },
                    { type: 'rock', icon: '🪨', label: 'Rock' },
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
              <div className="absolute top-3 left-3 bg-background border border-border rounded-lg shadow-lg p-3 w-52 z-50">
                <div className="text-xs font-semibold text-foreground mb-3">
                  {selectedElement?.type === 'adu' ? 'ADU Properties' : 'Object Properties'}
                </div>
                
                {selectedElement ? (
                  (() => {
                    // Get the current element data
                    const isADU = selectedElement.type === 'adu'
                    const obstacle = isADU ? null : obstacles.find(o => o.id === selectedElement.id)
                    
                    const currentWidth = isADU ? config.aduWidth : obstacle?.width || 0
                    const currentDepth = isADU ? config.aduDepth : obstacle?.depth || 0
                    const currentX = isADU ? aduPosition.x : obstacle?.x || 0
                    const currentY = isADU ? aduPosition.y : obstacle?.y || 0
                    
                    const updateWidth = (val: number) => {
                      if (isADU) {
                        updateConfigValue('aduWidth', Math.min(40, Math.max(10, val)))
                      } else if (obstacle) {
                        setObstacles(prev => prev.map(obs => 
                          obs.id === obstacle.id ? { ...obs, width: Math.min(50, Math.max(5, val)) } : obs
                        ))
                      }
                    }
                    
                    const updateDepth = (val: number) => {
                      if (isADU) {
                        updateConfigValue('aduDepth', Math.min(40, Math.max(10, val)))
                      } else if (obstacle) {
                        setObstacles(prev => prev.map(obs => 
                          obs.id === obstacle.id ? { ...obs, depth: Math.min(50, Math.max(5, val)) } : obs
                        ))
                      }
                    }
                    
                    const updateX = (val: number) => {
                      if (isADU) {
                        setAduPosition(prev => ({ ...prev, x: Math.min(config.lotWidth - config.aduWidth, Math.max(0, val)) }))
                      } else if (obstacle) {
                        setObstacles(prev => prev.map(obs => 
                          obs.id === obstacle.id ? { ...obs, x: Math.min(config.lotWidth - obs.width, Math.max(0, val)) } : obs
                        ))
                      }
                    }
                    
                    const updateY = (val: number) => {
                      if (isADU) {
                        setAduPosition(prev => ({ ...prev, y: Math.min(config.lotDepth - config.aduDepth, Math.max(0, val)) }))
                      } else if (obstacle) {
                        setObstacles(prev => prev.map(obs => 
                          obs.id === obstacle.id ? { ...obs, y: Math.min(config.lotDepth - obs.depth, Math.max(0, val)) } : obs
                        ))
                      }
                    }
                    
                    if (!isADU && !obstacle) return null
                    
                    return (
                      <>
                        {/* Size Controls */}
                        <div className="space-y-2 mb-3">
                          {/* Module preset notice for ADUs */}
                          {isADU && aduModule !== 'custom' && (
                            <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50/50 border border-dashed border-blue-200 px-2.5 py-1.5 rounded-md mb-2">
                              <Info className="h-3.5 w-3.5" />
                              <span>Set by module preset</span>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 mb-1">
                                <Label className="text-xs">Width</Label>
                                <input
                                  type="text"
                                  value={config.units === 'imperial' ? toFeetAndInches(currentWidth) : `${toDisplay(currentWidth)}m`}
                                  onChange={(e) => {
                                    const val = config.units === 'imperial' 
                                      ? fromFeetAndInches(e.target.value)
                                      : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                    if (!isNaN(val) && val > 0) {
                                      updateWidth(val)
                                    }
                                  }}
                                  disabled={isADU && aduModule !== 'custom'}
                                  className={`text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out ${
                                    isADU && aduModule !== 'custom'
                                      ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                                      : ''
                                  }`}
                                />
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(currentWidth).toString()) : currentWidth}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  updateWidth(config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                                }}
                                max={config.units === 'metric' ? (isADU ? 12 : 15) : (isADU ? 40 : 50)}
                                min={config.units === 'metric' ? (isADU ? 3 : 1.5) : (isADU ? 10 : 5)}
                                step={config.units === 'metric' ? 0.3 : 1}
                                disabled={isADU && aduModule !== 'custom'}
                                className={`w-full h-1 bg-muted rounded-lg appearance-none ${
                                  isADU && aduModule !== 'custom'
                                    ? 'cursor-not-allowed opacity-50'
                                    : 'cursor-pointer accent-primary'
                                }`}
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 mb-1">
                                <Label className="text-xs">Depth</Label>
                                <input
                                  type="text"
                                  value={config.units === 'imperial' ? toFeetAndInches(currentDepth) : `${toDisplay(currentDepth)}m`}
                                  onChange={(e) => {
                                    const val = config.units === 'imperial' 
                                      ? fromFeetAndInches(e.target.value)
                                      : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                    if (!isNaN(val) && val > 0) {
                                      updateDepth(val)
                                    }
                                  }}
                                  disabled={isADU && aduModule !== 'custom'}
                                  className={`text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out ${
                                    isADU && aduModule !== 'custom'
                                      ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                                      : ''
                                  }`}
                                />
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(currentDepth).toString()) : currentDepth}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  updateDepth(config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val)
                                }}
                                max={config.units === 'metric' ? (isADU ? 12 : 15) : (isADU ? 40 : 50)}
                                min={config.units === 'metric' ? (isADU ? 3 : 1.5) : (isADU ? 10 : 5)}
                                step={config.units === 'metric' ? 0.3 : 1}
                                disabled={isADU && aduModule !== 'custom'}
                                className={`w-full h-1 bg-muted rounded-lg appearance-none ${
                                  isADU && aduModule !== 'custom'
                                    ? 'cursor-not-allowed opacity-50'
                                    : 'cursor-pointer accent-primary'
                                }`}
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Position Controls */}
                        <div className="space-y-2 mb-3 border-t border-border pt-2">
                          <div className="text-xs font-semibold mb-1">Position</div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 mb-1">
                                <Label className="text-xs">X</Label>
                                <input
                                  type="text"
                                  value={config.units === 'imperial' ? toFeetAndInches(currentX) : `${toDisplay(currentX)}m`}
                                  onChange={(e) => {
                                    const val = config.units === 'imperial' 
                                      ? fromFeetAndInches(e.target.value)
                                      : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                    if (!isNaN(val) && val >= 0) {
                                      updateX(val)
                                    }
                                  }}
                                  className="text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto"
                                />
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(currentX).toString()) : currentX}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  updateX(config.units === 'metric' ? val / FEET_TO_METERS : val)
                                }}
                                max={config.units === 'metric' ? parseFloat(toDisplay(config.lotWidth - currentWidth).toString()) : config.lotWidth - currentWidth}
                                min={0}
                                step={config.units === 'metric' ? 0.3 : 1}
                                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                            
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 mb-1">
                                <Label className="text-xs">Y</Label>
                                <input
                                  type="text"
                                  value={config.units === 'imperial' ? toFeetAndInches(currentY) : `${toDisplay(currentY)}m`}
                                  onChange={(e) => {
                                    const val = config.units === 'imperial' 
                                      ? fromFeetAndInches(e.target.value)
                                      : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                                    if (!isNaN(val) && val >= 0) {
                                      updateY(val)
                                    }
                                  }}
                                  className="text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto"
                                />
                              </div>
                              <input
                                type="range"
                                value={config.units === 'metric' ? parseFloat(toDisplay(currentY).toString()) : currentY}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value)
                                  updateY(config.units === 'metric' ? val / FEET_TO_METERS : val)
                                }}
                                max={config.units === 'metric' ? parseFloat(toDisplay(config.lotDepth - currentDepth).toString()) : config.lotDepth - currentDepth}
                                min={0}
                                step={config.units === 'metric' ? 0.3 : 1}
                                className="w-full h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Rotate Button */}
                        <div className="border-t border-border pt-2 mb-3">
                          <Button
                            onClick={() => {
                              if (isADU && aduModule !== 'custom') {
                                // For preset modules, toggle rotation state
                                setIsModuleRotated(!isModuleRotated)
                              } else {
                                // For custom or obstacles, just swap dimensions
                                const newWidth = currentDepth
                                const newDepth = currentWidth
                                updateWidth(newWidth)
                                updateDepth(newDepth)
                              }
                            }}
                            size="sm"
                            variant="outline"
                            className="w-full h-7 text-xs"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Rotate
                          </Button>
                        </div>
                        
                        {/* Info Display */}
                        <div className="space-y-1 text-xs border-t border-border pt-2">
                          <div className="flex justify-between">
                            <span>Area:</span>
                            <span className="font-mono">{toDisplay(currentWidth * currentDepth, true)} {getUnitLabel(true)}</span>
                          </div>
                        </div>
                        
                        {/* Info Display */}
                        <div className="border-t border-border pt-2 mt-2">
                          <div className="text-xs text-muted-foreground">
                            Drag to move • Drag corner to resize
                          </div>
                        </div>
                      </>
                    )
                  })()
                ) : (
                  <div className="text-center py-4">
                    <div className="text-xs text-muted-foreground">
                      Click on an ADU or object to view its properties
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}