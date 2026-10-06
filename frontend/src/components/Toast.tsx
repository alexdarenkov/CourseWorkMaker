export function Toast({ message }: { message: string }) {
  return <div role="status" className="ui-toast animate-toast-in fixed bottom-8 left-1/2 z-[80] -translate-x-1/2 px-5 py-3 font-medium">{message}</div>
}
