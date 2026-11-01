// apps/miniapp/src/pages/chat/index.tsx
import { useRef, useState } from 'react'
import Taro, { useLoad, useUnload } from '@tarojs/taro'
import { Button, Textarea, View } from '@tarojs/components'
import { askSchema, type MessageView } from '@should-quit/shared'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import { askStream } from '../../services/agent-stream'
import { ApiError } from '../../services/request'
import { restoredHistoryHint } from '../../services/chat-model'
import { useChat } from '../../stores/chat'
export default function Chat() {
  const [id, setId] = useState(''), [draft, setDraft] = useState(''), [presets, setPresets] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true), loadingRef = useRef(true), generation = useRef(0)
  const session = useChat(s => s.sessions[id]), active = useRef<ReturnType<typeof askStream>>()
  const alive = useRef(true), sending = useRef(false)
  const load = async (conversationId: string) => {
    const g = ++generation.current; loadingRef.current = true; setLoading(true)
    try {
    if (!await guardPage()) return
    const [messages, config] = await Promise.all([api.messages(conversationId), api.agentConfig()])
    if (!alive.current || g !== generation.current) return
    // 重新进入页面时以服务端历史为准；本次页面内工具行由turn持有。
    useChat.getState().setHistory(conversationId, messages); setPresets(config.presetQuestions); setFailed(false); loadingRef.current = false; setLoading(false)
    } catch { if (alive.current && g === generation.current) setFailed(true) }
  }
  useLoad(query => {
    const conversationId = query.id
    if (!conversationId) { setFailed(true); return }
    setId(conversationId); void load(conversationId)
  })
  useUnload(() => { alive.current = false; generation.current++; active.current?.abort() })
  const send = async (text: string) => {
    const parsed = askSchema.safeParse({ text })
    if (!parsed.success || sending.current || loadingRef.current || !id) return
    sending.current = true
    const g = generation.current
    const key = useChat.getState().start(id, parsed.data.text)
    setDraft('')
    const handle = askStream(id, parsed.data.text, event => {
      if (alive.current && g === generation.current) {
        useChat.getState().event(id, key, event)
        if (event.type === 'done') void api.messages(id).then(messages => {
          if (alive.current && g === generation.current) useChat.getState().reconcile(id, messages)
        }).catch(() => {})
      }
    })
    active.current = handle
    try { await handle.finished }
    catch (error) {
      if (!alive.current || g !== generation.current) return
      useChat.getState().interrupt(id, key)
      if (alive.current && error instanceof ApiError && error.code === 'AGENT_BUSY') {
        await Taro.showModal({ title: '上一条回答尚未结束', content: '上一条回答还在后台收尾，稍等片刻再试，或新开一个会话', showCancel: false })
      }
    } finally { if (alive.current && g === generation.current) { sending.current = false; active.current = undefined } }
  }
  const pending = session?.turns.some(t => t.state === 'pending') ?? false
  return <View className='screen'>
    {loading && !failed && <View>加载中…</View>}
    {failed && <Button onClick={() => void load(id)}>加载失败，重试</Button>}
    {!loading && !session?.history.length && !session?.turns.length && presets.map(text => <Button key={text} disabled={pending} onClick={() => void send(text)}>{text}</Button>)}
    {session?.history.map((message, index) => <View key={message.id}>
      <View className={'bubble ' + (message.role === 'USER' ? 'user' : 'assistant')}>{message.content}</View>
      {message.role === 'ASSISTANT' && (message.status === 'FAILED' || message.status === 'INTERRUPTED') && <Button disabled={pending || loading}
        onClick={() => { const question = previousQuestion(session.history, index); if (question) void send(question) }}>回答中断，点此重试</Button>}
    </View>)}
    {session && restoredHistoryHint(session.history) && <View className='muted'>{restoredHistoryHint(session.history)}</View>}
    {session?.turns.map(turn => <View key={turn.key}><View className='bubble user'>{turn.question}</View>
      {turn.tools.map((label, i) => <View className='muted' key={i}>{label}</View>)}
      <View className='bubble assistant'>{turn.answer || (turn.state === 'pending' ? '正在思考…' : '未收到回答')}</View>
      {turn.error && <View className='muted'>{turn.error}</View>}
      {(turn.state === 'failed' || turn.state === 'interrupted') && <Button disabled={pending} onClick={() => void send(turn.question)}>回答中断，点此重试</Button>}
    </View>)}
    <View className='chat-input'><Textarea className='note' maxlength={500} value={draft} placeholder='问点什么…'
      adjustPosition onInput={e => setDraft(e.detail.value)} /><Button className='primary' disabled={loading || pending || !draft.trim()} onClick={() => void send(draft)}>发送</Button></View>
  </View>
}
function previousQuestion(messages: MessageView[], index: number): string | undefined {
  return messages.slice(0, index).reverse().find(m => m.role === 'USER')?.content
}

import "./index.css"
