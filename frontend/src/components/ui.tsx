import { InputHTMLAttributes, ReactNode } from 'react'

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative flex-shrink-0 cursor-pointer rounded-[13px] border-none p-0 transition-colors duration-200"
      style={{ width: 42, height: 25, background: on ? '#d97757' : 'var(--toggle-off)' }}
    >
      <span
        className="absolute rounded-[10px] bg-white transition-transform duration-200"
        style={{
          top: 2.5,
          left: 2.5,
          width: 20,
          height: 20,
          boxShadow: '0 1px 3px rgba(0,0,0,.2)',
          transform: `translateX(${on ? 17 : 0}px)`,
        }}
      />
    </button>
  )
}

export function SettingRow({
  label,
  desc,
  children,
}: {
  label: string
  desc: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hover py-[13px]">
      <div className="flex flex-col gap-0.5">
        <div className="text-[13.5px] font-medium text-ink">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      {children}
    </div>
  )
}

export function TextField({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium text-muted">{label}</span>
      <input
        {...props}
        className={
          'rounded-lg border border-edge bg-paper px-2.5 py-2 text-[13px] text-ink transition-colors focus:border-accent ' +
          (props.className || '')
        }
      />
    </label>
  )
}

export function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex-1 cursor-pointer rounded-[7px] border-none py-1.5 text-xs font-semibold transition-all"
      style={{
        color: active ? 'var(--ink)' : 'var(--muted)',
        background: active ? 'var(--seg-active)' : 'transparent',
        boxShadow: active ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
      }}
    >
      {children}
    </button>
  )
}

export function IconButton({
  title,
  onClick,
  children,
  hoverBg = 'var(--hover)',
  size = 30,
}: {
  title: string
  onClick: () => void
  children: ReactNode
  hoverBg?: string
  size?: number
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      className="flex cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-soft transition-colors"
      style={{ width: size, height: size }}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  )
}
