'use client'

import { useState } from 'react'

// Mock data for testing - more comprehensive
const mockReport = {
  municipality: "City of Toronto",
  property: {
    lotSize: "50' × 120'",
    lotArea: "6,000 sq ft", 
    buildableArea: "4,500 sq ft",
    frontage: "50 ft",
    depth: "120 ft",
    zoning: "R-D (Residential Detached)",
    orientation: "North-South"
  },
  mainBuilding: {
    size: "30' × 40'",
    area: "1,200 sq ft",
    position: "20' from front, 15' from west side",
    stories: "2",
    height: "28 ft",
    footprint: "1,200 sq ft"
  },
  adu: {
    type: "laneway house",
    size: "24' × 30'",
    area: "720 sq ft",
    stories: "1",
    height: "16 ft",
    position: "25' from west side, 85' from front",
    distanceFromMain: "15 ft",
    access: "Via rear laneway",
    parking: "1 space included",
    utilities: "Separate electrical, shared water/sewer"
  },
  design: {
    totalFootprint: "1,920 sq ft",
    remainingYardSpace: "4,080 sq ft",
    driveways: "Shared rear access from laneway",
    landscaping: "68% of lot remains as open space",
    privacy: "6' fence along property lines",
    windows: "No direct overlook into neighbors"
  },
  setbacks: {
    front: "20 ft (from bylaws)",
    rear: "7.5 ft (from bylaws) - alley access applied",
    side: "4 ft (from bylaws)",
    notes: [
      "Alley access: 7.5' (vs standard 25')",
      "Corner lot: Street side 12', Interior 4'"
    ]
  },
  placement: {
    aduToMainSeparation: "15 ft (exceeds 10 ft minimum)",
    aduToRearProperty: "7.5 ft (alley access setback)",
    aduToSideProperty: "4 ft (meets minimum)",
    sunlightAnalysis: "Good southern exposure, minimal shadow impact",
    accessRoute: "Direct from laneway, 12' wide access",
    serviceAccess: "Utilities accessible from rear"
  },
  compliance: {
    isValid: false,
    violations: 2,
    warnings: 1,
    details: [
      {
        type: "setback",
        message: "Front setback is below minimum requirement",
        requirement: "Minimum 25 ft"
      },
      {
        type: "coverage", 
        message: "Lot coverage exceeds maximum allowed",
        requirement: "Maximum 40%"
      },
      {
        type: "warning",
        message: "ADU close to property line - verify survey",
        requirement: "Professional survey recommended"
      }
    ]
  },
  calculations: {
    lotCoverage: "32.0% (1,920 sf / 6,000 sf)",
    separationDistance: "15 ft (from bylaws)",
    buildableAreaUsed: "42.7% (1,920 sf / 4,500 sf)",
    floorAreaRatio: "0.32",
    permeableArea: "68% (4,080 sf)"
  },
  siteFeatures: [
    {
      type: "tree",
      name: "Large Oak Tree",
      position: "35', 60' from front",
      size: "15' canopy diameter"
    },
    {
      type: "utility",
      name: "Electrical Panel",
      position: "5', 45' from front",
      size: "Point feature"
    },
    {
      type: "structure",
      name: "Garden Shed",
      position: "8', 100' from front",
      size: "10' × 8'"
    },
    {
      type: "driveway",
      name: "Rear Laneway Access",
      position: "0', 115' from front",
      size: "12' × 20'"
    }
  ],
  infrastructure: {
    waterConnection: "Shared service from main building",
    sewerConnection: "Separate connection to municipal system",
    electricalService: "New 100A panel, separate meter",
    gasService: "Separate connection available",
    internet: "Fiber ready, separate installation",
    waste: "Shared collection point at front curb"
  }
}

const mockBylawData = {
  min_lot_width_ft: "50",
  front_setback_min_ft: "25", 
  rear_setback_standard_ft: "25",
  rear_setback_with_alley_ft: "7.5",
  side_setback_interior_ft: "4",
  side_setback_corner_street_ft: "12", 
  max_adu_size_sqft: "1000",
  max_lot_coverage_percent: "40",
  adu_types_allowed: "Laneway House, Garden Suite, Coach House"
}

export default function TestPDFPreview() {
  const [isCornerLot] = useState(true)
  const [hasAlleyAccess] = useState(true)
  
  const timestamp = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })

  const statusColor = mockReport.compliance.isValid ? 'bg-green-600' : 'bg-red-600'
  const statusText = mockReport.compliance.isValid ? 'COMPLIANT - Configuration meets bylaw requirements' : 'NON-COMPLIANT - Issues require resolution'

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto bg-white shadow-lg">
        
        {/* Header */}
        <div className="border-b border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-between items-center text-sm text-gray-500 mb-4">
            <span>ADU Configuration Report - {mockReport.municipality}</span>
            <span>Page 1</span>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8">
          
          {/* Site Layout Visualization */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">SITE LAYOUT VISUALIZATION</h2>
            <div className="border border-gray-300 bg-gray-50 p-4 rounded mb-4">
              <div className="bg-white border border-gray-300 rounded-lg p-8 text-center">
                <div className="mb-4">
                  <div className="w-20 h-20 bg-blue-100 border-2 border-blue-300 rounded-lg mx-auto mb-2 flex items-center justify-center text-blue-600 text-2xl">
                    🏗️
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Interactive Lot Visualization</h3>
                  <p className="text-gray-600 mb-4">
                    In the actual PDF report, this section will contain a high-resolution capture 
                    of the interactive lot configurator showing:
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm text-left max-w-2xl mx-auto">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-100 border border-green-400 border-dashed rounded"></div>
                      <span>Buildable area boundaries</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-600 rounded"></div>
                      <span>ADU placement and sizing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-orange-500 rounded"></div>
                      <span>Main residence location</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌳</span>
                      <span>Trees and landscaping</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🏚️</span>
                      <span>Sheds and structures</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border border-orange-400 border-dashed rounded"></div>
                      <span>Setback requirements</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> The PDF will capture the exact visual state of your lot configuration 
                    including all buildings, site features, setback lines, and compliance status in high resolution.
                  </p>
                </div>
              </div>
            </div>
          </section>
          
          {/* Title Section */}
          <div className="text-center border-b border-gray-200 pb-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-2">
              ACCESSORY DWELLING UNIT<br/>
              LOT CONFIGURATION REPORT
            </h1>
            <div className="text-lg text-gray-600 space-y-1">
              <p>Municipality: {mockReport.municipality}</p>
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
              <p>• ADU Type: {mockReport.adu.type.toUpperCase()}</p>
              <p>• Floor Area: {mockReport.adu.area}</p>  
              <p>• Lot Coverage: {mockReport.calculations.lotCoverage}</p>
              <p>• Compliance Issues: {mockReport.compliance.violations + mockReport.compliance.warnings} total</p>
            </div>
          </section>

          {/* Property Information */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">PROPERTY INFORMATION</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Lot Dimensions:</span> {mockReport.property.lotSize}</div>
              <div><span className="font-bold">Total Lot Area:</span> {mockReport.property.lotArea}</div>
              <div><span className="font-bold">Buildable Area:</span> {mockReport.property.buildableArea}</div>
              <div><span className="font-bold">Frontage:</span> {mockReport.property.frontage}</div>
              <div><span className="font-bold">Depth:</span> {mockReport.property.depth}</div>
              <div><span className="font-bold">Zoning:</span> {mockReport.property.zoning}</div>
              <div><span className="font-bold">Orientation:</span> {mockReport.property.orientation}</div>
              <div><span className="font-bold">Corner Lot:</span> {isCornerLot ? 'Yes' : 'No'}</div>
              <div><span className="font-bold">Alley Access:</span> {hasAlleyAccess ? 'Yes' : 'No'}</div>
            </div>
          </section>

          {/* Main Building */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">MAIN BUILDING</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Dimensions:</span> {mockReport.mainBuilding.size}</div>
              <div><span className="font-bold">Floor Area:</span> {mockReport.mainBuilding.area}</div>
              <div><span className="font-bold">Stories:</span> {mockReport.mainBuilding.stories}</div>
              <div><span className="font-bold">Height:</span> {mockReport.mainBuilding.height}</div>
              <div><span className="font-bold">Position:</span> {mockReport.mainBuilding.position}</div>
              <div><span className="font-bold">Building Footprint:</span> {mockReport.mainBuilding.footprint}</div>
            </div>
          </section>

          {/* ADU Configuration */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">ADU CONFIGURATION</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Type:</span> {mockReport.adu.type.charAt(0).toUpperCase() + mockReport.adu.type.slice(1)}</div>
              <div><span className="font-bold">Dimensions:</span> {mockReport.adu.size}</div>
              <div><span className="font-bold">Floor Area:</span> {mockReport.adu.area}</div>
              <div><span className="font-bold">Stories:</span> {mockReport.adu.stories}</div>
              <div><span className="font-bold">Height:</span> {mockReport.adu.height}</div>
              <div><span className="font-bold">Position on Lot:</span> {mockReport.adu.position}</div>
              <div><span className="font-bold">Distance from Main:</span> {mockReport.adu.distanceFromMain}</div>
              <div><span className="font-bold">Access:</span> {mockReport.adu.access}</div>
              <div><span className="font-bold">Parking:</span> {mockReport.adu.parking}</div>
              <div><span className="font-bold">Utilities:</span> {mockReport.adu.utilities}</div>
            </div>
          </section>

          {/* Bylaw Requirements */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">MUNICIPAL BYLAW REQUIREMENTS</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Minimum Lot Width:</span> {mockBylawData.min_lot_width_ft}'</div>
              <div><span className="font-bold">Front Setback (min):</span> {mockBylawData.front_setback_min_ft}'</div>
              <div><span className="font-bold">Rear Setback (standard):</span> {mockBylawData.rear_setback_standard_ft}'</div>
              <div><span className="font-bold">Rear Setback (w/ alley):</span> {mockBylawData.rear_setback_with_alley_ft}'</div>
              <div><span className="font-bold">Side Setback (interior):</span> {mockBylawData.side_setback_interior_ft}'</div>
              <div><span className="font-bold">Side Setback (corner st.):</span> {mockBylawData.side_setback_corner_street_ft}'</div>
              <div><span className="font-bold">Max ADU Size:</span> {mockBylawData.max_adu_size_sqft} sq ft</div>
              <div><span className="font-bold">Max Lot Coverage:</span> {mockBylawData.max_lot_coverage_percent}%</div>
              <div className="col-span-2"><span className="font-bold">Permitted ADU Types:</span> {mockBylawData.adu_types_allowed}</div>
            </div>
          </section>

          {/* Setback Analysis */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">SETBACK ANALYSIS</h2>
            <div className="space-y-2 text-sm">
              <div><span className="font-bold">Front Setback:</span> {mockReport.setbacks.front}</div>
              <div><span className="font-bold">Rear Setback:</span> {mockReport.setbacks.rear}</div>
              <div><span className="font-bold">Side Setback:</span> {mockReport.setbacks.side}</div>
              
              {mockReport.setbacks.notes && (
                <div className="mt-4">
                  <p className="font-bold">Special Conditions:</p>
                  <ul className="list-disc list-inside space-y-1 ml-4">
                    {mockReport.setbacks.notes.map((note, idx) => (
                      <li key={idx}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>

          {/* Compliance Analysis */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">COMPLIANCE ANALYSIS</h2>
            
            <div className={`text-lg font-bold mb-4 ${mockReport.compliance.isValid ? 'text-green-600' : 'text-red-600'}`}>
              {mockReport.compliance.isValid ? '✓ CONFIGURATION COMPLIANT' : '✗ COMPLIANCE ISSUES FOUND'}
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className={`${mockReport.compliance.violations > 0 ? 'text-red-600' : 'text-green-600'}`}>
                Total Violations: {mockReport.compliance.violations}
              </div>
              <div className={`${mockReport.compliance.warnings > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                Warnings: {mockReport.compliance.warnings}
              </div>
            </div>

            {mockReport.compliance.details && mockReport.compliance.details.length > 0 && (
              <div>
                <p className="font-bold mb-2">Specific Issues:</p>
                <div className="space-y-3">
                  {mockReport.compliance.details.map((detail, idx) => (
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


          {/* Site Features */}
          {mockReport.siteFeatures && mockReport.siteFeatures.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-black mb-4">SITE FEATURES</h2>
              <div className="space-y-3 text-sm">
                {mockReport.siteFeatures.map((feature, index) => (
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

          {/* Technical Calculations */}
          <section>
            <h2 className="text-xl font-bold text-black mb-4">TECHNICAL CALCULATIONS</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Lot Coverage:</span> {mockReport.calculations.lotCoverage}</div>
              <div><span className="font-bold">Main-ADU Separation:</span> {mockReport.calculations.separationDistance}</div>
              <div><span className="font-bold">Total Building Footprint:</span> {mockReport.calculations.totalBuildingFootprint}</div>
              <div><span className="font-bold">Remaining Yard Space:</span> {mockReport.calculations.remainingYardSpace}</div>
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
      
      {/* Action Button */}
      <div className="text-center mt-8">
        <p className="text-gray-600 mb-4">This is a preview of the enhanced PDF report format with comprehensive site features and professional layout</p>
        <div className="space-x-4">
          <button 
            onClick={() => window.history.back()} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            Back to Lot Configurator
          </button>
          <button 
            onClick={() => window.open('/lot-configurator', '_blank')} 
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
          >
            Open Live Configurator
          </button>
        </div>
      </div>
    </div>
  )
}