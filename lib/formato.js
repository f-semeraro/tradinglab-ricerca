/**
 * lib/formato.js — come si scrivono i numeri nei report e nel registro.
 *
 * Funzioni pure. Un punto solo, così un report e la sua riga di registro non possono
 * scrivere lo stesso numero in due modi diversi.
 */

/** Un numero con la virgola decimale; «—» se non è un numero finito: mai uno zero al posto di un dato che manca. */
export function numero(valore, decimali = 2) {
  return Number.isFinite(valore) ? valore.toFixed(decimali).replace(".", ",") : "—";
}

/** Una frazione scritta come percentuale: 0,1234 diventa «12,34%». */
export function percento(frazione, decimali = 2) {
  return Number.isFinite(frazione) ? `${numero(frazione * 100, decimali)}%` : "—";
}

/** Un testo che può stare in una cella di tabella Markdown: senza barre verticali né a capo. */
export function cella(testo) {
  return String(testo).replace(/[|\r\n]+/g, " ").trim();
}

/** La data UTC di un istante in millisecondi, AAAA-MM-GG. */
export function dataISO(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Data e ora UTC al minuto, «AAAA-MM-GG HH:MM»: la prima colonna del registro. */
export function dataOraUTC(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}
