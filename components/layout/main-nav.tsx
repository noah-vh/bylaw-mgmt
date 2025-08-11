"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, Search, FileText, Settings, Menu, HelpCircle, Zap, BarChart3, Cog, Home } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

const navigationItems = [
  {
    title: "Home",
    href: "/",
    description: "Bylaw portal dashboard",
    icon: Home,
  },
  {
    title: "Search",
    href: "/search",
    description: "Search through municipal bylaws and documents",
    icon: Search,
  },
  {
    title: "Municipalities",
    href: "/municipalities",
    description: "Browse municipalities and their bylaws",
    icon: Building2,
  },
  {
    title: "Documents",
    href: "/documents",
    description: "Browse and manage bylaw documents",
    icon: FileText,
    items: [
      {
        title: "All Documents",
        href: "/documents",
        description: "View all bylaw documents",
      },
      {
        title: "Recent Updates",
        href: "/documents/recent",
        description: "Recently updated documents",
      },
      {
        title: "Categories",
        href: "/documents/categories",
        description: "Browse documents by category",
      },
    ],
  },
]

interface MainNavProps {
  className?: string
}

export function MainNav({ className }: MainNavProps) {
  const pathname = usePathname()

  return (
    <div className={cn("flex items-center space-x-4 lg:space-x-6", className)}>
      <Link href="/" className="flex items-center space-x-2">
        <Building2 className="h-6 w-6" />
        <span className="hidden font-bold sm:inline-block">
          Bylaw Portal
        </span>
      </Link>

      <NavigationMenu className="hidden md:flex">
        <NavigationMenuList>
          {navigationItems.map((item) => (
            <NavigationMenuItem key={item.href}>
              {item.items ? (
                <>
                  <NavigationMenuTrigger
                    className={cn(
                      pathname.startsWith(item.href) && pathname !== "/" 
                        ? "bg-accent text-accent-foreground" 
                        : "",
                      "flex items-center"
                    )}
                    onClick={(e) => {
                      e.preventDefault()
                      window.location.href = item.href
                    }}
                  >
                    {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                    {item.title}
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      {item.items.map((subItem) => (
                        <li key={subItem.href}>
                          <NavigationMenuLink asChild>
                            <Link
                              href={subItem.href}
                              className={cn(
                                "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
                                pathname === subItem.href
                                  ? "bg-accent text-accent-foreground"
                                  : ""
                              )}
                            >
                              <div className="text-sm font-medium leading-none">
                                {subItem.title}
                              </div>
                              <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
                                {subItem.description}
                              </p>
                            </Link>
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </>
              ) : (
                <NavigationMenuLink asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      pathname === item.href
                        ? "bg-accent text-accent-foreground"
                        : ""
                    )}
                  >
                    <span className="flex items-center">
                      {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                      {item.title}
                    </span>
                  </Link>
                </NavigationMenuLink>
              )}
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    </div>
  )
}

interface MobileNavProps {
  className?: string
}

export function MobileNav({ className }: MobileNavProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const pathname = usePathname()

  return (
    <div className={cn("md:hidden", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 w-9"
      >
        <Menu className="h-4 w-4" />
        <span className="sr-only">Toggle navigation menu</span>
      </Button>

      {isOpen && (
        <div className="absolute top-16 left-0 right-0 z-50 bg-background border-b shadow-lg">
          <nav className="container py-4">
            <div className="flex flex-col space-y-2">
              {navigationItems.map((item) => (
                <div key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center space-x-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      pathname === item.href
                        ? "bg-accent text-accent-foreground"
                        : ""
                    )}
                    onClick={() => setIsOpen(false)}
                  >
                    {item.icon && <item.icon className="h-4 w-4" />}
                    <span>{item.title}</span>
                  </Link>
                  {item.items && (
                    <div className="ml-6 space-y-1">
                      {item.items.map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={cn(
                            "block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                            pathname === subItem.href
                              ? "bg-accent text-accent-foreground"
                              : ""
                          )}
                          onClick={() => setIsOpen(false)}
                        >
                          {subItem.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}