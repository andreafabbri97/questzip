// Stessa convenzione WhatsApp: oggi -> ora, ieri -> "Ieri", ultimi 6 giorni -> giorno della
// settimana, oltre -> data breve. Condivisa fra la lista conversazioni (Chat) e il centro
// notifiche, invece di due implementazioni identiche mantenute separatamente.
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) {
    const label = d.toLocaleDateString("it-IT", { weekday: "long" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
