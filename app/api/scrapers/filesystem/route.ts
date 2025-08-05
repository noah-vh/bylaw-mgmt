import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

// GET /api/scrapers/filesystem - Get all scrapers from filesystem
export async function GET(request: NextRequest) {
  try {
    // Check if we have the bylaw_scrapers/scrapers directory
    const scrapersPath = '/Users/noahvanhart/Documents/GitHub/bylaw_scrapers/scrapers'
    
    try {
      await fs.access(scrapersPath)
    } catch {
      return NextResponse.json({
        data: [],
        stats: { total: 0, v1: 0, v2: 0, enhanced: 0, totalSize: 0, averageSize: 0 },
        message: 'Scrapers directory not found',
        timestamp: new Date().toISOString()
      })
    }

    // Read scraper files
    const files = await fs.readdir(scrapersPath)
    const pythonFiles = files.filter(file => 
      file.endsWith('.py') && 
      !file.startsWith('_') && 
      !file.startsWith('.') &&
      file !== 'base.py' &&
      file !== 'template.py' &&
      file !== 'manager.py' &&
      file !== 'config_manager.py' &&
      file !== 'data_validation.py' &&
      file !== 'enhanced_base.py' &&
      file !== 'enhanced_manager.py' &&
      file !== 'logging_system.py' &&
      file !== 'node_bridge.py' &&
      file !== 'queue_manager.py'
    )
    
    const scrapers = await Promise.all(
      pythonFiles.map(async (file) => {
        const filePath = path.join(scrapersPath, file)
        const stats = await fs.stat(filePath)
        const content = await fs.readFile(filePath, 'utf-8')
        
        // Extract basic info from file
        const name = file.replace('.py', '')
        const displayName = name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        
        // Simple version - just use 'filesystem'
        let version = 'filesystem'
        
        // Extract capabilities
        const capabilities = []
        if (content.includes('requests.get') || content.includes('urllib')) capabilities.push('scrape')
        if (content.includes('BeautifulSoup') || content.includes('lxml')) capabilities.push('parse')
        if (content.includes('download') || content.includes('pdf')) capabilities.push('download')
        if (content.includes('extract')) capabilities.push('extract')
        
        return {
          name,
          displayName,
          filePath: file,
          version,
          description: `${displayName} scraper`,
          estimatedPages: Math.floor(Math.random() * 50) + 10, // Mock data
          estimatedDocuments: Math.floor(Math.random() * 200) + 50, // Mock data
          fileSize: stats.size,
          lastModified: stats.mtime.toISOString(),
          capabilities,
          metadata: {
            author: 'System',
            created: stats.birthtime.toISOString(),
            dependencies: [],
          }
        }
      })
    )
    
    // Get summary statistics
    const stats = {
      total: scrapers.length,
      filesystem: scrapers.length,
      totalSize: scrapers.reduce((sum, s) => sum + (s.fileSize || 0), 0),
      averageSize: scrapers.length > 0 
        ? Math.round(scrapers.reduce((sum, s) => sum + (s.fileSize || 0), 0) / scrapers.length)
        : 0
    }
    
    return NextResponse.json({
      data: scrapers,
      stats,
      message: `Found ${scrapers.length} scrapers in filesystem`,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Unexpected error in GET /api/scrapers/filesystem:', error)
    return NextResponse.json(
      { 
        error: 'Failed to retrieve filesystem scrapers',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}