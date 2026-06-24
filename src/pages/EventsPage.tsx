"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import MainLayout from "../components/layout/MainLayout"
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  PlusIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon,
} from "@heroicons/react/24/outline"
import { useAuth } from "../contexts/AuthContext"
import {
  type Event,
  type EventCategory,
  createEvent,
  getUpcomingEvents,
  getPastEvents,
  registerForEvent,
  isUserRegisteredForEvent,
  unregisterFromEvent,
  deleteEvent,
} from "../services/eventService"
import { Timestamp } from "firebase/firestore"
import EventCreateModal from "../components/events/EventCreateModal"

// Initialize with empty array
const initialEvents: Event[] = []

const formatDate = (timestamp: Timestamp) => {
  const date = timestamp.toDate()
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const formatTime = (timestamp: Timestamp) => {
  const date = timestamp.toDate()
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
}

const EventCard: React.FC<{
  event: Event
  onClick: (event: Event) => void
  onDelete?: (eventId: string) => void
}> = ({ event, onClick, onDelete }) => {
  const isPast = event.end.toDate() <= Timestamp.now().toDate()
  const { currentUser } = useAuth()
  const canDelete = currentUser && (currentUser.role === "admin" || currentUser.role === "super admin")

  // Add click handler to show event details
  const handleClick = () => {
    onClick(event)
  }

  return (
    <div
      className="group relative bg-gray-900/50 backdrop-blur-sm border border-gray-700/30 rounded-xl overflow-hidden hover:border-green-500/40 hover:bg-gray-800/60 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-green-500/10"
      onClick={handleClick}
    >
      {/* Header with image - slightly smaller */}
      <div className="relative h-40 sm:h-28 md:h-36 lg:h-44 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-105 group-hover:scale-100 transition-transform duration-500"
          style={{ backgroundImage: `url(${event.coverImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />

        {/* Status badge */}
        <div className="absolute top-2 right-2 flex items-center gap-2">
          {isPast ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-900/80 text-red-200 backdrop-blur-sm">
              Past
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-900/80 text-green-200 backdrop-blur-sm">
              Live
            </span>
          )}
          {/* Minimal delete button for admins/super admins */}
          {canDelete && onDelete && (
            <button
              className="p-0.5 rounded hover:bg-red-700/20 text-red-400 hover:text-red-200 transition-all duration-200"
              style={{ minWidth: 0, minHeight: 0, marginLeft: 0 }}
              title="Delete event"
              onClick={(e) => {
                e.stopPropagation()
                if (
                  window.confirm(
                    `Are you sure you want to delete the event '${event.title}'? This action cannot be undone.`,
                  )
                ) {
                  onDelete(event.id)
                }
              }}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Category badge */}
        <div className="absolute bottom-2 left-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/80 text-blue-200 backdrop-blur-sm">
            {event.category}
          </span>
        </div>
      </div>

      {/* Content section */}
      <div className="p-2 sm:p-3 space-y-1 sm:space-y-2">
        {/* Title */}
        <h3 className="font-semibold text-white text-xs sm:text-sm line-clamp-2 group-hover:text-green-300 transition-colors">
          {event.title}
        </h3>

        {/* Meta information in compact grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 sm:gap-1.5 text-xs text-gray-400">
          {/* Date & Time */}
          <div className="flex items-center gap-1">
            <CalendarIcon className="h-2.5 sm:h-3 w-2.5 sm:w-3 text-green-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-gray-300 truncate text-[10px] sm:text-xs">{formatDate(event.start)}</div>
              <div className="text-gray-500 truncate text-[10px] sm:text-xs">
                {formatTime(event.start)} - {formatTime(event.end)}
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="flex items-center gap-1">
            <MapPinIcon className="h-2.5 sm:h-3 w-2.5 sm:w-3 text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-gray-300 truncate text-[10px] sm:text-xs">{event.location}</div>
            </div>
          </div>
        </div>

        {/* Description preview - showing only one line */}
        <p className="text-[10px] sm:text-xs text-gray-500 line-clamp-1 leading-relaxed">{event.description}</p>

        {/* Hover indicator */}
        <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-green-400">
            <span>View details</span>
            <svg className="h-2.5 sm:h-3 w-2.5 sm:w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}

// Default cover images are now imported from EventCreateModal component

// Event creation handled by the imported EventCreateModal component

// Enhanced EventDetailModal component with modern, minimalist design
const EventDetailModal: React.FC<{
  isOpen: boolean
  event: Event | null
  onClose: () => void
  onEventDeleted: () => void
}> = ({ isOpen, event, onClose, onEventDeleted }) => {
  const { currentUser } = useAuth()
  const [isDeleting, setIsDeleting] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Check if current user can delete this event
  const canDeleteEvent =
    currentUser &&
    (currentUser.role === "admin" || currentUser.role === "super admin" || currentUser.id === event?.createdBy)

  // Handle event deletion
  const handleDeleteEvent = async () => {
    if (!event || !currentUser) return

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the event "${event.title}"? This action cannot be undone.`,
    )

    if (!confirmDelete) return

    setIsDeleting(true)
    try {
      await deleteEvent(event.id)
      onEventDeleted() // Callback to refresh the events list
      onClose() // Close the modal
    } catch (error) {
      console.error("Error deleting event:", error)
      alert("Failed to delete event. Please try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "hidden"
    } else {
      document.removeEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "unset"
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.body.style.overflow = "unset"
    }
  }, [isOpen, onClose])

  if (!isOpen || !event) return null

  const isPast = event.end.toDate() <= Timestamp.now().toDate()

  // Calculate event duration
  const startDate = event.start.toDate()
  const endDate = event.end.toDate()
  const durationMs = endDate.getTime() - startDate.getTime()
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60))
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

  // Format date more elegantly
  const formatDateElegant = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  const formatTimeRange = (start: Date, end: Date) => {
    const startTime = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    const endTime = end.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    return `${startTime} - ${endTime}`
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-4 overflow-y-auto">
      <div
        ref={modalRef}
        className="relative bg-white/5 backdrop-blur-md w-full max-w-md mx-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 max-h-[calc(100vh-2rem)] flex flex-col animate-fadeIn"
        style={{
          background: "linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.95) 100%)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Enhanced close button with better X icon visibility */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-gray-900/90 backdrop-blur-sm text-white border border-gray-600/50 hover:bg-red-600/80 hover:border-red-500/60 transition-all duration-300 flex items-center justify-center group shadow-lg hover:shadow-red-500/20"
          aria-label="Close modal"
        >
          <svg
            className="h-5 w-5 group-hover:scale-110 group-hover:rotate-90 transition-all duration-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Delete button - only visible to admins/super admins */}
        {canDeleteEvent && (
          <button
            onClick={handleDeleteEvent}
            disabled={isDeleting}
            className="absolute top-3 right-16 z-10 w-10 h-10 rounded-full bg-gray-900/90 backdrop-blur-sm text-white border border-gray-600/50 hover:bg-red-600/80 hover:border-red-500/60 transition-all duration-300 flex items-center justify-center group shadow-lg hover:shadow-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Delete event"
          >
            <TrashIcon
              className={`h-5 w-5 group-hover:scale-110 transition-all duration-300 ${isDeleting ? "animate-pulse" : ""}`}
            />
          </button>
        )}

        {/* Compact hero section */}
        <div className="relative h-48 sm:h-32 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center scale-105"
            style={{ backgroundImage: `url(${event.coverImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          {/* Compact badges */}
          <div className="absolute top-2 left-2 flex gap-1">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium backdrop-blur-sm ${
                isPast
                  ? "bg-red-500/20 text-red-200 border border-red-500/30"
                  : "bg-green-500/20 text-green-200 border border-green-500/30"
              }`}
            >
              {isPast ? "Past" : "Live"}
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-200 border border-blue-500/30 backdrop-blur-sm">
              {event.category}
            </span>
          </div>

          {/* Compact title */}
          <div className="absolute bottom-0 left-0 right-0 p-3">
            <h2 className="text-lg font-bold text-white leading-tight line-clamp-2">{event.title}</h2>
            {/* Author info */}
            { (event.creatorName || event.creatorRole || event.createdBy) && (
              <p className="text-xs text-gray-300 mt-1">
                By <span className="font-medium text-white">{event.creatorName || event.createdBy}</span>
                {event.creatorRole ? <span className="text-gray-400"> &middot; {event.creatorRole}</span> : null}
              </p>
            )}
          </div>
        </div>

        {/* Compact content */}
        <div className="flex-1 overflow-y-auto mobile-scrollbar-hide">
          <div className="p-3 space-y-3">
            {/* Compact info grid */}
            <div className="grid grid-cols-2 gap-2">
              {/* Date & Time */}
              <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <CalendarIcon className="h-3 w-3 text-green-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-green-300 text-xs font-medium">When</p>
                    <p className="text-white text-xs leading-tight">{formatDateElegant(startDate)}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{formatTimeRange(startDate, endDate)}</p>
                  </div>
                </div>
              </div>

              {/* Location */}
              <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <MapPinIcon className="h-3 w-3 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-blue-300 text-xs font-medium">Where</p>
                    <p className="text-white text-xs leading-tight line-clamp-2">{event.location}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact description */}
            <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
              <div className="flex items-start gap-2 mb-1">
                <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                  <DocumentTextIcon className="h-3 w-3 text-purple-400" />
                </div>
                <p className="text-purple-300 text-xs font-medium">About</p>
              </div>
              <div className="ml-7">
                <p className="text-gray-300 text-xs leading-relaxed line-clamp-3">{event.description}</p>
              </div>
            </div>

            {/* Registration link - styled to match other elements */}
            {event.registrationLink && (
              <div className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/30">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center">
                    <GlobeAltIcon className="h-3 w-3 text-green-400" />
                  </div>
                  <p className="text-green-300 text-xs font-medium">Register</p>
                </div>
                <div className="ml-7">
                  <a
                    href={event.registrationLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-300 hover:text-green-200 border border-green-500/30 hover:border-green-500/40 rounded-md text-xs font-medium transition-all duration-200"
                  >
                    <span>Register now</span>
                    <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const EventsPage: React.FC = () => {
  const { currentUser } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [events, setEvents] = useState<Event[]>(initialEvents)
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming")
  const [searchTerm, setSearchTerm] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userRegistrations, setUserRegistrations] = useState<Record<string, boolean>>({})
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768) // Add mobile detection

  // State for event detail modal
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showEventDetailModal, setShowEventDetailModal] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const eventsPerPage = 4 // Increased from 3 to 4 to show more events per page

  // Enhanced caching and performance state
  const [eventsCache, setEventsCache] = useState<{
    upcoming: { data: Event[]; timestamp: number } | null
    past: { data: Event[]; timestamp: number } | null
  }>({ upcoming: null, past: null })
  const [registrationsCache, setRegistrationsCache] = useState<Record<string, { data: boolean; timestamp: number }>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Cache duration in milliseconds (5 minutes)
  const CACHE_DURATION = 5 * 60 * 1000

  // Enhanced fetch events with caching and parallel loading
  const fetchEventsOptimized = async (forceRefresh = false) => {
    try {
      const now = Date.now()
      const cacheKey = tab as keyof typeof eventsCache
      const cachedData = eventsCache[cacheKey]

      // Check if we have valid cached data and don't need to force refresh
      if (!forceRefresh && cachedData && now - cachedData.timestamp < CACHE_DURATION) {
        setEvents(cachedData.data)
        setLoading(false)

        // Load registrations in parallel without blocking UI
        if (currentUser && cachedData.data.length > 0) {
          loadUserRegistrationsOptimized(cachedData.data)
        }
        return
      }

      if (!cachedData) {
        setLoading(true)
      } else {
        setIsRefreshing(true)
      }

      setError(null)

      let fetchedEvents: Event[] = []
      let retryCount = 0
      const maxRetries = 3

      while (retryCount < maxRetries) {
        try {
          if (tab === "upcoming") {
            fetchedEvents = await getUpcomingEvents()
          } else {
            fetchedEvents = await getPastEvents()
          }
          break // Success, exit retry loop
        } catch (fetchError) {
          retryCount++
          if (retryCount === maxRetries) {
            throw fetchError // Re-throw after max retries
          }
          // Wait briefly before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 500))
        }
      }

      // Update cache
      setEventsCache((prev) => ({
        ...prev,
        [cacheKey]: { data: fetchedEvents, timestamp: now },
      }))

      setEvents(fetchedEvents)

      // Load user registrations in parallel
      if (currentUser && fetchedEvents.length > 0) {
        loadUserRegistrationsOptimized(fetchedEvents)
      }
    } catch (err) {
      console.error("Error fetching events:", err)
      setError("Failed to load events. Please check your connection and try again.")

      const cacheKey = tab as keyof typeof eventsCache
      const cachedData = eventsCache[cacheKey]
      if (cachedData && cachedData.data.length > 0) {
        setEvents(cachedData.data)
        setError("Showing cached events. Some information may be outdated.")
      }
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  // Preload both upcoming and past events for instant tab switching
  const preloadAllEvents = async () => {
    const now = Date.now()

    try {
      // Check which data needs to be loaded
      const needsUpcoming = !eventsCache.upcoming || now - eventsCache.upcoming.timestamp >= CACHE_DURATION
      const needsPast = !eventsCache.past || now - eventsCache.past.timestamp >= CACHE_DURATION

      const promises: Promise<void>[] = []

      if (needsUpcoming) {
        promises.push(
          getUpcomingEvents()
            .then((events) => {
              setEventsCache((prev) => ({
                ...prev,
                upcoming: { data: events, timestamp: now },
              }))
            })
            .catch((err) => console.error("Error preloading upcoming events:", err)),
        )
      }

      if (needsPast) {
        promises.push(
          getPastEvents()
            .then((events) => {
              setEventsCache((prev) => ({
                ...prev,
                past: { data: events, timestamp: now },
              }))
            })
            .catch((err) => console.error("Error preloading past events:", err)),
        )
      }

      // Wait for all preloading to complete
      await Promise.allSettled(promises)
    } catch (err) {
      console.error("Error during preloading:", err)
    }
  }

  // Optimized user registrations loading with caching
  const loadUserRegistrationsOptimized = async (eventsList: Event[]) => {
    if (!currentUser) return

    const now = Date.now()
    const newRegistrations: Record<string, boolean> = {}
    const promises: Promise<void>[] = []

    for (const event of eventsList) {
      const cacheKey = `${currentUser.id}-${event.id}`
      const cachedReg = registrationsCache[cacheKey]

      // Use cached data if available and fresh
      if (cachedReg && now - cachedReg.timestamp < CACHE_DURATION) {
        newRegistrations[event.id] = cachedReg.data
      } else {
        // Load registration status in parallel
        promises.push(
          isUserRegisteredForEvent(event.id, currentUser.id)
            .then((isRegistered) => {
              newRegistrations[event.id] = isRegistered
              // Update cache
              setRegistrationsCache((prev) => ({
                ...prev,
                [cacheKey]: { data: isRegistered, timestamp: now },
              }))
            })
            .catch((regErr) => {
              console.error(`Error checking registration for event ${event.id}:`, regErr)
              // Don't block other registrations
            }),
        )
      }
    }

    // Wait for all parallel requests to complete
    if (promises.length > 0) {
      await Promise.allSettled(promises)
    }

    setUserRegistrations((prev) => ({ ...prev, ...newRegistrations }))
  }

  // Fetch events from Firestore when component mounts or tab changes
  useEffect(() => {
    fetchEventsOptimized()

    // Preload other tab's data in the background after initial load
    if (!loading) {
      setTimeout(() => preloadAllEvents(), 500) // Reduced delay
    }
  }, [tab, currentUser])

  // Preload on component mount
  useEffect(() => {
    if (currentUser) {
      setTimeout(() => preloadAllEvents(), 1000) // Reduced delay
    }
  }, [currentUser])

  // Handle eventId from URL parameters (from sidebar navigation)
  useEffect(() => {
    const eventId = searchParams.get("eventId")
    if (eventId && events.length > 0) {
      const event = events.find((e) => e.id === eventId)
      if (event) {
        setSelectedEvent(event)
        setShowEventDetailModal(true)
        // Remove the eventId parameter from URL after opening modal
        setSearchParams((prev) => {
          const newParams = new URLSearchParams(prev)
          newParams.delete("eventId")
          return newParams
        })
      }
    }
  }, [events, searchParams, setSearchParams])

  // Filter events based on search term
  const filteredEvents = events.filter((event) => event.title.toLowerCase().includes(searchTerm.toLowerCase()))

  // For upcoming tab, show earliest events first.
  const orderedEvents =
    tab === "upcoming"
      ? [...filteredEvents].sort((a, b) => a.start.toMillis() - b.start.toMillis())
      : filteredEvents

  // Pagination logic
  const totalPages = Math.ceil(orderedEvents.length / eventsPerPage)
  const startIndex = (currentPage - 1) * eventsPerPage
  const endIndex = startIndex + eventsPerPage
  const paginatedEvents = orderedEvents.slice(startIndex, endIndex)

  // Reset to first page when tab changes or search term changes
  useEffect(() => {
    setCurrentPage(1)
  }, [tab, searchTerm])

  // Handle event registration with optimistic updates
  const handleRegisterForEvent = async (eventId: string) => {
    if (!currentUser) {
      alert("You must be logged in to register for events.")
      return
    }

    // Optimistic update
    setUserRegistrations((prev) => ({
      ...prev,
      [eventId]: true,
    }))

    try {
      await registerForEvent(eventId, currentUser.id, currentUser.name, currentUser.role, currentUser.profile_pic)

      // Update cache
      const cacheKey = `${currentUser.id}-${eventId}`
      setRegistrationsCache((prev) => ({
        ...prev,
        [cacheKey]: { data: true, timestamp: Date.now() },
      }))
    } catch (err) {
      console.error("Error registering for event:", err)
      alert("Failed to register for event. Please try again.")

      // Revert optimistic update
      setUserRegistrations((prev) => ({
        ...prev,
        [eventId]: false,
      }))
    }
  }

  const handleUnregisterFromEvent = async (eventId: string) => {
    if (!currentUser) return

    // Optimistic update
    setUserRegistrations((prev) => ({
      ...prev,
      [eventId]: false,
    }))

    try {
      await unregisterFromEvent(eventId, currentUser.id)

      // Update cache
      const cacheKey = `${currentUser.id}-${eventId}`
      setRegistrationsCache((prev) => ({
        ...prev,
        [cacheKey]: { data: false, timestamp: Date.now() },
      }))
    } catch (err) {
      console.error("Error unregistering from event:", err)
      alert("Failed to unregister from event. Please try again.")

      // Revert optimistic update
      setUserRegistrations((prev) => ({
        ...prev,
        [eventId]: true,
      }))
    }
  }

  // Handle showing the event detail modal
  const handleEventCardClick = (event: Event) => {
    setSelectedEvent(event)
    setShowEventDetailModal(true)
  }

  // Enhanced event creation with optimistic updates
  const handleCreateEvent = async (eventData: {
    title: string
    description: string
    location: string
    category: EventCategory
    startDate: string
    startTime: string
    endDate: string
    endTime: string
    coverImage?: string
    registrationLink?: string
  }) => {
    if (!currentUser) {
      alert("You must be logged in to create events.")
      return
    }

    try {
      // Create start and end timestamps
      const startTimestamp = Timestamp.fromDate(new Date(`${eventData.startDate}T${eventData.startTime}`))
      const endTimestamp = Timestamp.fromDate(new Date(`${eventData.endDate}T${eventData.endTime}`))

      // Create the event data
      const event: any = {
        title: eventData.title,
        description: eventData.description,
        location: eventData.location,
        category: eventData.category,
        start: startTimestamp,
        end: endTimestamp,
        coverImage: eventData.coverImage || "",
        createdBy: currentUser.id,
        creatorName: currentUser.name,
        creatorRole: currentUser.role,
      }

      // Only add registrationLink if it exists and is not empty
      if (eventData.registrationLink && eventData.registrationLink.trim()) {
        event.registrationLink = eventData.registrationLink
      }

      // Save event to Firebase
      setLoading(true)
      const eventId = await createEvent(event)

      // Invalidate cache to force refresh
      setEventsCache((prev) => ({
        ...prev,
        upcoming: null, // Clear upcoming cache since new event was added
      }))

      // Refresh events with force refresh
      if (tab === "upcoming") {
        await fetchEventsOptimized(true)
      }

      // Show success message
      alert("Event created successfully!")
      setLoading(false)
    } catch (error) {
      setLoading(false)
      console.error("Error creating event:", error)
      alert("Error creating event. Please try again.")
      throw error
    }
  }

  // Enhanced event deletion handler
  const handleEventDeleted = async () => {
    try {
      setIsRefreshing(true)

      // Invalidate both caches since we don't know which one the deleted event was in
      setEventsCache({ upcoming: null, past: null })

      // Force refresh current tab
      await fetchEventsOptimized(true)
    } catch (error) {
      console.error("Error refreshing events after deletion:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Add this function to handle event deletion
  const handleDeleteEvent = async (eventId: string) => {
    setLoading(true)
    try {
      await deleteEvent(eventId)
      await fetchEventsOptimized(true)
    } catch (error) {
      alert("Failed to delete event. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  // Handle window resize to update mobile state
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768) // Set mobile breakpoint at 768px (md)
    }

    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  const EventCardSkeleton = () => (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 animate-pulse">
      {/* Event image skeleton */}
      <div className="w-full h-32 bg-gray-700/50 rounded-lg mb-3"></div>

      {/* Title skeleton */}
      <div className="h-5 bg-gray-700/50 rounded mb-2"></div>
      <div className="h-4 bg-gray-700/30 rounded w-3/4 mb-3"></div>

      {/* Date and location skeleton */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-700/50 rounded"></div>
          <div className="h-3 bg-gray-700/30 rounded w-24"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-700/50 rounded"></div>
          <div className="h-3 bg-gray-700/30 rounded w-32"></div>
        </div>
      </div>

      {/* Button skeleton */}
      <div className="h-9 bg-gray-700/50 rounded-lg"></div>
    </div>
  )

  const EventsGridSkeleton = () => (
    <>
      {Array.from({ length: eventsPerPage }).map((_, index) => (
        <EventCardSkeleton key={index} />
      ))}
    </>
  )

  return (
    <>
      <MainLayout>
        <div className="container mx-auto px-2 sm:px-4 max-w-6xl" data-tutorial="events-page">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <h1 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-green-500 to-green-400 animate-gradient-x drop-shadow-lg mb-2 md:mb-0">
              Events
            </h1>
            
          </div>
          {/* Search and Add Event Section */}
          <div className="mb-4 flex flex-row gap-3 items-center">
            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                placeholder="Search events..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-800/30 border border-gray-600/30 rounded-lg py-2.5 px-3 text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-green-500/40 focus:border-green-500/40 transition-all duration-200"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>
            {currentUser && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-700/80 to-green-600/80 hover:from-green-600 hover:to-green-500 text-white rounded-lg text-sm font-bold shadow-lg transition-all duration-200 hover:scale-105 whitespace-nowrap flex-shrink-0"
              >
                <PlusIcon className="h-5 w-5" />
                <span>Add Event</span>
              </button>
            )}
          </div>
          {/* Event Tabs - Enhanced with Community Page styling */}
          <div className="bg-gray-900/50 rounded-2xl border border-gray-700/50 overflow-hidden shadow-2xl backdrop-blur-sm mb-8">
            {/* Modern Tab Container */}
            <div className="relative">
              {/* Sliding indicator */}
              <div
                className={`absolute bottom-0 h-0.5 w-1/2 bg-green-500 transition-transform duration-300 ease-out ${
                  tab === "upcoming" ? "translate-x-0" : "translate-x-full"
                }`}
              />
              {/* Tab buttons */}
              <div className="flex">
                <button
                  onClick={() => setTab("upcoming")}
                  className={`flex-1 py-4 px-6 text-sm font-medium transition-colors duration-200 relative ${
                    tab === "upcoming"
                      ? "text-green-400 bg-gray-800/30"
                      : "text-gray-400 hover:text-gray-300 hover:bg-gray-800/20"
                  }`}
                  disabled={loading}
                >
                  <span className="flex items-center justify-center gap-2">
                    <CalendarIcon className="w-4 h-4" />
                    Upcoming Events
                    {/* Cache indicator */}
                    {tab === "upcoming" && eventsCache.upcoming && !loading && (
                      <span
                        className="ml-1 px-1 py-0.5 text-xs bg-blue-600/20 text-blue-300 rounded border border-blue-500/30"
                        title="Cached data"
                      >
                        ⚡
                      </span>
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setTab("past")}
                  className={`flex-1 py-4 px-6 text-sm font-medium transition-colors duration-200 relative ${
                    tab === "past"
                      ? "text-green-400 bg-gray-800/30"
                      : "text-gray-400 hover:text-gray-300 hover:bg-gray-800/20"
                  }`}
                  disabled={loading}
                >
                  <span className="flex items-center justify-center gap-2">
                    <ClockIcon className="w-4 h-4" />
                    Past Events
                    {/* Cache indicator */}
                    {tab === "past" && eventsCache.past && !loading && (
                      <span
                        className="ml-1 px-1 py-0.5 text-xs bg-blue-600/20 text-blue-300 rounded border border-blue-500/30"
                        title="Cached data"
                      >
                        ⚡
                      </span>
                    )}
                  </span>
                </button>
              </div>
            </div>
            {/* Content Area */}
            <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 min-h-[300px]">
              {loading && <EventsGridSkeleton />}
              {/* Refreshing indicator - shown when updating cache */}
              {!loading && isRefreshing && (
                <div className="col-span-full">
                  <div className="flex items-center justify-center py-2 mb-4">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/20">
                      <div className="h-3 w-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin"></div>
                      <span className="text-sm font-medium">Refreshing events...</span>
                    </div>
                  </div>
                </div>
              )}
              {error && !loading && (
                <div className="col-span-full text-center py-12">
                  <div className="max-w-md mx-auto">
                    <div className="w-16 h-16 mx-auto mb-4 bg-red-500/10 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z"
                        />
                      </svg>
                    </div>
                    <p className="text-red-400 mb-4">{error}</p>
                    <button
                      onClick={() => fetchEventsOptimized(true)}
                      className="px-6 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors font-medium"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
              {/* Empty state */}
              {!loading && !error && filteredEvents.length === 0 && (
                <div className="col-span-full flex justify-center items-center py-16">
                  <div className="rounded-2xl px-8 py-10 max-w-md w-full flex flex-col items-center" style={{background: 'transparent', border: 'none', boxShadow: 'none'}}>
                    <CalendarIcon className="h-14 w-14 text-green-400 mb-4" aria-hidden="true" />
                    <div className="text-green-200 text-xl font-semibold mb-2">
                      {searchTerm ? "No events match your search." : `No ${tab} events coming up!`}
                    </div>
                    <div className="text-green-300 text-base mb-6">Check back later for new events and opportunities.</div>
                    {!isRefreshing && (
                      <button
                        onClick={() => fetchEventsOptimized(true)}
                        className="mt-2 px-5 py-2 bg-green-500/30 hover:bg-green-500/50 text-green-100 rounded-lg text-base font-medium shadow-sm transition-colors"
                      >
                        Refresh Events
                      </button>
                    )}
                  </div>
                </div>
              )}
              {/* Events list */}
              {!loading &&
                !error &&
                paginatedEvents.map((event) => (
                  <EventCard key={event.id} event={event} onClick={handleEventCardClick} onDelete={handleDeleteEvent} />
                ))}
            </div>
            {/* Pagination Controls */}
            {!loading && !error && filteredEvents.length > eventsPerPage && (
              <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                <div className="flex items-center justify-center gap-4">
                  {/* Previous button */}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800/50 border border-gray-600/30 rounded-lg hover:bg-gray-700/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                    <span>Previous</span>
                  </button>
                  {/* Page indicator */}
                  <span className="text-sm text-gray-400 font-semibold">
                    {currentPage} / {totalPages}
                  </span>
                  {/* Next button */}
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800/50 border border-gray-600/30 rounded-lg hover:bg-gray-700/50 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <span>Next</span>
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
      {/* Create Event Modal (fully unwrapped, outside MainLayout) */}
      <EventCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateEvent}
      />
      {/* Event Detail Modal (fully unwrapped, outside MainLayout) */}
      <EventDetailModal
        isOpen={showEventDetailModal}
        event={selectedEvent}
        onClose={() => setShowEventDetailModal(false)}
        onEventDeleted={handleEventDeleted}
      />
    </>
  )
}

export default EventsPage
