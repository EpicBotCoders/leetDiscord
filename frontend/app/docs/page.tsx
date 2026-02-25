import { Navbar } from "@/components/navbar"
import { DocsHeader } from "@/components/docs-header"
import { CommandsSection } from "@/components/commands-section"
import { Footer } from "@/components/footer"
import commands from "@/public/commands.json"

export default async function DocsPage() {

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="pt-16">
        <DocsHeader />
        <CommandsSection commands={commands} />
      </div>
      <Footer />
    </main>
  )
}
