import Link from "next/link"
import { MainNav, MobileNav } from "./main-nav"
import { ThemeToggle } from "./theme-toggle"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <MainNav />
        <MobileNav />
        
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" asChild>
            <Link 
              href="https://chatgpt.com/g/g-6890f891faf48191b4b674c7cd0a0364-ontario-municipal-bylaws-assistant" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              <img 
                src="https://www.svgrepo.com/show/306500/openai.svg" 
                alt="OpenAI Logo"
                width="16" 
                height="16" 
                className="flex-shrink-0 dark:invert"
              />
              <span className="hidden sm:inline">BylawGPT</span>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}