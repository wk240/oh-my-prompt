import { useState, useEffect, lazy, Suspense } from 'react'
import { LoadingSpinner } from './components/LoadingSpinner'
import { MessageType } from '@oh-my-prompt/shared/messages'

// Lazy load views
const PromptListView = lazy(() => import('./views/PromptListView').then(m => ({ default: m.default })))
const SettingsView = lazy(() => import('./views/SettingsView').then(m => ({ default: m.default })))

type CurrentView = 'prompts' | 'settings'

export default function SidePanelApp() {
  const [currentView, setCurrentView] = useState<CurrentView>('prompts')

  // Check and restore folder permission on mount (like content script dropdown)
  // This preserves user gesture from sidepanel open action (clicking extension icon)
  useEffect(() => {
    // Fire permission request message - restore permission if needed
    chrome.runtime.sendMessage({ type: MessageType.REQUEST_PERMISSION_GESTURE })
      .then((response) => {
        if (response?.success) {
          console.log('[Oh My Prompt] Sidepanel permission restored successfully')
          // Trigger sync after permission restored
          chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC })
            .then((syncResponse) => {
              if (syncResponse?.success) {
                console.log('[Oh My Prompt] Sidepanel auto-sync completed')
              }
            })
            .catch(() => {
              // Silently ignore sync errors
            })
        }
      })
      .catch((error) => {
        // Silently ignore - permission may not be configured
        console.log('[Oh My Prompt] Sidepanel permission request skipped:', error)
      })
  }, []) // Run once on mount

  // Respond to SIDEPANEL_PING from service worker (check if sidepanel is open)
  useEffect(() => {
    const handleMessage = (
      message: { type: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message.type === MessageType.SIDEPANEL_PING) {
        sendResponse({ success: true, view: currentView })
        return true // Required for async response
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [currentView])

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