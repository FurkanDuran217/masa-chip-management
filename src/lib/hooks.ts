import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = () => setMatches(mql.matches)
    handler()
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

export function useLocalInstallPrompt() {
  const [prompt, setPrompt] = useState<Event | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])
  const install = async () => {
    if (!prompt) return false
    const anyPrompt = prompt as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: string }>
    }
    await anyPrompt.prompt()
    const choice = await anyPrompt.userChoice
    setPrompt(null)
    return choice.outcome === 'accepted'
  }
  return { canInstall: !!prompt, install }
}
