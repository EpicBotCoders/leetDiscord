import {
  BarChart3,
  Bell,
  Trophy,
  Users,
  Zap,
  Shield,
} from "lucide-react"

const features = [
  {
    icon: BarChart3,
    title: "Activity Tracking",
    description:
      "Automatically track LeetCode submissions, streaks, and problem counts for every registered user in your server.",
  },
  {
    icon: Trophy,
    title: "Leaderboards",
    description:
      "Rank members by weekly or all-time problem count. Fuel competition and keep your community motivated.",
  },
  {
    icon: Bell,
    title: "Live Notifications",
    description:
      "Get real-time alerts when members solve problems. Celebrate wins and keep the momentum going.",
  },
  {
    icon: Users,
    title: "Multi-User Support",
    description:
      "Register unlimited users per server. Everyone can link their LeetCode profile in seconds.",
  },
  {
    icon: Zap,
    title: "Blazing Fast",
    description:
      "Built on Node.js with optimized caching. Responses are instant, even at scale across thousands of servers.",
  },
  {
    icon: Shield,
    title: "Reliable & Tested",
    description:
      "Backed by MongoDB and covered with Jest tests. Built for uptime and production-grade stability.",
  },
]

export function Features() {
  return (
    <section id="features" className="relative px-6 py-24">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-16 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-primary">
            Features
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Everything your server needs
          </h2>
          <p className="mt-3 max-w-lg mx-auto text-muted-foreground">
            Powerful tools to turn your Discord server into a coding hub.
          </p>
        </div>

        {/* Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative flex flex-col rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/40 hover:bg-secondary/50"
            >
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary/10">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="leading-relaxed text-sm text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
