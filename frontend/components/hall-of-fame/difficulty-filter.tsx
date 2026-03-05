"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"

interface DifficultyFilterProps {
  selectedDifficulty: string
  onDifficultyChange: (difficulty: string) => void
}

const DIFFICULTY_OPTIONS = [
  { value: "All", label: "All", color: "bg-slate-100 text-slate-900 hover:bg-slate-200" },
  { value: "Easy", label: "Easy", color: "bg-green-100 text-green-900 hover:bg-green-200" },
  { value: "Medium", label: "Medium", color: "bg-yellow-100 text-yellow-900 hover:bg-yellow-200" },
  { value: "Hard", label: "Hard", color: "bg-red-100 text-red-900 hover:bg-red-200" },
]

export function DifficultyFilter({ selectedDifficulty, onDifficultyChange }: DifficultyFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm font-semibold text-foreground">Filter by Difficulty:</span>
      <div className="flex flex-wrap gap-2">
        {DIFFICULTY_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onDifficultyChange(option.value)}
            className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
              selectedDifficulty === option.value
                ? `${option.color} ring-2 ring-offset-2 ring-primary`
                : `${option.color} opacity-60`
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
