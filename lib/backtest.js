/**
 * lib/backtest.js — una strategia rigiocata sul passato: la finestra, la corsa, il report, la riga di registro.
 *
 * Funzioni pure: niente file, niente orologio, niente rete. Lo script scripts/backtest.js legge e
 * scrive; qui si decide solo che cosa si calcola e come si racconta.
 *
 * Il backtest non è una seconda implementazione: la corsa passa da avanza() di lib/simulazione.js,
 * la stessa funzione del giro orario, e le metriche da calcolaMetriche(). Chi vuole rigiocare una
 * strategia — il comando, il generatore, un test — chiama eseguiBacktest() e nient'altro.
 */

import { nuovoStato, avanza } from "./simulazione.js";
import { calcolaMetriche } from "./metriche.js";
import { candeleNecessarie } from "./configurazione.js";
import { formattaMomento } from "./tempo.js";
import { numero } from "./formato.js";
import { rigaRegistro } from "./registro.js";

const GIORNO = 86400;

/**
 * Dice se una configurazione è una strategia a blocchi, quella che questo motore rigioca. Le prove
 * in avanti settimanali e giornaliere dichiarano un `tipo` e hanno un motore loro.
 */
export function rigiocabile(configurazione) {
  return configurazione?.tipo === undefined;
}

/**
 * Le candele della finestra richiesta.
 *
 * @param {Array} candele               tutte le candele, in ordine di tempo
 * @param {object} finestra
 * @param {number|null} finestra.da     mezzanotte UTC del primo giorno, in secondi; null per partire dall'inizio
 * @param {number|null} finestra.a      mezzanotte UTC dell'ultimo giorno, COMPRESO; null per arrivare alla fine
 * @param {number|null} finestra.chiuseEntro  restano solo le candele chiuse entro questo istante; null per tenerle tutte
 * @param {number} finestra.intervalloMinuti
 * @returns {{candele: Array, escluse: number}} `escluse` conta solo le candele tolte da `chiuseEntro`
 */
export function finestraCandele(candele, { da = null, a = null, chiuseEntro = null, intervalloMinuti }) {
  const durata = intervalloMinuti * 60;
  const nelleDate = candele.filter((c) => (da === null || c.momento >= da) && (a === null || c.momento < a + GIORNO));
  if (chiuseEntro === null) return { candele: nelleDate, escluse: 0 };
  const chiuse = nelleDate.filter((c) => c.momento + durata <= chiuseEntro);
  return { candele: chiuse, escluse: nelleDate.length - chiuse.length };
}

/** Il primo indice con storia sufficiente per gli indicatori della strategia. */
export function primaCandelaValutabile(strategia) {
  return candeleNecessarie(strategia) - 1;
}

/**
 * Rigioca la strategia sulle candele `candele[da..a)`. Le candele prima di `da` servono solo a
 * riscaldare gli indicatori; nessuna candela da `a` in poi viene guardata.
 *
 * @param {object} args
 * @param {object} args.strategia   la configurazione validata
 * @param {Array} args.candele      candele chiuse, in ordine
 * @param {object} args.base        { capitaleIniziale, mercato, intervalloMinuti, fusoOrario }
 * @param {number} [args.da]        di default, la prima candela valutabile
 * @param {number} [args.a]         di default, la fine delle candele
 * @returns {{stato: object, metriche: object}} lo stato finale del portafoglio di carta e le sue metriche
 */
export function eseguiBacktest({ strategia, candele, base, da = primaCandelaValutabile(strategia), a = candele.length }) {
  if (da >= a) {
    throw new Error(`nessuna candela da valutare: ne servono più di ${da}, ce ne sono ${Math.min(a, candele.length)}`);
  }
  const stato = avanza(nuovoStato(base), candele, da, a, strategia);
  const ultimo = stato.istantanee.at(-1);
  const metriche = calcolaMetriche(stato, { prezzoMercato: ultimo.prezzo, adessoSecondi: ultimo.momento });
  return { stato, metriche };
}

/** Il periodo coperto dalle candele, dall'apertura della prima a quella dell'ultima, nel fuso dato. */
export function periodoDi(candele, fuso) {
  const momento = (candela) => formattaMomento(candela.momento, fuso, { conAnno: true });
  return `${momento(candele[0])} → ${momento(candele.at(-1))}`;
}

const percentuale = (valore, decimali = 2) => (valore === null ? "—" : `${numero(valore, decimali)}%`);

/**
 * Il report di un backtest, in Markdown.
 *
 * @param {object} args
 * @param {string} args.nome              nome della strategia
 * @param {string} args.impronta
 * @param {string} args.coppia
 * @param {number} args.intervalloMinuti
 * @param {string} args.fonte             da dove vengono le candele, come percorso relativo
 * @param {Array} args.candele            le candele della finestra
 * @param {string} args.fuso
 * @param {number} args.escluse           candele dell'ultimo periodo tolte dalla finestra
 * @param {number} args.giorniEsclusi     quanti giorni dura l'ultimo periodo escluso per configurazione
 * @param {object} args.stato
 * @param {object} args.metriche
 */
export function reportBacktest({ nome, impronta, coppia, intervalloMinuti, fonte, candele, fuso, escluse, giorniEsclusi, stato, metriche }) {
  const m = metriche;
  const etichetta = intervalloMinuti === 1440 ? "giornaliere" : `da ${intervalloMinuti} minuti`;
  const momento = (secondi) => formattaMomento(secondi, fuso, { conAnno: true });
  const righe = [
    `# Backtest — ${nome} su ${coppia}`,
    "",
    `Dati: \`${fonte}\`, candele ${etichetta}.`,
    `Periodo: ${periodoDi(candele, fuso)} (${numero((candele.length * intervalloMinuti) / 1440, 1)} giorni di candele).`,
    escluse > 0
      ? `Escluse ${escluse} candele dell'ultimo anno (configurazione: ${giorniEsclusi} giorni). Per includerle: \`--usa-ultimo-anno\`.`
      : "Ultimo anno incluso per scelta esplicita (`--usa-ultimo-anno`).",
    `Impronta della configurazione: \`${impronta}\`.`,
    "",
    "| | |",
    "|---|---|",
    `| capitale finale | ${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%) |`,
    `| vs comprato e basta | ${numero(m.benchmark.differenzaDalMercato)} punti |`,
    `| operazioni chiuse | ${m.operazioni.chiuse} |`,
    `| win rate | ${percentuale(m.operazioni.winRate, 1)} |`,
    `| drawdown massimo | ${percentuale(m.drawdownMassimo)} |`,
    `| segnali fermati dal rischio | ${stato.blocchi.length} |`,
    `| posizione ancora aperta a fine periodo | ${stato.posizione ? "sì" : "no"} |`,
    ""
  ];

  if (stato.operazioni.length > 0) {
    righe.push(
      "## Operazioni",
      "",
      "| # | ingresso | uscita | prezzo ingresso | prezzo uscita | risultato | come è uscita |",
      "|---:|---|---|---:|---:|---:|---|"
    );
    for (const o of stato.operazioni) {
      righe.push(
        `| ${o.numero} | ${momento(o.momentoIngresso)} | ${momento(o.momentoUscita)} | ` +
        `${numero(o.prezzoIngresso)} | ${numero(o.prezzoUscita)} | ${numero(o.risultatoPercento)}% | ${o.uscitaScattata ?? "—"} |`
      );
    }
    righe.push("");
  }

  righe.push("---", "", "Simulazione su carta. Nessun soldo vero, nessuna chiave, nessuna consulenza.");
  return righe.join("\n") + "\n";
}

/** La riga di registro di un backtest: le stesse cifre del report, nello stesso formato. */
export function rigaRegistroBacktest({ data, nome, coppia, impronta, periodo, metriche, nota = "" }) {
  const m = metriche;
  return rigaRegistro({
    data,
    strategia: nome,
    coppia,
    impronta,
    periodo,
    operazioni: m.operazioni.chiuse,
    capitale: `${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%)`,
    vsCompratoEBasta: `${numero(m.benchmark.differenzaDalMercato)} punti`,
    drawdown: percentuale(m.drawdownMassimo),
    nota
  });
}

/** Il riepilogo di una riga per il terminale. */
export function riepilogoBacktest({ nome, coppia, metriche }) {
  const m = metriche;
  return `${nome} · ${coppia}: ${m.operazioni.chiuse} operazioni · capitale ${numero(m.capitaleAttuale)} € ` +
    `(${numero(m.variazionePercento)}%) · vs comprato e basta ${numero(m.benchmark.differenzaDalMercato)} punti`;
}
