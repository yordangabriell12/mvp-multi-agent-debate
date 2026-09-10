'use client'

import { useChatStore } from '@/store/chatStore'
import { useAgentStore } from '@/store/agentStore'
import { ChatBubble } from './ChatBubble'
import { ModeratorBubble } from './ModeratorBubble'
import { UserBubble } from './UserBubble'
import { SystemMessage } from './SystemMessage'
import { TypingIndicator } from './TypingIndicator'
import { CodeBlock } from './CodeBlock'
import { CodeInterpreter } from './CodeInterpreter'
import { HTMLPreview } from './HTMLPreview'
import { BrowserView } from './BrowserView'
import { SearchResults } from './SearchResults'
import { PPTViewer } from './PPTViewer'

const EMPTY: never[] = []

interface ChatAreaProps {
  sessionId: string
  streaming?: Record<string, string>
}

export function ChatArea({ sessionId, streaming }: ChatAreaProps) {
  const allMessages = useChatStore((s) => s.messages)
  const messages = allMessages[sessionId] ?? EMPTY
  const agents = useAgentStore((s) => s.agents)

  const streamingAgents = Object.entries(streaming || {}).filter(([, text]) => text !== '')

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[720px] mx-auto px-6 py-8">
        {messages.length === 0 && streamingAgents.length === 0 ? (
          <EmptyState agentCount={agents.length} />
        ) : (
          <div className="space-y-6">
            {messages.map((msg) => {
              // Render code messages
              if (msg.role === 'code' || msg.metadata?.code) {
                return (
                  <div key={msg.id}>
                    {msg.content && <ChatBubble name="You" role="User" color="#475569" content={msg.content} timestamp={msg.createdAt} />}
                    <CodeInterpreter initialCode={msg.metadata?.code || msg.content} />
                    {msg.metadata?.output && (
                      <div className="ml-12 mt-1 p-2 bg-green-50 border border-green-200 rounded text-xs font-mono text-green-800 whitespace-pre-wrap max-h-[200px] overflow-auto">
                        {msg.metadata.output}
                      </div>
                    )}
                    {msg.metadata?.outputImages?.map((img, i) => (
                      <img key={i} src={`data:image/png;base64,${img}`} alt="Output" className="ml-12 mt-1 max-w-[400px] rounded border" />
                    ))}
                  </div>
                )
              }

              // Render browser messages
              if (msg.role === 'browser' || msg.metadata?.screenshot) {
                return (
                  <div key={msg.id}>
                    {msg.content && <UserBubble content={msg.content} />}
                    <BrowserView initialUrl={msg.metadata?.url || ''} />
                  </div>
                )
              }

              // Render search results
              if (msg.role === 'search' || msg.metadata?.searchResults) {
                return (
                  <div key={msg.id}>
                    {msg.content && <UserBubble content={msg.content} />}
                    <SearchResults
                      results={msg.metadata?.searchResults || []}
                      query={msg.metadata?.searchQuery || ''}
                      source={msg.metadata?.searchSource}
                    />
                  </div>
                )
              }

              // Render PPT messages
              if (msg.role === 'ppt' || msg.metadata?.pptFilename) {
                return (
                  <div key={msg.id}>
                    {msg.content && <ChatBubble name="VMA" role="System" color="#6d28d9" content={msg.content} timestamp={msg.createdAt} />}
                    <PPTViewer filename={msg.metadata?.pptFilename} />
                  </div>
                )
              }

              // Render HTML preview
              if (msg.metadata?.html) {
                return (
                  <div key={msg.id}>
                    {msg.content && <ChatBubble name="VMA" role="System" color="#0e7490" content={msg.content} timestamp={msg.createdAt} />}
                    <HTMLPreview html={msg.metadata.html} />
                  </div>
                )
              }

              // Standard message rendering
              if (msg.role === 'system') {
                return <SystemMessage key={msg.id} content={msg.content} />
              }
              if (msg.role === 'moderator') {
                return <ModeratorBubble key={msg.id} content={msg.content} timestamp={msg.createdAt} />
              }
              if (msg.role === 'user') {
                return <UserBubble key={msg.id} content={msg.content} />
              }
              const agent = agents.find((a) => a.id === msg.agentId)
              if (!agent) return null
              return (
                <ChatBubble
                  key={msg.id}
                  name={agent.name}
                  role={agent.roleTitle}
                  color={agent.avatarColor}
                  content={msg.content}
                  timestamp={msg.createdAt}
                />
              )
            })}

            {streamingAgents.map(([agentId, text]) => {
              const agent = agents.find((a) => a.id === agentId)
              if (!agent) return null
              return (
                <ChatBubble
                  key={`streaming-${agentId}`}
                  name={agent.name}
                  role={agent.roleTitle}
                  color={agent.avatarColor}
                  content={text || '\u200b'}
                  timestamp={Date.now()}
                />
              )
            })}

            {Object.keys(streaming || {}).length > 0 && Object.values(streaming || {}).every((t) => t === '') && (
              <>
                {agents.filter((a) => (streaming || {})[a.id] !== undefined).map((a) => (
                  <TypingIndicator key={a.id} name={a.name} color={a.avatarColor} status={(streaming || {})[a.id] || "thinking"} />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState({ agentCount }: { agentCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 rounded-xl border border-border-strong flex items-center justify-center mb-5">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-ink-muted">
          <path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-base font-medium text-ink mb-1">Start a discussion</h3>
      <p className="text-sm text-ink-muted max-w-xs">
        Type a question below and {agentCount} agents will discuss it. Use @ to direct your question to a specific agent.
      </p>
    </div>
  )
}