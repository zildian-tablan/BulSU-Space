import React from "react"
import ReactDOM from "react-dom"

type LoaderOverlayProps = {
  open: boolean
  message?: string
}

const LoaderOverlay: React.FC<LoaderOverlayProps> = ({ open, message = "Processing..." }) => {
  if (!open) return null
  if (typeof document === "undefined") return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[2147483649] flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 px-8 py-6 rounded-2xl bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#0b1220] border border-white/10 shadow-2xl text-gray-100">
        <div className="h-12 w-12 border-4 border-green-500/40 border-t-green-400 rounded-full animate-spin" aria-hidden="true" />
        <p className="text-base font-medium tracking-wide text-gray-200" role="status">
          {message}
        </p>
      </div>
    </div>,
    document.body,
  )
}

export default LoaderOverlay
