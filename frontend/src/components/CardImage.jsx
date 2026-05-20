import { useState } from 'react'

const CARD_BACK = '/cardback.jpg'

export default function CardImage({ src, alt, className, showName = false, style, loading = 'lazy' }) {
  const [failed, setFailed] = useState(false)

  const handleError = (event) => {
    event.currentTarget.onerror = null
    event.currentTarget.src = CARD_BACK
    event.currentTarget.style.opacity = '0.8'
    setFailed(true)
  }

  const showOverlay = !src || failed || showName

  return (
    <div className="relative h-full w-full">
      <img
        src={src || CARD_BACK}
        alt={alt}
        className={className || 'h-full w-full object-cover'}
        style={{ ...(src && !failed ? {} : { opacity: 0.8 }), ...style }}
        loading={loading}
        onError={handleError}
      />
      {showOverlay && alt && (
        <div
          className="absolute bottom-0 left-0 right-0 px-1 pb-2 pt-4"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}
        >
          <span className="block truncate text-center text-sm font-semibold leading-tight text-white">
            {alt}
          </span>
        </div>
      )}
    </div>
  )
}
