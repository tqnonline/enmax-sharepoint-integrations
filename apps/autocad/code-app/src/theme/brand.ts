import {
  type BrandVariants,
  createLightTheme,
  createDarkTheme,
  type Theme,
} from "@fluentui/react-components";

// 16-step ramp seeded from Cinnabar #E1393E via Fluent UI Theme Designer.
// Index 120 hand-tuned to match Cinnabar exactly.
export const enmaxBrandRamp: BrandVariants = {
  10:  "#0A0203",
  20:  "#1F0708",
  30:  "#36100F",
  40:  "#491614",
  50:  "#5E1B17",
  60:  "#73201A",
  70:  "#88251D",
  80:  "#9D2A1F",
  90:  "#B12F22",
  100: "#C53324",
  110: "#D03828",
  120: "#E1393E",  // Cinnabar — brand primary, light theme
  130: "#E85A5F",
  140: "#EE7A7E",
  150: "#F39A9E",
  160: "#F8BABD",
};

export const enmaxLightTheme: Theme = {
  ...createLightTheme(enmaxBrandRamp),
};

export const enmaxDarkTheme: Theme = {
  ...createDarkTheme(enmaxBrandRamp),
  // Dark Cinnabar shifts to ~#FF6B73; Fluent's createDarkTheme uses higher
  // indices by default, approximating this naturally from the ramp.
};

// Secondary + accent aren't part of Fluent's single-ramp BrandVariants.
// Exposed as CSS custom properties for non-Fluent components.
export const enmaxCssVars = {
  "--enmax-secondary":      "#0F487A",
  "--enmax-secondary-dark": "#5BA3E8",
  "--enmax-accent":         "#F7DB9C",
  "--enmax-accent-dark":    "#E8C76A",
} as const;
