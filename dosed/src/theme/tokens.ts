import { Platform } from "react-native";
import { Easing } from "react-native-reanimated";

// Palette: warm clinical-but-caring. No purple/blue SaaS gradient, no
// mint-green wellness cliche. Base is warm paper, ink for text, clay for
// the primary action (medication = attention without alarm), moss for
// "done/taken" (calmer and more specific than default green).
export const color = {
  paper: "#F7F3EC",
  paperRaised: "#FFFFFF",
  ink: "#241F1B",
  inkFaint: "#8A8078",
  hairline: "#E4DACC",
  clay: "#C1552C",
  clayDeep: "#9C4222",
  moss: "#4B6B4A",
  mossFaint: "#DCE6D9",
  amber: "#B8862E",
  danger: "#A5342A",
  overlay: "rgba(36,31,27,0.45)",
};

// System fonts on purpose: they render natively correct (Dynamic Type /
// font scaling, hinting) on each platform, and skip bundling a webfont
// dependency the app doesn't need (ponytail: native platform feature over
// an added dependency). Headings use the platform serif for warmth and to
// avoid the geometric-grotesk-everywhere tell; body uses the system UI face.
export const font = {
  heading: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  body: Platform.select({ ios: "System", android: "sans-serif", default: "System" }),
};

export const space = { xs: 4, sm: 8, md: 12, lg: 20, xl: 32, xxl: 48 };
export const radius = { sm: 6, md: 10, lg: 16 };

// Motion: durations/easings per Kowalski's rules — enter with ease-out
// (fast start, gentle settle), exit with ease-in (fast departure), and a
// single spring reserved for the one high-frequency interactive moment
// (marking a dose taken) where physical feedback earns its cost.
export const motion = {
  durationEnter: 180,
  durationExit: 120,
  easeOut: Easing.out(Easing.cubic),
  easeIn: Easing.in(Easing.cubic),
  spring: { damping: 16, stiffness: 220, mass: 0.6 },
};

export const type = {
  title: { fontFamily: font.heading, fontSize: 28, color: color.ink },
  section: { fontFamily: font.heading, fontSize: 18, color: color.ink },
  body: { fontFamily: font.body, fontSize: 15, color: color.ink },
  caption: { fontFamily: font.body, fontSize: 13, color: color.inkFaint },
};
