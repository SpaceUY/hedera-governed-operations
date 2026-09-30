"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SELECTED_SCHEDULE_PARAM } from "~~/config/governanceConfig";

/**
 * The selected proposal, kept in the `schedule` query param on `/` rather than in component state, so
 * reloading the URL reopens the same card. Selecting replaces the URL instead of pushing a new
 * history entry — clicking through cards should not fill the back button with one stop per row — and
 * always with `scroll: false`: the rail already scrolls on its own, and the whole page scrolls on a
 * phone, so letting Next reset the window's scroll on every selection would jump the page under foot.
 */
export function useSelectedSchedule() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedScheduleId = searchParams.get(SELECTED_SCHEDULE_PARAM);

  const select = useCallback(
    (scheduleId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (scheduleId) params.set(SELECTED_SCHEDULE_PARAM, scheduleId);
      else params.delete(SELECTED_SCHEDULE_PARAM);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return { selectedScheduleId, select };
}
