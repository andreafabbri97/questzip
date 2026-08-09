"use client";

// Effetto sonoro del lancio dadi sintetizzato via Web Audio API invece di un file audio
// pre-registrato — nessun asset da procurarsi/licenziare, coerente con lo stile "costruito da
// zero" già usato altrove nel progetto (dungeon procedurale, decoder font del mastrino...).

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

// Un singolo "clack": rumore bianco molto breve filtrato passa-banda (isola le frequenze medio-
// alte tipiche di un urto secco, niente basso ronzio) con un inviluppo attacco-rilascio ripido —
// suona come un dado che rimbalza sul tavolo, non come un rumore bianco continuo.
function playClack(ctx: AudioContext, time: number, gain: number, freq: number) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.05);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = 1.2;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(gain, time + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

  noise.connect(filter);
  filter.connect(envelope);
  envelope.connect(ctx.destination);

  noise.start(time);
  noise.stop(time + 0.06);
}

/** Simula il rumore di una manciata di dadi che rotolano e rimbalzano su un tavolo: una serie di
 * "clack" brevi a volume/tono casuali, con intervalli che si allargano verso la fine (i dadi
 * rallentano prima di fermarsi) — invece di un unico file audio pre-registrato in loop, così ogni
 * tiro suona leggermente diverso, più vicino a dadi veri. Va chiamata da dentro un gestore di
 * click (gesture utente) — i browser bloccano l'audio altrimenti. */
export function playDiceRollSound() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const clackCount = 10 + Math.floor(Math.random() * 5);
  let t = now;
  for (let i = 0; i < clackCount; i++) {
    const progress = i / clackCount;
    const gain = 0.25 * (1 - progress * 0.6);
    const freq = 800 + Math.random() * 1400;
    playClack(ctx, t, gain, freq);
    t += 0.03 + progress * 0.08 + Math.random() * 0.03;
  }
}
