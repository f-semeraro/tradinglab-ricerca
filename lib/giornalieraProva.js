/**
 * lib/giornalieraProva.js — la prova in avanti della variante «B giornaliera» su un portafoglio di monete.
 *
 * Funzioni pure: le storie arrivano da fuori. Una storia è una lista di { data: "AAAA-MM-GG", chiusura }, una riga
 * per giorno con candela, in ordine. Le decisioni si ricalcolano a ogni giro dalla storia, con la stessa funzione
 * del test (esposizione in lib/giornaliera.js): una decisione dipende solo dalle candele fino al suo giorno.
 * Regola e giudizio: registro/esperimenti.md, sezione della prova in avanti della variante.
 */

import { serieGiornaliera, esposizione, giudicaGiornaliera } from "./giornaliera.js";
import { curvaPortafoglio } from "./verifica140.js";
import { permanenzeLineari } from "./rotazione.js";
import { drawdownMassimo } from "./settimane.js";

export const GIORNO = 86400000;
const CALENDARIO = "2013-01-01";
export const COSTO = 0.003; // 0,30% per operazione, andata e ritorno
export const LATO = 0.0015; // 0,15% per lato
export const ESCLUDI = 28; // spostamenti entro 28 giorni dallo zero, in entrambe le direzioni
export const ALFA = 0.05; // N = 1
export const GIORNI_TOLTA = 7; // giorni consecutivi senza candele: la moneta è considerata tolta
const ETICHETTA = "prova in avanti: tendenza, non indipendente da liu-b";

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const giorniTra = (da, a) => Math.round((Date.parse(a) - Date.parse(da)) / GIORNO);
const pct = (v, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d).replace(".", ",")}%` : "—");
const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");

/** Il giorno prima di una data: la domenica che decide il primo giorno di una partenza di lunedì. */
export function giornoPrima(data) {
  return iso(Date.parse(data) - GIORNO);
}

/** Unisce alla storia nuove candele giornaliere ({ momento in secondi, chiusura }); a parità di giorno vince la nuova. */
export function aggiornaStoriaGiornaliera(storia, candele) {
  const perData = new Map(storia.map((r) => [r.data, r.chiusura]));
  for (const c of candele) perData.set(iso(c.momento * 1000), c.chiusura);
  return [...perData.keys()].sort().map((data) => ({ data, chiusura: perData.get(data) }));
}

/** La serie giornaliera della storia fino a `fine` compresa, dal calendario fisso del test. */
function serieDi(storia, fine) {
  const candele = storia
    .filter((r) => r.data <= fine && r.chiusura !== null)
    .map((r) => ({ date: r.data, close: r.chiusura }));
  return serieGiornaliera(candele, fine, CALENDARIO);
}

/**
 * Le esposizioni di ogni moneta dal lunedì di partenza fino a `fine`, con i rendimenti della stessa finestra.
 * Nessuna posizione ereditata: si entra solo con segnali dal giorno prima della partenza in poi.
 * Una moneta è tolta se, fino a `fine`, non ha candele da più di GIORNI_TOLTA giorni: si esce all'ultima chiusura.
 */
export function datiPortafoglio({ storie, partenza, fine }) {
  if (fine < partenza) throw new Error(`la finestra non è ancora iniziata: partenza ${partenza}, fine ${fine}`);
  const monete = Object.entries(storie).map(([coppia, storia]) => {
    const serie = serieDi(storia, fine);
    const { date, close, presente } = serie;
    const ultimo = presente.lastIndexOf(true);
    const tolta = ultimo < 0 || giorniTra(date[ultimo], fine) > GIORNI_TOLTA;
    const ultimoIndice = tolta ? ultimo : date.length; // le monete attive non escono alla fine della serie
    const expo = esposizione(serie, ultimoIndice, date.indexOf(giornoPrima(partenza)));
    const rend = close.map((c, i) => (i === 0 || c === null || close[i - 1] === null ? 0 : c / close[i - 1] - 1));
    const iS = date.indexOf(partenza);
    const iE = date.indexOf(fine);
    return {
      coppia,
      tolta,
      e: expo.slice(iS, iE + 1),
      R: rend.slice(iS, iE + 1),
      attiva: date.slice(iS, iE + 1).map((_, k) => (iS + k <= ultimoIndice ? 1 : 0))
    };
  });
  const giorni = monete.length === 0 ? 0 : monete[0].e.length;
  return { giorni, monete };
}

/** La curva del portafoglio a pesi uguali senza ribilanciamento: la media delle curve delle monete, ciascuna con la sua quota. */
export function curvaSenzaRibilanciamento(monete) {
  if (monete.length === 0) return [1];
  const curve = monete.map((m) => curvaPortafoglio([{ e: m.e, R: m.R }], LATO));
  return curve[0].map((_, k) => curve.reduce((somma, c) => somma + c[k], 0) / curve.length);
}

/** Rendimento totale, rendimento annuo e drawdown massimo di una curva in base 1 su `giorni` giorni. */
export function metriche(curva, giorni) {
  const rendimento = curva.at(-1) - 1;
  return {
    rendimento,
    annuo: (1 + rendimento) ** (365.25 / giorni) - 1,
    drawdown: drawdownMassimo(curva, 0, curva.length - 1)
  };
}

/** Il giudizio della prova: rotazione circolare comune in giorni, somma netta per operazione, N = 1. */
export function giudizio(monete) {
  return giudicaGiornaliera({ monete, costo: COSTO, alfa: ALFA, escludi: ESCLUDI });
}

/**
 * Il verdetto, una volta sola: la finestra va dalla partenza alla domenica in cui il verdetto di liu-b è dovuto,
 * compresa. Il giudizio è lo stesso di sempre; qui solo la finestra.
 */
export function verdetto({ storie, partenza, domenica }) {
  const dati = datiPortafoglio({ storie, partenza, fine: domenica });
  return { domenica, giorni: dati.giorni, ...giudizio(dati.monete) };
}

/** I problemi di una strategia giornaliera. Lista vuota se è valida. */
export function problemiGiornaliera(strategia) {
  const problemi = [];
  if (strategia.tipo !== "giornaliera") problemi.push('tipo deve essere "giornaliera"');
  if (strategia.variante !== "B") problemi.push('variante deve essere "B"');
  if (strategia.percentile !== 0.8) problemi.push("percentile deve essere 0,8");
  if (strategia.metodoPercentile !== "R7") problemi.push('metodoPercentile deve essere "R7"');
  if (strategia.lato !== "lungo") problemi.push('lato deve essere "lungo": niente vendite allo scoperto');
  const partenza = strategia.partenza ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(partenza) || new Date(`${partenza}T00:00:00Z`).getUTCDay() !== 1) {
    problemi.push("partenza deve essere un lunedì, AAAA-MM-GG");
  }
  if (!Array.isArray(strategia.coppie) || strategia.coppie.length === 0) problemi.push("coppie: serve un elenco");
  if (strategia.costi?.commissionePercentoPerLato !== 0.1 || strategia.costi?.slippagePercento !== 0.05) {
    problemi.push("costi: 0,10% di commissione per lato e 0,05% di slippage, come rsi-base");
  }
  return problemi;
}

/**
 * Gli avvisi della variante: una giornata chiusa da più di 24 ore che non è nello storico di una moneta attiva.
 * La candela del giorno X si chiude alle 00:00 UTC del giorno dopo: il controllo è su X = oggi meno due giorni.
 */
export function avvisiGiornaliera({ storie, adessoMs, fine }) {
  const giorno = iso(adessoMs - 2 * GIORNO);
  const mancanti = Object.entries(storie)
    .filter(([, storia]) => {
      const ultimo = storia.at(-1)?.data ?? null;
      if (ultimo === null || giorniTra(ultimo, fine) > GIORNI_TOLTA) return false; // tolta: niente avviso
      return !storia.some((r) => r.data === giorno);
    })
    .map(([coppia]) => coppia);
  if (mancanti.length === 0) return [];
  return [`> ⚠ Giornata ${giorno} non elaborata entro 24 ore dalla sua chiusura per ${mancanti.length} monete: ${mancanti.join(", ")}.`];
}

/** La sezione della variante in SINTESI.md: una riga, il verdetto e l'etichetta del campione. */
export function sezioneGiornaliera({ nome, dati, capitale, verdetto: verdettoEmesso, liuB }) {
  const { monete, giorni } = dati;
  const p = metriche(curvaSenzaRibilanciamento(monete.map((m) => ({ e: m.e, R: m.R }))), giorni);
  const bh = metriche(curvaSenzaRibilanciamento(monete.map((m) => ({ e: m.attiva, R: m.R }))), giorni);
  const operazioni = monete.reduce(
    (somma, m) => somma + permanenzeLineari(m.e).filter((r) => m.tolta || r.at(-1) < m.e.length - 1).length,
    0
  );
  const anni = giorni / 365.25;
  const confrontoLiuB = liuB
    ? `liu-b sulle stesse monete: rendimento ${pct(liuB.rendimento)}, drawdown ${pct(liuB.drawdown)}.`
    : "liu-b non ancora attivo.";
  const testoVerdetto = verdettoEmesso
    ? `${verdettoEmesso.passa ? "passa" : "non passa"} (p ${numero(verdettoEmesso.p, 5)})`
    : "in attesa del verdetto di liu-b";
  return [
    "## Variante «B giornaliera» (prova in avanti)",
    "",
    "| strategia | monete | giorni trascorsi | operazioni chiuse | rendimento contro buy and hold | drawdown massimo | verdetto | campione |",
    "|---|---:|---:|---:|---|---|---|---|",
    `| ${nome} | ${monete.length} | ${giorni} | ${operazioni} | ${pct(p.rendimento)} contro ${pct(bh.rendimento)} (${numero((p.rendimento - bh.rendimento) * 100)} punti) | ` +
      `${pct(p.drawdown)} (buy and hold ${pct(bh.drawdown)}) | ${testoVerdetto} | ${ETICHETTA} |`,
    "",
    `Informativo: rendimento annuo ${pct(p.annuo)}, rendimento annuo diviso drawdown ${numero(p.annuo / Math.abs(p.drawdown))}, ` +
      `operazioni all'anno ${numero(operazioni / monete.length / anni, 1)} per moneta. ${confrontoLiuB}`,
    "",
    `Capitale di partenza ${numero(capitale)} € per moneta. Le decisioni si ricalcolano dalla storia a ogni giro, al prezzo di chiusura del loro giorno.`,
    ""
  ];
}
