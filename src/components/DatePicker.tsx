import { useState } from 'react'
import { enUS, zhCN } from 'date-fns/locale'
import { CalendarDays } from 'lucide-react'
import { useI18n } from '../i18n'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Calendar } from './ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

interface DatePickerProps {
  id: string
  'aria-label': string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
}

function parseLocalDate(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

function formatLocalDate(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${value.getFullYear()}-${month}-${day}`
}

export function DatePicker({
  id,
  'aria-label': ariaLabel,
  value,
  onChange,
  min,
  max,
  className,
}: DatePickerProps) {
  const { locale } = useI18n()
  const isEn = locale === 'en'
  const [open, setOpen] = useState(false)
  const selected = parseLocalDate(value)
  const earliest = parseLocalDate(min)
  const latest = parseLocalDate(max)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-label={ariaLabel}
          className={cn('w-full justify-start font-mono font-normal', className)}
        >
          <CalendarDays aria-hidden="true" />
          {value || (isEn ? 'Select date' : '选择日期')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={isEn ? enUS : zhCN}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={earliest}
          endMonth={latest}
          labels={isEn
            ? {
                labelMonthDropdown: () => 'Select month',
                labelYearDropdown: () => 'Select year',
              }
            : {
                labelMonthDropdown: () => '选择月份',
                labelYearDropdown: () => '选择年份',
              }}
          formatters={isEn
            ? undefined
            : {
                formatMonthDropdown: (date) => `${date.getMonth() + 1}月`,
                formatYearDropdown: (date) => `${date.getFullYear()}年`,
              }}
          disabled={[
            ...(earliest ? [{ before: earliest }] : []),
            ...(latest ? [{ after: latest }] : []),
          ]}
          onSelect={(date) => {
            if (!date) return
            onChange(formatLocalDate(date))
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
