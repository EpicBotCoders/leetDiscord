"use client"

import { ChevronDown } from "lucide-react"
import { useState } from "react"

interface CommandOption {
  name: string
  description: string
  required?: boolean
  type?: number
  choices?: Array<{ name: string; value: string | number }>
  autocomplete?: boolean
  min_value?: number
  max_value?: number
}

interface CommandCardProps {
  name: string
  description: string
  category: string
  options?: CommandOption[]
  adminOnly?: boolean
  hidden?: boolean
}

export function CommandCard({
  name,
  description,
  category,
  options = [],
  adminOnly,
  hidden,
}: CommandCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getCategoryColor = (cat: string) => {
    const colors: Record<string, string> = {
      Monitoring: "bg-blue-500/10 text-blue-400 border-blue-500/30",
      "User Management": "bg-purple-500/10 text-purple-400 border-purple-500/30",
      Setup: "bg-green-500/10 text-green-400 border-green-500/30",
      Scheduling: "bg-orange-500/10 text-orange-400 border-orange-500/30",
      Notifications: "bg-pink-500/10 text-pink-400 border-pink-500/30",
      Information: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
      Admin: "bg-red-500/10 text-red-400 border-red-500/30",
      Info: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    }
    return colors[cat] || "bg-secondary text-muted-foreground border-border"
  }

  return (
    <div className="rounded-lg border border-border bg-card transition-all hover:border-primary/50 hover:bg-card/80">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 text-left transition-colors hover:bg-secondary/20"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <code className="font-mono text-sm font-bold text-primary">
                /{name}
              </code>
              {adminOnly && (
                <span className="rounded px-2 py-0.5 bg-red-500/10 text-red-400 text-xs font-medium border border-red-500/30">
                  Admin
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">{description}</p>
            <span
              className={`inline-block rounded-md border px-2.5 py-1 text-xs font-medium ${getCategoryColor(
                category
              )}`}
            >
              {category}
            </span>
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </button>

      {isExpanded && options.length > 0 && (
        <div className="border-t border-border/50 bg-secondary/30 px-6 py-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Options
            </p>
            {options.map((option, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs text-primary">
                    {option.name}
                  </code>
                  {option.required && (
                    <span className="rounded px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-medium">
                      required
                    </span>
                  )}
                  {option.autocomplete && (
                    <span className="rounded px-1.5 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-medium">
                      autocomplete
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {option.description}
                </p>
                {option.choices && option.choices.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {option.choices.map((choice) => (
                      <span
                        key={choice.value}
                        className="rounded px-2 py-1 bg-background text-[10px] font-mono text-muted-foreground border border-border/50"
                      >
                        {choice.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
