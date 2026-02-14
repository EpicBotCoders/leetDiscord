"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  Clock,
  Tag,
  Server,
  Users,
  Circle,
} from "lucide-react"

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  subtext?: string
  highlight?: boolean
}

function StatCard({ icon, label, value, subtext, highlight }: StatCardProps) {
  return (
    <div className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/40 hover:bg-secondary/50">
      {highlight && (
        <div className="absolute -top-px left-1/2 h-px w-1/2 -translate-x-1/2 bg-primary/50" />
      )}
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary/10">
        {icon}
      </div>
      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-3xl font-extrabold tracking-tight text-foreground">
        {value}
      </span>
      {subtext && (
        <span className="text-xs text-muted-foreground">{subtext}</span>
      )}
    </div>
  )
}

export function LiveStats() {
  const [mounted, setMounted] = useState(false)
  const [stats, setStats] = useState({
    guilds: 0,
    users: 0,
    submissions: 0,
    version: '2.2.0'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setMounted(true)

    // Fetch stats
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    // Refresh every 60 seconds
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [])

  if (!mounted) {
    return (
      <section id="stats" className="relative px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Live Dashboard
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Real-Time Bot Stats
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6"
              >
                <div className="h-10 w-10 animate-pulse rounded-xl bg-secondary" />
                <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
                <div className="h-8 w-20 animate-pulse rounded bg-secondary" />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section id="stats" className="relative px-6 py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-12 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Live Dashboard
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Real-Time Bot Stats
          </h2>
          <p className="mt-3 text-muted-foreground">
            Always-on performance. Always-up metrics.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            icon={
              <Circle className="h-5 w-5 fill-primary text-primary animate-pulse_glow" />
            }
            label="Status"
            value="Online"
            subtext="All systems operational"
            highlight
          />

          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="Uptime"
            value="99.9%"
            subtext="Last 30 days"
          />
          <StatCard
            icon={<Tag className="h-5 w-5" />}
            label="Version"
            value={`v${stats.version}`}
            subtext="Stable release"
          />
          <StatCard
            icon={<Server className="h-5 w-5" />}
            label="Guilds"
            value={stats.guilds.toLocaleString()}
            subtext="Active servers"
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Users"
            value={stats.users.toLocaleString()}
            subtext="Registered coders"
          />
          <StatCard
            icon={<Activity className="h-5 w-5" />}
            label="Submissions"
            value={stats.submissions.toLocaleString()}
            subtext="Total solved"
          />
        </div>

        {/* Pulse indicator */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary animate-pulse_glow" />
          <span className="font-mono text-xs text-muted-foreground">
            Stats refresh every 60s
          </span>
        </div>
      </div>
    </section>
  )
}
