export function Toast({ message }: { message: string }) {
  return (
    <div
      className="animate-toast-in fixed z-[80] whitespace-nowrap rounded-full px-[18px] py-2.5 text-[12.5px] font-medium"
      style={{
        bottom: 46,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--toast-bg)',
        color: 'var(--toast-text)',
        boxShadow: '0 8px 28px rgba(0,0,0,.3)',
      }}
    >
      {message}
    </div>
  )
}
