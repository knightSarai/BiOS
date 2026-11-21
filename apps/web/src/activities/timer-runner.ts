import type { ScheduledCue } from "./routine-view"
import type { TimerCue, TimerSound } from "./timer"

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

const LONGEST_CUE_SECONDS =
  (hitsPerCue.finish - 1) * HIT_SPACING_SECONDS +
  Math.max(
    ...Object.values(voices).flatMap((tones) => tones.map((t) => t.decay))
  ) +
  0.05

let audio: AudioContext | null = null

// Browsers only let audio start from a tap or click, so this is called from those handlers.
const unlockAudio = () => {
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
  const context = unlockAudio()
  playCue(context, sound, "work", context.currentTime)
}

// `at` is the cue's instant on the routine's clock and `audioAt` when it starts on the audio
// clock, which can trail it a little.
type Sounding = {
  at: number
  cue: TimerCue
  audioAt: number
  oscillators: OscillatorNode[]
}

type Armed = {
  workspaceId: string
  routineId: string
  // Every activity in the routine, so deleting one of them can silence it.
  ids: Set<string>
  cues: Sounding[]
  handOver: ReturnType<typeof setTimeout> | null
  waitingForGesture: AbortController
}

// Lives outside React so a routine keeps its sounds while you move to another page. One
// routine runs at a time in a workspace, so one is armed per workspace.
const armed = new Map<string, Armed>()

// Results can land out of order; one computed before the last arm must not undo it.
const armedAsOf = new Map<string, number>()

// setTimeout fires at once for a wait beyond this (about 24.8 days).
const MAX_TIMEOUT_MS = 2 ** 31 - 1

const isArmed = (workspaceId: string, activityId: string) =>
  armed.get(workspaceId)?.ids.has(activityId) ?? false

// Disconnecting silences sounds already playing and never throws, unlike a second stop().
const release = (current: Armed, keep: Sounding[] = []) => {
  for (const cue of current.cues) {
    if (keep.includes(cue)) continue
    for (const oscillator of cue.oscillators) oscillator.disconnect()
  }
  if (current.handOver !== null) clearTimeout(current.handOver)
  current.waitingForGesture.abort()
}

const disarmRoutine = (
  workspaceId: string,
  activityId: string | null = null
) => {
  const current = armed.get(workspaceId)
  if (!current || (activityId !== null && !current.ids.has(activityId))) return
  release(current)
  armed.delete(workspaceId)
}

// A routine that finished by itself has nothing scheduled, only its finish cue ringing out,
// which is left to ring.
const disarmPending = (workspaceId: string) => {
  if (armed.get(workspaceId)?.handOver === null) return
  disarmRoutine(workspaceId)
}

const soundsAhead = (
  context: AudioContext,
  sound: TimerSound,
  cues: ScheduledCue[],
  now: number
): Sounding[] => {
  const audioNow = context.currentTime
  return cues.map((scheduled) => {
    const audioAt = audioNow + Math.max(0, scheduled.at - now)
    return {
      at: scheduled.at,
      cue: scheduled.cue,
      audioAt,
      oscillators: playCue(context, sound, scheduled.cue, audioAt),
    }
  })
}

// Instants are stored to the millisecond, so a re-read plan can place a cue that much off.
const CUE_TOLERANCE_SECONDS = 0.001

// A cue is sounding once it has started on the audio clock, or once the routine's clock has
// reached it: a hand-over's own sync reads the clock as its cue is due, while the audio
// clock may not quite be there yet. Anything later is only pending.
const isSounding = (cue: Sounding, asOf: number, audioNow: number) =>
  (cue.audioAt <= audioNow || cue.at <= asOf + CUE_TOLERANCE_SECONDS) &&
  cue.audioAt + LONGEST_CUE_SECONDS > audioNow

const sameCue = (a: { at: number; cue: TimerCue }, b: ScheduledCue) =>
  a.cue === b.cue && Math.abs(a.at - b.at) <= CUE_TOLERANCE_SECONDS

// Sounds are scheduled on the audio clock, which stays accurate in background tabs where
// timeouts are throttled; a timeout only writes the next hand-over to the database, and that
// write arms the one after. Audio only exists once a tap or click made it (after a reload it
// doesn't), so until then the sounds wait for the first one. `asOf` is when the routine's state
// was read. A routine that isn't running only disarms itself, so ticking a box elsewhere never
// silences the one that is. Re-arming the same routine lets a cue already sounding ring out,
// since the hand-over or finish it marks is what re-armed it; `silence` cuts it off. Pending
// cues are dropped and scheduled again from the new plan, so a cue never plays twice and one
// the plan moved never plays where it was.
const armRoutine = ({
  workspaceId,
  asOf,
  running,
  silence = false,
  routineId,
  ids,
  sound,
  cues,
  clock,
  onHandOver,
}: {
  workspaceId: string
  asOf: number
  running: boolean
  silence?: boolean
  routineId: string
  ids: string[]
  sound: TimerSound
  cues: ScheduledCue[]
  clock: () => number
  onHandOver: () => void
}) => {
  if (asOf < (armedAsOf.get(workspaceId) ?? -Infinity)) return
  const previous = armed.get(workspaceId) ?? null
  if (!running && previous && !ids.some((id) => previous.ids.has(id))) return
  armedAsOf.set(workspaceId, asOf)
  const sounding =
    !silence && audio && previous?.routineId === routineId
      ? previous.cues.filter((cue) =>
          isSounding(cue, asOf, audio?.currentTime ?? 0)
        )
      : []
  if (previous) release(previous, sounding)
  armed.delete(workspaceId)
  const ahead = cues.filter(
    (scheduled) => !sounding.some((cue) => sameCue(cue, scheduled))
  )
  if (ahead.length === 0 && sounding.length === 0) return
  const now = clock()
  const next = cues[0]
  const waitingForGesture = new AbortController()
  const current: Armed = {
    workspaceId,
    routineId,
    ids: new Set(ids),
    cues: [
      ...sounding,
      ...(audio ? soundsAhead(audio, sound, ahead, now) : []),
    ],
    handOver: next
      ? setTimeout(
          onHandOver,
          Math.min(MAX_TIMEOUT_MS, Math.max(0, next.at - now) * 1000)
        )
      : null,
    waitingForGesture,
  }
  armed.set(workspaceId, current)
  if (audio) return
  const onGesture = () => {
    waitingForGesture.abort()
    const at = clock()
    current.cues = soundsAhead(
      unlockAudio(),
      sound,
      ahead.filter((scheduled) => scheduled.at > at),
      at
    )
  }
  for (const type of ["click", "keydown"]) {
    document.addEventListener(type, onGesture, {
      capture: true,
      signal: waitingForGesture.signal,
    })
  }
}

export {
  armRoutine,
  disarmPending,
  disarmRoutine,
  isArmed,
  previewSound,
  unlockAudio,
}
