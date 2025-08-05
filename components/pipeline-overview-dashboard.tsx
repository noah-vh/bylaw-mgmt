"use client"

import React from "react"
import { 
  Activity, 
  Database, 
  FileSearch, 
  Brain, 
  Download, 
  CheckCircle, 
  AlertTriangle, 
  Clock,
  Zap,
  BarChart3,
  TrendingUp,
  Server,
  HardDrive,
  Cpu,
  MemoryStick
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ProcessingStatusBadge, ProcessingJobCard } from "@/components/processing-status"
import type { ProcessingJob } from "@/components/processing-status"
import { useDashboard, useSystemHealth } from "@/hooks/use-dashboard"
import { format } from "date-fns"

interface PipelineMetrics {
  totalOperations: number
  completedToday: number
  successRate: number
  averageProcessingTime: number
  documentsAtStage: {
    scraped: number
    extracted: number
    analyzed: number
    completed: number
  }
  systemLoad: {
    cpu: number
    memory: number
    disk: number
  }
  throughput: {
    documentsPerHour: number
    operationsPerDay: number
  }
}

interface PipelineOverviewDashboardProps {
  className?: string
  showControls?: boolean
  activeJobs?: ProcessingJob[]
}

export function PipelineOverviewDashboard({ 
  className = "",
  showControls = true,
  activeJobs = []
}: PipelineOverviewDashboardProps) {
  const { quickStats, isLoading } = useDashboard()
  const { data: systemHealth } = useSystemHealth()

  // Mock pipeline metrics - in a real app, this would come from your API
  const pipelineMetrics: PipelineMetrics = {
    totalOperations: 1247,
    completedToday: 34,
    successRate: 94.5,
    averageProcessingTime: 12.3,
    documentsAtStage: {
      scraped: 8934,
      extracted: 7823,
      analyzed: 6912,
      completed: 6543
    },
    systemLoad: {
      cpu: systemHealth?.cpu || 45,
      memory: systemHealth?.memory || 62,
      disk: systemHealth?.disk || 78
    },
    throughput: {
      documentsPerHour: 125,
      operationsPerDay: 2840
    }
  }

  if (isLoading) {
    return (
      <div className={`space-y-6 ${className}`}>
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
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pipeline Overview</h2>
          <p className="text-muted-foreground">
            System-wide status and performance metrics
          </p>
        </div>
        {showControls && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        )}
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Operations"
          value={activeJobs.filter(job => job.status === 'running').length}
          description="Currently processing"
          icon={<Activity className="h-4 w-4" />}
          trend="+2 from yesterday"
          variant="default"
        />
        <MetricCard
          title="Success Rate"
          value={`${pipelineMetrics.successRate}%`}
          description="Last 24 hours"
          icon={<CheckCircle className="h-4 w-4" />}
          trend="+1.2% from last week"
          variant="success"
        />
        <MetricCard
          title="Avg Processing Time"
          value={`${pipelineMetrics.averageProcessingTime}m`}
          description="Per document"
          icon={<Clock className="h-4 w-4" />}
          trend="-2.1m improvement"
          variant="info"
        />
        <MetricCard
          title="Throughput"
          value={pipelineMetrics.throughput.documentsPerHour}
          description="Documents/hour"
          icon={<TrendingUp className="h-4 w-4" />}
          trend="+15% this week"
          variant="success"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Pipeline Stages */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Document Pipeline Stages
            </CardTitle>
            <CardDescription>
              Documents at each stage of the processing pipeline
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <PipelineStage
                name="Scraped"
                count={pipelineMetrics.documentsAtStage.scraped}
                icon={<Download className="h-4 w-4" />}
                color="blue"
              />
              <PipelineStage
                name="Extracted"
                count={pipelineMetrics.documentsAtStage.extracted}
                icon={<FileSearch className="h-4 w-4" />}
                color="orange"
              />
              <PipelineStage
                name="Analyzed"
                count={pipelineMetrics.documentsAtStage.analyzed}
                icon={<Brain className="h-4 w-4" />}
                color="purple"
              />
              <PipelineStage
                name="Completed"
                count={pipelineMetrics.documentsAtStage.completed}
                icon={<CheckCircle className="h-4 w-4" />}
                color="green"
              />
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>Current resource utilization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SystemMetric
              name="CPU Usage"
              value={pipelineMetrics.systemLoad.cpu}
              icon={<Cpu className="h-4 w-4" />}
            />
            <SystemMetric
              name="Memory Usage"
              value={pipelineMetrics.systemLoad.memory}
              icon={<MemoryStick className="h-4 w-4" />}
            />
            <SystemMetric
              name="Disk Usage"
              value={pipelineMetrics.systemLoad.disk}
              icon={<HardDrive className="h-4 w-4" />}
            />
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">System Status</span>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Healthy
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Operations */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Active Operations
            </CardTitle>
            <CardDescription>
              Currently running processing jobs and their progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {activeJobs.slice(0, 6).map((job) => (
                <ProcessingJobCard
                  key={job.id}
                  job={job}
                  showMunicipality={true}
                  className="h-full"
                />
              ))}
            </div>
            {activeJobs.length > 6 && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm">
                  View All {activeJobs.length} Operations
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Performance Trends */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance Summary
          </CardTitle>
          <CardDescription>
            Key performance indicators and trends
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {pipelineMetrics.totalOperations.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Total Operations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {pipelineMetrics.completedToday}
              </div>
              <div className="text-sm text-muted-foreground">Completed Today</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {pipelineMetrics.throughput.operationsPerDay.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Daily Capacity</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface MetricCardProps {
  title: string
  value: string | number
  description: string
  icon: React.ReactNode
  trend?: string
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

function MetricCard({ 
  title, 
  value, 
  description, 
  icon, 
  trend, 
  variant = 'default' 
}: MetricCardProps) {
  const variantClasses = {
    default: 'text-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    error: 'text-red-600',
    info: 'text-blue-600'
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`${variantClasses[variant]}`}>
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className="text-2xl font-bold">{value}</div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{description}</p>
        {trend && (
          <p className="text-xs text-green-600 mt-1">{trend}</p>
        )}
      </CardContent>
    </Card>
  )
}

interface PipelineStageProps {
  name: string
  count: number
  icon: React.ReactNode
  color: 'blue' | 'orange' | 'purple' | 'green'
}

function PipelineStage({ name, count, icon, color }: PipelineStageProps) {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50',
    orange: 'text-orange-600 bg-orange-50',
    purple: 'text-purple-600 bg-purple-50',
    green: 'text-green-600 bg-green-50'
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-sm text-muted-foreground">Documents</div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-lg font-bold">{count.toLocaleString()}</div>
      </div>
    </div>
  )
}

interface SystemMetricProps {
  name: string
  value: number
  icon: React.ReactNode
}

function SystemMetric({ name, value, icon }: SystemMetricProps) {
  const getVariant = (value: number) => {
    if (value >= 90) return 'destructive'
    if (value >= 75) return 'warning'
    return 'default'
  }

  const getColor = (value: number) => {
    if (value >= 90) return 'bg-red-500'
    if (value >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{name}</span>
        </div>
        <span className="font-medium">{value}%</span>
      </div>
      <Progress value={value} className="h-2" />
    </div>
  )
}