import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', err, info)
  }

  render() {
    const ar = (document.documentElement.lang || 'ar') !== 'en'
    if (!this.state.hasError) return this.props.children
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4 p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center">
          <AlertTriangle size={22} className="text-danger" />
        </div>
        <div>
          <p className="text-ink font-semibold mb-1">{ar ? 'حدث خطأ غير متوقع' : 'Something went wrong'}</p>
          <p className="text-xs text-muted font-mono max-w-sm">{this.state.message}</p>
        </div>
        <button
          onClick={() => this.setState({ hasError: false, message: '' })}
          className="flex items-center gap-2 px-4 py-2 bg-primary/15 hover:bg-primary/25 text-primary text-sm rounded-lg transition-colors"
        >
          <RefreshCw size={14} />
          {ar ? 'إعادة المحاولة' : 'Try again'}
        </button>
      </div>
    )
  }
}
