import { defineConfig, devices } from "@playwright/test";

// Sessione autenticata catturata a mano con `npm run test:e2e:login` (vedi scripts/e2e-login.mjs)
// — login reale fatto dall'utente, mai credenziali gestite da qui. Se il file non esiste ancora
// i test che richiedono login falliranno con un errore chiaro invece di uno silenzioso.
const AUTH_FILE = "playwright/.auth/user.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
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
