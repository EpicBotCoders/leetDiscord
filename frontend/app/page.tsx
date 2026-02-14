import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { LiveStats } from "@/components/live-stats"
import { Features } from "@/components/features"
import { CtaSection } from "@/components/cta-section"
import { Footer } from "@/components/footer"

export default function Page() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <LiveStats />
      <Features />
      <CtaSection />
      <Footer />
    </main>
  )
}
