"use client"

import { Suspense } from "react"
import HallOfFameContent from "./[guildId]/content"

export default function HallOfFamePage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>}>
            <HallOfFameContent />
        </Suspense>
    )
}
