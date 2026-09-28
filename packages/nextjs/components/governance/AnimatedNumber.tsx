"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "~~/hooks/usePrefersReducedMotion";
import { MOTION_MS } from "~~/services/liveMap/motion/timings";

type AnimatedNumberProps = {
  value: number | bigint;
  /** How a value is written; it is given whole numbers while counting. */
  format?: (value: number | bigint) => string;
};

const easeOut = (progress: number): number => 1 - (1 - progress) ** 3;

/**
 * A figure that counts to its new value when it changes, in tabular numerals and in the success
 * colour while it counts. The count runs here, in one leaf, so no screen re-renders per frame; with
 * reduced motion the new value is simply shown. At rest it writes `value` itself, so a bigint is
 * never rounded: only the numbers in between are.
 */
export function AnimatedNumber({ value, format = String }: AnimatedNumberProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [counting, setCounting] = useState<number | null>(null);
  const shown = useRef(Number(value));

  useEffect(() => {
    const from = shown.current;
    const to = Number(value);
    if (from === to || reducedMotion) {
      shown.current = to;
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / MOTION_MS.figures);
      shown.current = from + (to - from) * easeOut(progress);
      setCounting(progress < 1 ? shown.current : null);
      if (progress < 1) frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      setCounting(null);
    };
  }, [value, reducedMotion]);

  return (
    <span className={`tabular-nums transition-colors duration-700 ${counting === null ? "" : "text-success"}`}>
      {counting === null ? format(value) : format(Math.round(counting))}
    </span>
  );
}
