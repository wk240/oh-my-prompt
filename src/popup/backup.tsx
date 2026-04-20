import React from 'react'
import ReactDOM from 'react-dom/client'
import BackupApp from './BackupApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BackupApp />
    </ErrorBoundary>
  </React.StrictMode>
)