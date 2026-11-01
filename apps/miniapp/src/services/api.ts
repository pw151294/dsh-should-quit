import type { BaselineBody, BaselineResponse, ScoreView, MoodCreateBody, MoodDailyItem, MoodItem,
  TrendRange, TrendResponse, ConversationView, MessageView, AgentConfigView } from '@should-quit/shared'
import { request } from './request'
export const api = {
  baseline: () => request<BaselineResponse>('/baseline'),
  saveBaseline: (data: BaselineBody) => request<ScoreView>('/baseline', { method: 'PUT', data }),
  score: () => request<ScoreView>('/score/current'),
  checkin: (data: MoodCreateBody) => request<ScoreView>('/moods', { method: 'POST', data }),
  daily: (days = 90) => request<MoodDailyItem[]>(`/moods/daily?days=${days}`),
  moods: (date: string) => request<MoodItem[]>(`/moods?date=${encodeURIComponent(date)}`),
  trend: (range: TrendRange) => request<TrendResponse>(`/score/trend?range=${range}`),
  conversations: () => request<ConversationView[]>('/agent/conversations'),
  createConversation: () => request<ConversationView>('/agent/conversations', { method: 'POST' }),
  messages: (id: string) => request<MessageView[]>(`/agent/conversations/${encodeURIComponent(id)}/messages`),
  agentConfig: () => request<AgentConfigView>('/agent/config'),
}
