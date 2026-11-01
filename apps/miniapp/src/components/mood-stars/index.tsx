import { Button, View } from '@tarojs/components'
export default function MoodStars({ value, onChange }: { value: number; onChange(value: number): void }) {
  const labels = ['很差', '较差', '一般', '不错', '很好']
  return <View className='stars'>{labels.map((label, i) => <Button key={i}
    aria-label={`${i + 1}星，${label}`} onClick={() => onChange(i + 1)}>{i < value ? '★' : '☆'}</Button>)}</View>
}
