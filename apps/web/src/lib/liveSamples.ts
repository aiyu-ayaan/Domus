import { useEffect, useRef, useState } from 'react'

/** The last five minutes of what `sample` reads, taken every five seconds while mounted. Each sample is stamped with its time as `t`. */
// shortcut: held by the component, so the line starts empty on each visit; move the samples into the query cache if it should outlive the page.
export function useLive<T>(sample: () => T): (T & { t: string })[] {
  const latest = useRef(sample)
  latest.current = sample
  const [samples, setSamples] = useState<(T & { t: string })[]>([])
  useEffect(() => {
    const take = () => setSamples((s) => [...s.slice(-59), { ...latest.current(), t: new Date().toISOString() }])
    take()
    const id = setInterval(take, 5000)
    return () => clearInterval(id)
  }, [])
  return samples
}
