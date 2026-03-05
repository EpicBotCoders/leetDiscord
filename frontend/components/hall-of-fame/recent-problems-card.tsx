"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Clock } from "lucide-react"

interface RecentProblem {
  problemId: string
  problemTitle: string
  difficulty: "Easy" | "Medium" | "Hard"
  solver: string
  userId: string
  submissionTime: string
  isRecent: boolean
}

interface RecentProblemsCardProps {
  problems: RecentProblem[]
  loading?: boolean
}

function getDifficultyColor(difficulty: string) {
  switch (difficulty) {
    case "Easy":
      return "bg-green-100 text-green-900"
    case "Medium":
      return "bg-yellow-100 text-yellow-900"
    case "Hard":
      return "bg-red-100 text-red-900"
    default:
      return "bg-slate-100 text-slate-900"
  }
}

function formatTimeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffTime / (1000 * 60))
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60))
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export function RecentProblemsCard({ problems, loading = false }: RecentProblemsCardProps) {
  const sortedProblems = [...problems].sort(
    (a, b) => new Date(b.submissionTime).getTime() - new Date(a.submissionTime).getTime()
  )

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-blue-500" />
          Recently Solved
        </CardTitle>
        <CardDescription>
          Latest problems solved
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3">
                <div className="h-4 w-32 animate-pulse rounded bg-secondary" />
                <div className="flex gap-2">
                  <div className="h-6 w-16 animate-pulse rounded bg-secondary" />
                  <div className="h-6 w-20 animate-pulse rounded bg-secondary" />
                </div>
              </div>
            ))
          ) : sortedProblems.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">No recent problems found</p>
            </div>
          ) : (
            sortedProblems.map((problem) => (
              <div
                key={`${problem.problemId}-${problem.userId}-${problem.submissionTime}`}
                className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3 transition-all hover:border-primary/40 hover:bg-secondary/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{problem.problemTitle}</p>
                    <p className="text-sm text-muted-foreground">by {problem.solver}</p>
                  </div>
                  {problem.isRecent && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700 whitespace-nowrap">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
                      Live
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getDifficultyColor(problem.difficulty)}>
                    {problem.difficulty}
                  </Badge>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(problem.submissionTime)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
