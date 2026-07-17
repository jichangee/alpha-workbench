import type { PositionMode } from '../types'

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
    <div className="position-mode-controls">
      <div className="position-mode-picker" role="group" aria-label="卖出处理方式">
        <button
          type="button"
          aria-label="卖出后持有现金"
          aria-pressed={mode === 'cash'}
          onClick={() => onModeChange('cash')}
        >
          <strong>卖出后持有现金</strong>
          <small>等待下一次买入信号</small>
        </button>
        <button
          type="button"
          aria-label="卖出后换仓"
          aria-pressed={mode === 'rotate'}
          onClick={() => onModeChange('rotate')}
        >
          <strong>卖出后换仓</strong>
          <small>切换到另一只股票</small>
        </button>
      </div>
      {mode === 'rotate' && (
        <label className="alternate-symbol-field">
          替代股票代码
          <input
            aria-label="替代股票代码"
            value={alternateSymbol}
            onChange={(event) => onAlternateSymbolChange(event.target.value.toUpperCase())}
            placeholder="例如 QQQ"
            autoCapitalize="characters"
          />
          <small>主策略卖出时换入此标的，重新买入时换回主标的。</small>
        </label>
      )}
    </div>
  )
}
