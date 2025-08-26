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
  AlertCircle,
  Circle,
  Dot,
  Eye,
  FileText
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

// Municipality badge helper function
function getMunicipalityBadgeConfig(bylawData: any) {
  if (!bylawData) {
    return {
      text: 'No Data',
      className: 'text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded'
    }
  }

  // Calculate completeness score
  const requiredFields = [
    'permit_type', 'adu_types_allowed', 'front_setback_min_ft',
    'rear_setback_standard_ft', 'side_setback_interior_ft',
    'detached_adu_max_size_sqft', 'adu_parking_spaces_required'
  ]
  const presentFields = requiredFields.filter(field => bylawData[field] !== null && bylawData[field] !== undefined)
  const completeness = presentFields.length / requiredFields.length

  // Determine content status
  let contentStatus = ''
  let contentClass = ''
  if (completeness >= 0.8) {
    contentStatus = 'Complete'
    contentClass = 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400'
  } else if (completeness >= 0.5) {
    contentStatus = 'Partial'
    contentClass = 'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400'
  } else {
    contentStatus = 'Incomplete'
    contentClass = 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
  }

  // Determine review status
  let reviewStatus = ''
  if (bylawData.reviewed_by && bylawData.review_date) {
    reviewStatus = 'Verified'
  } else {
    reviewStatus = 'Draft'
  }

  // Review status icon (simplified)
  const ReviewIcon = reviewStatus === 'Verified' ? FileText : Eye
  const reviewIconClass = reviewStatus === 'Verified' 
    ? 'h-3 w-3 text-blue-500' 
    : 'h-3 w-3 text-orange-500'

  return {
    contentBadge: {
      text: contentStatus,
      className: `text-xs border px-1.5 py-0.5 rounded ${contentClass}`
    },
    reviewIcon: { Icon: ReviewIcon, className: reviewIconClass, status: reviewStatus }
  }
}

// Report Modal Component
interface ReportModalProps {
  config: Config;
  obstacles: Obstacle[];
  bylawValidation: BylawValidationResult;
  selectedMunicipalityData: MunicipalityWithBylawData | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  visualizationContainerRef: React.RefObject<HTMLDivElement | null>;
  aduPosition: { x: number; y: number };
  scale: number;
  containerDimensions: { width: number; height: number };
  isCornerLot: boolean;
  hasAlleyAccess: boolean;
  onClose: () => void;
}

function ReportModal({ config, obstacles, bylawValidation, selectedMunicipalityData, canvasRef, visualizationContainerRef, aduPosition, scale, containerDimensions, isCornerLot, hasAlleyAccess, onClose }: ReportModalProps) {
  const generateDetailedReport = () => {
    const municipality = selectedMunicipalityData?.name || 'Unknown Municipality'
    
    const timestamp = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })

    // Calculate metrics
    const lotArea = config.lotWidth * config.lotDepth
    const mainBuildingArea = config.mainBuildingWidth * config.mainBuildingDepth
    const aduArea = config.aduWidth * config.aduDepth
    const totalBuildingFootprint = mainBuildingArea + aduArea
    const lotCoveragePercent = (totalBuildingFootprint / lotArea * 100).toFixed(1)
    const remainingYardSpace = lotArea - totalBuildingFootprint

    return {
      municipality,
      property: {
        lotSize: `${config.lotWidth}' × ${config.lotDepth}'`,
        lotArea: `${lotArea.toLocaleString()} sq ft`,
        buildableArea: `${(lotArea * 0.75).toLocaleString()} sq ft`, // Approximate
        frontage: `${config.lotWidth}'`,
        depth: `${config.lotDepth}'`,
      },
      mainBuilding: {
        size: `${config.mainBuildingWidth}' × ${config.mainBuildingDepth}'`,
        area: `${mainBuildingArea.toLocaleString()} sq ft`,
        position: (() => {
          const mainBuilding = obstacles.find(o => o.type === 'residence')
          return mainBuilding ? `${mainBuilding.y}' from front, ${mainBuilding.x}' from west side` : 'Position not set'
        })(),
      },
      adu: {
        type: config.aduType || 'detached',
        size: `${config.aduWidth}' × ${config.aduDepth}'`,
        area: `${aduArea.toLocaleString()} sq ft`,
        stories: config.aduStories || 1,
        position: `${aduPosition.y}' from front, ${aduPosition.x}' from west side`,
        distanceFromMain: '15 ft', // Approximate
      },
      setbacks: {
        front: `${selectedMunicipalityData?.bylaw_data?.front_setback_min_ft || 20}'`,
        rear: `${selectedMunicipalityData?.bylaw_data?.rear_setback_standard_ft || 25}'`,
        side: `${selectedMunicipalityData?.bylaw_data?.side_setback_interior_ft || 4}'`,
      },
      compliance: {
        isValid: bylawValidation.isValid,
        violations: bylawValidation.violations.length,
        warnings: bylawValidation.warnings.length,
        details: [...bylawValidation.violations, ...bylawValidation.warnings].map(item => ({
          type: item.type,
          message: item.message,
          requirement: 'details' in item ? item.details : ('requirement' in item ? item.requirement : 'No details available')
        }))
      },
      calculations: {
        lotCoverage: `${lotCoveragePercent}% (${totalBuildingFootprint.toLocaleString()} sq ft / ${lotArea.toLocaleString()} sq ft)`,
        separationDistance: '15 ft',
        totalBuildingFootprint: `${totalBuildingFootprint.toLocaleString()} sq ft`,
        remainingYardSpace: `${remainingYardSpace.toLocaleString()} sq ft`,
      },
      siteFeatures: obstacles.map(obstacle => ({
        type: obstacle.type,
        name: `${obstacle.type} feature`,
        position: `${obstacle.x}', ${obstacle.y}' from front`,
        size: `${obstacle.width}' × ${obstacle.depth}'`
      }))
    }
  }

  const report = generateDetailedReport()
  const statusColor = report.compliance.isValid ? 'bg-green-600' : 'bg-red-600'
  const statusText = report.compliance.isValid ? 'COMPLIANT - Configuration meets bylaw requirements' : 'NON-COMPLIANT - Issues require resolution'

  const handlePrint = () => {
    const reportContent = document.getElementById('modal-report-content')
    if (!reportContent) return

    // Create hidden iframe for seamless printing
    const iframe = document.createElement('iframe')
    iframe.style.position = 'absolute'
    iframe.style.top = '-10000px'
    iframe.style.left = '-10000px'
    iframe.style.width = '1px'
    iframe.style.height = '1px'
    document.body.appendChild(iframe)

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
    if (!iframeDoc) return

    // Get current page styles
    const stylesheets = Array.from(document.styleSheets)
    let allStyles = ''
    
    try {
      stylesheets.forEach(sheet => {
        try {
          if (sheet.cssRules) {
            Array.from(sheet.cssRules).forEach(rule => {
              allStyles += rule.cssText + '\n'
            })
          }
        } catch (e) {
          // Skip cross-origin stylesheets
        }
      })
    } catch (e) {
      console.log('Could not access some stylesheets')
    }

    // Write content to iframe
    iframeDoc.open()
    iframeDoc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ADU Configuration Report - ${report.municipality}</title>
          <meta charset="utf-8">
          <style>
            ${allStyles}
            
            body {
              margin: 0;
              padding: 20px;
              background: white;
              font-family: ui-sans-serif, system-ui, sans-serif;
            }
            
            .print-content {
              max-width: 800px;
              margin: 0 auto;
              background: white;
            }
            
            @media print {
              body { margin: 0; padding: 15px; }
              .print-content { max-width: none; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="print-content">
            ${reportContent.outerHTML}
          </div>
        </body>
      </html>
    `)
    iframeDoc.close()

    // Wait for content to load, then print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
        
        // Clean up iframe after a delay
        setTimeout(() => {
          document.body.removeChild(iframe)
        }, 1000)
      } catch (error) {
        console.error('Print failed:', error)
        // Fallback to window print if iframe fails
        window.print()
        document.body.removeChild(iframe)
      }
    }, 500)
  }


  // Helper functions for visualization (same as main component)
  const calculateBuildableArea = () => {
    return {
      left: config.sideSetback,
      right: config.lotWidth - config.sideSetback,
      top: config.frontSetback,
      bottom: config.lotDepth - config.rearSetback,
      width: config.lotWidth - (config.sideSetback * 2),
      height: config.lotDepth - config.frontSetback - config.rearSetback
    }
  }

  const toDisplay = (value: number, isArea: boolean = false) => {
    return (value * 3.28084).toFixed(1) // Convert to feet
  }

  const getUnitLabel = (isArea: boolean = false) => {
    return isArea ? 'sq ft' : 'ft'
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">ADU Configuration Report</h3>
            <div className="flex items-center space-x-2">
              <Button onClick={handlePrint} variant="outline" size="sm">
                Download PDF
              </Button>
              <Button onClick={onClose} variant="ghost" size="sm">
                ×
              </Button>
            </div>
          </div>

          {/* Document Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div id="modal-report-content" className="space-y-6">
          {/* Title Section */}
          <div className="text-center border-b border-gray-200 pb-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              ACCESSORY DWELLING UNIT<br/>
              LOT CONFIGURATION REPORT
            </h1>
            <div className="text-lg text-gray-600 space-y-1">
              <p>Municipality: {report.municipality}</p>
              <p>Generated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
          </div>

          {/* Executive Summary */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">EXECUTIVE SUMMARY</h2>
            
            <div className={`${statusColor} text-white p-3 rounded mb-3`}>
              <p className="font-bold text-sm">{statusText}</p>
            </div>

            <div className="space-y-1 text-gray-700 text-sm">
              <p>• ADU Type: {report.adu.type.toUpperCase()}</p>
              <p>• Floor Area: {report.adu.area}</p>  
              <p>• Lot Coverage: {report.calculations.lotCoverage}</p>
              <p>• Compliance Issues: {report.compliance.violations + report.compliance.warnings} total</p>
            </div>
          </section>

          {/* Site Layout Visualization */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">SITE LAYOUT VISUALIZATION</h2>
            <div className="border border-gray-300 bg-gray-50 p-3 rounded">
              <div className="flex justify-center">
                {(() => {
                  // Calculate scale to fit lot in modal container
                  const maxWidth = 500
                  const maxHeight = 350
                  const modalScale = Math.min(maxWidth / config.lotWidth, maxHeight / config.lotDepth) * 0.85 // 0.85 for padding
                  
                  return (
                    <div
                      className="relative bg-background border-2 border-border rounded-lg shadow-lg overflow-hidden"
                      style={{
                        width: config.lotWidth * modalScale + 'px',
                        height: config.lotDepth * modalScale + 'px',
                        maxWidth: '100%',
                        maxHeight: '350px',
                        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, hsl(var(--border)) 19px, hsl(var(--border)) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, hsl(var(--border)) 19px, hsl(var(--border)) 20px)',
                        backgroundSize: `${Math.max(3, Math.min(15, 5 * modalScale))}px ${Math.max(3, Math.min(15, 5 * modalScale))}px`
                      }}
                    >
                      {/* Buildable Area */}
                      <div
                        className="absolute bg-green-50/80 border-2 border-dashed border-green-400 rounded dark:bg-green-950/30 dark:border-green-600"
                        style={{
                          left: config.sideSetback * modalScale + 'px',
                          top: config.frontSetback * modalScale + 'px',
                          width: Math.max(0, (config.lotWidth - 2 * config.sideSetback) * modalScale) + 'px',
                          height: Math.max(0, (config.lotDepth - config.frontSetback - config.rearSetback) * modalScale) + 'px'
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

                        return (
                          <div
                            key={obstacle.id}
                            className={`absolute border-2 text-xs font-semibold flex items-center justify-center select-none z-10 ${
                              obstacle.type === 'tree' ? 'bg-green-500 border-green-700 rounded-full text-white' :
                              obstacle.type === 'rock' ? 'bg-gray-500 border-gray-700 rounded-lg text-white' :
                              obstacle.type === 'residence' ? 'bg-orange-500 border-orange-700 rounded-lg text-white' :
                              obstacle.type === 'shed' ? 'bg-purple-500 border-purple-700 rounded-lg text-white' :
                              obstacle.type === 'pool' ? 'bg-blue-500 border-blue-700 rounded-xl text-white' :
                              obstacle.type === 'fence' ? 'bg-red-500 border-red-700 rounded-lg text-white' :
                              'bg-yellow-500 border-yellow-700 rounded-lg text-white'
                            }`}
                            style={{
                              left: obstacle.x * modalScale + 'px',
                              top: obstacle.y * modalScale + 'px',
                              width: obstacle.width * modalScale + 'px',
                              height: obstacle.depth * modalScale + 'px'
                            }}
                          >
                            {icons[obstacle.type] || icons.other}
                          </div>
                        )
                      })}

                      {/* Separation boundaries for residences */}
                      {obstacles.filter(o => o.type === 'residence').map((residence) => (
                        <div
                          key={`boundary-${residence.id}`}
                          className="absolute border border-orange-400 border-dashed pointer-events-none z-5"
                          style={{
                            left: (residence.x - config.separationFromMain) * modalScale + 'px',
                            top: (residence.y - config.separationFromMain) * modalScale + 'px',
                            width: (residence.width + 2 * config.separationFromMain) * modalScale + 'px',
                            height: (residence.depth + 2 * config.separationFromMain) * modalScale + 'px'
                          }}
                        />
                      ))}

                      {/* ADU Unit */}
                      <div
                        className={`absolute border-2 text-white font-semibold flex items-center justify-center select-none shadow-lg rounded-lg z-20 text-xs ${
                          bylawValidation.violations.length > 0 ? 'bg-red-500 border-red-700' : 'bg-blue-600 border-blue-800'
                        }`}
                        style={{
                          width: config.aduWidth * modalScale + 'px',
                          height: config.aduDepth * modalScale + 'px',
                          left: aduPosition.x * modalScale + 'px',
                          top: aduPosition.y * modalScale + 'px'
                        }}
                      >
                        ADU
                      </div>
                    </div>
                  )
                })()}
              </div>
              <p className="text-center text-xs text-gray-600 mt-2">
                Current lot configuration showing ADU placement, setbacks, and site features
              </p>
            </div>
          </section>

          {/* Property Information */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">PROPERTY INFORMATION</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-bold">Lot Dimensions:</span> {report.property.lotSize}</div>
              <div><span className="font-bold">Total Lot Area:</span> {report.property.lotArea}</div>
              <div><span className="font-bold">Buildable Area:</span> {report.property.buildableArea}</div>
              <div><span className="font-bold">Frontage:</span> {report.property.frontage}</div>
              <div><span className="font-bold">Depth:</span> {report.property.depth}</div>
              <div><span className="font-bold">Corner Lot:</span> {isCornerLot ? 'Yes' : 'No'}</div>
              <div><span className="font-bold">Alley Access:</span> {hasAlleyAccess ? 'Yes' : 'No'}</div>
              <div><span className="font-bold">Zoning:</span> Not specified</div>
            </div>
          </section>

          {/* Main Building */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">MAIN BUILDING</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-bold">Dimensions:</span> {config.mainBuildingWidth}' × {config.mainBuildingDepth}'</div>
              <div><span className="font-bold">Floor Area:</span> {(config.mainBuildingWidth * config.mainBuildingDepth).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Position:</span> {(() => {
                const mainBuilding = obstacles.find(o => o.type === 'residence')
                return mainBuilding ? `${mainBuilding.y}' from front, ${mainBuilding.x}' from west side` : 'Position not set'
              })()}</div>
              <div><span className="font-bold">Stories:</span> 2</div>
            </div>
          </section>

          {/* ADU Configuration */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">ADU CONFIGURATION</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-bold">Type:</span> {config.aduType?.charAt(0).toUpperCase()}{config.aduType?.slice(1)} ADU</div>
              <div><span className="font-bold">Dimensions:</span> {config.aduWidth}' × {config.aduDepth}'</div>
              <div><span className="font-bold">Floor Area:</span> {(config.aduWidth * config.aduDepth).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Stories:</span> {config.aduStories || 1}</div>
              <div><span className="font-bold">Position on Lot:</span> {aduPosition.y}' from front, {aduPosition.x}' from west side</div>
              <div><span className="font-bold">Distance from Main:</span> {(() => {
                const mainBuilding = obstacles.find(o => o.type === 'residence')
                if (!mainBuilding) return 'Main building position not set'
                const distance = Math.sqrt(Math.pow(aduPosition.x - mainBuilding.x, 2) + Math.pow(aduPosition.y - mainBuilding.y, 2))
                return `${distance.toFixed(1)}' (calculated)`
              })()}</div>
            </div>
          </section>

          {/* Municipal Bylaw Requirements */}
          {selectedMunicipalityData?.bylaw_data && (
            <section>
              <h2 className="text-lg font-bold text-black mb-3">MUNICIPAL BYLAW REQUIREMENTS</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="font-bold">Minimum Lot Width:</span> {selectedMunicipalityData.bylaw_data.min_lot_width_ft ? `${selectedMunicipalityData.bylaw_data.min_lot_width_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Front Setback (min):</span> {selectedMunicipalityData.bylaw_data.front_setback_min_ft ? `${selectedMunicipalityData.bylaw_data.front_setback_min_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Rear Setback (standard):</span> {selectedMunicipalityData.bylaw_data.rear_setback_standard_ft ? `${selectedMunicipalityData.bylaw_data.rear_setback_standard_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Rear Setback (w/ alley):</span> {selectedMunicipalityData.bylaw_data.rear_setback_with_alley_ft ? `${selectedMunicipalityData.bylaw_data.rear_setback_with_alley_ft}'` : 'Same as standard'}</div>
                <div><span className="font-bold">Side Setback (interior):</span> {selectedMunicipalityData.bylaw_data.side_setback_interior_ft ? `${selectedMunicipalityData.bylaw_data.side_setback_interior_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Side Setback (corner st.):</span> {selectedMunicipalityData.bylaw_data.side_setback_corner_street_ft ? `${selectedMunicipalityData.bylaw_data.side_setback_corner_street_ft}'` : 'Same as interior'}</div>
                <div><span className="font-bold">Max ADU Size:</span> {selectedMunicipalityData.bylaw_data.detached_adu_max_size_sqft ? `${selectedMunicipalityData.bylaw_data.detached_adu_max_size_sqft} sq ft` : 'Not specified'}</div>
                <div><span className="font-bold">Max Lot Coverage:</span> {selectedMunicipalityData.bylaw_data.max_lot_coverage_percent ? `${selectedMunicipalityData.bylaw_data.max_lot_coverage_percent}%` : 'Not specified'}</div>
                <div className="col-span-2"><span className="font-bold">Permitted ADU Types:</span> {
                  selectedMunicipalityData.bylaw_data.adu_types_allowed 
                    ? Object.entries(selectedMunicipalityData.bylaw_data.adu_types_allowed)
                        .filter(([_, allowed]) => allowed)
                        .map(([type, _]) => type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
                        .join(', ') || 'None specified'
                    : 'Not specified'
                }</div>
              </div>
            </section>
          )}

          {/* Setback Analysis */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">SETBACK ANALYSIS</h2>
            <div className="space-y-2 text-sm">
              <div><span className="font-bold">Current Front Setback:</span> {config.frontSetback}' (Required: {selectedMunicipalityData?.bylaw_data?.front_setback_min_ft || config.frontSetback}')</div>
              <div><span className="font-bold">Current Rear Setback:</span> {config.rearSetback}' (Required: {selectedMunicipalityData?.bylaw_data?.rear_setback_standard_ft || config.rearSetback}')</div>
              <div><span className="font-bold">Current Side Setback:</span> {config.sideSetback}' (Required: {selectedMunicipalityData?.bylaw_data?.side_setback_interior_ft || config.sideSetback}')</div>
              
              <div className="mt-4">
                <p className="font-bold">ADU Setback Compliance:</p>
                <div className="ml-4 space-y-1">
                  <div>• Front: {aduPosition.y}' (Required: {config.frontSetback}')</div>
                  <div>• Rear: {config.lotDepth - aduPosition.y - config.aduDepth}' (Required: {config.rearSetback}')</div>
                  <div>• West Side: {aduPosition.x}' (Required: {config.sideSetback}')</div>
                  <div>• East Side: {config.lotWidth - aduPosition.x - config.aduWidth}' (Required: {config.sideSetback}')</div>
                </div>
              </div>
            </div>
          </section>

          {/* Site Features */}
          {obstacles.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-black mb-3">SITE FEATURES</h2>
              <div className="space-y-3 text-sm">
                {obstacles.map((feature, index) => (
                  <div key={feature.id} className="border-l-4 border-blue-500 pl-4">
                    <div className="font-bold">
                      {index + 1}. {feature.type.charAt(0).toUpperCase() + feature.type.slice(1)}: {`${feature.type} ${index + 1}`}
                    </div>
                    <div className="text-gray-600">Position: {feature.x}', {feature.y}' from southwest corner</div>
                    <div className="text-gray-600">Size: {feature.width}' × {feature.depth}'</div>
                    <div className="text-gray-600">Area: {(feature.width * feature.depth).toLocaleString()} sq ft</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Compliance Analysis */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">COMPLIANCE ANALYSIS</h2>
            
            <div className={`text-lg font-bold mb-4 ${bylawValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
              {bylawValidation.isValid ? '✓ CONFIGURATION COMPLIANT' : '✗ COMPLIANCE ISSUES FOUND'}
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className={`${bylawValidation.violations.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
                Total Violations: {bylawValidation.violations.length}
              </div>
              <div className={`${bylawValidation.warnings.length > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                Warnings: {bylawValidation.warnings.length}
              </div>
            </div>

            {(bylawValidation.violations.length > 0 || bylawValidation.warnings.length > 0) && (
              <div>
                <p className="font-bold mb-2">Specific Issues:</p>
                <div className="space-y-3">
                  {bylawValidation.violations.map((violation, idx) => (
                    <div key={idx} className="ml-4">
                      <div className="text-red-600">
                        • {violation.message}
                      </div>
                      {('details' in violation && violation.details) ? (
                        <div className="text-gray-600 text-sm ml-4">
                          Details: {String(violation.details)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {bylawValidation.warnings.map((warning, idx) => (
                    <div key={idx} className="ml-4">
                      <div className="text-orange-500">
                        ⚠ {warning.message}
                      </div>
                      {('details' in warning && warning.details) ? (
                        <div className="text-gray-600 text-sm ml-4">
                          Details: {String(warning.details)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Technical Calculations */}
          <section>
            <h2 className="text-lg font-bold text-black mb-3">TECHNICAL CALCULATIONS</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="font-bold">Total Lot Area:</span> {(config.lotWidth * config.lotDepth).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Main Building Footprint:</span> {(config.mainBuildingWidth * config.mainBuildingDepth).toLocaleString()} sq ft</div>
              <div><span className="font-bold">ADU Footprint:</span> {(config.aduWidth * config.aduDepth).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Total Building Footprint:</span> {((config.mainBuildingWidth * config.mainBuildingDepth) + (config.aduWidth * config.aduDepth)).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Lot Coverage:</span> {(((config.mainBuildingWidth * config.mainBuildingDepth) + (config.aduWidth * config.aduDepth)) / (config.lotWidth * config.lotDepth) * 100).toFixed(1)}%</div>
              <div><span className="font-bold">Remaining Yard Space:</span> {((config.lotWidth * config.lotDepth) - (config.mainBuildingWidth * config.mainBuildingDepth) - (config.aduWidth * config.aduDepth)).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Buildable Area:</span> {((config.lotWidth - 2 * config.sideSetback) * (config.lotDepth - config.frontSetback - config.rearSetback)).toLocaleString()} sq ft</div>
              <div><span className="font-bold">Buildable Area Used:</span> {(((config.mainBuildingWidth * config.mainBuildingDepth) + (config.aduWidth * config.aduDepth)) / ((config.lotWidth - 2 * config.sideSetback) * (config.lotDepth - config.frontSetback - config.rearSetback)) * 100).toFixed(1)}%</div>
            </div>
          </section>

          {/* Disclaimer */}
          <section className="border-t border-gray-200 pt-6">
            <div className="text-gray-500 text-sm space-y-2">
              <p className="font-bold">IMPORTANT DISCLAIMER</p>
              <p>
                This report is generated for preliminary planning purposes only and does not constitute
                official approval or authorization for construction. All dimensions, setbacks, and compliance
                determinations must be verified with local municipal authorities and building departments
                before proceeding with any construction activities.
              </p>
              <p>
                The configuration shown represents the current state of the lot configurator tool and may
                not reflect all applicable building codes, zoning requirements, or site-specific conditions.
                Professional architectural and engineering consultation is recommended for final design and
                permit applications.
              </p>
            </div>
          </section>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LotConfigurator() {
  const [config, setConfig] = useState<Config>({
    lotWidth: 65, // Default width within range of 15-300 ft
    lotDepth: 120, // Default depth within range of 50-300 ft
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

  // Helper function to calculate default ADU position (centered in buildable area)
  const calculateDefaultAduPosition = (config: Config) => {
    const buildableLeft = config.sideSetback
    const buildableTop = config.frontSetback
    const buildableRight = config.lotWidth - config.sideSetback
    const buildableBottom = config.lotDepth - config.rearSetback
    
    // Center the ADU in the buildable area
    const centerX = buildableLeft + (buildableRight - buildableLeft - config.aduWidth) / 2
    const centerY = buildableTop + (buildableBottom - buildableTop - config.aduDepth) / 2
    
    return { 
      x: Math.max(buildableLeft, centerX),
      y: Math.max(buildableTop, centerY)
    }
  }

  const [obstacles, setObstacles] = useState<Obstacle[]>([])
  const [aduPosition, setAduPosition] = useState(() => {
    const defaultConfig = {
      lotWidth: 65,
      lotDepth: 120,
      frontSetback: 10,
      rearSetback: 5,
      sideSetback: 4,
      aduWidth: 20,
      aduDepth: 24,
      aduStories: 1,
      aduType: 'detached' as const,
      separationFromMain: 10,
      units: 'imperial' as const,
      mainBuildingWidth: 30,
      mainBuildingDepth: 40
    }
    return calculateDefaultAduPosition(defaultConfig)
  })
  const [selectedElement, setSelectedElement] = useState<{type: 'adu' | 'obstacle', id?: string} | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [isResizing, setIsResizing] = useState(false)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 })
  const [dragPositions, setDragPositions] = useState<{adu?: {x: number, y: number}, obstacles?: Record<string, {x: number, y: number}>}>({})
  const lastUpdateRef = useRef(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const visualizationContainerRef = useRef<HTMLDivElement>(null)
  const [containerDimensions, setContainerDimensions] = useState({ width: 600, height: 400 })
  const [showReportModal, setShowReportModal] = useState(false)
  
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

  // Property type characteristics
  const [isCornerLot, setIsCornerLot] = useState(false)
  const [hasAlleyAccess, setHasAlleyAccess] = useState(false)

  // Conversion constants
  const FEET_TO_METERS = 0.3048
  const SQFT_TO_SQM = 0.092903

  // Dynamic container size tracking
  useEffect(() => {
    const updateContainerSize = () => {
      if (visualizationContainerRef.current) {
        const rect = visualizationContainerRef.current.getBoundingClientRect()
        const padding = 32 // Account for padding and margins
        setContainerDimensions({
          width: Math.max(300, rect.width - padding),
          height: Math.max(200, rect.height - padding)
        })
      }
    }

    updateContainerSize()
    
    const resizeObserver = new ResizeObserver(updateContainerSize)
    if (visualizationContainerRef.current) {
      resizeObserver.observe(visualizationContainerRef.current)
    }

    window.addEventListener('resize', updateContainerSize)
    
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateContainerSize)
    }
  }, [])

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
          const ajaxMuni = result.data.find((m: any) => m.id === 13);
          console.log('Ajax municipality data:', ajaxMuni)
          console.log('Ajax bylaw data:', ajaxMuni?.bylaw_data)
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
  const selectedMunicipalityData = municipalities.find((m: any) => m.id === selectedMunicipality)
  
  // Debug the selected municipality data
  useEffect(() => {
    console.log('Selected municipality changed:', {
      selectedMunicipality,
      selectedMunicipalityData: selectedMunicipalityData?.name,
      hasBylawData: !!selectedMunicipalityData?.bylaw_data,
      minLotWidth: selectedMunicipalityData?.bylaw_data?.min_lot_width_ft,
      currentLotWidth: config.lotWidth
    });
  }, [selectedMunicipality, selectedMunicipalityData, config.lotWidth])

  // Apply bylaw constraints when municipality is selected
  const applyBylawConstraints = useCallback(() => {
    // Get fresh municipality data to avoid closure issues
    const currentMunicipalityData = municipalities.find((m: any) => m.id === selectedMunicipality)
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
    
    // Handle rear setback based on alley access
    if (bylawData.rear_setback_standard_ft) {
      const rearSetback = hasAlleyAccess && bylawData.rear_setback_with_alley_ft 
        ? parseFloat(bylawData.rear_setback_with_alley_ft)
        : parseFloat(bylawData.rear_setback_standard_ft)
      configUpdates.rearSetback = rearSetback
      newSetbacksFromBylaws.rear = true
      const setbackType = hasAlleyAccess && bylawData.rear_setback_with_alley_ft ? ' (w/ alley)' : ''
      changes.push(`Rear setback set to: ${rearSetback}'${setbackType}`)
    }
    
    // Handle side setback based on corner lot
    if (bylawData.side_setback_interior_ft) {
      const sideSetback = isCornerLot && bylawData.side_setback_corner_street_ft 
        ? parseFloat(bylawData.side_setback_corner_street_ft)
        : parseFloat(bylawData.side_setback_interior_ft)
      configUpdates.sideSetback = sideSetback
      newSetbacksFromBylaws.side = true
      const setbackType = isCornerLot && bylawData.side_setback_corner_street_ft ? ' (corner)' : ''
      changes.push(`Side setback set to: ${sideSetback}'${setbackType}`)
    }
    
    // Override default separation if bylaw specifies it
    if (bylawData.distance_from_primary_ft) {
      configUpdates.separationFromMain = parseFloat(bylawData.distance_from_primary_ft)
      // Set the flag to indicate separation is from bylaws
      setSeparationFromBylaws(true)
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
    } else {
      // Reset the flag if no bylaw separation is specified
      setSeparationFromBylaws(false)
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
        const currentMunicipality = municipalities.find((m: any) => m.id === selectedMunicipality)
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

  // Handle property type changes
  useEffect(() => {
    // Only reapply if we have a municipality selected and the property type changes
    if (selectedMunicipality && municipalities.length > 0) {
      const currentMunicipality = municipalities.find((m: any) => m.id === selectedMunicipality)
      if (currentMunicipality?.bylaw_data) {
        // Set a flag to indicate we're applying bylaws to prevent infinite loops
        setIsApplyingBylaws(true)
        setTimeout(() => {
          applyBylawConstraintsForMunicipality(currentMunicipality)
          setIsApplyingBylaws(false)
        }, 50)
      }
    }
  }, [isCornerLot, hasAlleyAccess])

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

    // PHASE 1: ADU Type Enforcement
    const aduTypeKey = config.aduType === 'detached' ? 'detached' : 
                       config.aduType === 'attached' ? 'attached' : 'garage_conversion'
    
    if (!bylawData.adu_types_allowed?.[aduTypeKey]) {
      violations.push({
        type: 'zoning',
        message: `${config.aduType.charAt(0).toUpperCase() + config.aduType.slice(1)} ADUs are not permitted`,
        requirement: 'Check permitted ADU types for this municipality',
        current_value: config.aduType,
        required_value: 'permitted ADU type'
      })
    }

    // PHASE 1: Story/Height Limits
    if (bylawData.detached_adu_max_stories && config.aduStories > bylawData.detached_adu_max_stories) {
      violations.push({
        type: 'height',
        message: 'ADU exceeds maximum number of stories',
        requirement: `Maximum ${bylawData.detached_adu_max_stories} ${bylawData.detached_adu_max_stories === 1 ? 'story' : 'stories'}`,
        current_value: config.aduStories,
        required_value: bylawData.detached_adu_max_stories
      })
    }

    if (bylawData.detached_adu_max_height_ft) {
      const estimatedHeight = config.aduStories * 10 // Rough estimate: 10ft per story
      if (estimatedHeight > bylawData.detached_adu_max_height_ft) {
        warnings.push({
          type: 'consideration',
          message: `ADU may exceed height limit (${estimatedHeight}' estimated vs ${bylawData.detached_adu_max_height_ft}' max)`,
          details: 'Verify actual height with architectural plans'
        })
      }
    }

    // PHASE 1: Lot Size Requirements
    const lotArea = config.lotWidth * config.lotDepth
    if (bylawData.min_lot_size_sqft && lotArea < bylawData.min_lot_size_sqft) {
      violations.push({
        type: 'zoning',
        message: 'Lot size is below minimum requirement for ADUs',
        requirement: `Minimum ${bylawData.min_lot_size_sqft.toLocaleString()} sq ft`,
        current_value: lotArea,
        required_value: bylawData.min_lot_size_sqft
      })
    }

    if (bylawData.min_lot_width_ft && config.lotWidth < bylawData.min_lot_width_ft) {
      violations.push({
        type: 'zoning',
        message: 'Lot width is below minimum requirement',
        requirement: `Minimum ${bylawData.min_lot_width_ft} ft wide`,
        current_value: config.lotWidth,
        required_value: bylawData.min_lot_width_ft
      })
    }

    if (bylawData.min_lot_depth_ft && config.lotDepth < bylawData.min_lot_depth_ft) {
      violations.push({
        type: 'zoning',
        message: 'Lot depth is below minimum requirement',
        requirement: `Minimum ${bylawData.min_lot_depth_ft} ft deep`,
        current_value: config.lotDepth,
        required_value: bylawData.min_lot_depth_ft
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

    // PHASE 2: Enhanced Setback Validation for Corner Lots & Alley Access
    // Note: Removed constant warnings - these are now only shown in export reports when selected

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

    // PHASE 2: Impervious Surface Tracking
    if (bylawData.max_impervious_surface_percent) {
      // Simplified calculation: assume all structures and driveways are impervious
      const aduArea = config.aduWidth * config.aduDepth
      const mainBuildingArea = config.mainBuildingWidth * config.mainBuildingDepth
      const estimatedDrivewayArea = 400 // Rough estimate for driveway
      const totalImperviousArea = aduArea + mainBuildingArea + estimatedDrivewayArea
      const lotArea = config.lotWidth * config.lotDepth
      const imperviousPercentage = (totalImperviousArea / lotArea) * 100

      if (imperviousPercentage > bylawData.max_impervious_surface_percent) {
        violations.push({
          type: 'coverage',
          message: 'Impervious surface coverage exceeds maximum allowed',
          requirement: `Maximum ${bylawData.max_impervious_surface_percent}%`,
          current_value: imperviousPercentage,
          required_value: bylawData.max_impervious_surface_percent
        })
      } else if (imperviousPercentage > bylawData.max_impervious_surface_percent * 0.9) {
        warnings.push({
          type: 'consideration',
          message: 'Approaching impervious surface limit',
          details: `Current: ${imperviousPercentage.toFixed(1)}%, Maximum: ${bylawData.max_impervious_surface_percent}%`
        })
      }
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

  // Helper function to calculate buildable area boundaries
  const getBuildableArea = useCallback(() => {
    return {
      left: config.sideSetback,
      top: config.frontSetback,
      right: config.lotWidth - config.sideSetback,
      bottom: config.lotDepth - config.rearSetback
    }
  }, [config.sideSetback, config.frontSetback, config.lotWidth, config.rearSetback, config.lotDepth])

  // Helper function to constrain ADU position within buildable area
  const constrainAduPosition = useCallback((x: number, y: number) => {
    const buildable = getBuildableArea()
    const constrainedX = Math.min(
      buildable.right - config.aduWidth, 
      Math.max(buildable.left, x)
    )
    const constrainedY = Math.min(
      buildable.bottom - config.aduDepth, 
      Math.max(buildable.top, y)
    )
    return { x: constrainedX, y: constrainedY }
  }, [getBuildableArea, config.aduWidth, config.aduDepth])

  const checkAduValidPlacement = useCallback(() => {
    const buildable = getBuildableArea()
    const buildableLeft = buildable.left
    const buildableTop = buildable.top
    const buildableRight = buildable.right
    const buildableBottom = buildable.bottom

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

  // Automatically reposition ADU when constraints would be violated or for better centering
  useEffect(() => {
    const buildable = getBuildableArea()
    
    // Check if current ADU position violates buildable area constraints
    const aduRight = aduPosition.x + config.aduWidth
    const aduBottom = aduPosition.y + config.aduDepth
    
    const violatesConstraints = 
      aduPosition.x < buildable.left || 
      aduPosition.y < buildable.top || 
      aduRight > buildable.right || 
      aduBottom > buildable.bottom
    
    if (violatesConstraints) {
      // When constraints are violated, try to center the ADU first, then constrain if needed
      const centeredPosition = calculateDefaultAduPosition(config)
      const finalPosition = constrainAduPosition(centeredPosition.x, centeredPosition.y)
      
      if (finalPosition.x !== aduPosition.x || finalPosition.y !== aduPosition.y) {
        setAduPosition(finalPosition)
      }
    }
  }, [config.lotWidth, config.lotDepth, config.frontSetback, config.rearSetback, config.sideSetback, config.aduWidth, config.aduDepth, getBuildableArea, constrainAduPosition, aduPosition, calculateDefaultAduPosition, config])

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

  // Calculate dynamic scale factor for visualization based on actual container size
  const calculateScale = useCallback(() => {
    // Use actual container dimensions with padding for labels and UI elements
    const padding = 60 // Padding for labels, controls, and visual breathing room
    const maxWidth = Math.max(200, containerDimensions.width - padding)
    const maxHeight = Math.max(150, containerDimensions.height - padding)
    
    // Ensure minimum lot dimensions to prevent division by zero
    const effectiveWidth = Math.max(15, config.lotWidth)
    const effectiveDepth = Math.max(50, config.lotDepth)
    
    // Calculate scale based on lot dimensions to fit within available space
    const scaleX = maxWidth / effectiveWidth
    const scaleY = maxHeight / effectiveDepth
    
    // Use the smaller scale to ensure both dimensions fit
    const dynamicScale = Math.min(scaleX, scaleY)
    
    // Set reasonable minimum and maximum scale limits
    const minScale = 0.2  // Allow smaller visualization for very large lots
    const maxScale = 12   // Allow larger visualization for very small lots
    
    // Round to 2 decimal places for smoother transitions
    return Math.round(Math.max(minScale, Math.min(maxScale, dynamicScale)) * 100) / 100
  }, [config.lotWidth, config.lotDepth, containerDimensions])
  
  const scale = calculateScale()

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
        buildableArea: `${toDisplay(metrics.buildableAreaSize, true)} ${getUnitLabel(true)}`,
        frontage: `${toDisplay(config.lotWidth)} ${getUnitLabel()}`,
        depth: `${toDisplay(config.lotDepth)} ${getUnitLabel()}`,
        ...(isCornerLot && { cornerLot: 'Yes - Corner lot setbacks applied' }),
        ...(hasAlleyAccess && { alleyAccess: 'Yes - Reduced rear setback applied' })
      },
      mainBuilding: {
        size: `${toDisplay(config.mainBuildingWidth)} × ${toDisplay(config.mainBuildingDepth)} ${getUnitLabel()}`,
        area: `${toDisplay(config.mainBuildingWidth * config.mainBuildingDepth, true)} ${getUnitLabel(true)}`,
        position: `${toDisplay(config.sideSetback)} from side, ${toDisplay(config.frontSetback)} from front`
      },
      adu: {
        type: config.aduType,
        size: `${toDisplay(config.aduWidth)} × ${toDisplay(config.aduDepth)} ${getUnitLabel()}`,
        area: `${toDisplay(metrics.aduArea, true)} ${getUnitLabel(true)}`,
        stories: config.aduStories,
        position: `${toDisplay(aduPosition.x)}, ${toDisplay(aduPosition.y)} ${getUnitLabel()}`,
        distanceFromMain: `${toDisplay(config.separationFromMain)} ${getUnitLabel()}`
      },
      siteFeatures: obstacles.map(obstacle => ({
        type: obstacle.type,
        name: `${obstacle.type.charAt(0).toUpperCase() + obstacle.type.slice(1)}`,
        position: `${toDisplay(obstacle.x)}, ${toDisplay(obstacle.y)} ${getUnitLabel()}`,
        size: obstacle.width && obstacle.depth ? `${toDisplay(obstacle.width)} × ${toDisplay(obstacle.depth)} ${getUnitLabel()}` : 'Point feature'
      })),
      setbacks: {
        front: `${toDisplay(config.frontSetback)} ${getUnitLabel()} ${setbacksFromBylaws.front ? '(from bylaws)' : '(manual)'}`,
        rear: `${toDisplay(config.rearSetback)} ${getUnitLabel()} ${setbacksFromBylaws.rear ? '(from bylaws)' : '(manual)'}${hasAlleyAccess ? ' - alley access applied' : ''}`,
        side: `${toDisplay(config.sideSetback)} ${getUnitLabel()} ${setbacksFromBylaws.side ? '(from bylaws)' : '(manual)'}${isCornerLot ? ' - corner lot applied' : ''}`,
        ...(selectedMunicipalityData?.bylaw_data && (isCornerLot || hasAlleyAccess) && {
          notes: [
            ...(isCornerLot && selectedMunicipalityData.bylaw_data.side_setback_corner_street_ft 
              ? [`Corner lot: Street side ${selectedMunicipalityData.bylaw_data.side_setback_corner_street_ft}', Interior ${selectedMunicipalityData.bylaw_data.side_setback_interior_ft || 'standard'}'`] 
              : []),
            ...(hasAlleyAccess && selectedMunicipalityData.bylaw_data.rear_setback_with_alley_ft 
              ? [`Alley access: ${selectedMunicipalityData.bylaw_data.rear_setback_with_alley_ft}' (vs standard ${selectedMunicipalityData.bylaw_data.rear_setback_standard_ft}')`] 
              : [])
          ]
        })
      },
      compliance: {
        isValid: bylawValidation.isValid,
        violations: bylawValidation.violations.length,
        warnings: bylawValidation.warnings.length,
        details: [...bylawValidation.violations, ...bylawValidation.warnings]
      },
      calculations: {
        lotCoverage: `${metrics.coverage.toFixed(1)}%`,
        separationDistance: `${toDisplay(config.separationFromMain)} ${getUnitLabel()} ${separationFromBylaws ? '(from bylaws)' : '(manual)'}`,
        totalBuildingFootprint: `${toDisplay((config.mainBuildingWidth * config.mainBuildingDepth) + metrics.aduArea, true)} ${getUnitLabel(true)}`,
        remainingYardSpace: `${toDisplay(metrics.lotArea - ((config.mainBuildingWidth * config.mainBuildingDepth) + metrics.aduArea), true)} ${getUnitLabel(true)}`
      }
    }
    return report
  }

  // Function to capture the lot visualization as an image
  const captureLotVisualization = async (): Promise<string | null> => {
    try {
      const { default: html2canvas } = await import('html2canvas')
      const visualizer = document.querySelector('[data-visualizer="true"]') as HTMLElement
      if (!visualizer) {
        console.error('Visualizer element not found')
        return null
      }
      
      // Wait a moment for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const canvas = await html2canvas(visualizer, {
        backgroundColor: '#ffffff',
        scale: 3, // Higher scale for better quality
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: visualizer.offsetWidth,
        height: visualizer.offsetHeight,
        scrollX: 0,
        scrollY: 0
      })
      
      return canvas.toDataURL('image/png', 0.95)
    } catch (error) {
      console.error('Error capturing visualization:', error)
      return null
    }
  }

  // Function to show report modal with live data
  const generateReport = () => {
    try {
      setShowReportModal(true)
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Error generating report. Please check the console for details.')
    }
  }

  const exportConfiguration = async () => {
    try {
      // Dynamic import to avoid SSR issues
      const { default: jsPDF } = await import('jspdf')
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      })
      
      const report = generateDetailedReport()
      const bylawData = selectedMunicipalityData?.bylaw_data
      const timestamp = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
      
      // Helper function to add page header
      const addHeader = (pageNum: number) => {
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(128, 128, 128)
        pdf.text(`ADU Configuration Report - ${report.municipality}`, 20, 10)
        pdf.text(`Page ${pageNum}`, 190, 10)
        pdf.setTextColor(0, 0, 0)
      }
      
      // Helper function to check if we need a new page
      const checkNewPage = (currentY: number, requiredSpace: number = 20): number => {
        if (currentY + requiredSpace > 250) {
          pdf.addPage()
          addHeader(pdf.getNumberOfPages())
          return 25
        }
        return currentY
      }
      
      let yPosition = 25
      addHeader(1)
      
      // Professional Title Section
      pdf.setFontSize(22)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(51, 51, 51)
      pdf.text('ACCESSORY DWELLING UNIT', 20, yPosition)
      yPosition += 8
      pdf.text('LOT CONFIGURATION REPORT', 20, yPosition)
      yPosition += 15
      
      // Municipality and Date
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(85, 85, 85)
      pdf.text(`Municipality: ${report.municipality}`, 20, yPosition)
      yPosition += 8
      pdf.text(`Generated: ${timestamp}`, 20, yPosition)
      yPosition += 20
      
      // Executive Summary Section
      yPosition = checkNewPage(yPosition, 60)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(0, 0, 0)
      pdf.text('EXECUTIVE SUMMARY', 20, yPosition)
      yPosition += 12
      
      // Status indicator box - exactly like preview
      const statusColor = report.compliance.isValid ? [34, 139, 34] : [220, 20, 60]
      pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2])
      pdf.rect(20, yPosition, 170, 18, 'F')
      
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255, 255, 255)
      const statusText = report.compliance.isValid ? 'COMPLIANT - Configuration meets bylaw requirements' : 'NON-COMPLIANT - Issues require resolution'
      pdf.text(statusText, 25, yPosition + 12)
      yPosition += 25
      
      pdf.setTextColor(85, 85, 85) // Gray text like preview
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      
      // Key metrics summary - exactly matching preview format
      const summaryItems = [
        `ADU Type: ${report.adu.type.toUpperCase()}`,
        `Floor Area: ${report.adu.area}`,
        `Lot Coverage: ${report.calculations.lotCoverage}`,
        `Compliance Issues: ${report.compliance.violations + report.compliance.warnings} total`
      ]
      
      summaryItems.forEach(item => {
        pdf.text(`• ${item}`, 25, yPosition)
        yPosition += 7
      })
      yPosition += 15
      
      // Site Layout Visualization
      yPosition = checkNewPage(yPosition, 120)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SITE LAYOUT VISUALIZATION', 20, yPosition)
      yPosition += 12
      
      // Capture and add the lot visualization image
      const visualizationImage = await captureLotVisualization()
      if (visualizationImage) {
        try {
          // Add the visualization image to the PDF - larger size for better visibility
          pdf.addImage(visualizationImage, 'PNG', 20, yPosition, 170, 100)
          yPosition += 110
          
          pdf.setFontSize(10)
          pdf.setFont('helvetica', 'italic')
          pdf.setTextColor(102, 102, 102)
          pdf.text('Live capture of your lot configuration with buildings, site features, and setback compliance.', 20, yPosition)
          yPosition += 10
        } catch (error) {
          console.error('Error adding visualization image:', error)
          pdf.setFontSize(11)
          pdf.setFont('helvetica', 'italic')
          pdf.setTextColor(128, 128, 128)
          pdf.text('Site layout visualization could not be captured', 25, yPosition)
          yPosition += 15
        }
      } else {
        // Add placeholder box when capture fails
        pdf.setFillColor(245, 245, 245)
        pdf.rect(20, yPosition, 170, 100, 'F')
        pdf.setDrawColor(200, 200, 200)
        pdf.rect(20, yPosition, 170, 100, 'S')
        
        pdf.setFontSize(12)
        pdf.setTextColor(102, 102, 102)
        pdf.text('🏗️', 100, yPosition + 40)
        pdf.setFont('helvetica', 'bold')
        pdf.text('Site Layout Visualization', 105 - (pdf.getTextWidth('Site Layout Visualization') / 2), yPosition + 50)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(10)
        pdf.text('Live visualization capture unavailable', 105 - (pdf.getTextWidth('Live visualization capture unavailable') / 2), yPosition + 60)
        
        yPosition += 110
      }
      
      pdf.setTextColor(0, 0, 0)
      yPosition += 10
      
      // Property Information Section - matching preview layout
      yPosition = checkNewPage(yPosition, 60)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('PROPERTY INFORMATION', 20, yPosition)
      yPosition += 12
      
      // Two-column layout like preview
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      
      const propertyDataLeft = [
        ['Lot Dimensions:', report.property.lotSize],
        ['Total Lot Area:', report.property.lotArea],
        ['Buildable Area:', report.property.buildableArea]
      ]
      
      const propertyDataRight = [
        ['Frontage:', report.property.frontage],
        ['Depth:', report.property.depth],
        ['Corner Lot:', isCornerLot ? report.property.cornerLot || 'Yes' : 'No'],
        ['Alley Access:', hasAlleyAccess ? report.property.alleyAccess || 'Yes' : 'No']
      ]
      
      const startY = yPosition
      // Left column
      propertyDataLeft.forEach(([label, value], idx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 25, startY + (idx * 7))
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 75, startY + (idx * 7))
      })
      
      // Right column
      propertyDataRight.forEach(([label, value], idx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 110, startY + (idx * 7))
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 150, startY + (idx * 7))
      })
      
      yPosition = startY + Math.max(propertyDataLeft.length, propertyDataRight.length) * 7 + 15
      
      // Main Building Section - matching preview format
      yPosition = checkNewPage(yPosition, 40)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('MAIN BUILDING', 20, yPosition)
      yPosition += 12
      
      pdf.setFontSize(11)
      const mainBuildingLeft = [
        ['Dimensions:', report.mainBuilding.size],
        ['Floor Area:', report.mainBuilding.area]
      ]
      const mainBuildingRight = [
        ['Position:', report.mainBuilding.position]
      ]
      
      const mainStartY = yPosition
      // Left column
      mainBuildingLeft.forEach(([label, value], idx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 25, mainStartY + (idx * 7))
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 75, mainStartY + (idx * 7))
      })
      
      // Right column  
      mainBuildingRight.forEach(([label, value], idx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 110, mainStartY + (idx * 7))
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 150, mainStartY + (idx * 7))
      })
      
      yPosition = mainStartY + Math.max(mainBuildingLeft.length, mainBuildingRight.length) * 7 + 15
      
      // ADU Configuration Section
      yPosition = checkNewPage(yPosition, 50)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('ADU CONFIGURATION', 20, yPosition)
      yPosition += 12
      
      const aduData = [
        ['Type:', report.adu.type.charAt(0).toUpperCase() + report.adu.type.slice(1)],
        ['Dimensions:', report.adu.size],
        ['Floor Area:', report.adu.area],
        ['Stories:', report.adu.stories.toString()],
        ['Position on Lot:', report.adu.position],
        ['Distance from Main:', report.adu.distanceFromMain]
      ]
      
      pdf.setFontSize(11)
      aduData.forEach(([label, value]) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 25, yPosition)
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 85, yPosition)
        yPosition += 7
      })
      yPosition += 15
      
      // Site Features Section
      if (report.siteFeatures && report.siteFeatures.length > 0) {
        yPosition = checkNewPage(yPosition, 30 + (report.siteFeatures.length * 8))
        pdf.setFontSize(16)
        pdf.setFont('helvetica', 'bold')
        pdf.text('SITE FEATURES', 20, yPosition)
        yPosition += 12
        
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'normal')
        report.siteFeatures.forEach((feature, index) => {
          pdf.setFont('helvetica', 'bold')
          pdf.text(`${index + 1}. ${feature.type.charAt(0).toUpperCase() + feature.type.slice(1)}:`, 25, yPosition)
          pdf.setFont('helvetica', 'normal')
          pdf.text(`${feature.name || 'Unnamed'}`, 85, yPosition)
          yPosition += 6
          pdf.text(`Position: ${feature.position}`, 30, yPosition)
          if (feature.size !== 'Point feature') {
            yPosition += 6
            pdf.text(`Size: ${feature.size}`, 30, yPosition)
          }
          yPosition += 10
        })
        yPosition += 5
      }
      
      // Bylaw Requirements Section (NEW)
      if (bylawData) {
        yPosition = checkNewPage(yPosition, 60)
        pdf.setFontSize(16)
        pdf.setFont('helvetica', 'bold')
        pdf.text('MUNICIPAL BYLAW REQUIREMENTS', 20, yPosition)
        yPosition += 12
        
        pdf.setFontSize(11)
        pdf.setFont('helvetica', 'normal')
        
        const bylawRequirements = [
          ['Minimum Lot Width:', bylawData.min_lot_width_ft ? `${bylawData.min_lot_width_ft}'` : 'Not specified'],
          ['Front Setback (min):', bylawData.front_setback_min_ft ? `${bylawData.front_setback_min_ft}'` : 'Not specified'],
          ['Rear Setback (standard):', bylawData.rear_setback_standard_ft ? `${bylawData.rear_setback_standard_ft}'` : 'Not specified'],
          ['Rear Setback (w/ alley):', bylawData.rear_setback_with_alley_ft ? `${bylawData.rear_setback_with_alley_ft}'` : 'Same as standard'],
          ['Side Setback (interior):', bylawData.side_setback_interior_ft ? `${bylawData.side_setback_interior_ft}'` : 'Not specified'],
          ['Side Setback (corner st.):', bylawData.side_setback_corner_street_ft ? `${bylawData.side_setback_corner_street_ft}'` : 'Same as interior'],
          ['Max ADU Size:', bylawData.detached_adu_max_size_sqft ? `${bylawData.detached_adu_max_size_sqft} sq ft` : 'Not specified'],
          ['Max Lot Coverage:', bylawData.max_lot_coverage_percent ? `${bylawData.max_lot_coverage_percent}%` : 'Not specified'],
          ['Permitted ADU Types:', bylawData.adu_types_allowed 
            ? Object.entries(bylawData.adu_types_allowed)
                .filter(([_, allowed]) => allowed)
                .map(([type, _]) => type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()))
                .join(', ') || 'None specified'
            : 'Not specified']
        ]
        
        bylawRequirements.forEach(([label, value]) => {
          pdf.setFont('helvetica', 'bold')
          pdf.text(label, 25, yPosition)
          pdf.setFont('helvetica', 'normal')
          pdf.text(value, 90, yPosition)
          yPosition += 7
        })
        yPosition += 15
      }
      
      // Setbacks Analysis Section
      yPosition = checkNewPage(yPosition, 50)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SETBACK ANALYSIS', 20, yPosition)
      yPosition += 12
      
      const setbackData = [
        ['Front Setback:', report.setbacks.front],
        ['Rear Setback:', report.setbacks.rear],
        ['Side Setback:', report.setbacks.side]
      ]
      
      pdf.setFontSize(11)
      setbackData.forEach(([label, value]) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 25, yPosition)
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 85, yPosition)
        yPosition += 7
      })
      
      if (report.setbacks.notes) {
        yPosition += 5
        pdf.setFont('helvetica', 'bold')
        pdf.text('Special Conditions:', 25, yPosition)
        yPosition += 7
        pdf.setFont('helvetica', 'normal')
        report.setbacks.notes.forEach((note) => {
          pdf.text(`• ${note}`, 30, yPosition)
          yPosition += 6
        })
      }
      yPosition += 15
      
      // Compliance Analysis Section
      yPosition = checkNewPage(yPosition, 60)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('COMPLIANCE ANALYSIS', 20, yPosition)
      yPosition += 12
      
      // Overall status
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(statusColor[0], statusColor[1], statusColor[2])
      pdf.text(report.compliance.isValid ? '✓ CONFIGURATION COMPLIANT' : '✗ COMPLIANCE ISSUES FOUND', 25, yPosition)
      yPosition += 12
      
      pdf.setTextColor(0, 0, 0)
      pdf.setFontSize(11)
      pdf.setFont('helvetica', 'normal')
      
      const complianceStats = [
        [`Total Violations: ${report.compliance.violations}`, report.compliance.violations > 0 ? [220, 20, 60] : [34, 139, 34]],
        [`Warnings: ${report.compliance.warnings}`, report.compliance.warnings > 0 ? [255, 140, 0] : [34, 139, 34]]
      ]
      
      complianceStats.forEach(([text, color]) => {
        pdf.setTextColor((color as number[])[0], (color as number[])[1], (color as number[])[2])
        pdf.text(text as string, 25, yPosition)
        yPosition += 7
      })
      
      pdf.setTextColor(0, 0, 0)
      yPosition += 8
      
      // Detailed issues
      if (report.compliance.details && report.compliance.details.length > 0) {
        pdf.setFont('helvetica', 'bold')
        pdf.text('Specific Issues:', 25, yPosition)
        yPosition += 8
        
        pdf.setFont('helvetica', 'normal')
        report.compliance.details.forEach((detail) => {
          yPosition = checkNewPage(yPosition, 15)
          const detailColor = detail.type === 'setback' ? [220, 20, 60] : [255, 140, 0]
          pdf.setTextColor(detailColor[0], detailColor[1], detailColor[2])
          pdf.text(`• ${detail.message}`, 30, yPosition)
          if (detail.requirement) {
            yPosition += 6
            pdf.setTextColor(85, 85, 85)
            pdf.text(`  Requirement: ${detail.requirement}`, 35, yPosition)
          }
          yPosition += 8
        })
      } else {
        pdf.setTextColor(34, 139, 34)
        pdf.text('✓ All requirements satisfied', 25, yPosition)
        yPosition += 8
      }
      
      pdf.setTextColor(0, 0, 0)
      yPosition += 15
      
      // Calculations Section
      yPosition = checkNewPage(yPosition, 30)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('TECHNICAL CALCULATIONS', 20, yPosition)
      yPosition += 12
      
      // Two-column layout for calculations like preview
      const calculationsLeft = [
        ['Lot Coverage:', report.calculations.lotCoverage],
        ['Main-ADU Separation:', report.calculations.separationDistance]
      ]
      const calculationsRight = [
        ['Total Building Footprint:', report.calculations.totalBuildingFootprint],
        ['Remaining Yard Space:', report.calculations.remainingYardSpace]
      ]
      
      const calcStartY = yPosition
      // Left column
      calculationsLeft.forEach(([label, value], idx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 25, calcStartY + (idx * 7))
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 85, calcStartY + (idx * 7))
      })
      
      // Right column
      calculationsRight.forEach(([label, value], idx) => {
        pdf.setFont('helvetica', 'bold')
        pdf.text(label, 110, calcStartY + (idx * 7))
        pdf.setFont('helvetica', 'normal')
        pdf.text(value, 170, calcStartY + (idx * 7))
      })
      
      pdf.setFontSize(11)
      yPosition = calcStartY + Math.max(calculationsLeft.length, calculationsRight.length) * 7 + 20
      
      // Professional Footer
      yPosition = checkNewPage(yPosition, 40)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(128, 128, 128)
      pdf.text('IMPORTANT DISCLAIMER', 20, yPosition)
      yPosition += 8
      
      pdf.setFont('helvetica', 'normal')
      const disclaimerText = [
        'This report is generated for preliminary planning purposes only and does not constitute',
        'official approval or authorization for construction. All dimensions, setbacks, and compliance',
        'determinations must be verified with local municipal authorities and building departments',
        'before proceeding with any construction activities.'
      ]
      
      disclaimerText.forEach(line => {
        pdf.text(line, 20, yPosition)
        yPosition += 5
      })
      
      // Save the PDF
      const fileName = `adu-configuration-report-${report.municipality.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
      
    } catch (error) {
      console.error('Error generating PDF:', error)
      // Fallback to JSON export if PDF fails
      const report = generateDetailedReport()
      const json = JSON.stringify(report, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `lot-configuration-${Date.now()}.json`
      link.click()
      URL.revokeObjectURL(url)
    }
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
    <div className="container mx-auto px-4 h-[calc(100vh-6rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="pt-4 mb-4">
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

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_2fr] lg:grid-cols-[1fr_1.5fr] gap-4 flex-1 min-h-0 max-h-full overflow-hidden">
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
                    const selectedMuni = municipalities.find((m: any) => m.id === municipalityId)
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
                        const targetMuni = municipalities.find((m: any) => m.id === municipalityId)
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
                    {municipalities.map((muni) => {
                      const municipalityId = muni.id?.toString() || `temp-${Math.random()}`
                      return (
                        <SelectItem key={muni.id} value={municipalityId} className="w-full block">
                          <div className="flex items-center justify-between w-full pr-2">
                            <span className="font-medium">{muni.name}</span>
                            <div className="flex items-center gap-2">
                              {(() => {
                                const badgeConfig = getMunicipalityBadgeConfig(muni.bylaw_data)
                                if (badgeConfig.reviewIcon) {
                                  const ReviewIcon = badgeConfig.reviewIcon.Icon
                                  return <ReviewIcon className={badgeConfig.reviewIcon.className} />
                                }
                                return null
                              })()}
                              {(() => {
                                const badgeConfig = getMunicipalityBadgeConfig(muni.bylaw_data)
                                if (badgeConfig.contentBadge) {
                                  return (
                                    <span className={badgeConfig.contentBadge.className}>
                                      {badgeConfig.contentBadge.text}
                                    </span>
                                  )
                                } else {
                                  // Handle "No Data" case (old format)
                                  return (
                                    <span className={badgeConfig.className}>
                                      {badgeConfig.text}
                                    </span>
                                  )
                                }
                              })()}
                            </div>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
                
                {/* Permit Type Display (Phase 1) */}
                {selectedMunicipalityData?.bylaw_data && (
                  <div className="flex items-center gap-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-md">
                    <Building className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                    <span className="text-slate-700 dark:text-slate-300">
                      <span className="font-medium">Permit Required:</span> {
                        selectedMunicipalityData.bylaw_data.permit_type === 'by_right' ? 'By-Right' :
                        selectedMunicipalityData.bylaw_data.permit_type === 'special_permit' ? 'Special Permit' :
                        selectedMunicipalityData.bylaw_data.permit_type === 'conditional_use' ? 'Conditional Use' :
                        selectedMunicipalityData.bylaw_data.permit_type === 'variance' ? 'Variance Required' :
                        'Unknown'
                      }
                    </span>
                  </div>
                )}
              </div>

              {/* Property Dimensions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Property Dimensions</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 border border-dashed border-blue-200 dark:border-blue-800 px-2.5 py-1.5 rounded-md">
                    <Info className="h-3.5 w-3.5" />
                    <span>Validate via site visit</span>
                  </div>
                </div>
                
                {/* Property Type Characteristics */}
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isCornerLot}
                      onChange={(e) => setIsCornerLot(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                    />
                    <span className="text-muted-foreground">Corner lot</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasAlleyAccess}
                      onChange={(e) => setHasAlleyAccess(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary focus:ring-offset-0 focus:ring-1"
                    />
                    <span className="text-muted-foreground">Alley access</span>
                  </label>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Width</Label>
                      <div className="flex items-center gap-1 ml-auto">
                        {selectedMunicipalityData?.bylaw_data?.min_lot_width_ft && config.lotWidth < selectedMunicipalityData.bylaw_data.min_lot_width_ft && <span className="text-red-600 text-xs">⚠</span>}
                        <input
                          type="text"
                          value={config.units === 'imperial' ? toFeetAndInches(config.lotWidth) : `${toDisplay(config.lotWidth)}m`}
                          onChange={(e) => {
                            const val = config.units === 'imperial' 
                              ? fromFeetAndInches(e.target.value)
                              : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                            if (!isNaN(val) && val > 0) {
                              // Enforce range: 15-300 feet for lot width
                              const clampedVal = Math.min(300, Math.max(15, val))
                              updateConfigValue('lotWidth', clampedVal)
                            }
                          }}
                          className={`text-xs font-mono w-12 px-1 py-0.5 border rounded text-right transition-all duration-75 ease-out ${
                            selectedMunicipalityData?.bylaw_data?.min_lot_width_ft && config.lotWidth < selectedMunicipalityData.bylaw_data.min_lot_width_ft
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : ''
                          }`}
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        value={config.units === 'metric' ? parseFloat(toDisplay(config.lotWidth).toString()) : config.lotWidth}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          const finalVal = config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val
                          // Enforce same range as text input: 15-300 feet
                          const clampedVal = Math.min(300, Math.max(15, finalVal))
                          updateConfigValue('lotWidth', clampedVal)
                        }}
                        max={config.units === 'metric' ? 91 : 300}
                        min={config.units === 'metric' ? 4.6 : 15}
                        step={config.units === 'metric' ? 1.5 : 5}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      {/* Minimum requirement tick mark */}
                      {selectedMunicipalityData?.bylaw_data?.min_lot_width_ft && (
                        <div 
                          className="absolute top-1/2 w-0.5 h-4 bg-slate-500 transform -translate-y-1/2 -translate-x-0.5 pointer-events-none border border-white/50"
                          style={{ 
                            left: `${((config.units === 'metric' 
                              ? selectedMunicipalityData.bylaw_data.min_lot_width_ft * FEET_TO_METERS 
                              : selectedMunicipalityData.bylaw_data.min_lot_width_ft) - (config.units === 'metric' ? 4.6 : 15)) 
                              / ((config.units === 'metric' ? 91 : 300) - (config.units === 'metric' ? 4.6 : 15)) * 100}%` 
                          }}
                          title={`Minimum required: ${config.units === 'imperial' 
                            ? `${selectedMunicipalityData.bylaw_data.min_lot_width_ft}'` 
                            : `${(selectedMunicipalityData.bylaw_data.min_lot_width_ft * FEET_TO_METERS).toFixed(1)}m`}`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                      <span>{config.units === 'metric' ? '4.6m' : '15ft'}</span>
                      <span>{config.units === 'metric' ? '91m+' : '300ft+'}</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-xs">Depth</Label>
                      <div className="flex items-center gap-1 ml-auto">
                        {selectedMunicipalityData?.bylaw_data?.min_lot_depth_ft && config.lotDepth < selectedMunicipalityData.bylaw_data.min_lot_depth_ft && <span className="text-red-600 text-xs">⚠</span>}
                        <input
                          type="text"
                          value={config.units === 'imperial' ? toFeetAndInches(config.lotDepth) : `${toDisplay(config.lotDepth)}m`}
                          onChange={(e) => {
                            const val = config.units === 'imperial' 
                              ? fromFeetAndInches(e.target.value)
                              : parseFloat(e.target.value.replace('m', '')) / FEET_TO_METERS
                            if (!isNaN(val) && val > 0) {
                              // Enforce range: 50-300 feet for lot depth
                              const clampedVal = Math.min(300, Math.max(50, val))
                              updateConfigValue('lotDepth', clampedVal)
                            }
                          }}
                          className={`text-xs font-mono w-12 px-1 py-0.5 border rounded text-right transition-all duration-75 ease-out ${
                            selectedMunicipalityData?.bylaw_data?.min_lot_depth_ft && config.lotDepth < selectedMunicipalityData.bylaw_data.min_lot_depth_ft
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : ''
                          }`}
                        />
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="range"
                        value={config.units === 'metric' ? parseFloat(toDisplay(config.lotDepth).toString()) : config.lotDepth}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value)
                          const finalVal = config.units === 'metric' ? Math.round(val / FEET_TO_METERS) : val
                          // Enforce same range as text input: 50-300 feet
                          const clampedVal = Math.min(300, Math.max(50, finalVal))
                          updateConfigValue('lotDepth', clampedVal)
                        }}
                        max={config.units === 'metric' ? 91 : 300}
                        min={config.units === 'metric' ? 15.2 : 50}
                        step={config.units === 'metric' ? 1.5 : 5}
                        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      {/* Minimum requirement tick mark */}
                      {selectedMunicipalityData?.bylaw_data?.min_lot_depth_ft && (
                        <div 
                          className="absolute top-1/2 w-0.5 h-4 bg-slate-500 transform -translate-y-1/2 -translate-x-0.5 pointer-events-none border border-white/50"
                          style={{ 
                            left: `${((config.units === 'metric' 
                              ? selectedMunicipalityData.bylaw_data.min_lot_depth_ft * FEET_TO_METERS 
                              : selectedMunicipalityData.bylaw_data.min_lot_depth_ft) - (config.units === 'metric' ? 15.2 : 50)) 
                              / ((config.units === 'metric' ? 91 : 300) - (config.units === 'metric' ? 15.2 : 50)) * 100}%` 
                          }}
                          title={`Minimum required: ${config.units === 'imperial' 
                            ? `${selectedMunicipalityData.bylaw_data.min_lot_depth_ft}'` 
                            : `${(selectedMunicipalityData.bylaw_data.min_lot_depth_ft * FEET_TO_METERS).toFixed(1)}m`}`}
                        />
                      )}
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                      <span>{config.units === 'metric' ? '15.2m' : '50ft'}</span>
                      <span>{config.units === 'metric' ? '91m+' : '300ft+'}</span>
                    </div>
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
                      <SelectItem 
                        value="detached"
                        disabled={selectedMunicipalityData?.bylaw_data && !selectedMunicipalityData.bylaw_data.adu_types_allowed?.detached}
                      >
                        Detached
                        {selectedMunicipalityData?.bylaw_data && !selectedMunicipalityData.bylaw_data.adu_types_allowed?.detached && (
                          <span className="text-muted-foreground ml-1">(Not Permitted)</span>
                        )}
                      </SelectItem>
                      <SelectItem 
                        value="attached"
                        disabled={selectedMunicipalityData?.bylaw_data && !selectedMunicipalityData.bylaw_data.adu_types_allowed?.attached}
                      >
                        Attached
                        {selectedMunicipalityData?.bylaw_data && !selectedMunicipalityData.bylaw_data.adu_types_allowed?.attached && (
                          <span className="text-muted-foreground ml-1">(Not Permitted)</span>
                        )}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Select value={aduStories.toString()} onValueChange={(value: string) => setAduStories(parseInt(value) as 1 | 2)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Stories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Story</SelectItem>
                      <SelectItem 
                        value="2"
                        disabled={selectedMunicipalityData?.bylaw_data?.detached_adu_max_stories === 1}
                      >
                        2 Story
                        {selectedMunicipalityData?.bylaw_data?.detached_adu_max_stories === 1 && (
                          <span className="text-muted-foreground ml-1">(Not Permitted)</span>
                        )}
                      </SelectItem>
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
                  {selectedMunicipalityData?.bylaw_data && (setbacksFromBylaws.front || setbacksFromBylaws.rear || setbacksFromBylaws.side || separationFromBylaws) && (
                    <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 border border-dashed border-blue-200 dark:border-blue-800 px-2.5 py-1.5 rounded-md">
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
                      disabled={separationFromBylaws}
                      className={`text-xs font-mono w-12 px-1 py-0.5 border rounded text-right ml-auto transition-all duration-75 ease-out ${
                        separationFromBylaws 
                          ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                          : ''
                      }`}
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
                    disabled={separationFromBylaws}
                    className={`w-full h-2 bg-muted rounded-lg appearance-none ${
                      separationFromBylaws
                        ? 'cursor-not-allowed opacity-50'
                        : 'cursor-pointer accent-primary'
                    }`}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-1 space-y-2">
                <Button onClick={generateReport} className="w-full h-9">
                  <FileText className="mr-2 h-4 w-4" />
                  Generate Report
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Visualization */}
        <main className="flex flex-col min-h-0">

          {/* Canvas */}
          <Card className="flex-1 flex flex-col min-h-0 max-h-full min-w-0 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Move className="h-4 w-4" />
                    Property Visualization
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Drag the ADU to reposition it on your lot • Scale: {scale}x
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent 
              ref={visualizationContainerRef}
              className="flex-1 flex justify-center items-center bg-muted/30 relative min-h-0 p-4 overflow-auto"
            >
              <div
                data-visualizer="true"
                className={`relative bg-background border-2 border-border rounded-lg shadow-lg overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-auto'}`}
                style={{
                  width: Math.min(containerDimensions.width - 40, Math.max(200, config.lotWidth * scale)) + 'px',
                  height: Math.min(containerDimensions.height - 40, Math.max(150, config.lotDepth * scale)) + 'px',
                  maxWidth: '100%',
                  maxHeight: '100%',
                  backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, hsl(var(--border)) 19px, hsl(var(--border)) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, hsl(var(--border)) 19px, hsl(var(--border)) 20px)',
                  backgroundSize: `${Math.max(5, Math.min(30, 5 * scale))}px ${Math.max(5, Math.min(30, 5 * scale))}px`
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
                        const buildable = getBuildableArea()
                        const constrainedX = Math.min(
                          buildable.right - config.aduWidth, 
                          Math.max(buildable.left, val)
                        )
                        setAduPosition(prev => ({ ...prev, x: constrainedX }))
                      } else if (obstacle) {
                        setObstacles(prev => prev.map(obs => 
                          obs.id === obstacle.id ? { ...obs, x: Math.min(config.lotWidth - obs.width, Math.max(0, val)) } : obs
                        ))
                      }
                    }
                    
                    const updateY = (val: number) => {
                      if (isADU) {
                        const buildable = getBuildableArea()
                        const constrainedY = Math.min(
                          buildable.bottom - config.aduDepth, 
                          Math.max(buildable.top, val)
                        )
                        setAduPosition(prev => ({ ...prev, y: constrainedY }))
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
                            <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30 border border-dashed border-blue-200 dark:border-blue-800 px-2.5 py-1.5 rounded-md mb-2">
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
                                max={config.units === 'metric' ? parseFloat(toDisplay(getBuildableArea().right - currentWidth).toString()) : getBuildableArea().right - currentWidth}
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
                                max={config.units === 'metric' ? parseFloat(toDisplay(getBuildableArea().bottom - currentDepth).toString()) : getBuildableArea().bottom - currentDepth}
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

      {/* Report Modal */}
      {showReportModal && (
        <ReportModal
          config={config}
          obstacles={obstacles}
          bylawValidation={bylawValidation}
          selectedMunicipalityData={selectedMunicipalityData || null}
          canvasRef={canvasRef}
          visualizationContainerRef={visualizationContainerRef}
          aduPosition={aduPosition}
          scale={scale}
          containerDimensions={containerDimensions}
          isCornerLot={isCornerLot}
          hasAlleyAccess={hasAlleyAccess}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  )
}