/**
 * lib/rischio.js — i limiti che il valutatore non può vedere.
 *
 * `valuta()` è pura: riceve candele e posizione, e basta. Non sa quante
 * posizioni sono aperte né quanto hai perso oggi, perché per saperlo dovrebbe
 * guardare lo storico — e allora non sarebbe più pura, e non sarebbe più
 * l'unica cosa che stai davvero mettendo alla prova.
 *
 * Quei due controlli vivono qui, e vivono in **un posto solo**: li applicano
 * sia il ciclo che il backtest. Se il backtest avesse una sua copia delle
 * regole di rischio, il giorno in cui ne cambi una i due numeri divergono e
 * scopri quale dei due era sbagliato mesi dopo, dai risultati.
 *
 * Il momento si passa da fuori e non si legge dall'orologio: nel backtest
 * «oggi» è il giorno della candela, non il giorno in cui stai guardando lo
 * schermo.
 */

import { giornoLocale } from "./tempo.js";

const n = (valore, decimali = 2) =>
  Number(valore).toFixed(decimali).replace(".", ",");

/**
 * Si può aprire?
 *
 * @param {object} segnale
 * @param {object} stato       lo stato (vero o simulato)
 * @param {object} strategia   config/strategia.json
 * @param {number} momento     secondi UTC: adesso per il ciclo, la candela per il backtest
 * @returns {string|null} il motivo del blocco, o null se si può procedere
 */
export function controlloRischio(segnale, stato, strategia, momento) {
  if (segnale.azione !== "compra") return null; // le uscite non si bloccano mai

  const posizioniAperte = stato.posizione ? 1 : 0;
  if (posizioniAperte >= strategia.rischio.posizioniMassime) {
    return `c'è già una posizione aperta (il massimo configurato è ${strategia.rischio.posizioniMassime})`;
  }

  const limite = strategia.rischio.perditaMassimaGiornalieraPercento;
  if (limite === null || limite === undefined) return null;

  const oggi = giornoLocale(momento, stato.configurazione.fusoOrario);
  const risultatoOggi = (stato.operazioni ?? [])
    .filter((o) => giornoLocale(o.momentoUscita, stato.configurazione.fusoOrario) === oggi)
    .reduce((somma, o) => somma + o.risultatoEuro, 0);

  const percentoOggi = (risultatoOggi / stato.configurazione.capitaleIniziale) * 100;
  if (percentoOggi <= -limite) {
    return `oggi sei a ${n(percentoOggi)}%, oltre la perdita massima giornaliera di −${n(limite)}%: niente nuove posizioni fino a domani`;
  }
  return null;
}
