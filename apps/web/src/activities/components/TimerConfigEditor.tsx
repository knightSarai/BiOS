import { useId } from "react"
import { Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  MAX_TIMER_SECONDS,
  TIMER_MODES,
  TIMER_SOUNDS,
  formatClock,
  parseClock,
  timerModeLabels,
  timerSoundLabels,
  withMode,
  type TimerConfig,
  type TimerMode,
  type TimerSound,
} from "../timer"
import { previewSound } from "../timer-runner"

type NumberInputProps = {
  label: string
  value: number
  min: number
  max: number
  format: (value: number) => string
  parse: (text: string) => number | null
  onCommit: (value: number) => void
}

// Uncontrolled and keyed by the saved value, so stored settings aren't mirrored in client state.
function CommitNumberInput({
  label,
  value,
  min,
  max,
  format,
  parse,
  onCommit,
}: NumberInputProps) {
  const id = useId()
  const shown = format(value)
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <Input
        id={id}
        key={shown}
        defaultValue={shown}
        inputMode="numeric"
        className="h-8 w-24 tabular-nums max-md:h-11"
        onBlur={(event) => {
          const next = parse(event.currentTarget.value)
          if (next === null || next < min || next > max) {
            event.currentTarget.value = shown
            return
          }
          if (next !== value) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
          if (event.key === "Escape") {
            event.currentTarget.value = shown
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function DurationInput({
  label,
  value,
  min = 1,
  onCommit,
}: {
  label: string
  value: number
  min?: number
  onCommit: (value: number) => void
}) {
  return (
    <CommitNumberInput
      label={label}
      value={value}
      min={min}
      max={MAX_TIMER_SECONDS}
      format={(seconds) => formatClock(seconds, "down")}
      parse={parseClock}
      onCommit={onCommit}
    />
  )
}

function ModeDurations({
  config,
  onChange,
}: {
  config: TimerConfig
  onChange: (config: TimerConfig) => void
}) {
  switch (config.mode) {
    case "stopwatch":
      return null
    case "countdown":
      return (
        <DurationInput
          label="Duration"
          value={config.seconds}
          onCommit={(seconds) => onChange({ ...config, seconds })}
        />
      )
    case "intervals":
      return (
        <div className="flex flex-wrap gap-3">
          <DurationInput
            label="Work"
            value={config.workSeconds}
            onCommit={(workSeconds) => onChange({ ...config, workSeconds })}
          />
          <DurationInput
            label="Rest"
            value={config.restSeconds}
            min={0}
            onCommit={(restSeconds) => onChange({ ...config, restSeconds })}
          />
          <CommitNumberInput
            label="Rounds"
            value={config.rounds}
            min={1}
            max={100}
            format={String}
            parse={(text) =>
              /^\d+$/.test(text.trim()) ? Number(text.trim()) : null
            }
            onCommit={(rounds) => onChange({ ...config, rounds })}
          />
        </div>
      )
  }
}

function TimerConfigEditor({
  config,
  onChange,
  className,
}: {
  config: TimerConfig
  onChange: (config: TimerConfig) => void
  className?: string
}) {
  const modeLabelId = useId()
  const soundLabelId = useId()

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <span id={modeLabelId} className="text-xs text-muted-foreground">
          Mode
        </span>
        <ToggleGroup
          aria-labelledby={modeLabelId}
          variant="outline"
          size="sm"
          spacing={4}
          value={[config.mode]}
          onValueChange={(next) => {
            const mode = next[0] as TimerMode | undefined
            if (mode) onChange(withMode(config, mode))
          }}
          className="flex-wrap"
        >
          {TIMER_MODES.map((mode) => (
            <ToggleGroupItem key={mode} value={mode} className="max-md:h-11">
              {timerModeLabels[mode]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <ModeDurations config={config} onChange={onChange} />
      {config.mode === "stopwatch" ? null : (
        <div className="flex flex-col gap-1.5">
          <span id={soundLabelId} className="text-xs text-muted-foreground">
            Sound
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              aria-labelledby={soundLabelId}
              variant="outline"
              size="sm"
              spacing={4}
              value={[config.sound]}
              onValueChange={(next) => {
                const sound = next[0] as TimerSound | undefined
                if (sound) onChange({ ...config, sound })
              }}
              className="flex-wrap"
            >
              {TIMER_SOUNDS.map((sound) => (
                <ToggleGroupItem
                  key={sound}
                  value={sound}
                  className="max-md:h-11"
                >
                  {timerSoundLabels[sound]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="max-md:size-11"
              aria-label={`Play ${timerSoundLabels[config.sound]}`}
              disabled={config.sound === "none"}
              onClick={() => previewSound(config.sound)}
            >
              <Volume2 />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { TimerConfigEditor }
