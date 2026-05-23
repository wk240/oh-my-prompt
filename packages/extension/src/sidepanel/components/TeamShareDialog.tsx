// packages/extension/src/sidepanel/components/TeamShareDialog.tsx
import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { Prompt, TeamInfo } from '@oh-my-prompt/shared/types'
import { sharePromptToTeam } from '@/lib/team-sync'
import { usePromptStore } from '@/lib/store'

interface TeamShareDialogProps {
  prompt: Prompt
  isOpen: boolean
  onClose: () => void
  onSuccess: (teamName: string) => void
  onError: (error: string) => void
}

export function TeamShareDialog({
  prompt,
  isOpen,
  onClose,
  onSuccess,
  onError
}: TeamShareDialogProps) {
  const [teams, setTeams] = useState<TeamInfo[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const getUserTeams = usePromptStore((state) => state.getUserTeams)

  // Load user teams on open
  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      getUserTeams().then((result) => {
        setLoading(false)
        if (result.success && result.teams) {
          setTeams(result.teams)
        } else {
          onError(result.error || '获取团队列表失败')
        }
      })
    }
  }, [isOpen, getUserTeams, onError])

  // Handle share
  const handleShare = async () => {
    if (!selectedTeamId) return

    setSharing(true)
    const result = await sharePromptToTeam(prompt, selectedTeamId)
    setSharing(false)

    if (result.success) {
      const team = teams.find(t => t.id === selectedTeamId)
      onSuccess(team?.name || '团队')
      onClose()
    } else {
      onError(result.error || '共享失败')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-lg w-[320px] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">选择目标团队</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Team list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
            您还未加入任何团队，请先创建或加入团队
          </div>
        ) : (
          <div className="space-y-2 mb-4">
            {teams.map((team) => (
              <button
                key={team.id}
                onClick={() => setSelectedTeamId(team.id)}
                className={`w-full p-3 rounded-lg border text-left transition ${
                  selectedTeamId === team.id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-4 h-4 rounded-full border ${
                      selectedTeamId === team.id
                        ? 'border-purple-500 bg-purple-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedTeamId === team.id && (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    )}
                  </div>
                  <span className="font-medium">{team.name}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleShare}
            disabled={!selectedTeamId || sharing || teams.length === 0}
            className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sharing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                共享中...
              </span>
            ) : (
              '确认共享'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}