/**
 * ErrorBoundary - React error boundary for extension context errors
 * Catches "Extension context invalidated" and other runtime errors
 */

import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Check if this is an extension context invalidated error
    if (
      error.message?.includes('Extension context invalidated') ||
      error.message?.includes('Extension context invalidated')
    ) {
      return { hasError: true, error }
    }
    return { hasError: true, error }
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Silently catch errors - no logging in production
  }

  render() {
    if (this.state.hasError) {
      // Silently handle all errors, don't show UI
      return null
    }

    return this.props.children
  }
}