"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { HomeIcon, MegaphoneIcon, FlagIcon, UserIcon } from "@heroicons/react/24/outline"

interface Props {
  currentFilter: string
  onFilterChange?: (f: string) => void
  className?: string
}

const CreatePostFilterBar: React.FC<Props> = ({ currentFilter, onFilterChange, className }) => {
  const [visible, setVisible] = useState<boolean>(true) // Default to visible for demo

  // Mock auth state inline to avoid module loading issues
  const currentUser = { role: "admin" } // Mock admin user for demo
  const isAdminOrSuperAdmin = currentUser?.role === "admin" || currentUser?.role === "super admin"

  useEffect(() => {
    const handler = () => setVisible((v) => !v)
    window.addEventListener("toggle-filter-bar", handler as EventListener)
    return () => window.removeEventListener("toggle-filter-bar", handler as EventListener)
  }, [])

  const base = [
    { id: "all", label: "All", icon: <HomeIcon className="h-4 w-4" /> },
    { id: "announcements", label: "Announcements", icon: <MegaphoneIcon className="h-4 w-4" /> },
    { id: "yours", label: "Your posts", icon: <UserIcon className="h-4 w-4" /> },
  ]
  const admin = isAdminOrSuperAdmin
    ? [{ id: "reported", label: "Reported", icon: <FlagIcon className="h-4 w-4" /> }]
    : []
  const all = [...base, ...admin]

  const handleClick = (id: string) => {
    if (onFilterChange) onFilterChange(id)
    // Notify feed to set the filter
    window.dispatchEvent(new CustomEvent("set-feed-filter", { detail: { filter: id } }))
  }

  if (!visible) return null

  return (
    <div className={`mt-2 mb-4 px-0 md:px-2 ${className || ""} mobile-filter-bar`}>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none md:hidden" />
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none md:hidden" />

        <div className="flex items-center gap-2 md:gap-3 overflow-x-auto scrollbar-hide scroll-smooth py-3 px-4 md:px-0 snap-x snap-mandatory">
          {all.map((f) => (
            <button
              key={f.id}
              onClick={() => handleClick(f.id)}
              role="button"
              aria-pressed={currentFilter === f.id}
              title={f.label}
              className={`flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 text-sm md:text-base font-semibold rounded-full whitespace-nowrap transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 active:scale-95 snap-start min-w-fit backdrop-blur-sm border ${
                currentFilter === f.id
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25 ring-2 ring-emerald-400/50 focus:ring-emerald-400 border-emerald-400/30 hover:shadow-emerald-500/40 hover:shadow-xl"
                  : "bg-slate-800/60 text-slate-300 hover:bg-slate-700/80 hover:text-white shadow-md hover:shadow-lg border-slate-700/50 hover:border-slate-600/50 focus:ring-slate-400"
              }`}
            >
              <span className="flex-shrink-0 transition-transform duration-200 group-hover:scale-110">{f.icon}</span>
              <span className="inline truncate max-w-[7rem] md:max-w-none font-medium">{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700/50 to-transparent" />
    </div>
  )
}

export default CreatePostFilterBar
