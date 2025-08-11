"use client"

import Link from "next/link"
import { Building2, Search, FileText, Activity, Eye, Star, Settings, Clock, RefreshCw, CheckCircle, AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { HelpTooltip, FeatureHint } from "@/components/ui/help-tooltip"
import { useDashboard } from "@/hooks/use-dashboard"
import { useFavoriteDocuments } from "@/hooks/use-documents"
import { format } from "date-fns"

export default function HomePage() {
  const { stats, recentDocuments, activeJobs, quickStats, isLoading } = useDashboard()
  const { data: favoriteDocuments, isLoading: favoritesLoading } = useFavoriteDocuments()
  
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor and manage municipal bylaw portal activities
            </p>
          </div>
          <div className="text-muted-foreground">
            Loading...
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-muted rounded w-1/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor and manage municipal bylaw portal activities
          </p>
        </div>
      </div>


      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <QuickActionCard
            title="Search Documents"
            description="Find specific bylaws and documents"
            icon={<Search className="h-6 w-6" />}
            href="/search"
          />
          <QuickActionCard
            title="Browse Municipalities"
            description="Manage municipal data sources"
            icon={<Building2 className="h-6 w-6" />}
            href="/municipalities"
          />
          <QuickActionCard
            title="View All Documents"
            description="Browse document collection"
            icon={<FileText className="h-6 w-6" />}
            href="/documents"
          />
        </div>
      </div>



      <div className="grid gap-8 md:grid-cols-2">
        {/* Favorite Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                Favorite Documents
                <HelpTooltip 
                  content="Documents you've starred will appear here for quick access. Star documents by clicking the star icon in document listings or the document viewer."
                  variant="help" 
                />
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/documents?favorites=true">
                  <Eye className="h-4 w-4" />
                  View All
                </Link>
              </Button>
            </CardTitle>
            <CardDescription>
              Your starred documents for quick access
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {favoriteDocuments?.slice(0, 5).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.municipality?.name} • {format(new Date(doc.date_found), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.is_relevant && (
                      <Badge variant="secondary" className="text-xs">
                        Relevant
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      ⭐
                    </Badge>
                  </div>
                </div>
              ))}
              {(!favoriteDocuments || favoriteDocuments.length === 0) && (
                <div className="py-4">
                  <FeatureHint
                    title="No favorites yet"
                    description="Star documents to see them here for quick access. Look for the star icon in document listings."
                    icon={<Star className="h-4 w-4" />}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recently Viewed Documents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Recently Viewed
              <Button variant="ghost" size="sm" asChild>
                <Link href="/documents/recent">
                  <Eye className="h-4 w-4" />
                  View All
                </Link>
              </Button>
            </CardTitle>
            <CardDescription>
              Documents you've recently opened or viewed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentDocuments?.slice(0, 5).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.municipality?.name} • {format(new Date(doc.date_found), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {doc.is_relevant && (
                      <Badge variant="secondary" className="text-xs">
                        Relevant
                      </Badge>
                    )}
                    {doc.is_favorited && (
                      <Badge variant="outline" className="text-xs">
                        ⭐
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {(!recentDocuments || recentDocuments.length === 0) && (
                <div className="py-4">
                  <FeatureHint
                    title="No recent activity"
                    description="Documents you view will appear here for easy access. Try browsing documents or using the search feature."
                    icon={<Eye className="h-4 w-4" />}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}


interface StatsCardProps {
  title: string
  value: number | string
  description: string
  icon: React.ReactNode
  trend?: string
}

function StatsCard({ title, value, description, icon, trend }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">
          {description}
        </p>
        {trend && (
          <p className="text-xs text-muted-foreground mt-1">
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

interface QuickActionCardProps {
  title: string
  description: string
  icon: React.ReactNode
  href: string
}


function QuickActionCard({ title, description, icon, href }: QuickActionCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-6 h-full">
          <div className="flex items-center space-x-4 h-full">
            <div className="text-primary">{icon}</div>
            <div className="flex-1">
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

interface JobStatusBadgeProps {
  status: string
}

function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const variants = {
    pending: { variant: "outline" as const, icon: <Clock className="h-3 w-3" /> },
    running: { variant: "default" as const, icon: <RefreshCw className="h-3 w-3 animate-spin" /> },
    completed: { variant: "secondary" as const, icon: <CheckCircle className="h-3 w-3" /> },
    failed: { variant: "destructive" as const, icon: <AlertCircle className="h-3 w-3" /> },
  }

  const config = variants[status as keyof typeof variants] || variants.pending

  return (
    <Badge variant={config.variant} className="text-xs">
      <span className="flex items-center gap-1">
        {config.icon}
        {status}
      </span>
    </Badge>
  )
}
