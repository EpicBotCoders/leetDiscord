// Generate static params for all guilds
export async function generateStaticParams() {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/api/guilds`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.warn('[v0] Failed to fetch guilds for static generation')
      return []
    }

    const guilds = await response.json()
    return guilds.map((guild: { guildId: string }) => ({
      guildId: guild.guildId,
    }))
  } catch (error) {
    console.warn('[v0] Error generating static params:', error)
    return []
  }
}

import HallOfFameContent from "./content"

export default function HallOfFamePage() {
  return <HallOfFameContent />
}
