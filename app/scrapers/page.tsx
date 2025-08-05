"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useScrapers } from "@/hooks/use-scrapers"
import { useMunicipalities } from "@/hooks/use-municipalities"
import { MunicipalityProcessingTab } from "@/components/municipality-processing-tab"
import { ScraperManagementTab } from "@/components/scraper-management-tab"
import { 
  Activity, 
  Server, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  Database,
  Wifi,
  WifiOff
} from "lucide-react"

export default function ScrapersPage() {
  const [activeTab, setActiveTab] = useState("processing")
  
  // Fetch scrapers and municipalities data
  const { 
    data: scrapers = [], 
    isLoading: isLoadingScrapers,
    error: scrapersError 
  } = useScrapers()
  
  const { 
    data: municipalitiesData,
    isLoading: isLoadingMunicipalities,
    error: municipalitiesError 
  } = useMunicipalities({ limit: 100 })

  const municipalities = municipalitiesData?.data || []

  // Calculate system status
  const totalScrapers = scrapers.length
  const availableScrapers = scrapers.filter(s => s.status === 'available').length
  const busyScrapers = scrapers.filter(s => s.status === 'busy').length
  const errorScrapers = scrapers.filter(s => s.status === 'error').length
  const offlineScrapers = scrapers.filter(s => s.status === 'offline').length

  const totalMunicipalities = municipalities.length
  const activeMunicipalities = municipalities.filter(m => m.schedule_active).length
  const runningJobs = municipalities.filter(m => m.status === 'running').length

  // Connection status
  const isConnected = !isLoadingScrapers && !scrapersError
  const hasErrors = scrapersError || municipalitiesError || errorScrapers > 0

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header with System Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Scraper Management</h1>
            <p className="text-muted-foreground">
              Manage municipality processing and scraper operations
            </p>
          </div>
          
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-emerald-500" />
                <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
                  Connected
                </Badge>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-red-500" />
                <Badge variant="outline" className="text-red-700 border-red-200 bg-red-50">
                  Disconnected
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* System Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Scrapers Status */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Scrapers</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold">{totalScrapers}</p>
                  <Server className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>{availableScrapers} available</span>
                </div>
                {busyScrapers > 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    <Activity className="h-3 w-3 text-blue-500" />
                    <span>{busyScrapers} busy</span>
                  </div>
                )}
                {errorScrapers > 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                    <span>{errorScrapers} error</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Municipalities Status */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Municipalities</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold">{totalMunicipalities}</p>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>{activeMunicipalities} active</span>
                </div>
                {runningJobs > 0 && (
                  <div className="flex items-center gap-1 text-xs">
                    <Activity className="h-3 w-3 text-blue-500" />
                    <span>{runningJobs} running</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* System Health */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">System Health</p>
                <div className="flex items-center gap-2 mt-1">
                  {hasErrors ? (
                    <>
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <Badge variant="destructive" className="text-xs">Issues</Badge>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50">
                        Healthy
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Processing Status */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processing</p>
                <div className="flex items-center gap-2 mt-1">
                  {runningJobs > 0 ? (
                    <>
                      <Activity className="h-5 w-5 text-blue-500" />
                      <Badge variant="outline" className="text-xs text-blue-700 border-blue-200 bg-blue-50">
                        Active
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <Badge variant="outline" className="text-xs">
                        Idle
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Main Tabs Interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger 
            value="processing" 
            className="flex items-center gap-2"
          >
            <Database className="h-4 w-4" />
            Municipality Processing
            {runningJobs > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                {runningJobs}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="management" 
            className="flex items-center gap-2"
          >
            <Server className="h-4 w-4" />
            Scraper Management
            {errorScrapers > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs">
                {errorScrapers}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="processing" className="space-y-4">
          <MunicipalityProcessingTab 
            municipalities={municipalities}
            scrapers={scrapers}
            isLoading={isLoadingMunicipalities}
            error={municipalitiesError}
          />
        </TabsContent>

        <TabsContent value="management" className="space-y-4">
          <ScraperManagementTab 
            scrapers={scrapers}
            municipalities={municipalities}
            isLoading={isLoadingScrapers}
            error={scrapersError}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}