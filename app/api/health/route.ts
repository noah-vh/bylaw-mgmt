import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabase'

// GET /api/health - System health check
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    // Check database connectivity
    const { data, error } = await supabase
      .from('municipalities')
      .select('id')
      .limit(1)

    const dbHealthy = !error && data !== null
    const responseTime = Date.now() - startTime

    if (!dbHealthy) {
      return NextResponse.json(
        {
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            database: {
              status: 'down',
              error: error?.message || 'Unknown database error',
              responseTime
            }
          }
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: {
          status: 'up',
          responseTime
        }
      },
      version: process.env.npm_package_version || '1.0.0'
    })
  } catch (error) {
    console.error('Health check error:', error)
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed'
      },
      { status: 503 }
    )
  }
}