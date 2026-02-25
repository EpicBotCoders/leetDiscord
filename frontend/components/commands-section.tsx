"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"
import { CommandCard } from "./command-card"

interface Command {
  name: string
  description: string
  category: string
  options?: Array<any>
  adminOnly?: boolean
  hidden?: boolean
}

interface CommandsSectionProps {
  commands: Command[]
}

export function CommandsSection({ commands }: CommandsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // Get unique visible categories
  const categories = useMemo(() => {
    const cats = new Set<string>()
    commands.forEach((cmd) => {
      if (!cmd.hidden) {
        cats.add(cmd.category)
      }
    })
    return Array.from(cats).sort()
  }, [commands])

  // Filter commands
  const filteredCommands = useMemo(() => {
    return commands.filter((cmd) => {
      if (cmd.hidden) return false

      const matchesSearch = cmd.name
        .toLowerCase()
        .includes(searchQuery.toLowerCase())

      const matchesCategory =
        !selectedCategory || cmd.category === selectedCategory

      return matchesSearch && matchesCategory
    })
  }, [commands, searchQuery, selectedCategory])

  // Group by category
  const groupedCommands = useMemo(() => {
    const grouped: Record<string, Command[]> = {}
    filteredCommands.forEach((cmd) => {
      if (!grouped[cmd.category]) {
        grouped[cmd.category] = []
      }
      grouped[cmd.category].push(cmd)
    })
    return grouped
  }, [filteredCommands])

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Search and Filter */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-secondary/20 py-3 pl-10 pr-4 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Category Pills */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                selectedCategory === null
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  selectedCategory === category
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {Object.keys(groupedCommands).length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
            <p className="text-muted-foreground">
              No commands found matching your search.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((category) => {
              const cmds = groupedCommands[category]
              if (!cmds) return null
              return (
                <div key={category}>
                  <h2 className="mb-4 text-lg font-semibold text-foreground">
                    {category}
                  </h2>
                  <div className="space-y-3">
                    {cmds.map((cmd) => (
                      <CommandCard key={cmd.name} {...cmd} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
