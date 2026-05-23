// packages/extension/src/sidepanel/components/TeamShareDialog.tsx
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import type { Prompt, TeamInfo } from '@oh-my-prompt/shared/types'
import { sharePromptToTeam } from '@/lib/team-sync'
import { usePromptStore } from '@/lib/store'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/popup/components/ui/dialog'
import { Button } from '@/popup/components/ui/button'

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

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTeamId(null)
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

  // Handle open change (Radix Dialog handles Escape key and overlay click)
  const handleOpenChange = (open: boolean) => {
    if (!open) onClose()
  }

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

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>选择目标团队</DialogTitle>
          <DialogDescription>
            将「{prompt.name}」共享到团队库，团队成员可查看和使用
          </DialogDescription>
        </DialogHeader>

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
          <div className="space-y-2 py-2">
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
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            onClick={handleShare}
            disabled={!selectedTeamId || sharing || teams.length === 0}
          >
            {sharing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                共享中...
              </span>
            ) : (
              '确认共享'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}