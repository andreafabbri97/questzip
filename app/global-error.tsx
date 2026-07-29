"use client";

// Copre il caso più raro (ma possibile) in cui l'errore avvenga nel root layout stesso (nav,
// provider di sessione/realtime) — app/error.tsx da solo non lo intercetta perché vive SOTTO il
// layout che sta fallendo. Questo file sostituisce l'intero documento quando scatta, quindi deve
// avere i propri <html>/<body> (nessun accesso al tema/font del layout, stile minimo apposta).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="it">
      <body
        style={{
          background: "#0c0a09",
          color: "#ece5da",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <p style={{ fontSize: "2.5rem" }}>🎲💥</p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#f2c14e" }}>
          Qualcosa è andato storto
        </h1>
        <p style={{ maxWidth: "28rem", fontSize: "0.875rem", color: "#a89e90" }}>
          Un errore imprevisto ha impedito il caricamento dell&apos;app. I tuoi dati non sono
          stati toccati.
        </p>
        <button
          onClick={reset}
          style={{
            borderRadius: "0.5rem",
            background: "#e0a83e",
            color: "#0c0a09",
            fontWeight: "bold",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          Riprova
        </button>
      </body>
    </html>
  );
}
