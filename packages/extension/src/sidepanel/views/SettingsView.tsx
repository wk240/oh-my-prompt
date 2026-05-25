import { useState, useEffect, lazy, Suspense } from 'react'
import { ArrowLeft } from 'lucide-react'
import { BackupSection } from '../settings/BackupSection'
import { LoadingSpinner } from '../components/LoadingSpinner'

const ImportExportSection = lazy(() =>
  import('../settings/ImportExportSection').then(m => ({ default: m.ImportExportSection }))
)
const MineView = lazy(() =>
  import('./MineView').then(m => ({ default: m.default }))
)

interface SettingsViewProps {
  onBack: () => void
}

type SettingsTab = 'sync' | 'import-export' | 'mine'

const tabLabels: Record<SettingsTab, string> = {
  sync: '同步与备份',
  'import-export': '导入导出',
  mine: '我的'
}

export default function SettingsView({ onBack }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sync')

  // Handle sidepanelIntent for navigating to mine tab
  useEffect(() => {
    // Check for mine intent on mount
    chrome.storage.session.get('sidepanelIntent', (result) => {
      if (result.sidepanelIntent === 'mine') {
        setActiveTab('mine')
        chrome.storage.session.remove('sidepanelIntent')
      }
    })

    // Listen for storage changes
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName === 'session' && changes.sidepanelIntent?.newValue === 'mine') {
        setActiveTab('mine')
        chrome.storage.session.remove('sidepanelIntent')
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold truncate">设置</h1>
      </div>

      {/* Tab Bar - Adaptive layout */}
      <div className="flex px-4 py-3 border-b border-gray-200 shrink-0 bg-gray-50">
        {(Object.keys(tabLabels) as SettingsTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                : 'text-gray-600 hover:bg-white/50 hover:text-gray-900'
            }`}
          >
            {tabLabels[tab]}
          </button>
        ))}
      </div>

      {/* Tab Content - Scrollable with full width */}
      {/* Keep all tabs mounted but hidden to avoid re-querying on tab switch */}
      <div className="flex-1 w-full overflow-y-auto">
        <div className={activeTab === 'sync' ? 'block' : 'hidden'}>
          <BackupSection />
        </div>
        <div className={activeTab === 'import-export' ? 'block' : 'hidden'}>
          <Suspense fallback={<LoadingSpinner className="py-8" />}>
            <ImportExportSection />
          </Suspense>
        </div>
        <div className={activeTab === 'mine' ? 'block' : 'hidden'}>
          <Suspense fallback={<LoadingSpinner className="py-8" />}>
            <MineView />
          </Suspense>
        </div>
      </div>
    </div>
  )
}