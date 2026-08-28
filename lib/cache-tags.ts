/**
 * Tag di cache condivisi fra chi legge e chi invalida.
 *
 * Sta in un modulo suo e non accanto alle server action: un file "use server" può esportare solo
 * funzioni asincrone, quindi una costante lì dentro farebbe fallire la build.
 */

/** Le tabelle italiane del Compendio: cambiano solo quando le riempiono gli script. */
export const TAG_COMPENDIO = "compendio-ita";
