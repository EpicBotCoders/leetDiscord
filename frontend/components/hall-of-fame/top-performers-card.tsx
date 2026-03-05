"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface TopPerformer {
  userId: string
  username: string
  totalProblems: number
  problemsByDifficulty: { Easy: number; Medium: number; Hard: number }
  lastSubmissionDate: string
  successRate: number
}

interface TopPerformersCardProps {
  performers: TopPerformer[]
  loading?: boolean
}

const medals = ["🥇", "🥈", "🥉"]

function formatDate(dateStr: string) {
  if (!dateStr) return "N/A"
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function TopPerformersCard({ performers, loading = false }: TopPerformersCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">👑</span>
          Top Performers
        </CardTitle>
        <CardDescription>
          Ranked by total problems solved
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-secondary/20 p-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 animate-pulse rounded-full bg-secondary" />
                  <div className="space-y-1">
                    <div className="h-3 w-24 animate-pulse rounded bg-secondary" />
                    <div className="h-2 w-32 animate-pulse rounded bg-secondary" />
                  </div>
                </div>
                <div className="h-6 w-12 animate-pulse rounded bg-secondary" />
              </div>
            ))
          ) : performers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">No performers found</p>
            </div>
          ) : (
            performers.map((performer, index) => (
              <div
                key={performer.userId}
                className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3 transition-all hover:border-primary/40"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold w-6">
                      {index < 3 ? medals[index] : `#${index + 1}`}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{performer.username}</span>
                      <span className="text-xs text-muted-foreground">
                        Last solved: {formatDate(performer.lastSubmissionDate)}
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-primary">{performer.totalProblems}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-200">
                    E: {performer.problemsByDifficulty.Easy}
                  </Badge>
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-200">
                    M: {performer.problemsByDifficulty.Medium}
                  </Badge>
                  <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-200">
                    H: {performer.problemsByDifficulty.Hard}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
