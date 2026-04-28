import React from 'react'
import ReactDOM from 'react-dom/client'
import LoadingApp from './LoadingApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LoadingApp />
    </ErrorBoundary>
  </React.StrictMode>
)