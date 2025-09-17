import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Allow larger body size for upload endpoints
  if (request.nextUrl.pathname.startsWith('/api/documents/upload')) {
    // The middleware runs before the body is parsed, so we can't check size here
    // But we can set headers to indicate this is a file upload route
    const response = NextResponse.next()
    response.headers.set('x-upload-route', 'true')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}