import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `intervalMs`, so relative times ("32 s ago") and mute
 * states ("Muted until 20:15") stay true while the page is open.
 */
export function useNow(intervalMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
