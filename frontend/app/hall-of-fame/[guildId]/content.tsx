"use client"

import { useEffect, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { DifficultyFilter } from "@/components/hall-of-fame/difficulty-filter"
import { StatsSummary } from "@/components/hall-of-fame/stats-summary"
import { TopPerformersCard } from "@/components/hall-of-fame/top-performers-card"
import { StreaksCard } from "@/components/hall-of-fame/streaks-card"
import { RecentProblemsCard } from "@/components/hall-of-fame/recent-problems-card"

interface HallOfFameData {
  guildId: string
  difficultyFilter: string
  stats: {
    totalProblems: number
    totalSolvers: number
    averageProblemsPerUser: number
  }
  topPerformers: any[]
  longestStreaks: any[]
  recentProblems: any[]
  lastUpdated: string
  error?: string
}

export default function HallOfFameContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const guildId = (params.guildId as string) || (searchParams.get("guildId") as string)

  const [difficulty, setDifficulty] = useState("All")
  const [data, setData] = useState<HallOfFameData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHallOfFameData = async () => {
    if (!guildId || guildId === 'default') {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError(null)

      const query = new URLSearchParams()
      if (difficulty !== "All") {
        query.append("difficulty", difficulty)
      } else {
        query.append("difficulty", "All")
      }

      const res = await fetch(`/api/hall-of-fame/${guildId}?${query.toString()}`)

      if (!res.ok) {
        throw new Error(`Failed to fetch hall of fame data: ${res.statusText}`)
      }

      const hallOfFameData = await res.json()
      setData(hallOfFameData)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load hall of fame data"
      setError(message)
      console.error("[v0] Hall of Fame fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch on component mount and when difficulty changes
  useEffect(() => {
    fetchHallOfFameData()
  }, [difficulty, guildId])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchHallOfFameData()
    }, 60000)

    return () => clearInterval(interval)
  }, [difficulty, guildId])

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Hall of Fame
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Server leaderboard showcasing top performers, longest streaks, and recent achievements
          </p>
        </div>

        {/* Difficulty Filter */}
        <div className="mb-8 rounded-lg border border-border bg-card p-4">
          <DifficultyFilter
            selectedDifficulty={difficulty}
            onDifficultyChange={setDifficulty}
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-8 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800">
              <strong>Error:</strong> {error}
            </p>
          </div>
        )}

        {(!guildId || guildId === 'default') && !loading && (
          <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 p-6 text-center">
            <h2 className="text-xl font-semibold text-blue-900 mb-2">Select a Server</h2>
            <p className="text-blue-800">
              Please access the Hall of Fame using a direct link from your Discord server using the <strong>/halloffame</strong> command.
            </p>
          </div>
        )}

        {/* Statistics Summary */}
        <div className="mb-8">
          <h2 className="mb-4 text-2xl font-bold text-foreground">Overview</h2>
          <StatsSummary
            totalProblems={data?.stats.totalProblems ?? 0}
            totalSolvers={data?.stats.totalSolvers ?? 0}
            averageProblemsPerUser={data?.stats.averageProblemsPerUser ?? 0}
            loading={loading}
          />
        </div>

        {/* Main Leaderboards */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Top Performers */}
          <TopPerformersCard
            performers={data?.topPerformers ?? []}
            loading={loading}
          />

          {/* Streaks */}
          <StreaksCard
            streaks={data?.longestStreaks ?? []}
            loading={loading}
          />
        </div>

        {/* Recently Solved Problems */}
        <div className="mt-8">
          <RecentProblemsCard
            problems={data?.recentProblems ?? []}
            loading={loading}
          />
        </div>

        {/* Last Updated */}
        {data?.lastUpdated && (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Last updated: {new Date(data.lastUpdated).toLocaleTimeString()}
            {loading && " (refreshing...)"}
          </div>
        )}
      </div>
    </main>
  )
}
