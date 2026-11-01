import { Button, Text, View } from '@tarojs/components'
import type { BaselineQuestion, Level } from '@should-quit/shared'
export default function BaselineQuestionView({ question, value, onChange }: {
  question: BaselineQuestion; value?: Level; onChange(value: Level): void
}) {
  return <View className='card'><View className='title'>{question.title}</View><Text className='muted'>{question.hint}</Text>
    {question.options.map(option => <Button key={option.level} className={'option ' + (option.level === value ? 'selected' : '')}
      onClick={() => onChange(option.level)}>{option.label}</Button>)}</View>
}
