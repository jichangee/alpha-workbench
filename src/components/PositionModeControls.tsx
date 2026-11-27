import type { PositionMode } from '../types'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { RadioGroup, RadioGroupItem } from './ui/radio-group'

interface PositionModeControlsProps {
  mode: PositionMode
  alternateSymbol: string
  onModeChange: (mode: PositionMode) => void
  onAlternateSymbolChange: (symbol: string) => void
}

export function PositionModeControls({
  mode,
  alternateSymbol,
  onModeChange,
  onAlternateSymbolChange,
}: PositionModeControlsProps) {
  return (
    <div className="space-y-4">
      <RadioGroup
        className="grid gap-2 sm:grid-cols-2"
        value={mode}
        onValueChange={(value) => onModeChange(value as PositionMode)}
        aria-label="卖出处理方式"
      >
        <Label
          htmlFor="position-cash"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 has-data-[state=checked]:border-primary/60 has-data-[state=checked]:bg-primary/5"
        >
          <RadioGroupItem id="position-cash" value="cash" aria-label="卖出后持有现金" />
          <span className="grid gap-1">
            <strong className="text-sm">卖出后持有现金</strong>
            <small className="font-normal text-muted-foreground">等待下一次买入信号</small>
          </span>
        </Label>
        <Label
          htmlFor="position-rotate"
          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3 has-data-[state=checked]:border-primary/60 has-data-[state=checked]:bg-primary/5"
        >
          <RadioGroupItem id="position-rotate" value="rotate" aria-label="卖出后换仓" />
          <span className="grid gap-1">
            <strong className="text-sm">卖出后换仓</strong>
            <small className="font-normal text-muted-foreground">切换到另一只股票</small>
          </span>
        </Label>
      </RadioGroup>
      {mode === 'rotate' && (
        <div className="grid gap-2">
          <Label htmlFor="alternate-symbol">替代股票代码</Label>
          <Input
            id="alternate-symbol"
            aria-label="替代股票代码"
            value={alternateSymbol}
            onChange={(event) => onAlternateSymbolChange(event.target.value.toUpperCase())}
            placeholder="例如 QQQ"
            autoCapitalize="characters"
          />
          <p className="text-xs leading-5 text-muted-foreground">主策略卖出时换入此标的，重新买入时换回主标的。</p>
        </div>
      )}
    </div>
  )
}
