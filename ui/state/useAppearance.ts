import { useEffect } from "react";

/**
 * Applies appearance and interface preferences to <html>.
 *
 * This is not cosmetic wiring — styles.css keys its entire dark palette off
 * `:root[data-theme="dark"]`, and glass/density/motion off their own data
 * attributes. Without these the stylesheet stays in its light defaults no
 * matter what the device prefers, which is what made every surface render as
 * a white box.
 *
 * Ported from the prototype's applyAppearancePreference /
 * applyInterfacePreferences, including the listener that re-resolves when the
 * system flips while the app is open.
 */

export type Appearance = "system" | "light" | "dark";

export interface InterfacePreferences {
  appearance?: string;
  glassIntensity?: string;
  interfaceDensity?: string;
  motionPreference?: string;
  navigationBehavior?: string;
}

function oneOf(value: unknown, allowed: string[], fallback: string): string {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

/** Resolve "system" against the device, exactly as the prototype does. */
export function resolveAppearance(preference: string): "light" | "dark" {
  if (preference === "dark" || preference === "light") return preference;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function useAppearance(profile: InterfacePreferences | undefined): void {
  const preference = oneOf(profile?.appearance, ["system", "light", "dark"], "system");
  const glass = oneOf(profile?.glassIntensity, ["subtle", "balanced", "vivid"], "balanced");
  const density = oneOf(profile?.interfaceDensity, ["comfortable", "compact"], "comfortable");
  const motion = oneOf(profile?.motionPreference, ["system", "full", "reduced"], "system");
  const navigation = oneOf(profile?.navigationBehavior, ["smart", "steady"], "smart");

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const resolved = resolveAppearance(preference);
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", resolved === "dark" ? "#000000" : "#f7f7f9");
      root.dataset.glass = glass;
      root.dataset.density = density;
      root.dataset.motion = motion;
      root.dataset.navigation = navigation;
    };

    apply();

    // Follow the system while the app is open, but only when the athlete has
    // not pinned light or dark themselves.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (preference === "system") apply();
    };
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [preference, glass, density, motion, navigation]);
}
