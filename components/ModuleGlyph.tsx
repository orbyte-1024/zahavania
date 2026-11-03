import type { ModuleId } from "@/lib/modules";

const HAIR = "rgba(var(--ink-rgb), 0.22)";
const ACCENT = "var(--accent)";

export function ModuleGlyph({ id, className = "" }: { id: ModuleId; className?: string }) {
  return (
    <svg className={`module-glyph ${className}`} viewBox="0 0 120 120" aria-hidden="true">
      {id === "verify" && (
        <g fill="none" strokeWidth="1.4" strokeLinecap="round">
          {[24, 40, 56, 72, 88].map((y, i) => (
            <line key={y} x1="16" x2={i === 4 ? 70 : 104} y1={y} y2={y} stroke={HAIR} />
          ))}
          <path d="M60,45 C92,44 101,50 100,56 C99,63 86,67 58,66 C32,65 18,62 19,56 C20,49 34,46 60,45 Z" stroke={ACCENT} />
        </g>
      )}
      {id === "image" && (
        <g fill="none" strokeWidth="1.4">
          <rect x="18" y="26" width="84" height="64" stroke={HAIR} />
          <path d="M18,76 L46,52 L64,68 L78,58 L102,78" stroke={HAIR} />
          <circle cx="82" cy="44" r="9" stroke={ACCENT} />
          <path d="M12,34 V20 H26 M108,34 V20 H94 M12,82 V96 H26 M108,82 V96 H94" stroke={HAIR} />
        </g>
      )}
      {id === "monitor" && (
        <g fill="none" strokeWidth="1.4" strokeLinecap="round">
          <path d="M40,80 A20,20 0 0 1 80,80" stroke={HAIR} />
          <path d="M26,80 A34,34 0 0 1 94,80" stroke={HAIR} />
          <path d="M12,80 A48,48 0 0 1 108,80" stroke={HAIR} />
          <circle cx="60" cy="80" r="5" fill={ACCENT} stroke="none" />
        </g>
      )}
      {id === "translate" && (
        <g fill="none" strokeWidth="1.4" strokeLinecap="round">
          {[30, 42, 54].map((y) => (
            <line key={`a${y}`} x1="14" x2="58" y1={y} y2={y} stroke={HAIR} />
          ))}
          {[66, 78, 90].map((y) => (
            <line key={`b${y}`} x1="62" x2="106" y1={y} y2={y} stroke={HAIR} />
          ))}
          <path d="M58,42 C76,42 62,78 62,78" stroke={ACCENT} />
        </g>
      )}
      {id === "experts" && (
        <g fill="none" strokeWidth="1.4">
          <line x1="60" y1="60" x2="24" y2="30" stroke={HAIR} />
          <line x1="60" y1="60" x2="98" y2="36" stroke={HAIR} />
          <line x1="60" y1="60" x2="72" y2="100" stroke={HAIR} />
          <circle cx="60" cy="60" r="11" stroke={HAIR} />
          <circle cx="24" cy="30" r="6" stroke={HAIR} />
          <circle cx="72" cy="100" r="6" stroke={HAIR} />
          <circle cx="98" cy="36" r="6" fill={ACCENT} stroke="none" />
        </g>
      )}
      {id === "stats" && (
        <g fill="none" strokeWidth="1.4" strokeLinecap="round">
          <line x1="12" x2="108" y1="74" y2="74" stroke={HAIR} />
          {[22, 40, 58, 76, 94].map((x) => (
            <line key={x} x1={x} x2={x} y1="68" y2="80" stroke={HAIR} />
          ))}
          <circle cx="76" cy="74" r="6" fill={ACCENT} stroke="none" />
          <line x1="76" x2="76" y1="40" y2="64" stroke={ACCENT} />
        </g>
      )}
      {id === "angles" && (
        <g strokeWidth="1.4">
          {[0, 1, 2].map((row) =>
            [0, 1, 2, 3].map((col) => {
              const key = `${row}-${col}`;
              const accent = row === 1 && col === 2;
              const marked = (row === 0 && col === 1) || (row === 2 && col === 3);
              return (
                <rect
                  key={key}
                  x={16 + col * 24}
                  y={26 + row * 24}
                  width="16"
                  height="16"
                  fill={accent ? ACCENT : "none"}
                  stroke={accent ? "none" : marked ? "rgba(var(--ink-rgb), 0.55)" : HAIR}
                />
              );
            }),
          )}
        </g>
      )}
    </svg>
  );
}
