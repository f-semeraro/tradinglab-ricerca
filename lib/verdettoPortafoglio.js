/**
 * lib/verdettoPortafoglio.js — il verdetto della prova in avanti del portafoglio di monete.
 *
 * Funzioni pure. Il verdetto si dà una sola volta, quando sono passate almeno 52 settimane E sono
 * chiuse almeno 100 operazioni: dei due traguardi, si aspetta quello che arriva più tardi.
 * L'allarme scatta se il giro non gira da più di 24 ore.
 */

export const SETTIMANE_MINIME = 52;
export const OPERAZIONI_MINIME = 100;
export const ORE_MASSIME_SENZA_GIRO = 24;

/** Dice se il verdetto è dovuto, e cosa manca se non lo è. */
export function verdettoDovuto({ settimaneTrascorse, operazioniChiuse }) {
  const mancanoSettimane = Math.max(0, SETTIMANE_MINIME - settimaneTrascorse);
  const mancanoOperazioni = Math.max(0, OPERAZIONI_MINIME - operazioniChiuse);
  if (mancanoSettimane === 0 && mancanoOperazioni === 0) {
    return { dovuto: true, mancano: { settimane: 0, operazioni: 0 } };
  }
  return { dovuto: false, mancano: { settimane: mancanoSettimane, operazioni: mancanoOperazioni } };
}

/** L'allarme sul giro: attivo se non c'è un giro registrato o se l'ultimo è più vecchio di 24 ore. */
export function allarmeGiro({ ultimoGiroMs, adessoMs }) {
  if (ultimoGiroMs === null || ultimoGiroMs === undefined) {
    return { attivo: true, motivo: "nessun giro registrato" };
  }
  const ore = (adessoMs - ultimoGiroMs) / 3600000;
  if (ore > ORE_MASSIME_SENZA_GIRO) {
    return { attivo: true, motivo: `il giro non gira da ${ore.toFixed(1).replace(".", ",")} ore` };
  }
  return { attivo: false, motivo: "" };
}
