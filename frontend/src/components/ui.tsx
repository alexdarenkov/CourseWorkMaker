import {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react'
import { CloseIcon, Spinner } from './icons'

export function Button({
  variant = 'secondary',
  size = 'md',
  busy = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  busy?: boolean
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

export function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Texturn — на главную"
      className="ui-brand"
    >
      Texturn<span className="text-accent">.</span>
    </button>
  )
}

export function Card({
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={'ui-card ' + className} />
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="ui-badge">{children}</span>
}

export function Notice({
  children,
  tone = 'info',
  className = '',
}: {
  children: ReactNode
  tone?: 'info' | 'error' | 'warning'
  className?: string
}) {
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : undefined}
      className={`ui-notice ui-notice--${tone} ${className}`}
    >
      {children}
    </div>
  )
}

/** Модальное окно с возвратом фокуса, Escape и ограничением Tab внутри панели. */
export function ModalShell({
  onClose,
  width,
  maxHeight,
  label,
  panelClassName = 'flex flex-col overflow-hidden',
  children,
}: {
  onClose: () => void
  width: number
  maxHeight: string
  label: string
  panelClassName?: string
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const controls = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([type="file"]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ) || [],
      )
    // Поле с autoFocus уже получило фокус при монтировании — не перехватываем.
    // Иначе фокус получает само окно, а не первая кнопка (крестик): после
    // набора текста браузер считает ввод клавиатурным и рисовал бы на крестике
    // кольцо :focus-visible. Окно объявляется читалкой, Tab ведёт к первой кнопке.
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = controls()
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (!first) {
        event.preventDefault()
        panel.current?.focus()
        return
      }
      if (!event.shiftKey && document.activeElement === panel.current) {
        event.preventDefault()
        first.focus()
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panel.current)
      ) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      previous?.focus()
    }
  }, [])
  return (
    <div
      onClick={onClose}
      className="ui-modal-overlay animate-fade-in fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={
          'ui-modal animate-pop-in bg-paper text-ink ' + panelClassName
        }
        style={{ width, maxWidth: '100%', maxHeight }}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <IconButton title="Закрыть" onClick={onClose} className="window-close">
      <CloseIcon size={10} strokeWidth={3.4} />
    </IconButton>
  )
}

export function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className="ui-toggle"
      style={{ background: on ? 'var(--accent)' : 'var(--toggle-off)' }}
    >
      <span />
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
    <div className="ui-setting-row">
      <div className="min-w-0">
        <div className="ui-label text-ink">{label}</div>
        <div className="ui-hint">{desc}</div>
      </div>
      {children}
    </div>
  )
}

/** Сгруппированные поля: общая поверхность и разделители вместо отдельных рамок. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="ui-field-group">{children}</div>
}

export function TextField({
  label,
  hint,
  className = '',
  id,
  ...props
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId()
  const fieldId = id || generatedId
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        {...props}
        id={fieldId}
        aria-describedby={hint ? fieldId + '-hint' : props['aria-describedby']}
        className={'ui-input ' + className}
      />
      {hint && (
        <span id={fieldId + '-hint'} className="ui-hint">
          {hint}
        </span>
      )}
    </div>
  )
}

export function TextAreaField({
  label,
  hint,
  className = '',
  id,
  ...props
}: {
  label: string
  hint?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generatedId = useId()
  const fieldId = id || generatedId
  return (
    <div className="ui-field">
      <label className="ui-label" htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        {...props}
        id={fieldId}
        aria-describedby={hint ? fieldId + '-hint' : props['aria-describedby']}
        className={'ui-input resize-y ' + className}
      />
      {hint && (
        <span id={fieldId + '-hint'} className="ui-hint">
          {hint}
        </span>
      )}
    </div>
  )
}

export function SegmentedControl({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={'ui-segments ' + className}>
      {children}
    </div>
  )
}

export function SegButton({
  active,
  children,
  ...props
}: { active: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="button"
      aria-pressed={active}
      className="ui-segment"
    >
      {children}
    </button>
  )
}

export function IconButton({
  title,
  children,
  hoverBg,
  size = 32,
  className = '',
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  title: string
  hoverBg?: string
  size?: number
}) {
  return (
    <Button
      {...props}
      title={title}
      aria-label={props['aria-label'] || title}
      variant="ghost"
      onMouseDown={(e) => e.preventDefault()}
      className={'ui-icon-button ' + className}
      style={
        {
          '--icon-size': `${size}px`,
          ...(hoverBg ? { '--icon-hover': hoverBg } : {}),
          ...style,
        } as CSSProperties
      }
    >
      {children}
    </Button>
  )
}

export function RangeField({
  label,
  style,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const min = Number(props.min ?? 0)
  const max = Number(props.max ?? 100)
  const fill = max > min ? ((Number(props.value) - min) / (max - min)) * 100 : 0
  return (
    <input
      {...props}
      type="range"
      aria-label={label}
      className={'ui-range ' + className}
      style={{ '--fill': `${fill}%`, ...style } as CSSProperties}
    />
  )
}
