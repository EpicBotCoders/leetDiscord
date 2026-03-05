"use client"

import { Trophy, Users, Zap } from "lucide-react"

interface StatsSummaryProps {
  totalProblems: number
  totalSolvers: number
  averageProblemsPerUser: number
  loading?: boolean
}

export function StatsSummary({
  totalProblems,
  totalSolvers,
  averageProblemsPerUser,
  loading = false,
}: StatsSummaryProps) {
  const stats = [
    {
      icon: Trophy,
      label: "Total Problems",
      value: totalProblems,
      subtext: "Across all members",
    },
    {
      icon: Users,
      label: "Total Solvers",
      value: totalSolvers,
      subtext: "Active members",
    },
    {
      icon: Zap,
      label: "Average Per User",
      value: averageProblemsPerUser.toFixed(1),
      subtext: "Per member average",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {stats.map((stat, index) => {
        const Icon = stat.icon
        return (
          <div
            key={index}
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </span>
            {loading ? (
              <div className="h-8 w-16 animate-pulse rounded bg-secondary" />
            ) : (
              <>
                <span className="text-3xl font-bold text-foreground">{stat.value}</span>
                <span className="text-xs text-muted-foreground">{stat.subtext}</span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
