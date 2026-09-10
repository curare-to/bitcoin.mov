'use client'

import { useState } from 'react'

/**
 * Poster/thumbnail with a graceful fallback. Submitter-controlled URLs break
 * often, so on error (or when absent) we render a neutral ₿ placeholder rather
 * than a broken-image icon. Plain <img> because static export has no image
 * optimizer and the src is an arbitrary remote URL.
 */
export function Poster({
  src,
  alt,
  className = '',
  imgClassName = '',
}: {
  src: string | null
  alt: string
  className?: string
  imgClassName?: string
}) {
  const [failed, setFailed] = useState(false)
  const showImage = src && !failed

  return (
    <div
      className={`relative overflow-hidden bg-[var(--color-surface-2)] ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className={`w-full h-full object-cover ${imgClassName}`}
        />
      ) : (
        <div className="w-full h-full grid place-items-center text-[color-mix(in_srgb,var(--color-border)_80%,transparent)]">
          <span className="font-display text-5xl font-black select-none opacity-40">
            ₿
          </span>
        </div>
      )}
    </div>
  )
}
