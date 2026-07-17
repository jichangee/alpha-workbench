import type { StrategyDefinition, StrategyParameter } from '../types'

interface StrategyControlsProps {
  strategies: readonly StrategyDefinition[]
  strategyKey: string
  params: Record<string, number>
  onStrategyChange: (strategyKey: string) => void
  onParamsChange: (params: Record<string, number>) => void
}

function clamp(value: number, parameter: StrategyParameter): number {
  return Math.min(parameter.maximum, Math.max(parameter.minimum, value))
}

function strictStep(parameter: StrategyParameter): number {
  return parameter.type === 'integer' ? 1 : 0.01
}

function keepRelationshipsValid(
  strategy: StrategyDefinition,
  changedKey: string,
  params: Record<string, number>,
): Record<string, number> {
  const next = { ...params }
  const parameters = new Map(strategy.parameters.map((parameter) => [parameter.key, parameter]))

  for (const rule of strategy.validationRules) {
    const match = rule.expression.match(/^(\w+)\s*([<>])\s*(\w+)$/)
    if (!match) continue
    const [, leftKey, operator, rightKey] = match
    if (changedKey !== leftKey && changedKey !== rightKey) continue
    const leftParameter = parameters.get(leftKey)
    const rightParameter = parameters.get(rightKey)
    if (!leftParameter || !rightParameter) continue

    const relationIsValid = operator === '<' ? next[leftKey] < next[rightKey] : next[leftKey] > next[rightKey]
    if (relationIsValid) continue

    if (operator === '<' && changedKey === leftKey) {
      const pushedRight = next[leftKey] + strictStep(rightParameter)
      if (pushedRight <= rightParameter.maximum) next[rightKey] = clamp(pushedRight, rightParameter)
      else next[leftKey] = clamp(next[rightKey] - strictStep(leftParameter), leftParameter)
    } else if (operator === '<') {
      const pulledLeft = next[rightKey] - strictStep(leftParameter)
      if (pulledLeft >= leftParameter.minimum) next[leftKey] = clamp(pulledLeft, leftParameter)
      else next[rightKey] = clamp(next[leftKey] + strictStep(rightParameter), rightParameter)
    } else if (changedKey === leftKey) {
      const pulledRight = next[leftKey] - strictStep(rightParameter)
      if (pulledRight >= rightParameter.minimum) next[rightKey] = clamp(pulledRight, rightParameter)
      else next[leftKey] = clamp(next[rightKey] + strictStep(leftParameter), leftParameter)
    } else {
      const pushedLeft = next[rightKey] + strictStep(leftParameter)
      if (pushedLeft <= leftParameter.maximum) next[leftKey] = clamp(pushedLeft, leftParameter)
      else next[rightKey] = clamp(next[leftKey] - strictStep(rightParameter), rightParameter)
    }
  }

  return next
}

export function StrategyControls({
  strategies,
  strategyKey,
  params,
  onStrategyChange,
  onParamsChange,
}: StrategyControlsProps) {
  const strategy = strategies.find((candidate) => candidate.key === strategyKey)

  const updateParameter = (parameter: StrategyParameter, rawValue: string) => {
    const numericValue = Number(rawValue)
    if (!Number.isFinite(numericValue)) return
    const value = parameter.type === 'integer' ? Math.round(numericValue) : numericValue
    const next = { ...params, [parameter.key]: clamp(value, parameter) }
    onParamsChange(strategy ? keepRelationshipsValid(strategy, parameter.key, next) : next)
  }

  return (
    <div className="strategy-controls">
      <div className="strategy-picker" role="group" aria-label="选择策略">
        {strategies.map((candidate) => (
          <button
            className="strategy-option"
            type="button"
            key={candidate.key}
            aria-pressed={candidate.key === strategyKey}
            onClick={() => onStrategyChange(candidate.key)}
          >
            {candidate.name}
          </button>
        ))}
      </div>

      {strategy && <p className="strategy-description">{strategy.description}</p>}

      {strategy && strategy.parameters.length > 0 && (
        <div className="parameter-sliders">
          {strategy.parameters.map((parameter) => (
            <div className="parameter-slider" key={parameter.key}>
              <div className="parameter-heading">
                <label htmlFor={`${parameter.key}-range`}>{parameter.name}</label>
                <input
                  id={`${parameter.key}-number`}
                  className="parameter-value"
                  type="number"
                  aria-label={`${parameter.name}数值`}
                  inputMode="numeric"
                  step={parameter.type === 'integer' ? 1 : 'any'}
                  min={parameter.minimum}
                  max={parameter.maximum}
                  value={params[parameter.key]}
                  onChange={(event) => updateParameter(parameter, event.target.value)}
                />
              </div>
              <input
                id={`${parameter.key}-range`}
                className="range-control"
                type="range"
                aria-label={`${parameter.name}滑块`}
                step={parameter.type === 'integer' ? 1 : 'any'}
                min={parameter.minimum}
                max={parameter.maximum}
                value={params[parameter.key]}
                onChange={(event) => updateParameter(parameter, event.target.value)}
              />
              <div className="range-limits" aria-hidden="true">
                <span>{parameter.minimum}</span>
                <span>{parameter.maximum}</span>
              </div>
              <small>{parameter.description}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
