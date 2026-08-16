import { tokens } from "@fluentui/react-components";
import { RETINA_MEDIA_QUERY } from "../lib/useRetinaDisplay";

/** Griffel media-query key for Retina / 2× high-DPI screens. */
export const retinaMq = `@media ${RETINA_MEDIA_QUERY}`;

/** Horizontal scroll regions — momentum scrolling on iOS, crisp layer on macOS Retina. */
export const retinaScrollSurface = {
  WebkitOverflowScrolling: "touch",
  transform: "translateZ(0)",
  [retinaMq]: {
    backfaceVisibility: "hidden",
  },
} as const;

/** Hairline divider that stays sharp on 2× displays without looking heavy on 1×. */
export function retinaHairlineBorder(side: "bottom" | "top" = "bottom") {
  const widthKey = side === "bottom" ? "borderBottomWidth" : "borderTopWidth";
  const styleKey = side === "bottom" ? "borderBottomStyle" : "borderTopStyle";
  const colorKey = side === "bottom" ? "borderBottomColor" : "borderTopColor";
  return {
    [widthKey]: "1px",
    [styleKey]: "solid",
    [colorKey]: tokens.colorNeutralStroke2,
    [retinaMq]: {
      [widthKey]: "0.5px",
    },
  };
}

/** Grid min-widths — extra room on Retina MacBook / 4K so columns do not crowd. */
export const retinaGridMinWidth = {
  minWidth: "720px",
  "@media (min-width: 1024px)": {
    minWidth: "960px",
  },
  "@media (min-width: 1440px)": {
    minWidth: "1100px",
  },
  "@media (min-width: 1920px)": {
    minWidth: "1280px",
  },
  [`@media ${RETINA_MEDIA_QUERY} and (min-width: 1024px)`]: {
    minWidth: "1024px",
  },
  [`@media ${RETINA_MEDIA_QUERY} and (min-width: 1440px)`]: {
    minWidth: "1180px",
  },
  [`@media ${RETINA_MEDIA_QUERY} and (min-width: 1920px)`]: {
    minWidth: "1360px",
  },
} as const;

/** Full-bleed padding that respects safe areas on notched Retina Macs / iPads. */
export const retinaSafePadding = {
  paddingLeft: `max(${tokens.spacingHorizontalM}, env(safe-area-inset-left, 0px))`,
  paddingRight: `max(${tokens.spacingHorizontalM}, env(safe-area-inset-right, 0px))`,
} as const;
