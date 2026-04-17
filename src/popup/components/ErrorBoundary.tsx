/**
 * ErrorBoundary - React error boundary for catching errors in popup
 */

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    console.error('[Popup ErrorBoundary]', error.message)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-[300px] h-[200px] flex items-center justify-center">
          <div className="text-center p-4">
            <p className="text-sm text-muted-foreground">
              加载出错，请重新打开扩展
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}