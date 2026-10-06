interface IconProps {
  size?: number
  strokeWidth?: number
}

function svgProps(size: number, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export const GearIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    {/* «Ползунки» (как lucide settings-2): аккуратнее шестерёнки в мелком размере. */}
    <path d="M20 7h-9" />
    <path d="M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </svg>
)

export const ImageIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
)

export const TableIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18" />
    <path d="M3 15h18" />
    <path d="M12 3v18" />
  </svg>
)

export const CodeIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="m18 16 4-4-4-4" />
    <path d="m6 8-4 4 4 4" />
    <path d="m14.5 4-5 16" />
  </svg>
)

export const DiagramIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
)

export const MathIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    {/* Σ — формула. */}
    <path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2" />
  </svg>
)

export const MinusIcon = ({ size = 15, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M5 12h14" />
  </svg>
)

export const PlusIcon = ({ size = 15, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
)

export const FitIcon = ({ size = 14, strokeWidth = 1.9 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
)

export const CloseIcon = ({ size = 14, strokeWidth = 2.2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const CheckIcon = ({ size = 12, strokeWidth = 2.4 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

export const DownloadIcon = ({ size = 14, strokeWidth = 2.2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
)

export const SunIcon = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

export const MoonIcon = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)

export const UploadIcon = ({ size = 16, strokeWidth = 1.6 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    {/* Файл со стрелкой вверх — «открыть .md/.zip». */}
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M12 12v6" />
    <path d="m15 15-3-3-3 3" />
  </svg>
)

export const Spinner = ({ size = 14 }: IconProps) => (
  <span
    className="animate-spin-fast inline-block rounded-full"
    style={{
      width: size,
      height: size,
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
    }}
  />
)

export const SquarePenIcon = ({ size = 14, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
  </svg>
)

/** Монитор: документ хранится только на этом устройстве. */
export const MonitorIcon = ({ size = 13, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
)
