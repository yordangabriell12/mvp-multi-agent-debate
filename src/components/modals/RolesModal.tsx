'use client'

import { Modal } from './Modal'
import { useModalStore } from '@/store/modalStore'
import { useAgentStore } from '@/store/agentStore'
import { ImproveButton } from '@/components/common/ImproveButton'

export function RolesModal() {
  const activeModal = useModalStore((s) => s.activeModal)
  const closeModal = useModalStore((s) => s.closeModal)
  const { agents, updateAgent } = useAgentStore()

  if (activeModal !== 'roles') return null

  return (
    <Modal open onClose={closeModal} title="Agent Roles & Prompts" description="Edit the system prompt for each agent." maxWidth="max-w-xl">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto">
        {agents.map((agent) => (
          <div key={agent.id}>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium">
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: agent.avatarColor }} />
                {agent.name}, {agent.roleTitle}
              </label>
              <ImproveButton
                mode="persona"
                label="Improve prompt"
                getText={() => agent.systemPrompt}
                onImproved={(text) => updateAgent(agent.id, { systemPrompt: text })}
              />
            </div>
            <textarea
              value={agent.systemPrompt}
              onChange={(e) => updateAgent(agent.id, { systemPrompt: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-surface-inset border border-border rounded-md focus:outline-none focus:border-ink-faint resize-none"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
        <button onClick={closeModal} className="px-4 py-2 text-sm text-ink-muted hover:text-ink border border-border rounded-lg hover:bg-surface-hover transition-colors">Cancel</button>
        <button onClick={closeModal} className="px-4 py-2 text-sm text-white bg-sand-800 hover:bg-ink rounded-lg transition-colors">Save</button>
      </div>
    </Modal>
  )
}