import { Terminal, Github, MessageCircle, BookOpen } from "lucide-react"
import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 md:flex-row md:justify-between">
        {/* Logo & credit */}
        <div className="flex flex-col items-center gap-2 md:items-start">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <Terminal className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold text-foreground">LeetDiscord</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Built with care by EpicBotCoders
          </span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6">
          <Link
            href="https://github.com/surajstaabi/leetDiscord"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="GitHub Repository"
          >
            <Github className="h-4 w-4" />
            <span>GitHub</span>
          </Link>
          <Link
            href="https://discord.gg/4t5zg5SV69"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Discord Support Server"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Discord</span>
          </Link>
          <Link
            href="/docs"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Documentation"
          >
            <BookOpen className="h-4 w-4" />
            <span>Docs</span>
          </Link>
        </div>

        {/* Tech stack badges */}
        <div className="flex items-center gap-2">
          {["Node.js", "Discord.js", "MongoDB", "Jest"].map((tech) => (
            <span
              key={tech}
              className="rounded-md border border-border bg-secondary px-2.5 py-1 font-mono text-[10px] font-medium text-muted-foreground"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </footer>
  )
}
