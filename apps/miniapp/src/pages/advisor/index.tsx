// apps/miniapp/src/pages/advisor/index.tsx
import { useRef, useState } from 'react'
import Taro, { useDidShow, useUnload } from '@tarojs/taro'
import { Button, View } from '@tarojs/components'
import type { ConversationView } from '@should-quit/shared'
import { api } from '../../services/api'
import { guardPage } from '../../services/auth'
import { latestFirst } from '../../services/chat-model'
export default function Advisor() {
  const [items, setItems] = useState<ConversationView[]>([]), [failed, setFailed] = useState(false)
  const creating = useRef(false), version = useRef(0)
  const load = async () => {
    const v = ++version.current
    try { if (await guardPage()) { const rows = await api.conversations(); if (v === version.current) { setItems(latestFirst(rows)); setFailed(false) } } }
    catch { if (v === version.current) setFailed(true) }
  }
  const open = (id: string) => Taro.navigateTo({ url: '/pages/chat/index?id=' + encodeURIComponent(id) })
  const create = async () => {
    if (creating.current) return
    creating.current = true
    const v = version.current
    try { if (!await guardPage()) return; const c = await api.createConversation(); if (v === version.current) await open(c.id) } catch {} finally { creating.current = false }
  }
  useDidShow(() => { void load() })
  useUnload(() => { version.current++ })
  return <View className='screen'><Button className='primary' onClick={() => void create()}>新建会话</Button>
    {failed && <Button onClick={() => void load()}>读取失败，重试</Button>}
    {items.map(c => <Button key={c.id} onClick={() => void open(c.id)}>{c.title ?? '新会话'}</Button>)}
    {!items.length && !failed && <View className='muted'>还没有会话，问问“我该溜吗？”</View>}</View>
}

import "./index.css"
