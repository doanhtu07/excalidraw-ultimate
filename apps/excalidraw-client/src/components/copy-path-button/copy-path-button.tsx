import { useEffect, useRef, useState } from 'react'
import styles from './copy-path-button.module.css'
import { CheckSvg } from '@/components/svgs/check-svg'
import { CopySvg } from '@/components/svgs/copy-svg'
import { cn } from '@/utils/tailwind-merge'

interface CopyPathButtonProps {
  path: string
  className?: string
}

const COPIED_FEEDBACK_MS = 1200

export function CopyPathButton({ path, className }: CopyPathButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // Clipboard access denied: leave the button unchanged.
      return
    }

    setCopied(true)

    if (timerRef.current !== null) window.clearTimeout(timerRef.current)

    timerRef.current = window.setTimeout(() => {
      setCopied(false)
      timerRef.current = null
    }, COPIED_FEEDBACK_MS)
  }

  // MARK: Effects

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  // MARK: Preparation

  const label = copied ? 'Copied' : 'Copy workspace path'

  // MARK: Renderers

  return (
    <button
      type="button"
      title={label}
      aria-label={copied ? 'Copied' : `Copy workspace path ${path}`}
      onClick={() => void copy()}
      className={cn(styles.button, copied && styles.copied, className)}
    >
      {copied ? <CheckSvg /> : <CopySvg />}
    </button>
  )
}
