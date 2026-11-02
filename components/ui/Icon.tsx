import { type ReactNode } from "react";

// Point d'entrée unique Papicons (icônes minimalistes press-style)
export function Icon({ name, size = 20 }: { name: string; size?: number }): ReactNode {
  // Placeholder minimal : chaque icône est un carré avec une lettre indicative
  // Dans un vrai build Papicons, remplacer par <svg> importé depuis le package.
  const map: Record<string, string> = {
    check: "✓",
    cross: "✗",
    info: "ℹ",
    image: "◈",
    document: "◉",
  };
  return (
    <span
      aria-label={name}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        lineHeight: `${size}px`,
        textAlign: "center",
        fontSize: size * 0.7,
        fontFamily: "serif",
        color: "currentColor",
      }}
    >
      {map[name] ?? "◌"}
    </span>
  );
}
