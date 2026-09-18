// Syntezator eleganckiego dźwięku powiadomienia oparty na Web Audio API.
// Działa w 100% lokalnie bez plików zewnętrznych, kodeków czy opóźnień sieciowych.

let audioCtx: AudioContext | null = null

export function playNotificationSound(): void {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    if (!audioCtx) {
      audioCtx = new AudioContextClass()
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume()
    }

    const now = audioCtx.currentTime

    // Ton 1: D5 (~587.3 Hz)
    const osc1 = audioCtx.createOscillator()
    const gain1 = audioCtx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, now)
    gain1.gain.setValueAtTime(0, now)
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.03)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    osc1.connect(gain1)
    gain1.connect(audioCtx.destination)
    osc1.start(now)
    osc1.stop(now + 0.35)

    // Ton 2: A5 (~880 Hz) — czysta kwinta w górę
    const osc2 = audioCtx.createOscillator()
    const gain2 = audioCtx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(880, now + 0.1)
    gain2.gain.setValueAtTime(0, now + 0.1)
    gain2.gain.linearRampToValueAtTime(0.22, now + 0.13)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6)
    osc2.connect(gain2)
    gain2.connect(audioCtx.destination)
    osc2.start(now + 0.1)
    osc2.stop(now + 0.6)
  } catch {
    // Ignoruj błędy polityki autoplay audio
  }
}
