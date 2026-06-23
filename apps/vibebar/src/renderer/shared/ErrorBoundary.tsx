import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Catches render crashes so the overlay window is not a blank transparent rectangle. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('VibeBar overlay render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          className="vibe-no-drag flex h-full w-full flex-col items-center justify-center gap-2 bg-[#0d0f14] p-4 text-center"
          style={{ minHeight: '100vh' }}
        >
          <p className="text-sm font-medium text-red-300">Toolbar failed to load</p>
          <p className="max-w-xs text-xs text-vibe-muted">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-vibe-text hover:bg-white/15"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
