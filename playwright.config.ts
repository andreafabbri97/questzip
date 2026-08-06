import { defineConfig, devices } from "@playwright/test";

// Sessione autenticata catturata a mano con `npm run test:e2e:login` (vedi scripts/e2e-login.mjs)
// — login reale fatto dall'utente, mai credenziali gestite da qui. Se il file non esiste ancora
// i test che richiedono login falliranno con un errore chiaro invece di uno silenzioso.
const AUTH_FILE = "playwright/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  // Tutti gli spec condividono lo STESSO account di test (login di scorta, vedi
  // app/api/auth/test-login) e quindi la stessa riga "personaggi" sincronizzata sul server (vedi
  // la riconciliazione cloud in app/personaggi/page.tsx, legata all'account, non al singolo
  // browser context) — in parallelo, due spec che aprono una scheda Personaggio nello stesso
  // momento possono farsi sovrascrivere a vicenda i dati appena iniettati in localStorage.
  // Workers=1 sacrifica un po' di velocità (suite ancora piccola) per determinismo.
  fullyParallel: false,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
    },
  ],
  // Riusa il server di sviluppo se è già in ascolto (comodo mentre si lavora), altrimenti lo
  // avvia da solo — così `npx playwright test` funziona anche a freddo.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
