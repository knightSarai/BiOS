import { useId } from "react"
import { Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  MAX_TIMER_SECONDS,
  TIMER_MODES,
  TIMER_SOUNDS,
  timerModeLabels,
  timerSoundLabels,
  withMode,
  type TimerConfig,
  type TimerMode,
  type TimerSound,
} from "../timer"
import { secondsToValue, valueToSeconds } from "../duration"
import { previewSound } from "../timer-runner"
import { DurationChip } from "./DurationField"

// Typed digit by digit like every other duration in the app, so a phone keyboard without a
// colon still means minutes and seconds.
function ModeDurations({
  config,
  onChange,
}: {
  config: TimerConfig
  onChange: (config: TimerConfig) => void
}) {
  if (config.mode === "up") return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">Duration</span>
      <DurationChip
        value={secondsToValue(config.seconds)}
        label="Duration"
        zeroLabel=""
        icon={false}
        title="Duration"
        className="h-8 w-fit max-md:h-11"
        onCommit={(next) => {
          const seconds = valueToSeconds(next)
          if (seconds < 1 || seconds > MAX_TIMER_SECONDS) return
          onChange({ ...config, seconds })
        }}
      />
    </div>
  )
}

function TimerConfigEditor({
  config,
  onChange,
  sound = true,
  className,
}: {
  config: TimerConfig
  onChange: (config: TimerConfig) => void
  sound?: boolean
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
            <ToggleGroupItem
              key={mode}
              value={mode}
              className="aria-pressed:border-primary aria-pressed:bg-selection aria-pressed:text-accent-text max-md:h-11"
            >
              {timerModeLabels[mode]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <ModeDurations config={config} onChange={onChange} />
      {config.mode === "up" || !sound ? null : (
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
                  className="aria-pressed:border-primary aria-pressed:bg-selection aria-pressed:text-accent-text max-md:h-11"
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
