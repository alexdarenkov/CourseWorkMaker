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

export const GearIcon = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

export const ImageIcon = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </svg>
)

export const TableIcon = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M12 3v18" />
  </svg>
)

export const CodeIcon = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
)

export const DiagramIcon = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
)

export const MathIcon = ({ size = 16, strokeWidth = 1.9 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M18 5H8l6 7-6 7h10" />
  </svg>
)

export const MinusIcon = ({ size = 15, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M5 12h14" />
  </svg>
)

export const PlusIcon = ({ size = 15, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const FitIcon = ({ size = 14, strokeWidth = 1.9 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />
  </svg>
)

export const CloseIcon = ({ size = 14, strokeWidth = 2.2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

export const CollapseLeftIcon = ({ size = 16, strokeWidth = 1.9 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M15 6l-6 6 6 6M4 4v16" />
  </svg>
)

export const CollapseRightIcon = ({ size = 16, strokeWidth = 1.9 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M9 6l6 6-6 6M20 4v16" />
  </svg>
)

export const CheckIcon = ({ size = 12, strokeWidth = 2.4 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

export const DownloadIcon = ({ size = 14, strokeWidth = 2.2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

export const SunIcon = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
)

export const MoonIcon = ({ size = 18, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
)

export const UploadIcon = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 9 12 4 17 9" />
    <line x1="12" y1="4" x2="12" y2="16" />
  </svg>
)

export const ChevronDownIcon = ({ size = 14, strokeWidth = 2.2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

export const HeadingIcon = ({ size = 15, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M6 4v16" />
    <path d="M18 4v16" />
    <path d="M6 12h12" />
  </svg>
)

export const FileTextIcon = ({ size = 15, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M8 13h8" />
    <path d="M8 17h5" />
  </svg>
)

export const BoldIcon = ({ size = 15, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
  </svg>
)

export const ItalicIcon = ({ size = 15, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </svg>
)

export const FolderIcon = ({ size = 17, strokeWidth = 1.7 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
)

export const ShieldCheckIcon = ({ size = 13, strokeWidth = 1.9 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
)

export const UndoIcon = ({ size = 13, strokeWidth = 2 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
  </svg>
)

export const ArchiveIcon = ({ size = 16, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <rect x="2" y="4" width="20" height="5" rx="1" />
    <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
    <path d="M10 13h4" />
  </svg>
)

export const TrashIcon = ({ size = 15, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

export const SparklesIcon = ({ size = 15, strokeWidth = 1.8 }: IconProps) => (
  <svg {...svgProps(size, strokeWidth)}>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
)

export const Spinner = ({ size = 14 }: IconProps) => (
  <span
    className="animate-spin-fast inline-block rounded-full"
    style={{
      width: size,
      height: size,
      border: '2px solid rgba(255,255,255,.35)',
      borderTopColor: '#fff',
    }}
  />
)
