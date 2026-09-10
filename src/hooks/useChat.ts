import { useState, useCallback, useRef } from 'react'
import { useAgentStore } from '@/store/agentStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useChatStore } from '@/store/chatStore'
import { useSessionStore } from '@/store/sessionStore'
import { useDocumentStore } from '@/store/documentStore'
import { usePendingStore } from '@/store/pendingStore'
import type { Message } from '@/types/message'

const MODE_PREFIXES: Record<string, string> = {
  boardroom: 'STYLE: Structured boardroom debate. Be direct, challenge assumptions, pressure-test ideas. Short and sharp.',
  supportive: 'STYLE: Supportive collaboration. Build on others ideas, be encouraging, find common ground. Warm but honest.',
  learning: 'STYLE: Educational discussion. Explain concepts clearly, ask clarifying questions, use examples. Patient and thorough.',
  war: 'STYLE: Fast war room. Ultra-concise answers. Maximum 2 sentences. Speed over detail.',
  custom: '',
}

const NL = String.fromCharCode(10)
const DNL = NL + NL

// LANGUAGE RULE: Always respond in the same language as the user
const LANG_RULE = 'IMPORTANT: Always respond in the same language the user writes in. If the user writes in Indonesian, respond in Indonesian. If in English, respond in English. Match the user language exactly.'

// Dedicated Moderator system prompt — NOT an agent
const MODERATOR_SYSTEM = `You are an expert meeting moderator and facilitator. You are NOT one of the participants.

CAPABILITIES: Call specific agents by name with targeted questions. Route questions to the RIGHT agent based on expertise. Challenge vague answers. Bridge conflicting points. Redirect off-topic discussions.

AGENT EXPERTISE MAP:
- Financial questions (budget, ROI, cashflow, cost): Finance Advisor
- Legal/compliance (contracts, regulations, liability): Legal Counsel
- Sales/market/customers (revenue, pipeline, growth): VP of Sales
- Complex topics spanning multiple domains: call multiple agents

RULES:
- Always address agents by name, reference their expertise
- Be concise: 2-3 sentences max
- Never give opinions — only facilitate
- Highlight disagreements explicitly
- Push for depth when answers are shallow
- Use the same language as the discussion
- When calling an agent, use their expertise: "As our finance expert..."
${LANG_RULE}`

const MODERATOR_DECISION = `You are the intelligent meeting orchestrator. You see the full transcript AND discussion state.

PHASES: OPENING (call first expert) -> EXPLORATION (route by domain) -> DEEPENING (challenge/clarify) -> RESOLUTION (decisions)

TOPIC ROUTING:
- FINANCIAL (budget, ROI, cashflow, cost): Finance Advisor
- LEGAL (contracts, compliance, risk): Legal Counsel
- SALES (customers, pipeline, market): VP of Sales
- CROSS-DOMAIN: call multiple agents

QUALITY CHECK:
- SHALLOW (< 80 words): use CLARIFY — "Can you be more specific?"
- NO EVIDENCE: use CHALLENGE — "What data supports this?"
- CONTRADICTION: use BRIDGE — "Agent A says X, Agent B says not-X. Reconcile."
- OFF-TOPIC: use REDIRECT — "Let's focus on the core issue."
- STRONG: acknowledge, move on

DISAGREEMENTS: If agent A says X and B says not-X, prioritize it with BRIDGE or CHALLENGE. After 2 rounds unresolved, present both and move on.

FOLLOW-UP MEMORY: Do NOT repeat questions. Track what is covered vs not.

TIME: > 6 rounds simple topic = SUMMARY. > 10 rounds complex = RESOLUTION. Responses getting shorter = SUMMARY.

ACTIONS: FOLLOWUP/CLARIFY/CHALLENGE/BRIDGE/ELABORATE/REDIRECT/MULTI/POLL/SUMMARY

OUTPUT: {"action":"TYPE","agents":["Name"],"question":"q","topic":"FINANCIAL|LEGAL|SALES|CROSS"}
SUMMARY: {"action":"SUMMARY"}`

// Extract agent names mentioned in text
function findAgentsInMessage(text: string, roomAgents: { id: string; name: string; roleTitle: string }[]): { id: string; name: string }[] {
  const found: { id: string; name: string }[] = []
  const lower = text.toLowerCase()
  for (const agent of roomAgents) {
    if (lower.includes(agent.name.toLowerCase()) || lower.includes('@' + agent.name.toLowerCase())) {
      found.push({ id: agent.id, name: agent.name })
    }
  }
  return found
}

// Extract @mentions from agent response (for agent-to-agent tags)
function extractAgentTags(text: string, roomAgents: { id: string; name: string }[]): string[] {
  const tags: string[] = []
  const mentionPattern = text.match(/@(\w+)/g)
  if (!mentionPattern) return tags
  for (const mention of mentionPattern) {
    const name = mention.slice(1).toLowerCase()
    const agent = roomAgents.find(a => a.name.toLowerCase() === name)
    if (agent) tags.push(agent.name)
  }
  return [...new Set(tags)]
}

export function useChat(sessionId: string) {
  const [streaming, setStreaming] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [loopRound, setLoopRound] = useState(0)
  const abortRef = useRef<AbortController[]>([])
  const stoppedRef = useRef(false)
  const agents = useAgentStore((s) => s.agents)
  const providers = useSettingsStore((s) => s.providers)
  const addMessage = useChatStore((s) => s.addMessage)
  const session = useSessionStore((s) => s.sessions.find((s) => s.id === sessionId))
  const updateSession = useSessionStore((s) => s.updateSession)
  const documents = useDocumentStore((s) => s.documents)

  const buildRagContext = useCallback((agentId: string): string => {
    const agentDocs = documents.filter((d) => d.agentId === agentId)
    const generalDocs = documents.filter((d) => !d.agentId)
    const all = [...agentDocs, ...generalDocs]
    if (all.length === 0) return ''
    const sections = all.map((d) => '--- ' + d.name + ' ---' + NL + (d.content.length > 3000 ? d.content.slice(0, 3000) + '...' : d.content))
    return DNL + 'REFERENCE DOCUMENTS:' + NL + sections.join(DNL)
  }, [documents])

  const getModePrefix = useCallback((): string => {
    if (!session) return ''
    return MODE_PREFIXES[session.presetMode] || ''
  }, [session])

  const buildContext = useCallback((
    history: Message[], agentName: string, agentId: string,
    agentsMap: Record<string, string>, liveResponses: Record<string, string>, isDebate = false, moderatorQuestion = "", webSearchResults = ""
  ): { role: 'user' | 'assistant'; content: string }[] => {
    const userMsgs = history.filter((m) => m.role === 'user')
    const latestUser = userMsgs[userMsgs.length - 1]
    const rag = buildRagContext(agentId)
    const agent = agents.find(a => a.id === agentId)
    const persona = agent?.persona
    const skills = agent?.skills || []
    const memory = agent?.memory || []
    // Build persona injection
    let personaBlock = ''
    if (persona && persona.personality) {
      personaBlock = DNL + 'YOUR PERSONALITY & STYLE:' + NL
      personaBlock += persona.personality + NL
      personaBlock += 'Communication: ' + persona.communicationStyle + NL
      personaBlock += 'Values: ' + persona.values.join(', ') + NL
      personaBlock += 'Known biases: ' + persona.biases + NL
      if (persona.steelmansOthers) personaBlock += 'Before countering, acknowledge good points from others.' + NL
      if (persona.admitsUncertainty) personaBlock += 'Say I do not know or data is limited when appropriate.' + NL
      if (persona.usesRealExamples) personaBlock += 'Use real company examples, case studies, concrete numbers.' + NL
      if (persona.challengesAssumptions) personaBlock += 'Question flawed premises. Ask is that really true?' + NL
      personaBlock += 'Depth: ' + (persona.depth > 0.7 ? 'Give thorough detailed responses with examples.' : persona.depth > 0.4 ? 'Give balanced responses.' : 'Keep responses brief and focused.') + NL
      personaBlock += 'Confidence: ' + (persona.confidence > 0.7 ? 'Be assertive. State position clearly.' : 'Express uncertainty where appropriate.') + NL
      personaBlock += 'Adapt length to topic complexity. Simple = 2-3 sentences. Complex = up to 5 sentences.' + NL
    }
    let skillsBlock = ''
    if (skills.length > 0) {
      skillsBlock = DNL + 'YOUR SKILLS:' + NL
      for (const skill of skills) {
        skillsBlock += '- ' + skill.name + ': ' + skill.knowledge.slice(0, 300) + NL
      }
    }
    let memoryBlock = ''
    const recentMemory = memory.slice(-3)
    if (recentMemory.length > 0) {
      memoryBlock = DNL + 'YOUR PAST EXPERIENCE (use naturally, do not say "in previous discussions I said..."):' + NL
      for (const mem of recentMemory) {
        memoryBlock += '- Topic: ' + mem.topic.slice(0, 80) + NL
        memoryBlock += '  Your position: ' + mem.position.slice(0, 150) + NL
        if (mem.learnedFrom.length > 0) memoryBlock += '  You engaged with: ' + mem.learnedFrom.join('; ') + NL
      }
      memoryBlock += 'Example: weave experience naturally. E.g. "From what I have seen with similar situations..."' + NL
    }
    // Web search injection
    let webSearchBlock = ''
    if (agent?.webSearch && moderatorQuestion) {
          }

    const mp = getModePrefix()
    const recent = history.slice(-100)
    const lines: string[] = []
    for (const m of recent) {
      if (m.role === 'system') continue
      if (m.role === 'user') lines.push('[User]: ' + m.content)
      else if (m.role === 'agent') {
        const sp = m.agentId ? (agentsMap[m.agentId] || 'Advisor') : 'Advisor'
        lines.push('[' + sp + ']: ' + (m.content.length > 500 ? m.content.slice(0, 500) + '...' : m.content))
      }
    }
    for (const [otherId, liveText] of Object.entries(liveResponses)) {
      if (otherId === agentId || !liveText) continue
      lines.push('[' + (agentsMap[otherId] || 'Advisor') + ' (writing)]: ' + (liveText.length > 300 ? liveText.slice(0, 300) + '...' : liveText))
    }
    const linesStr = lines.join(NL)
    const prefix = mp ? mp + DNL : ''
    if (isDebate) {
      return [{ role: 'user' as const, content: 'You are ' + agentName + '. This is a HIGH-STAKES debate. Others below are THEIR OWN statements.' + NL + prefix + personaBlock + skillsBlock + memoryBlock + 'DEBATE RULES:' + NL + '1. DISAGREE if you see flaws. Say "That is wrong because..." not "I see your point, but..."' + NL + '2. CHALLENGE weak evidence. Ask "Where is the data?" "Have you actually tested this?"' + NL + '3. Use SPECIFIC examples, numbers, cases. Vague claims get called out.' + NL + '4. Be CONCISE but SHARP. 4-6 sentences. Every sentence must add value.' + NL + '5. Do NOT include your name or title.' + NL + LANG_RULE + rag + DNL + linesStr + DNL + 'Respond now.' }]
    }
    const questionToAnswer = moderatorQuestion || (latestUser?.content || '')
    const questionLabel = moderatorQuestion ? 'MODERATOR ASKS' : 'USER ASKS'
    return [{ role: 'user' as const, content: 'You are ' + agentName + ', a participant in a multi-agent discussion room.' + NL + prefix + personaBlock + skillsBlock + memoryBlock + webSearchBlock + 'INSTRUCTIONS:' + NL + '1. Respond to ' + questionLabel + ' below.' + NL + '2. Be concise.' + NL + '3. Do NOT include your name or title in response.' + NL + '4. Do not repeat earlier points. Reference what others said above.' + LANG_RULE + rag + DNL + questionLabel + ': "' + questionToAnswer + '"' + NL + 'Context:' + NL + (linesStr || '(first message)') + DNL + 'Respond.' }]
  }, [buildRagContext, getModePrefix])

  const getTargetAgents = useCallback((content: string): { id: string; name: string }[] => {
    const roomAgents = agents.filter((a) => session?.agentIds.includes(a.id))
    if (/@all\b/i.test(content)) return roomAgents.map((a) => ({ id: a.id, name: a.name }))
    const mentions = content.match(/@(\w+)/g)?.map((m) => m.slice(1).toLowerCase()) || []
    if (mentions.length > 0) return roomAgents.filter((a) => mentions.includes(a.name.toLowerCase())).map((a) => ({ id: a.id, name: a.name }))
    const lower = content.toLowerCase()
    const scored = roomAgents.map((a) => {
      const rw = (a.roleTitle + ' ' + a.name + ' ' + a.systemPrompt).toLowerCase()
      let s = 0
      for (const k of ['finance','sales','legal','money','law','revenue','contract','invest','cost','risk','tax','hiring','marketing','budget','debt','profit','cashflow','litigation','compliance','pricing']) if (rw.includes(k) && lower.includes(k)) s++
      return { id: a.id, name: a.name, score: s }
    }).sort((a, b) => b.score - a.score)
    return (scored[0]?.score > 0 ? scored.filter((s) => s.score > 0).slice(0, 2) : scored.slice(0, 1)).map((a) => ({ id: a.id, name: a.name }))
  }, [agents, session])

  const callAgent = useCallback(async (
    agentId: string, chatMessages: { role: 'user' | 'assistant'; content: string }[],
    onText?: (text: string) => void, signal?: AbortSignal, overridePrompt?: string
  ): Promise<string> => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return ''
    const provider = providers.find((p) => p.id === agent.model.provider)
    if (!provider?.apiKey) { addMessage(sessionId, { role: 'system', content: agent.name + ' skipped - no API key', sessionId }); return '' }
    const controller = new AbortController()
    abortRef.current.push(controller)
    try {
      setStreaming((prev) => ({ ...prev, [agent.id]: 'formulating response' }))
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages, agent: { id: agent.id, name: agent.name, systemPrompt: overridePrompt || agent.systemPrompt, provider: provider.id, modelName: agent.model.modelName }, providers: providers.filter((p) => p.apiKey) }),
        signal: controller.signal,
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Failed') }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No body')
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split(NL)) {
          if (line.startsWith('0:')) {
            const raw = line.slice(2)
            try { const d = JSON.parse(raw); fullText += typeof d === 'string' ? d : String(d) } catch { fullText += raw.replace(/^\"|\"$/g, '') }
            setStreaming((prev) => ({ ...prev, [agent.id]: fullText }))
            onText?.(fullText)
          } else if (line.trim() && !line.startsWith('d:') && !line.startsWith('g:') && !line.startsWith('e:')) {
            fullText += line
            setStreaming((prev) => ({ ...prev, [agent.id]: fullText }))
            onText?.(fullText)
          }
        }
      }
      if (fullText) addMessage(sessionId, { role: 'agent', agentId: agent.id, content: fullText, sessionId, metadata: { model: agent.model.modelName } })
      return fullText
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return ''
      addMessage(sessionId, { role: 'system', content: agent.name + ' error: ' + (err instanceof Error ? err.message : 'Unknown'), sessionId })
      return ''
    } finally {
      setStreaming((prev) => { const n = { ...prev }; delete n[agent.id]; return n })
      const idx = abortRef.current.indexOf(controller)
      if (idx > -1) abortRef.current.splice(idx, 1)
    }
  }, [agents, providers, addMessage, sessionId])

  const checkConsensus = useCallback(async (agentsMap: Record<string, string>): Promise<boolean> => {
    const roomAgents = agents.filter((a) => session?.agentIds.includes(a.id))
    const first = roomAgents[0]
    if (!first) return true
    const history = useChatStore.getState().messages[sessionId] || []
    const recent = history.slice(-5).filter((m) => m.role === 'agent')
    if (recent.length < 2) return false
    const lines = recent.map((m) => '[' + (m.agentId ? (agentsMap[m.agentId] || 'Advisor') : 'Advisor') + ']: ' + m.content.slice(0, 300)).join(NL)
    const provider = providers.find((p) => p.id === first.model.provider)
    if (!provider?.apiKey) return false
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user' as const, content: 'CONSENSUS or CONTINUE?' + DNL + lines }], agent: { id: first.id, name: first.name, systemPrompt: 'Reply one word: CONSENSUS or CONTINUE.', provider: provider.id, modelName: first.model.modelName }, providers: providers.filter((p) => p.apiKey) }) })
      const reader = res.body?.getReader(); if (!reader) return false
      const decoder = new TextDecoder(); let text = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value, { stream: true }) }
      return /CONSENSUS/i.test(text)
    } catch { return false }
  }, [agents, providers, session, sessionId])

  // ==========================================
  // MAIN SEND: normal + moderator
  // ==========================================
  const sendMessage = useCallback(async (content: string) => {
    if (!session) return

    // If the moderator is waiting for the user's answer, route this message
    // to resume the discussion instead of starting a new one.
    const resolver = usePendingStore.getState().takeResolver(sessionId)
    if (resolver) {
      addMessage(sessionId, { role: 'user', content, sessionId })
      resolver(content)
      return
    }

    setLoading(true)
    setLoopRound(0)
    stoppedRef.current = false
    abortRef.current = []
    updateSession(session.id, { status: 'running', currentRound: 1 })
    addMessage(sessionId, { role: 'user', content, sessionId })

    const agentsMap: Record<string, string> = {}
    agents.forEach((a) => { agentsMap[a.id] = a.name })

    const roomAgents = agents.filter((a) => session.agentIds.includes(a.id))
    const moderatorEnabled = session.settings.moderatorEnabled

    if (moderatorEnabled && roomAgents.length > 0) {
      // ========== MODERATOR MODE (agentic) ==========
      // Moderator uses dedicated provider if configured, otherwise first available
      const moderatorProviderId = useSettingsStore.getState().moderatorProviderId
      const moderatorModelId = useSettingsStore.getState().moderatorModelId
      const modProvider = moderatorProviderId
        ? providers.find((p) => p.id === moderatorProviderId && p.apiKey)
        : providers.find((p) => p.apiKey)
      if (!modProvider) {
        addMessage(sessionId, { role: 'system', content: 'No API key configured for moderator.', sessionId })
        updateSession(session.id, { status: 'idle' })
        setLoading(false)
        return
      }

      const modModelName = moderatorModelId && modProvider.models.some(m => m.id === moderatorModelId)
        ? moderatorModelId
        : modProvider.models[0]?.id || ''
      const modAgent = { id: '__moderator__', name: 'Moderator', systemPrompt: MODERATOR_SYSTEM, provider: modProvider.id, modelName: modModelName }
      const modDecisionAgent = { ...modAgent, systemPrompt: MODERATOR_DECISION }
      const userMsgs = useChatStore.getState().messages[sessionId] || []
      const lastUser = userMsgs.filter((m) => m.role === 'user').pop()
      const agentList = roomAgents.map((a) => a.name + ' (' + a.roleTitle + ')').join(', ')

      // Phase 1: Moderator opens
      addMessage(sessionId, { role: 'system', content: 'Moderator is facilitating this discussion.', sessionId })

      // Detect greeting — if user just said hello, ask what they want to discuss first
      const trimmedContent = content.trim()
      const isGreeting = trimmedContent.length < 20 && /^(halo|hai|hi|hello|hey|selamat|pagi|siang|sore|malam|test|tes|yo|woi)\b/i.test(trimmedContent)
      let discussionTopic = content

      if (isGreeting) {
        const greetCtx = [{ role: 'user' as const, content: 'The user greeted you with: "' + content + '". Respond warmly and ask what topic they would like to discuss with the team. Keep it to 1-2 sentences. ' + LANG_RULE }]
        await callMod(greetCtx, modAgent)
        // Wait for user to provide the actual topic
        setLoading(false)
        const topicAnswer = await usePendingStore.getState().waitForAnswer(sessionId)
        if (stoppedRef.current) return
        setLoading(true)
        discussionTopic = topicAnswer
      }

      // Detect "no topic" response — if user says they don't have a topic yet, suggest some
      const topicTrimmed = discussionTopic.trim()
      const isNoTopic = topicTrimmed.length < 20 && /^(belum|gak|tidak|enggak|nggak|belum ada|belum tahu|belum kepikiran|belum pikir|entah|terserah|bebas|random|apa aja|apa saja|ga ada|blm|blom)\b/i.test(topicTrimmed)

      if (isNoTopic) {
        const suggestCtx = [{ role: 'user' as const, content: 'The user said they don\'t have a specific topic yet. Suggest 2-3 interesting discussion topics that would benefit from multi-perspective analysis (sales, finance, legal). Keep it brief and engaging. ' + LANG_RULE }]
        await callMod(suggestCtx, modAgent)
        // Wait for user to pick a topic
        setLoading(false)
        const topicAnswer2 = await usePendingStore.getState().waitForAnswer(sessionId)
        if (stoppedRef.current) return
        setLoading(true)
        discussionTopic = topicAnswer2
      }

      const openCtx = [{ role: 'user' as const, content: 'USER QUESTION: "' + discussionTopic + '"' + DNL + 'PARTICIPANTS: ' + agentList + DNL + 'Call the FIRST agent by name with a specific question based on their expertise. Max 2 sentences. ' + LANG_RULE }]
      await callMod(openCtx, modAgent)

      // Phase 2: Agentic loop — moderator decides each step
      const agentsSpoken = new Set<string>()
      let followUpCount = 0
      const maxTotalTurns = roomAgents.length <= 2 ? 6 : roomAgents.length <= 4 ? 9 : 12 // adaptive to group size
      let totalTurns = 0
      let lastModText = ''

      // Get the moderator's opening message to find which agent(s) to call first
      const hist0 = useChatStore.getState().messages[sessionId] || []
      const lastModMsg = hist0.filter(m => m.role === 'moderator').pop()
      lastModText = lastModMsg?.content || ''
      let initialTargets = findAgentsInMessage(lastModText, roomAgents)
      if (initialTargets.length === 0) initialTargets = [roomAgents[0]] // fallback: first agent

      for (const target of initialTargets) {
        setLoopRound(totalTurns + 2)
        updateSession(session.id, { currentRound: totalTurns + 2 })
        const hist = useChatStore.getState().messages[sessionId] || []
        // Pass moderator's opening question so agent responds to THAT
        const modHist = hist.filter(m => m.role === 'moderator')
        const lastModQ = modHist.length > 0 ? modHist[modHist.length - 1].content : ''
        const ctx = buildContext(hist, target.name, target.id, agentsMap, {}, false, lastModQ)
        await callAgent(target.id, ctx)
        agentsSpoken.add(target.name)
        totalTurns++
      }

      // Check for tags in the last agent response
      const hist0b = useChatStore.getState().messages[sessionId] || []
      const lastAgentMsg = hist0b.filter(m => m.role === 'agent').pop()
      const initialTags = extractAgentTags(lastAgentMsg?.content || '', roomAgents)
      if (initialTags.length > 0) {
        // Feed tags to moderator for decision
        for (const tagName of initialTags) {
          const taggedAgent = roomAgents.find(a => a.name === tagName)
          if (taggedAgent && !agentsSpoken.has(taggedAgent.name)) {
            const tagCtx = [{ role: 'user' as const, content: tagName + ' was tagged by ' + (lastAgentMsg?.agentId ? agentsMap[lastAgentMsg.agentId] : 'an agent') + '. Should they respond? Reply ACTION: FOLLOWUP with AGENT: ' + tagName + ' and a brief question, or ACTION: SUMMARY.' }]
            const tagDecision = await callModSilent(tagCtx, modDecisionAgent)
            const tagParsed = parseDecision(tagDecision)
            if (tagParsed.action === 'followup' && tagParsed.question) {
              const followUpCtx = [{ role: 'user' as const, content: tagParsed.question + DNL + 'This is a follow-up question for ' + tagName + '. Max 2 sentences. ' + LANG_RULE }]
              await callMod(followUpCtx, modAgent)
              const hist2 = useChatStore.getState().messages[sessionId] || []
              const agentCtx = buildContext(hist2, taggedAgent.name, taggedAgent.id, agentsMap, {}, false)
              await callAgent(taggedAgent.id, agentCtx)
              agentsSpoken.add(taggedAgent.name)
              totalTurns++
            }
          }
        }
      }


      // Phase 2b + 3 wrapped in a continuation loop: ask user before summarizing
      let wantsSummary = false
      while (!wantsSummary) {
      // Phase 2b: Moderator decision loop
      while (followUpCount < 3 && totalTurns < maxTotalTurns) {
        const hist = useChatStore.getState().messages[sessionId] || []
        const transcript = buildTranscript(hist, agentsMap, lastUser?.content || content, roomAgents.map(a => a.name), followUpCount)

                // Check for @tags in the last agent response
        const histTags = useChatStore.getState().messages[sessionId] || []
        const lastAgentMsgTag = histTags.filter(m => m.role === 'agent').pop()
        const agentTags = extractAgentTags(lastAgentMsgTag?.content || '', roomAgents)
        const tagInfo = agentTags.length > 0 ? DNL + 'AGENT TAGS in last response: ' + agentTags.join(', ') + '. Consider calling them to respond.' : ''

        const decisionCtx = [{ role: 'user' as const, content: transcript + tagInfo + DNL + 'DECIDE the next action. Output ONLY the ACTION block.' }]
        const decisionText = await callModSilent(decisionCtx, modDecisionAgent)
        const decision = parseDecision(decisionText)

        if (decision.action === 'summary') break
        if (!decision.question) break

        // Resolve target agents from decision
        let targetNames: string[] = []
        if (decision.agents && decision.agents.length > 0) {
          targetNames = decision.agents
        } else {
          break // no agents specified
        }

        // Resolve agent objects
        const targetAgents = targetNames
          .map(name => roomAgents.find(a => a.name.toLowerCase() === name.toLowerCase()))
          .filter((a): a is typeof roomAgents[0] => !!a)
        if (targetAgents.length === 0) break

        // Build action-specific prompt prefix
        const actionPrefix: Record<string, string> = {
          followup: 'Follow-up question',
          multi: 'Direct this question to both/all named agents',
          clarify: 'The agent gave a vague answer — ask for specific details',
          challenge: 'Challenge the agent with a counterpoint or request evidence',
          bridge: 'Connect the points of the named agents and ask how they relate',
          elaborate: 'Ask the agent to expand on a specific point they mentioned',
          redirect: 'Redirect the discussion back to the core topic',
          poll: 'Ask ALL agents for a quick stance (1-2 sentences each)',
        }
        const prefix = actionPrefix[decision.action] || 'Follow-up question'

        // Moderator asks (visible to user)
        const targetList = targetAgents.map(a => a.name).join(' and ')
        const followUpCtx = [{ role: 'user' as const, content: prefix + ' directed at ' + targetList + '.' + DNL + decision.question + DNL + 'Max 3 sentences. ' + LANG_RULE }]
        await callMod(followUpCtx, modAgent)

        // Get moderator follow-up text and extract additional agent targets
        const hist2 = useChatStore.getState().messages[sessionId] || []
        const lastMod2 = hist2.filter(m => m.role === 'moderator').pop()
        const followUpTargets = findAgentsInMessage(lastMod2?.content || '', roomAgents)
        // Merge: explicit targets + parsed targets from moderator text
        const allTargets = followUpTargets.length > 0 ? followUpTargets : targetAgents

        // For POLL action, call all agents that haven't been called yet in this round
        const pollTargets = decision.action === 'poll'
          ? roomAgents.filter(a => !agentsSpoken.has(a.name) || followUpCount > 0)
          : allTargets

        for (const ft of pollTargets) {
          const hist3 = useChatStore.getState().messages[sessionId] || []
          const agentCtx = buildContext(hist3, ft.name, ft.id, agentsMap, {}, false, decision.question || '')
          await callAgent(ft.id, agentCtx)
          agentsSpoken.add(ft.name)
          totalTurns++
        }

        followUpCount++
        totalTurns++
      }

      // Ask (via moderator in chat) whether the user wants to continue before summarizing
      const askCtx = [{ role: 'user' as const, content: 'The discussion has covered the main points. Ask the user whether there is anything else they want to discuss before you summarize. Keep it to 1-2 sentences, addressed to the user. ' + LANG_RULE }]
      await callMod(askCtx, modAgent)

      // Allow the user to type a reply while the moderator waits
      setLoading(false)
      const answer = await usePendingStore.getState().waitForAnswer(sessionId)
      if (stoppedRef.current) return
      setLoading(true)

      // Use moderator LLM to classify user intent: SUMMARY or CONTINUE
      const classifyCtx = [{ role: 'user' as const, content: 'The user was asked if they want to continue the discussion or get a summary. The user replied: "' + answer + '"\n\nDoes the user want to CONTINUE the discussion with new topics, or get a SUMMARY now? Consider the full context and intent, not just keywords. Reply with ONLY one word: SUMMARY or CONTINUE.' }]
      const classifyResult = await callModSilent(classifyCtx, modDecisionAgent)

      if (/summary/i.test(classifyResult)) {
        wantsSummary = true
      } else {
        // User wants to continue: treat their answer as a new prompt for the discussion
        followUpCount = 0
        totalTurns = 0
      }
      } // end continuation loop

      // Phase 3: Moderator summary with full transcript
      setLoopRound(totalTurns + 2)
      const finalHist = useChatStore.getState().messages[sessionId] || []
      const transcript = finalHist
        .filter((m) => m.role === 'user' || m.role === 'agent' || m.role === 'moderator')
        .map((m) => {
          if (m.role === 'user') return '[User]: ' + m.content
          if (m.role === 'moderator') return '[Moderator]: ' + m.content
          const name = m.agentId ? (agentsMap[m.agentId] || 'Advisor') : 'Advisor'
          return '[' + name + ']: ' + m.content
        })
        .join(DNL)
      const sumCtx = [{ role: 'user' as const, content: 'DISCUSSION TRANSCRIPT:' + DNL + transcript + DNL + '---' + DNL + 'You are the Moderator. Based on the actual discussion above, provide FINAL SUMMARY:' + DNL + '1. Each agent position (use their ACTUAL names from transcript, 1 line each)' + DNL + '2. Consensus vs disagreement' + DNL + '3. RECOMMENDATION with reasoning' + DNL + '4. 2-3 ACTION ITEMS with owners' + DNL + LANG_RULE }]
      await callMod(sumCtx, modAgent)
      addMessage(sessionId, { role: 'system', content: 'Discussion complete.', sessionId })

    } else {// ========== NORMAL MODE ==========    } else {// ========== NORMAL MODE ==========
      const targets = getTargetAgents(content)
      const liveResponses: Record<string, string> = {}

      const firstTarget = targets[0]
      const firstAgentPromise = (async () => {
        const agent = agents.find((a) => a.id === firstTarget?.id)
        if (!agent) return
        const history = useChatStore.getState().messages[sessionId] || []
        const ctx = buildContext(history, agent.name, agent.id, agentsMap, liveResponses, false)
        const text = await callAgent(agent.id, ctx, (t) => { liveResponses[agent.id] = t })
        liveResponses[agent.id] = text
      })()

      if (targets.length > 1) {
        await new Promise((r) => setTimeout(r, 1500))
        const remaining = targets.slice(1).map(async (target) => {
          const agent = agents.find((a) => a.id === target.id)
          if (!agent) return
          await new Promise((r) => setTimeout(r, 500))
          const history = useChatStore.getState().messages[sessionId] || []
          const ctx = buildContext(history, agent.name, agent.id, agentsMap, liveResponses, false)
          const text = await callAgent(agent.id, ctx, (t) => { liveResponses[agent.id] = t })
          liveResponses[agent.id] = text
        })
        await Promise.all([firstAgentPromise, ...remaining])
      } else {
        await firstAgentPromise
      }

      const loopCap = session.settings.maxRounds === 'unlimited' ? 2 : Math.min(session.settings.maxRounds, 2)
      let round = 1
      while (round < loopCap) {
        round++
        setLoopRound(round)
        updateSession(session.id, { currentRound: round })
        await Promise.all(roomAgents.map(async (agent) => {
          const hist = useChatStore.getState().messages[sessionId] || []
          const ctx = buildContext(hist, agent.name, agent.id, agentsMap, {}, true)
          const text = await callAgent(agent.id, ctx)
          liveResponses[agent.id] = text
        }))
        if (await checkConsensus(agentsMap)) {
          addMessage(sessionId, { role: 'system', content: 'Consensus reached after round ' + round, sessionId })
          break
        }
        await new Promise((r) => setTimeout(r, session.settings.loopSpeed === 'slow' ? 2500 : session.settings.loopSpeed === 'fast' ? 500 : 1200))
      }
    }

    updateSession(session.id, { status: 'idle' })
    setLoading(false)
  }, [session, sessionId, agents, providers, getTargetAgents, buildContext, callAgent, checkConsensus, updateSession, addMessage])

  // Parse structured decision from moderator LLM output
  type DecisionAction = 'followup' | 'multi' | 'clarify' | 'challenge' | 'bridge' | 'elaborate' | 'redirect' | 'poll' | 'summary'
  interface ModeratorDecision {
    action: DecisionAction
    agents?: string[]
    question?: string
  }
  const parseDecision = (text: string): ModeratorDecision => {
    // Try JSON parse first (new format)
    try {
      const jsonMatch = text.match(/\{[^}]+\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.action && parsed.action !== 'summary') {
          const agents = Array.isArray(parsed.agents) ? parsed.agents : (parsed.agent ? [parsed.agent] : [])
          return { action: parsed.action.toLowerCase(), agents, question: parsed.question || undefined }
        }
        return { action: 'summary' }
      }
    } catch { /* fall through to legacy parse */ }
    // Legacy fallback: ACTION: FOLLOWUP / SUMMARY
    const actionMatch = text.match(/ACTION:\s*(SUMMARY|FOLLOWUP)/i)
    if (!actionMatch || actionMatch[1].toUpperCase() === 'SUMMARY') return { action: 'summary' }
    const agentMatch = text.match(/AGENT:\s*(.+)/i)
    const questionMatch = text.match(/QUESTION:\s*(.+)/i)
    if (!agentMatch || !questionMatch) return { action: 'summary' }
    return { action: 'followup', agents: [agentMatch[1].trim()], question: questionMatch[1].trim() }
  }

  // Build transcript for moderator decision-making
  const buildTranscript = useCallback((
    history: Message[], agentsMap: Record<string, string>, userQuestion: string, agentNames: string[], followUpCount: number
  ): string => {
    const lines: string[] = []
    const lastUserIdx = history.map(m => m.role).lastIndexOf('user')
    const roundHist = lastUserIdx > -1 ? history.slice(lastUserIdx) : history
    const agentMessages = roundHist.filter(m => m.role === 'agent')
    const spokenAgents = new Set(agentMessages.map(m => m.agentId ? agentsMap[m.agentId] : '').filter(Boolean))
    const notSpoken = agentNames.filter(n => !spokenAgents.has(n))
    const totalAgents = agentNames.length
    const responsesCount = agentMessages.length

    // Quality scoring
    const shallowResponses: string[] = []
    for (const m of agentMessages) {
      const name = m.agentId ? agentsMap[m.agentId] : 'Agent'
      if (m.content.split(/\s+/).length < 80) shallowResponses.push(name)
    }

    // Disagreement detection
    const disagreements: string[] = []
    if (agentMessages.length >= 2) {
      const contents = agentMessages.map(m => ({
        name: m.agentId ? agentsMap[m.agentId] : 'Agent', text: m.content.toLowerCase()
      }))
      const pairs = [['setuju','tidak setuju'],['harus','tidak harus'],['bisa','tidak bisa'],['risiko','aman'],['cepat','pelan'],['mahal','murah'],['lanjutkan','hentikan'],['positif','negatif'],['setuju','tolak']]
      for (let i=0;i<contents.length;i++) {
        for (let j=i+1;j<contents.length;j++) {
          for (const [p,n] of pairs) {
            if ((contents[i].text.includes(p)&&contents[j].text.includes(n))||(contents[i].text.includes(n)&&contents[j].text.includes(p))) {
              disagreements.push(contents[i].name+' vs '+contents[j].name+' ('+p+'/'+n+')')
              break
            }
          }
        }
      }
    }

    // Agent skills + dynamics
    const agentSkills = agents.filter(a=>a.skills&&a.skills.length>0).map(a=>a.name+': '+a.skills.map(s=>s.name).join(', '))
    const dynamics = agents.filter(a=>a.memory&&a.memory.length>0&&a.memory[a.memory.length-1].learnedFrom.length>0)
      .map(a=>a.name+' engaged with: '+a.memory[a.memory.length-1].learnedFrom.join(', '))

    const elapsed = Math.round((Date.now()-(roundHist[0]?.createdAt||Date.now()))/60000)
    const complexity = userQuestion.split(/\s+/).length>30?'COMPLEX':userQuestion.split(/\s+/).length>15?'MODERATE':'SIMPLE'

    lines.push('TOPIC: '+userQuestion)
    lines.push('COMPLEXITY: '+complexity+' | ELAPSED: '+elapsed+' min')
    lines.push('PHASE: '+(responsesCount===0?'OPENING':responsesCount<totalAgents?'EXPLORATION':followUpCount===0?'DEEPENING':'RESOLUTION'))
    lines.push('SPOKEN: '+Array.from(spokenAgents).join(', ')+' ('+responsesCount+'/'+totalAgents+')')
    if (notSpoken.length>0) lines.push('NOT YET CALLED: '+notSpoken.join(', '))
    if (shallowResponses.length>0) lines.push('SHALLOW: '+shallowResponses.join(', '))
    if (disagreements.length>0) lines.push('DISAGREEMENTS: '+disagreements.join('; '))
    if (agentSkills.length>0) lines.push('SKILLS: '+agentSkills.join(' | '))
    if (dynamics.length>0) lines.push('DYNAMICS: '+dynamics.join(' | '))
    lines.push('ROUNDS: '+followUpCount+' | TURNS: '+responsesCount)
    lines.push('')

    for (const m of roundHist) {
      if (m.role==='moderator'||m.role==='system') continue
      if (m.role==='user') lines.push('[User]: '+m.content)
      else if (m.role==='agent') {
        const name=m.agentId?(agentsMap[m.agentId]||'Agent'):'Agent'
        const wc=m.content.split(/\s+/).length
        const q=wc<80?' [SHALLOW]':wc>200?' [RICH]':''
        const preview=m.content.length>500?m.content.slice(0,500)+'...':m.content
        lines.push('['+name+']'+q+': '+preview)
      }
    }
    return lines.join(NL)
  }, [agents])

  // Helper: call moderator

  // Helper: call moderator (virtual entity using any provider)
  const callMod = useCallback(async (msgs: { role: 'user' | 'assistant'; content: string }[], modAgent: { id: string; name: string; systemPrompt: string; provider: string; modelName: string }): Promise<string> => {
    const provider = providers.find((p) => p.id === modAgent.provider)
    if (!provider?.apiKey) return ''
    const controller = new AbortController()
    abortRef.current.push(controller)
    try {
      setStreaming((prev) => ({ ...prev, [modAgent.id]: 'analyzing discussion' }))
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, agent: modAgent, providers: providers.filter((p) => p.apiKey) }),
        signal: controller.signal,
      })
      if (!res.ok) return ''
      const reader = res.body?.getReader()
      if (!reader) return ''
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split(NL)) {
          if (line.startsWith('0:')) {
            const raw = line.slice(2)
            try { const d = JSON.parse(raw); fullText += typeof d === 'string' ? d : String(d) } catch { fullText += raw.replace(/^\"|\"$/g, '') }
          } else if (line.trim() && !line.startsWith('d:') && !line.startsWith('g:') && !line.startsWith('e:')) {
            fullText += line
          }
        }
      }
      // Add moderator response as moderator message
      if (fullText) addMessage(sessionId, { role: 'moderator', content: fullText, sessionId, metadata: { model: modAgent.modelName || '' } })
      setStreaming((prev) => { const n = { ...prev }; delete n[modAgent.id]; return n })
      return fullText
    } catch {
      setStreaming((prev) => { const n = { ...prev }; delete n[modAgent.id]; return n })
      return ''
    } finally {
      const idx = abortRef.current.indexOf(controller)
      if (idx > -1) abortRef.current.splice(idx, 1)
    }
  }, [providers, addMessage, sessionId])

  // Silent moderator call — does NOT add to chat UI (used for decision-making)
  const callModSilent = useCallback(async (msgs: { role: 'user' | 'assistant'; content: string }[], modAgent: { id: string; name: string; systemPrompt: string; provider: string; modelName: string }): Promise<string> => {
    const provider = providers.find((p) => p.id === modAgent.provider)
    if (!provider?.apiKey) return ''
    const controller = new AbortController()
    abortRef.current.push(controller)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, agent: modAgent, providers: providers.filter((p) => p.apiKey) }),
        signal: controller.signal,
      })
      if (!res.ok) return ''
      const reader = res.body?.getReader()
      if (!reader) return ''
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of decoder.decode(value, { stream: true }).split(NL)) {
          if (line.startsWith('0:')) {
            const raw = line.slice(2)
            try { const d = JSON.parse(raw); fullText += typeof d === 'string' ? d : String(d) } catch { fullText += raw.replace(/^\"|\"$/g, '') }
          } else if (line.trim() && !line.startsWith('d:') && !line.startsWith('g:') && !line.startsWith('e:')) {
            fullText += line
          }
        }
      }
      // NO addMessage here — this is invisible
      return fullText
    } catch {
      return ''
    } finally {
      const idx = abortRef.current.indexOf(controller)
      if (idx > -1) abortRef.current.splice(idx, 1)
    }
  }, [providers])

  const stop = useCallback(() => {
    stoppedRef.current = true
    // Resolve any pending "wait for user answer" so the loop can unwind
    const r = usePendingStore.getState().takeResolver(sessionId)
    if (r) r('')
    abortRef.current.forEach((c) => c.abort())
    abortRef.current = []
    setLoading(false)
    setStreaming({})
    setLoopRound(0)
    if (session) updateSession(session.id, { status: 'idle' })
  }, [session, sessionId, updateSession])

  return { sendMessage, streaming, loading, stop, loopRound }
}
