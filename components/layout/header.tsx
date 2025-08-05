import Link from "next/link"
import { HelpCircle } from "lucide-react"
import { MainNav, MobileNav } from "./main-nav"
import { ThemeToggle } from "./theme-toggle"
import { Button } from "@/components/ui/button"
import { HelpTooltip } from "@/components/ui/help-tooltip"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <MainNav />
        <MobileNav />
        
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/help">
              <HelpCircle className="h-4 w-4" />
              <span className="sr-only">Help</span>
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}