import React from 'react'
import ReactDOM from 'react-dom/client'
import SettingsApp from './SettingsApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsApp />
    </ErrorBoundary>
  </React.StrictMode>
)