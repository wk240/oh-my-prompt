import { useState, useEffect, lazy, Suspense } from 'react'
import { LoadingSpinner } from './components/LoadingSpinner'

// Lazy load views
const PromptListView = lazy(() => import('./views/PromptListView').then(m => ({ default: m.default })))
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.default })))

type CurrentView = 'prompts' | 'settings'

export default function SidePanelApp() {
  const [currentView, setCurrentView] = useState<CurrentView>('prompts')

  // Check for navigation intent from content script (OPEN_SIDEPANEL_FOR_SETTINGS)
  useEffect(() => {
    // Initial check on mount
    chrome.storage.session.get('sidepanelIntent', (result) => {
      if (result.sidepanelIntent === 'settings') {
        setCurrentView('settings')
        // Clear intent after reading
        chrome.storage.session.remove('sidepanelIntent')
      }
    })

    // Listen for storage changes (handles case when sidepanel is already open)
    // Must use chrome.storage.onChanged (global) and filter by areaName === 'session'
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'session' && changes.sidepanelIntent?.newValue === 'settings') {
        setCurrentView('settings')
        // Clear intent after reading
        chrome.storage.session.remove('sidepanelIntent')
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  return (
    <Suspense fallback={<LoadingSpinner />}>
      {currentView === 'prompts' ? (
        <PromptListView onOpenSettings={() => setCurrentView('settings')} />
      ) : (
        <SettingsView onBack={() => setCurrentView('prompts')} />
      )}
    </Suspense>
  )
}