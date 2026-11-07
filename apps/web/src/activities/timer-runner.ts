import {
  timerTotalSeconds,
  upcomingCues,
  type TimerConfig,
  type TimerCue,
  type TimerSound,
} from "./timer"

type Tone = { frequency: number; wave: OscillatorType; decay: number }

const voices: Record<Exclude<TimerSound, "none">, Tone[]> = {
  bell: [
    { frequency: 880, wave: "sine", decay: 1.4 },
    { frequency: 1760, wave: "sine", decay: 0.6 },
    { frequency: 2640, wave: "sine", decay: 0.3 },
  ],
  beep: [{ frequency: 1000, wave: "square", decay: 0.15 }],
  chime: [
    { frequency: 660, wave: "triangle", decay: 0.9 },
    { frequency: 990, wave: "sine", decay: 0.7 },
  ],
}

// A round starts on one hit, rest on two and the finish on three, like a boxing bell.
const hitsPerCue: Record<TimerCue, number> = { work: 1, rest: 2, finish: 3 }

const HIT_SPACING_SECONDS = 0.35

let audio: AudioContext | null = null

// Browsers only let audio start from a tap or click, so this is called from those handlers.
const audioContext = () => {
  audio ??= new AudioContext()
  void audio.resume()
  return audio
}

const playCue = (
  context: AudioContext,
  sound: TimerSound,
  cue: TimerCue,
  at: number
) => {
  if (sound === "none") return []
  return Array.from({ length: hitsPerCue[cue] }, (_, hit) =>
    voices[sound].map((tone) => {
      const start = at + hit * HIT_SPACING_SECONDS
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = tone.wave
      oscillator.frequency.value = tone.frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.decay)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + tone.decay + 0.05)
      return oscillator
    })
  ).flat()
}

const previewSound = (sound: TimerSound) => {
  const context = audioContext()
  playCue(context, sound, "work", context.currentTime)
}

type Armed = {
  oscillators: OscillatorNode[]
  finish: ReturnType<typeof setTimeout> | null
}

// Lives outside React so a timer keeps its sounds while you move to another page.
const armed = new Map<string, Armed>()

const disarmTimer = (activityId: string) => {
  const current = armed.get(activityId)
  if (!current) return
  // Disconnecting silences sounds already playing and never throws, unlike a second stop().
  for (const oscillator of current.oscillators) oscillator.disconnect()
  if (current.finish !== null) clearTimeout(current.finish)
  armed.delete(activityId)
}

// Audio is scheduled on the audio clock, which stays accurate in background tabs where timeouts are throttled.
const armTimer = ({
  activityId,
  config,
  elapsed,
  onFinish,
}: {
  activityId: string
  config: TimerConfig
  elapsed: number
  onFinish: () => void
}) => {
  for (const id of [...armed.keys()]) disarmTimer(id)
  const context = audioContext()
  const startsAt = context.currentTime
  const oscillators = upcomingCues(config, elapsed).flatMap((scheduled) =>
    playCue(
      context,
      config.sound,
      scheduled.cue,
      startsAt + scheduled.atSecond - elapsed
    )
  )
  const total = timerTotalSeconds(config)
  const finish =
    total === null
      ? null
      : setTimeout(
          () => {
            armed.delete(activityId)
            onFinish()
          },
          Math.max(0, total - elapsed) * 1000
        )
  armed.set(activityId, { oscillators, finish })
}

export { armTimer, disarmTimer, previewSound }
