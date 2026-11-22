/**
 * lib/portafoglioSintesi.js — la riga del portafoglio di monete in SINTESI.md, la pagina per moneta e gli avvisi.
 *
 * Funzioni pure. Ogni moneta ha le sue istantanee settimanali { momento, portafoglio, mercato } in euro.
 * Il portafoglio è la media delle monete, ciascuna con quota 1/N e base 100 al capitale iniziale; il buy and
 * hold è la stessa media sulle quotazioni.
 */

import { domenicaChiusa } from "./politicaRichieste.js";
import { verdettoDovuto, allarmeGiro } from "./verdettoPortafoglio.js";

const GIORNO_MS = 86400000;
const ETICHETTA = "prova in avanti: tendenza, non indipendente da liu-b e detzel-140";

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pct = (v, d = 2) => (Number.isFinite(v) ? `${(v * 100).toFixed(d).replace(".", ",")}%` : "—");
const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");

const formatoRoma = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Rome",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit"
});

/** Quanti millisecondi l'ora di Roma è avanti rispetto a UTC, a quell'istante. */
function offsetRoma(ms) {
  const parti = Object.fromEntries(formatoRoma.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const orologioRoma = Date.UTC(+parti.year, +parti.month - 1, +parti.day, +parti.hour, +parti.minute, +parti.second);
  return orologioRoma - ms;
}

/** Il lunedì alle 23:59 ora di Roma della settimana che segue la domenica data, in millisecondi UTC. */
export function lunediSeraRoma(domenica) {
  const [anno, mese, giorno] = domenica.split("-").map(Number);
  const locale = Date.UTC(anno, mese - 1, giorno + 1, 23, 59, 0);
  const primo = locale - offsetRoma(locale);
  return locale - offsetRoma(primo);
}

/** La domenica che a questo istante deve già essere nello storico: quella la cui scadenza è passata. */
export function domenicaDaElaborare(adessoMs) {
  let domenica = domenicaChiusa(adessoMs);
  while (lunediSeraRoma(domenica) > adessoMs) domenica = iso(Date.parse(domenica) - 7 * GIORNO_MS);
  return domenica;
}

/** Le monete il cui storico non contiene ancora la domenica da elaborare. */
export function monetePiuIndietro(elementi, adessoMs) {
  const domenica = domenicaDaElaborare(adessoMs);
  return elementi.filter((e) => !e.storia.some((riga) => riga.data === domenica)).map((e) => e.coppia);
}

/** La curva media del portafoglio o del buy and hold: per ogni momento, la media delle monete con un'istantanea. */
export function curvaMedia(elementi, capitale, campo) {
  const perMomento = new Map();
  for (const e of elementi) {
    for (const i of e.stato.istantanee ?? []) {
      if (!perMomento.has(i.momento)) perMomento.set(i.momento, []);
      perMomento.get(i.momento).push((i[campo] / capitale) * 100);
    }
  }
  return [...perMomento.entries()]
    .sort(([a], [b]) => a - b)
    .map(([momento, valori]) => ({ momento, valore: valori.reduce((s, v) => s + v, 0) / valori.length }));
}

/** Rendimento totale e drawdown massimo di una curva in base 100. */
export function metriche(curva) {
  if (curva.length === 0) return { rendimento: null, drawdown: null };
  let picco = -Infinity;
  let peggiore = 0;
  for (const { valore } of curva) {
    picco = Math.max(picco, valore);
    peggiore = Math.min(peggiore, valore / picco - 1);
  }
  return { rendimento: curva[curva.length - 1].valore / 100 - 1, drawdown: peggiore };
}

/** Il testo del verdetto del portafoglio: dovuto, oppure che cosa manca. */
export function testoVerdettoPortafoglio(verdetto) {
  return verdetto.dovuto
    ? "dovuto: da emettere"
    : `in attesa: mancano ${verdetto.mancano.settimane} settimane e ${verdetto.mancano.operazioni} operazioni`;
}

/**
 * I numeri del portafoglio per la sintesi: le due curve in base 100, rendimento e drawdown del
 * portafoglio e del buy and hold, settimane, operazioni chiuse, verdetto ed etichetta del campione.
 * La sintesi e la dashboard li leggono da qui: scrivono gli stessi numeri per costruzione.
 */
export function datiSezionePortafoglio({ elementi, capitale }) {
  const curvaP = curvaMedia(elementi, capitale, "portafoglio");
  const curvaBH = curvaMedia(elementi, capitale, "mercato");
  const p = metriche(curvaP);
  const bh = metriche(curvaBH);
  const settimane = curvaP.length;
  const operazioni = elementi.reduce((s, e) => s + (e.stato.operazioni?.length ?? 0), 0);
  return {
    curvaP,
    curvaBH,
    p,
    bh,
    settimane,
    operazioni,
    verdetto: verdettoDovuto({ settimaneTrascorse: settimane, operazioniChiuse: operazioni }),
    differenza: p.rendimento === null || bh.rendimento === null ? null : (p.rendimento - bh.rendimento) * 100,
    etichetta: ETICHETTA
  };
}

/** La sezione del portafoglio in SINTESI.md: una riga, il verdetto e l'etichetta del campione. */
export function sezionePortafoglio({ elementi, capitale, nome }) {
  const { p, bh, settimane, operazioni, verdetto, differenza } = datiSezionePortafoglio({ elementi, capitale });
  const testoVerdetto = testoVerdettoPortafoglio(verdetto);

  return [
    "## Portafoglio di monete (prova in avanti)",
    "",
    "| strategia | monete | settimane trascorse | operazioni chiuse | rendimento contro buy and hold | drawdown massimo | verdetto | campione |",
    "|---|---:|---:|---:|---|---|---|---|",
    `| ${nome} | ${elementi.length} | ${settimane} | ${operazioni} | ${pct(p.rendimento)} contro ${pct(bh.rendimento)} (${numero(differenza)} punti) | ${pct(p.drawdown)} (buy and hold ${pct(bh.drawdown)}) | ${testoVerdetto} | ${ETICHETTA} |`,
    "",
    "liu-b, detzel-140 e questo portafoglio seguono tutti la stessa tendenza: i loro risultati non sono prove indipendenti.",
    ""
  ];
}

/** Gli avvisi da mettere in testa alla sintesi: giro fermo, e domeniche non elaborate in tempo. */
export function avvisi({ elementi, adessoMs, ultimoGiroPrecedente }) {
  const righe = [];
  const giro = allarmeGiro({ ultimoGiroMs: ultimoGiroPrecedente, adessoMs });
  if (giro.attivo) righe.push(`> ⚠ Il giro: ${giro.motivo}.`);
  const indietro = monetePiuIndietro(elementi.filter((e) => e.portafoglio), adessoMs);
  if (indietro.length > 0) {
    const domenica = domenicaDaElaborare(adessoMs);
    righe.push(`> ⚠ Domenica ${domenica} non elaborata entro le 23:59 di lunedì (ora di Roma) per ${indietro.length} monete: ${indietro.join(", ")}.`);
  }
  return righe;
}

/**
 * I numeri per moneta del portafoglio, all'ultima istantanea: operazioni chiuse, posizione aperta,
 * rendimento della quota e buy and hold della moneta dalla partenza, in frazione (null se non ci sono
 * ancora istantanee). La pagina per moneta e la dashboard li leggono da qui.
 */
export function datiMonete(elementi, capitale) {
  return elementi.map((e) => {
    const ultimo = e.stato.istantanee?.at(-1);
    return {
      coppia: e.coppia,
      operazioni: e.stato.operazioni?.length ?? 0,
      aperta: Boolean(e.stato.posizione),
      rendimento: ultimo ? ultimo.portafoglio / capitale - 1 : null,
      buyAndHold: ultimo ? ultimo.mercato / capitale - 1 : null
    };
  });
}

/** La pagina per moneta del portafoglio: solo come informazione, il giudizio è sul portafoglio. */
export function paginaMonete(elementi, capitale) {
  const righe = datiMonete(elementi, capitale).map(
    (m) => `| ${m.coppia} | ${m.operazioni} | ${m.aperta ? "sì" : "no"} | ${pct(m.rendimento)} | ${pct(m.buyAndHold)} |`
  );
  return [
    "# Portafoglio di monete: dettaglio per moneta",
    "",
    "Solo come informazione: il giudizio è sul portafoglio.",
    "",
    "| moneta | operazioni chiuse | posizione aperta | rendimento | buy and hold |",
    "|---|---:|---|---:|---:|",
    ...righe,
    ""
  ].join("\n");
}
