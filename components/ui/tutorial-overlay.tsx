"use client"

import { useState, useEffect } from "react"
import { X, ChevronLeft, ChevronRight, Lightbulb } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface TutorialStep {
  title: string
  description: string
  target?: string
  position?: "top" | "bottom" | "left" | "right"
}

interface TutorialOverlayProps {
  steps: TutorialStep[]
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
}

export function TutorialOverlay({ steps, isOpen, onClose, onComplete }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0)
    }
  }, [isOpen])

  if (!isOpen || steps.length === 0) return null

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onComplete?.()
      onClose()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const currentStepData = steps[currentStep]

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg">{currentStepData.title}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {currentStep + 1} of {steps.length}
              </Badge>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <CardDescription className="text-sm leading-relaxed">
            {currentStepData.description}
          </CardDescription>
          
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            
            <div className="flex gap-1">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full ${
                    index === currentStep 
                      ? 'bg-primary' 
                      : index < currentStep 
                        ? 'bg-primary/50' 
                        : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            
            <Button size="sm" onClick={handleNext}>
              {currentStep === steps.length - 1 ? (
                'Complete'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Hook for managing tutorial state
export function useTutorial(tutorialKey: string) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem(`tutorial-${tutorialKey}`)
    if (!hasSeenTutorial) {
      // Small delay to let the page load
      const timer = setTimeout(() => setIsOpen(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [tutorialKey])

  const completeTutorial = () => {
    localStorage.setItem(`tutorial-${tutorialKey}`, 'completed')
    setIsOpen(false)
  }

  const resetTutorial = () => {
    localStorage.removeItem(`tutorial-${tutorialKey}`)
    setIsOpen(true)
  }

  return {
    isOpen,
    closeTutorial: () => setIsOpen(false),
    completeTutorial,
    resetTutorial,
    startTutorial: () => setIsOpen(true)
  }
}