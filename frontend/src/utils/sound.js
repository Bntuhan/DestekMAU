/**
 * Web Audio API ile kısa bildirim sesi çalar.
 * localStorage'dan 'mau_sound_enabled' tercihini okur.
 */

let audioCtx = null

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return audioCtx
}

export function isSoundEnabled() {
  return localStorage.getItem('mau_sound_enabled') !== 'false'
}

export function toggleSound() {
  const next = !isSoundEnabled()
  localStorage.setItem('mau_sound_enabled', String(next))
  return next
}

/**
 * Kısa bir "ding" sesi çalar.
 * @param {'notify'|'success'|'error'} type
 */
export function playSound(type = 'notify') {
  if (!isSoundEnabled()) return
  try {
    const ctx = getCtx()

    // Suspended state (tarayıcı politikası) varsa resume et
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'notify') {
      // İki nota: ding-dong
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.setValueAtTime(1100, now + 0.1)
      gain.gain.setValueAtTime(0.15, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)
      osc.start(now)
      osc.stop(now + 0.4)
    } else if (type === 'success') {
      osc.frequency.setValueAtTime(660, now)
      osc.frequency.setValueAtTime(880, now + 0.08)
      osc.frequency.setValueAtTime(1100, now + 0.16)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc.start(now)
      osc.stop(now + 0.45)
    } else if (type === 'error') {
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, now)
      osc.frequency.setValueAtTime(180, now + 0.1)
      gain.gain.setValueAtTime(0.1, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc.start(now)
      osc.stop(now + 0.3)
    }
  } catch (e) {
    // Sessizce başarısız ol
  }
}
