"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the current server component tree on an interval, so live scores
 * and analysis update without a manual reload. Data itself is cached 60s at the
 * Supabase read, so this never hammers the database. */
export default function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
