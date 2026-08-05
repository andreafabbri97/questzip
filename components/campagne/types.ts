// Tipi derivati condivisi fra app/campagne/page.tsx e i componenti estratti in questa cartella
// (session-tools, dungeon-editor, ecc.) — centralizzati qui invece che duplicati o importati da
// page.tsx direttamente, per tenere page.tsx sotto le 800 righe senza sparpagliare i tipi.
import type { getCampaign, getMyCampaigns } from "@/app/actions/campaigns";
import type { getDungeon, getDungeonsForCampaign } from "@/app/actions/dungeons";

export type CampaignSummary = Awaited<ReturnType<typeof getMyCampaigns>>[number];
export type CampaignDetail = Awaited<ReturnType<typeof getCampaign>>;
export type DungeonListItem = Awaited<ReturnType<typeof getDungeonsForCampaign>>[number];
export type DungeonFull = Awaited<ReturnType<typeof getDungeon>>;
