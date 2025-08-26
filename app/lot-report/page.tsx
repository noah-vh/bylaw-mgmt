'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

interface ReportData {
  municipality: string
  property: {
    lotSize: string
    lotArea: string
    buildableArea: string
    frontage: string
    depth: string
    cornerLot?: string
    alleyAccess?: string
  }
  mainBuilding: {
    size: string
    area: string
    position: string
  }
  adu: {
    type: string
    size: string
    area: string
    stories: number
    position: string
    distanceFromMain: string
  }
  setbacks: {
    front: string
    rear: string
    side: string
    notes?: string[]
  }
  compliance: {
    isValid: boolean
    violations: number
    warnings: number
    details: Array<{
      type: string
      message: string
      requirement?: string
    }>
  }
  calculations: {
    lotCoverage: string
    separationDistance: string
    totalBuildingFootprint: string
    remainingYardSpace: string
  }
  siteFeatures: Array<{
    type: string
    name: string
    position: string
    size: string
  }>
  bylawData?: {
    min_lot_width_ft?: string
    front_setback_min_ft?: string
    rear_setback_standard_ft?: string
    rear_setback_with_alley_ft?: string
    side_setback_interior_ft?: string
    side_setback_corner_street_ft?: string
    max_adu_size_sqft?: string
    max_lot_coverage_percent?: string
    adu_types_allowed?: string
  }
  canvasImage?: string
}

export default function LotReport() {
  const searchParams = useSearchParams()
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get data from sessionStorage
    const storedData = sessionStorage.getItem('lotReportData')
    if (storedData) {
      try {
        const parsedData = JSON.parse(storedData)
        setReportData(parsedData)
        // Clear the data after using it
        sessionStorage.removeItem('lotReportData')
      } catch (error) {
        console.error('Error parsing report data from sessionStorage:', error)
      }
    }
    setLoading(false)
  }, [])

  // Draw lot visualization when report data is available
  useEffect(() => {
    if (reportData) {
      drawLotVisualization()
    }
  }, [reportData])

  const drawLotVisualization = () => {
    const canvas = document.getElementById('lot-visualization') as HTMLCanvasElement
    if (!canvas || !reportData) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Parse actual dimensions from report data
    const lotSizeMatch = reportData.property.lotSize.match(/(\d+)'\s*×\s*(\d+)'/)
    const lotWidth = lotSizeMatch ? parseInt(lotSizeMatch[1]) : 50
    const lotDepth = lotSizeMatch ? parseInt(lotSizeMatch[2]) : 120

    // Parse main building dimensions
    const mainSizeMatch = reportData.mainBuilding.size.match(/(\d+)'\s*×\s*(\d+)'/)
    const mainWidth = mainSizeMatch ? parseInt(mainSizeMatch[1]) : 30
    const mainDepth = mainSizeMatch ? parseInt(mainSizeMatch[2]) : 40

    // Parse ADU dimensions  
    const aduSizeMatch = reportData.adu.size.match(/(\d+)'\s*×\s*(\d+)'/)
    const aduWidth = aduSizeMatch ? parseInt(aduSizeMatch[1]) : 24
    const aduDepth = aduSizeMatch ? parseInt(aduSizeMatch[2]) : 30

    // Parse positions from strings like "20' from front, 15' from west side"
    const parsePosition = (positionStr: string) => {
      const frontMatch = positionStr.match(/(\d+)['']?\s*from\s*front/i)
      const westMatch = positionStr.match(/(\d+)['']?\s*from\s*west/i)
      const eastMatch = positionStr.match(/(\d+)['']?\s*from\s*east/i)
      
      return {
        fromFront: frontMatch ? parseInt(frontMatch[1]) : 20,
        fromWest: westMatch ? parseInt(westMatch[1]) : eastMatch ? lotWidth - parseInt(eastMatch[1]) : 5
      }
    }

    const mainPos = parsePosition(reportData.mainBuilding.position)
    const aduPos = parsePosition(reportData.adu.position)

    // Set up scaling with margins
    const margin = 40
    const scale = Math.min((canvas.width - margin * 2) / lotWidth, (canvas.height - margin * 2) / lotDepth)
    const offsetX = (canvas.width - lotWidth * scale) / 2
    const offsetY = (canvas.height - lotDepth * scale) / 2

    // Helper function to convert feet to canvas pixels
    const ftToPx = (ft: number) => ft * scale

    // Draw lot boundary
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.strokeRect(offsetX, offsetY, ftToPx(lotWidth), ftToPx(lotDepth))
    
    // Add lot dimensions labels
    ctx.fillStyle = '#374151'
    ctx.font = '12px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(`${lotWidth}'`, offsetX + ftToPx(lotWidth/2), offsetY - 8)
    ctx.save()
    ctx.translate(offsetX - 15, offsetY + ftToPx(lotDepth/2))
    ctx.rotate(-Math.PI / 2)
    ctx.fillText(`${lotDepth}'`, 0, 0)
    ctx.restore()

    // Parse and draw setback lines from bylaw data if available
    if (reportData.bylawData) {
      ctx.strokeStyle = '#ef4444'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      
      // Front setback
      const frontSetback = parseInt(reportData.bylawData.front_setback_min_ft || '20')
      ctx.beginPath()
      ctx.moveTo(offsetX, offsetY + ftToPx(frontSetback))
      ctx.lineTo(offsetX + ftToPx(lotWidth), offsetY + ftToPx(frontSetback))
      ctx.stroke()
      
      // Side setbacks
      const sideSetback = parseInt(reportData.bylawData.side_setback_interior_ft || '4')
      ctx.beginPath()
      ctx.moveTo(offsetX + ftToPx(sideSetback), offsetY)
      ctx.lineTo(offsetX + ftToPx(sideSetback), offsetY + ftToPx(lotDepth))
      ctx.moveTo(offsetX + ftToPx(lotWidth - sideSetback), offsetY)
      ctx.lineTo(offsetX + ftToPx(lotWidth - sideSetback), offsetY + ftToPx(lotDepth))
      ctx.stroke()
      
      // Rear setback
      const rearSetback = parseInt(reportData.bylawData.rear_setback_standard_ft || '25')
      ctx.beginPath()
      ctx.moveTo(offsetX, offsetY + ftToPx(lotDepth - rearSetback))
      ctx.lineTo(offsetX + ftToPx(lotWidth), offsetY + ftToPx(lotDepth - rearSetback))
      ctx.stroke()

      ctx.setLineDash([]) // Reset line dash
    }

    // Draw main building using actual position and size
    ctx.fillStyle = '#f97316'
    ctx.strokeStyle = '#ea580c'
    ctx.lineWidth = 2
    const mainX = offsetX + ftToPx(mainPos.fromWest)
    const mainY = offsetY + ftToPx(mainPos.fromFront)
    const mainW = ftToPx(mainWidth)
    const mainH = ftToPx(mainDepth)
    ctx.fillRect(mainX, mainY, mainW, mainH)
    ctx.strokeRect(mainX, mainY, mainW, mainH)
    
    // Main building label
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 11px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('MAIN', mainX + mainW/2, mainY + mainH/2 - 3)
    ctx.fillText('HOUSE', mainX + mainW/2, mainY + mainH/2 + 10)

    // Draw ADU using actual position and size
    ctx.fillStyle = '#3b82f6'
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 2
    const aduX = offsetX + ftToPx(aduPos.fromWest)
    const aduY = offsetY + ftToPx(aduPos.fromFront)
    const aduW = ftToPx(aduWidth)
    const aduH = ftToPx(aduDepth)
    ctx.fillRect(aduX, aduY, aduW, aduH)
    ctx.strokeRect(aduX, aduY, aduW, aduH)
    
    // ADU label
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 10px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('ADU', aduX + aduW/2, aduY + aduH/2 - 2)
    ctx.font = '8px Arial'
    ctx.fillText(reportData.adu.type, aduX + aduW/2, aduY + aduH/2 + 8)

    // Draw site features using actual positions if available
    if (reportData.siteFeatures) {
      reportData.siteFeatures.forEach((feature) => {
        // Parse position from string like "35', 60' from front"
        const posMatch = feature.position.match(/(\d+)['']?,\s*(\d+)['']?\s*from\s*front/i)
        if (posMatch) {
          const featureX = offsetX + ftToPx(parseInt(posMatch[1]))
          const featureY = offsetY + ftToPx(parseInt(posMatch[2]))
          
          if (feature.type === 'tree') {
            // Draw tree as green circle
            ctx.fillStyle = '#22c55e'
            ctx.strokeStyle = '#16a34a'
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.arc(featureX, featureY, ftToPx(2), 0, 2 * Math.PI)
            ctx.fill()
            ctx.stroke()
            
            // Tree symbol
            ctx.fillStyle = '#16a34a'
            ctx.font = '12px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('🌳', featureX, featureY + 4)
          } else if (feature.type === 'shed') {
            // Parse shed size
            const sizeMatch = feature.size.match(/(\d+)['']?\s*×\s*(\d+)['']?/)
            const shedW = ftToPx(sizeMatch ? parseInt(sizeMatch[1]) : 8)
            const shedH = ftToPx(sizeMatch ? parseInt(sizeMatch[2]) : 10)
            
            ctx.fillStyle = '#6b7280'
            ctx.strokeStyle = '#4b5563'
            ctx.lineWidth = 1
            ctx.fillRect(featureX - shedW/2, featureY - shedH/2, shedW, shedH)
            ctx.strokeRect(featureX - shedW/2, featureY - shedH/2, shedW, shedH)
            
            ctx.fillStyle = '#ffffff'
            ctx.font = '8px Arial'
            ctx.textAlign = 'center'
            ctx.fillText('SHED', featureX, featureY + 2)
          }
        }
      })
    }

    // Add legend
    const legendX = canvas.width - 120
    const legendY = 20
    ctx.fillStyle = '#374151'
    ctx.font = 'bold 11px Arial'
    ctx.textAlign = 'left'
    ctx.fillText('LEGEND:', legendX, legendY)
    
    const legendItems = [
      { color: '#f97316', label: 'Main Building' },
      { color: '#3b82f6', label: 'ADU' },
      { color: '#ef4444', label: 'Setbacks' },
      { color: '#22c55e', label: 'Trees' },
      { color: '#6b7280', label: 'Sheds' }
    ]
    
    legendItems.forEach((item, index) => {
      const y = legendY + 15 + (index * 12)
      ctx.fillStyle = item.color
      ctx.fillRect(legendX, y - 6, 10, 8)
      ctx.strokeStyle = '#374151'
      ctx.lineWidth = 1
      ctx.strokeRect(legendX, y - 6, 10, 8)
      ctx.fillStyle = '#374151'
      ctx.font = '9px Arial'
      ctx.fillText(item.label, legendX + 15, y)
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading report...</p>
        </div>
      </div>
    )
  }

  if (!reportData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">No Report Data</h1>
          <p className="text-gray-600 mb-6">No configuration data was provided.</p>
          <button 
            onClick={() => window.location.href = '/lot-configurator'} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            Go to Lot Configurator
          </button>
        </div>
      </div>
    )
  }

  const timestamp = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  const statusColor = reportData.compliance.isValid ? 'bg-green-600' : 'bg-red-600'
  const statusText = reportData.compliance.isValid ? 'COMPLIANT - Configuration meets bylaw requirements' : 'NON-COMPLIANT - Issues require resolution'

  const handlePrint = () => {
    window.print()
  }

  const handleExportPDF = async () => {
    try {
      const { default: html2canvas } = await import('html2canvas')
      const { default: jsPDF } = await import('jspdf')
      
      const element = document.getElementById('report-content')
      if (!element) return

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff'
      })

      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgWidth = 210
      const pageHeight = 295
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight

      let position = 0

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      const fileName = `adu-configuration-report-${reportData.municipality.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      pdf.save(fileName)
    } catch (error) {
      console.error('Error generating PDF:', error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print/Export Controls */}
      <div className="bg-white border-b border-gray-200 p-4 print:hidden">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">ADU Configuration Report</h1>
          <div className="space-x-4">
            <button 
              onClick={handlePrint}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm"
            >
              Print Report
            </button>
            <button 
              onClick={handleExportPDF}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
            >
              Export PDF
            </button>
            <button 
              onClick={() => window.location.href = '/lot-configurator'}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
            >
              Back to Configurator
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div id="report-content" className="bg-white max-w-4xl mx-auto shadow-lg print:shadow-none print:max-w-none">
        
        {/* Header */}
        <div className="border-b border-gray-200 p-6 bg-gray-50 print:bg-white">
          <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
            <span>ADU Configuration Report - {reportData.municipality}</span>
            <span>Page 1</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          
          {/* Title Section */}
          <div className="text-center border-b border-gray-200 pb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              ACCESSORY DWELLING UNIT<br/>
              LOT CONFIGURATION REPORT
            </h1>
            <div className="text-lg text-gray-600 space-y-1">
              <p>Municipality: {reportData.municipality}</p>
              <p>Generated: {timestamp}</p>
            </div>
          </div>

          {/* Executive Summary */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">EXECUTIVE SUMMARY</h2>
            
            {/* Status Box */}
            <div className={`${statusColor} text-white p-4 rounded mb-4`}>
              <p className="font-bold">{statusText}</p>
            </div>

            <div className="space-y-2 text-gray-700">
              <p>• ADU Type: {reportData.adu.type.toUpperCase()}</p>
              <p>• Floor Area: {reportData.adu.area}</p>  
              <p>• Lot Coverage: {reportData.calculations.lotCoverage}</p>
              <p>• Compliance Issues: {reportData.compliance.violations + reportData.compliance.warnings} total</p>
            </div>
          </section>

          {/* Site Layout Visualization */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">SITE LAYOUT VISUALIZATION</h2>
            <div className="border border-gray-300 bg-gray-50 p-4 rounded mb-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <canvas 
                  id="lot-visualization" 
                  width="600" 
                  height="400" 
                  className="w-full h-auto max-w-3xl mx-auto border border-gray-200 rounded"
                  style={{ backgroundColor: '#f8fafc' }}
                />
                <p className="text-center text-sm text-gray-600 mt-2">
                  Lot configuration showing ADU placement, main building, and setback requirements
                </p>
              </div>
            </div>
          </section>

          {/* Property Information */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">PROPERTY INFORMATION</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Lot Dimensions:</span> {reportData.property.lotSize}</div>
              <div><span className="font-bold">Total Lot Area:</span> {reportData.property.lotArea}</div>
              <div><span className="font-bold">Buildable Area:</span> {reportData.property.buildableArea}</div>
              <div><span className="font-bold">Frontage:</span> {reportData.property.frontage}</div>
              <div><span className="font-bold">Depth:</span> {reportData.property.depth}</div>
              <div><span className="font-bold">Corner Lot:</span> {reportData.property.cornerLot || 'No'}</div>
              <div><span className="font-bold">Alley Access:</span> {reportData.property.alleyAccess || 'No'}</div>
            </div>
          </section>

          {/* Main Building */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">MAIN BUILDING</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Dimensions:</span> {reportData.mainBuilding.size}</div>
              <div><span className="font-bold">Floor Area:</span> {reportData.mainBuilding.area}</div>
              <div><span className="font-bold">Position:</span> {reportData.mainBuilding.position}</div>
            </div>
          </section>

          {/* ADU Configuration */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">ADU CONFIGURATION</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Type:</span> {reportData.adu.type.charAt(0).toUpperCase() + reportData.adu.type.slice(1)}</div>
              <div><span className="font-bold">Dimensions:</span> {reportData.adu.size}</div>
              <div><span className="font-bold">Floor Area:</span> {reportData.adu.area}</div>
              <div><span className="font-bold">Stories:</span> {reportData.adu.stories}</div>
              <div><span className="font-bold">Position on Lot:</span> {reportData.adu.position}</div>
              <div><span className="font-bold">Distance from Main:</span> {reportData.adu.distanceFromMain}</div>
            </div>
          </section>

          {/* Municipal Bylaw Requirements */}
          {reportData.bylawData && (
            <section>
              <h2 className="text-xl font-bold text-black mb-4">MUNICIPAL BYLAW REQUIREMENTS</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-bold">Minimum Lot Width:</span> {reportData.bylawData.min_lot_width_ft ? `${reportData.bylawData.min_lot_width_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Front Setback (min):</span> {reportData.bylawData.front_setback_min_ft ? `${reportData.bylawData.front_setback_min_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Rear Setback (standard):</span> {reportData.bylawData.rear_setback_standard_ft ? `${reportData.bylawData.rear_setback_standard_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Rear Setback (w/ alley):</span> {reportData.bylawData.rear_setback_with_alley_ft ? `${reportData.bylawData.rear_setback_with_alley_ft}'` : 'Same as standard'}</div>
                <div><span className="font-bold">Side Setback (interior):</span> {reportData.bylawData.side_setback_interior_ft ? `${reportData.bylawData.side_setback_interior_ft}'` : 'Not specified'}</div>
                <div><span className="font-bold">Side Setback (corner st.):</span> {reportData.bylawData.side_setback_corner_street_ft ? `${reportData.bylawData.side_setback_corner_street_ft}'` : 'Same as interior'}</div>
                <div><span className="font-bold">Max ADU Size:</span> {reportData.bylawData.max_adu_size_sqft ? `${reportData.bylawData.max_adu_size_sqft} sq ft` : 'Not specified'}</div>
                <div><span className="font-bold">Max Lot Coverage:</span> {reportData.bylawData.max_lot_coverage_percent ? `${reportData.bylawData.max_lot_coverage_percent}%` : 'Not specified'}</div>
                <div className="col-span-2"><span className="font-bold">Permitted ADU Types:</span> {reportData.bylawData.adu_types_allowed || 'Not specified'}</div>
              </div>
            </section>
          )}

          {/* Setback Analysis */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">SETBACK ANALYSIS</h2>
            <div className="space-y-2 text-sm">
              <div><span className="font-bold">Front Setback:</span> {reportData.setbacks.front}</div>
              <div><span className="font-bold">Rear Setback:</span> {reportData.setbacks.rear}</div>
              <div><span className="font-bold">Side Setback:</span> {reportData.setbacks.side}</div>
              
              {reportData.setbacks.notes && reportData.setbacks.notes.length > 0 && (
                <div className="mt-4">
                  <p className="font-bold">Special Conditions:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    {reportData.setbacks.notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Site Features */}
          {reportData.siteFeatures && reportData.siteFeatures.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-black mb-4">SITE FEATURES</h2>
              <div className="space-y-3 text-sm">
                {reportData.siteFeatures.map((feature, index) => (
                  <div key={index} className="border-l-4 border-blue-500 pl-4">
                    <div className="font-bold">
                      {index + 1}. {feature.type.charAt(0).toUpperCase() + feature.type.slice(1)}: {feature.name}
                    </div>
                    <div className="text-gray-600">Position: {feature.position}</div>
                    {feature.size !== 'Point feature' && (
                      <div className="text-gray-600">Size: {feature.size}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Compliance Analysis */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">COMPLIANCE ANALYSIS</h2>
            
            <div className={`text-lg font-bold mb-4 ${reportData.compliance.isValid ? 'text-green-600' : 'text-red-600'}`}>
              {reportData.compliance.isValid ? '✓ CONFIGURATION COMPLIANT' : '✗ COMPLIANCE ISSUES FOUND'}
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className={`${reportData.compliance.violations > 0 ? 'text-red-600' : 'text-green-600'}`}>
                Total Violations: {reportData.compliance.violations}
              </div>
              <div className={`${reportData.compliance.warnings > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                Warnings: {reportData.compliance.warnings}
              </div>
            </div>

            {reportData.compliance.details && reportData.compliance.details.length > 0 && (
              <div>
                <p className="font-bold mb-2">Specific Issues:</p>
                <div className="space-y-3">
                  {reportData.compliance.details.map((detail, idx) => (
                    <div key={idx} className="ml-4">
                      <div className={`${detail.type === 'setback' ? 'text-red-600' : 'text-orange-500'}`}>
                        • {detail.message}
                      </div>
                      {detail.requirement && (
                        <div className="text-gray-600 text-sm ml-4">
                          Requirement: {detail.requirement}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Technical Calculations */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">TECHNICAL CALCULATIONS</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Lot Coverage:</span> {reportData.calculations.lotCoverage}</div>
              <div><span className="font-bold">Main-ADU Separation:</span> {reportData.calculations.separationDistance}</div>
              <div><span className="font-bold">Total Building Footprint:</span> {reportData.calculations.totalBuildingFootprint}</div>
              <div><span className="font-bold">Remaining Yard Space:</span> {reportData.calculations.remainingYardSpace}</div>
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
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}