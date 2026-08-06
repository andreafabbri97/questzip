// Cattura una sessione autenticata per i test E2E chiamando app/api/auth/test-login (login di
// scorta SOLO per i test, vedi commento lì) invece di passare da Google — che rifiuta il login
// quando rileva un browser pilotato da automazione come Playwright. Nessuna password/OAuth
// coinvolti: la route crea direttamente una sessione vera nel DB, esattamente come farebbe un
// login reale, e qui salviamo solo il cookie di sessione che ne risulta.
import { request } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_FILE = "playwright/.auth/user.json";

async function main() {
  const secret = process.env.E2E_TEST_LOGIN_SECRET;
  if (!secret) {
    console.error(
      "E2E_TEST_LOGIN_SECRET non impostato — lancia questo script con `npm run test:e2e:login` (usa dotenv-cli su .env.local).",
    );
    process.exitCode = 1;
    return;
  }

  const context = await request.newContext({ baseURL: BASE_URL });
  const response = await context.post("/api/auth/test-login", {
    headers: { "x-e2e-secret": secret },
  });

  if (!response.ok()) {
    console.error(`Login di test fallito: HTTP ${response.status()} — ${await response.text()}`);
    await context.dispose();
    process.exitCode = 1;
    return;
  }

  await context.storageState({ path: OUT_FILE });
  await context.dispose();
  console.log(`Sessione di test salvata in ${OUT_FILE}.`);
}

main();
