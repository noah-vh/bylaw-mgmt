"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface TestScraperDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  scraper: any
  municipalities: any[]
}

export function TestScraperDialog({ open, onOpenChange, scraper, municipalities }: TestScraperDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Test Scraper</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <p>Scraper testing is currently unavailable.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Scraper: {scraper?.name || 'Unknown'}
          </p>
          <p className="text-sm text-muted-foreground">
            Municipalities: {municipalities?.length || 0} available
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}