"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Flame } from "lucide-react"

interface StreakUser {
  userId: string
  username: string
  currentStreak: number
  bestStreak: number
  lastSubmissionDate: string | null
}

interface StreaksCardProps {
  streaks: StreakUser[]
  loading?: boolean
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "No submissions"
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return `${diffDays} days ago`
}

export function StreaksCard({ streaks, loading = false }: StreaksCardProps) {
  // Sort by current streak descending
  const sortedStreaks = [...streaks].sort((a, b) => b.currentStreak - a.currentStreak)

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" />
          Longest Streaks
        </CardTitle>
        <CardDescription>
          Current vs. best streak
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
                <div className="flex gap-2">
                  <div className="h-6 w-12 animate-pulse rounded bg-secondary" />
                  <div className="h-6 w-12 animate-pulse rounded bg-secondary" />
                </div>
              </div>
            ))
          ) : sortedStreaks.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground text-sm">No streaks found</p>
            </div>
          ) : (
            sortedStreaks.map((user) => {
              const streakColor =
                user.currentStreak >= 30
                  ? "text-red-600 bg-red-500/10"
                  : user.currentStreak >= 14
                    ? "text-orange-600 bg-orange-500/10"
                    : user.currentStreak >= 7
                      ? "text-yellow-600 bg-yellow-500/10"
                      : "text-green-600 bg-green-500/10"

              return (
                <div
                  key={user.userId}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 p-3 transition-all hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{user.username}</span>
                      <span className="text-xs text-muted-foreground">
                        Last solved: {formatDate(user.lastSubmissionDate)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 ${streakColor}`}>
                      <Flame className="h-4 w-4" />
                      <span className="font-bold">{user.currentStreak} day</span>
                      <span className="text-xs opacity-75">streak</span>
                    </div>
                    <Badge variant="outline" className="bg-slate-500/10 text-slate-700 border-slate-200">
                      Best: {user.bestStreak}
                    </Badge>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}
