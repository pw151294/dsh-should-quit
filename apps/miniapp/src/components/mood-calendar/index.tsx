import './index.css'
import { Button, View } from '@tarojs/components'
import { shiftDate, type MoodDailyItem } from '@should-quit/shared'
import { moodColor, monthCells, shiftMonth } from './calendar'
export default function MoodCalendar({ month, today, daily, onMonth, onDate }: {
  month: string; today: string; daily: MoodDailyItem[]; onMonth(value: string): void; onDate(date: string): void
}) {
  const since = shiftDate(today, -89), firstMonth = since.slice(0, 7), lastMonth = today.slice(0, 7)
  return <View className='card'><View className='row'>
    <Button disabled={month <= firstMonth} onClick={() => onMonth(shiftMonth(month, -1))}>上一月</Button>
    <View>{month}</View><Button disabled={month >= lastMonth} onClick={() => onMonth(shiftMonth(month, 1))}>下一月</Button></View>
    <View className='muted'>可查看最近90天；红低绿高，灰色未打卡</View>
    <View className='calendar'>{['一', '二', '三', '四', '五', '六', '日'].map(day => <View key={day}>{day}</View>)}
      {monthCells(month, daily).map((cell, i) => cell ? <Button key={cell.date}
        className={'day ' + moodColor(cell.avg)} disabled={cell.date < since || cell.date > today}
        aria-label={`${cell.date}，${cell.date > today ? '未来日期' : cell.date < since ? '超出可查看范围' : cell.avg === null ? '未打卡' : `日均${cell.avg}分，${cell.count}次`}`}
        onClick={() => onDate(cell.date)}>{Number(cell.date.slice(-2))}<View>{cell.date > today ? '未来' : cell.date < since ? '超出范围' : cell.avg === null ? '未打卡' : `${cell.avg}分`}</View></Button> : <View key={'blank-' + i} />)}</View>
  </View>
}
