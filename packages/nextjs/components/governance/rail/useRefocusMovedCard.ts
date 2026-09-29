"use client";

import { useEffect, useRef } from "react";
import { operationCardButtonId } from "./OperationCard";
import type { Proposal } from "@sh/core/governance/proposals";

/** Where on `/` a proposal's card is drawn: one of the inbox's two lists, or as the search's result. */
export type CardPlace = "pending" | "settled" | "search";

/** Where the selected card is drawn, or null while nothing is selected or the inbox is still loading. */
export function cardPlaceOf(
  scheduleId: string | null,
  lists: { pending: readonly Proposal[]; settled: readonly Proposal[] } | null,
): CardPlace | null {
  if (!scheduleId || !lists) return null;
  const isIn = (proposals: readonly Proposal[]) =>
    proposals.some(({ schedule }) => schedule.schedule_id === scheduleId);
  if (isIn(lists.pending)) return "pending";
  if (isIn(lists.settled)) return "settled";
  return "search";
}

/**
 * A card belongs to the list it is drawn in, so when the selected proposal changes place — a Withdraw
 * moves it from pending to settled on the next inbox read — React draws a new card there and drops the
 * old one with its open detail, and focus, which was on the button that did it, falls to the page.
 * This puts it on the card's button in its new place, scrolling only as far as it takes to show it.
 * It moves focus only when focus was dropped: a viewer who has already gone on elsewhere stays there,
 * and a card that opens where it already was (a first load, a click) is left alone.
 */
export function useRefocusMovedCard(scheduleId: string | null, place: CardPlace | null) {
  const previous = useRef({ scheduleId, place });

  useEffect(() => {
    const before = previous.current;
    previous.current = { scheduleId, place };
    if (!scheduleId || scheduleId !== before.scheduleId || !before.place || !place || place === before.place) return;
    const focusWasDropped = !document.activeElement || document.activeElement === document.body;
    if (!focusWasDropped) return;
    const button = document.getElementById(operationCardButtonId(scheduleId));
    if (!button) return;
    button.focus({ preventScroll: true });
    button.scrollIntoView({ block: "nearest" });
  }, [scheduleId, place]);
}
