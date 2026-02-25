import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Commands - LeetDiscord',
  description: 'Complete reference of all LeetDiscord bot commands.',
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
