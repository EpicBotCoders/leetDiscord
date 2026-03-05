import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Hall of Fame — LeetDiscord',
  description: 'View the Hall of Fame leaderboard showcasing top performers, longest streaks, and recent achievements.',
}

export default function HallOfFameLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
