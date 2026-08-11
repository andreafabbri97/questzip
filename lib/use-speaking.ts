"use client";

import { useEffect, useState } from "react";

// Soglia RMS oltre la quale consideriamo che lo stream stia producendo voce, non solo rumore di
// fondo del microfono — scelta empiricamente (0-1, dove 1 sarebbe un segnale digitale saturo,
// mai raggiunto da un vero microfono): abbastanza bassa da reagire a un sussurro, abbastanza alta
// da non accendersi per il solo hiss elettrico di un mic scadente a riposo.
const SPEAKING_THRESHOLD = 0.02;
// Il livello audio oscilla rapidamente frame per frame anche mentre si parla con continuità (le
// sillabe hanno pause naturali) — senza un piccolo ritardo prima di spegnersi, l'indicatore
// lampeggerebbe invece di restare acceso per la durata di una frase.
const HOLD_MS = 300;

/** true mentre lo stream audio passato sta producendo un volume sopra soglia (voce), con un
 * piccolo "hold" per non lampeggiare tra una sillaba e l'altra — usato per l'indicatore "sta
 * parlando" per sé stessi e per ogni partecipante della chat vocale (components/campagne/
 * session-tools.tsx). Nessun costo se lo stream è null (utente silenziato/non ancora connesso):
 * l'AnalyserNode si crea solo quando c'è davvero uno stream da analizzare. */
export function useSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // Niente setSpeaking(false) sincrono qui: quando questo effetto rigira per un nuovo stream
    // (incluso il caso limite "diventato null"), il cleanup dell'esecuzione PRECEDENTE (sotto)
    // ha già riportato lo stato a false prima che questo corpo ripartisca — a meno che non ci
    // sia mai stato un giro precedente, nel qual caso lo stato iniziale è già false di suo.
    if (!stream || stream.getAudioTracks().length === 0) return;

    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let rafId: number;
    let lastAboveAt = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      // RMS sui campioni PCM (centrati su 128, non 0): la deviazione media dal centro è la
      // stima standard del volume istantaneo di un buffer nel dominio del tempo.
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const normalized = (data[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const now = performance.now();
      if (rms > SPEAKING_THRESHOLD) lastAboveAt = now;
      setSpeaking(now - lastAboveAt < HOLD_MS);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
      setSpeaking(false);
    };
  }, [stream]);

  return speaking;
}
