import HallOfFameContent from "./content"

// Generate static params for all guilds
export async function generateStaticParams() {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
    const response = await fetch(`${apiUrl}/api/guilds`, {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      return []
    }

    const guilds = await response.json()
    return guilds.map((guild: { guildId: string }) => ({
      guildId: guild.guildId,
    }))
  } catch (error) {
    // If API is unavailable during build, return at least one default param
    // The page will be generated on-demand for other guild IDs
    return [{ guildId: 'default' }]
  }
}

export default function HallOfFamePage() {
  return <HallOfFameContent />
}
