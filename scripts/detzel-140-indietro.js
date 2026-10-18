/**
 * scripts/detzel-140-indietro.js — verifica all'indietro della media a 140 giorni (Detzel et al., L = 20
 * settimane), su dati mai usati dal laboratorio. Pre-registrata in registro/esperimenti.md (commit 0b975ef).
 *
 *     node scripts/detzel-140-indietro.js
 *
 * Un'esecuzione sola. Legge le candele giornaliere fino al 31 dicembre 2020, applica la regola di copertura
 * della pre-registrazione, scrive report/detzel-140-indietro.md, report/dati/detzel-140-indietro.json e una
 * riga nel registro.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { segnali, esposizione, turnoverLineare } from "../lib/detzel.js";
import { valutaCopertura, giudicaPortafoglio, curvaPortafoglio } from "../lib/verifica140.js";
import { drawdownMassimo } from "../lib/settimane.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const daRadice = (...parti) => path.join(RADICE, ...parti);

// XBTUSD e le coppie EUR di laboratorio.json, tranne XXBTZEUR (lo stesso asset di XBTUSD), con i nomi dell'archivio
const COPPIE = [
  "XBTUSD", "ETHEUR", "XRPEUR", "SOLEUR", "LINKEUR", "ZECEUR", "XDGEUR", "ADAEUR", "SUIEUR", "LTCEUR",
  "TRXEUR", "NEAREUR", "UNIEUR", "BCHEUR", "AAVEEUR", "XLMEUR", "AVAXEUR", "ALGOEUR", "ATOMEUR", "FILEUR"
];
const PRIMO_GIORNO_PRIMA = "2018-06-30"; // la chiusura da cui parte la posizione del 1 luglio 2018
const INIZIO_DATI_PRIMA = "2018-07-01";
const FINE = "2020-12-31";
const GIORNI_ATTESI = 915;
const FINESTRA = 140;
const COSTO_LATO = 0.0015; // 0,10% più 0,05% di slippage, per lato e per unità di variazione
const ESCLUDI = 30; // spostamenti entro 30 giorni dallo zero, in entrambe le direzioni
const ALFA = 0.05;
const GIORNI_ANNO = 365.25;

const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");
const percento = (v, d = 2) => `${numero(v * 100, d)}%`;

/** Le candele giornaliere fino al 31 dicembre 2020, compreso: le successive non si leggono. */
function caricaCandele(coppia) {
  const percorso = daRadice("dati", "archivio", `${coppia}_1440.csv`);
  const date = [];
  const close = [];
  for (const riga of fs.readFileSync(percorso, "utf8").trim().split("\n")) {
    const v = riga.split(",");
    const giorno = new Date(Number(v[0]) * 1000).toISOString().slice(0, 10);
    if (giorno > FINE) break;
    date.push(giorno);
    close.push(Number(v[4]));
  }
  return { coppia, date, close };
}

function main() {
  const registroPath = daRadice("registro", "esperimenti.md");
  const registro = fs.readFileSync(registroPath, "utf8");
  if (registro.includes("| detzel-140-indietro |")) throw new Error("la verifica all'indietro è già stata eseguita");

  const serie = COPPIE.map(caricaCandele);
  const copertura = serie.map((s) => ({
    coppia: s.coppia,
    ...valutaCopertura({ date: s.date, inizio: INIZIO_DATI_PRIMA, fine: FINE, finestra: FINESTRA })
  }));
  const incluse = serie.filter((_, i) => copertura[i].incluso);
  if (incluse.length === 0) throw new Error("nessuna moneta supera la regola di copertura");

  const monete = incluse.map((s) => {
    const S0 = s.date.indexOf(PRIMO_GIORNO_PRIMA);
    const S1 = s.date.indexOf(FINE);
    const W = S1 - S0;
    const eCompleta = esposizione(segnali(s.close, FINESTRA));
    const e = Array.from({ length: W }, (_, i) => {
      const x = eCompleta[S0 + 1 + i];
      if (x === null) throw new Error(`${s.coppia}: esposizione mancante il ${s.date[S0 + 1 + i]}`);
      return x;
    });
    const R = Array.from({ length: W }, (_, i) => s.close[S0 + 1 + i] / s.close[S0 + i] - 1);
    return { coppia: s.coppia, giorni: s.date.slice(S0, S1 + 1), e, R, W };
  });
  const W = monete[0].W;
  if (monete.some((m) => m.W !== W) || W !== GIORNI_ATTESI) {
    throw new Error(`periodo diverso da ${GIORNI_ATTESI} giorni: W = ${W}`);
  }

  const portafoglio = monete.map((m) => ({ e: m.e, R: m.R }));
  const buyAndHold = monete.map((m) => ({ e: new Array(W).fill(1), R: m.R }));
  const giudizio = giudicaPortafoglio({ monete: portafoglio, costo: COSTO_LATO, alfa: ALFA, escludi: ESCLUDI });
  const curva = curvaPortafoglio(portafoglio, COSTO_LATO);
  const curvaBH = curvaPortafoglio(buyAndHold, COSTO_LATO);
  const giorni = monete[0].giorni;
  const anni = W / GIORNI_ANNO;
  const N = monete.length;

  // l'ultimo indice di ciascun anno; l'indice 0 è il 30 giugno 2018, la base
  const ultimoDi = (anno) => {
    let k = 0;
    for (let i = 0; i <= W; i++) if (giorni[i].startsWith(`${anno}-`)) k = i;
    return k;
  };
  const anniDelPeriodo = [...new Set(giorni.slice(1).map((g) => Number(g.slice(0, 4))))];
  const annuale = anniDelPeriodo.map((anno, j) => {
    const fine = ultimoDi(anno);
    const inizio = j === 0 ? 0 : ultimoDi(anno - 1);
    return { anno, regola: curva[fine] / curva[inizio] - 1, buyAndHold: curvaBH[fine] / curvaBH[inizio] - 1 };
  });

  const rendimentoTotale = curva[W] - 1;
  const rendimentoBH = curvaBH[W] - 1;
  const cambiAnno = monete.reduce((somma, m) => somma + turnoverLineare(m.e) / anni, 0) / N;
  const operazioni = monete.reduce((somma, m) => somma + turnoverLineare(m.e) / 2, 0);
  const giorniDentro = monete.reduce((somma, m) => somma + m.e.reduce((s, x) => s + x, 0) / W, 0) / N;
  const drawdown = drawdownMassimo(curva, 0, W);
  const drawdownBH = drawdownMassimo(curvaBH, 0, W);

  fs.mkdirSync(daRadice("report", "dati"), { recursive: true });
  fs.writeFileSync(
    daRadice("report", "dati", "detzel-140-indietro.json"),
    JSON.stringify({
      test: "detzel-140-indietro",
      monete: monete.map((m) => m.coppia),
      giorni,
      portafoglio: curva,
      buyAndHold: curvaBH
    }) + "\n",
    "utf8"
  );

  const righe = [
    "# Verifica all'indietro della media a 140 giorni (Detzel et al., L = 20 settimane)",
    "",
    "Pre-registrazione: registro/esperimenti.md, sezione «verifica all'indietro della media a 140 giorni», commit 0b975ef, scritta prima di qualsiasi calcolo su questo periodo.",
    "",
    `**Verdetto:** ${giudizio.passa ? "passa" : "non passa"}. p ${numero(giudizio.p, 5)} contro soglia ${numero(ALFA, 2)}; rendimento netto totale del portafoglio ${percento(rendimentoTotale)}.`,
    "",
    `Periodo: dal 1 luglio 2018 al 31 dicembre 2020, ${W} giorni. Giudice: rotazione circolare comune, ${giudizio.spostamenti} spostamenti (s = 31…${W - 31}), senza seme. N = 1, alfa ${numero(ALFA, 2)}. Il minimo raggiungibile di p è ${numero(1 / (giudizio.spostamenti + 1), 5)}.`,
    "",
    `Costi: ${numero(COSTO_LATO * 100)}% per lato e per unità di variazione di esposizione, cioè ${numero(COSTO_LATO * 200)}% per operazione intera.`,
    "",
    "## Universo",
    "",
    "| moneta | esito | motivo |",
    "|---|---|---|",
    ...copertura.map((c) => `| ${c.coppia} | ${c.incluso ? "inclusa" : "esclusa"} | ${c.motivo || "—"} |`),
    "",
    "## Risultato del portafoglio a pesi uguali",
    "",
    "| portafoglio | cambi all'anno (per moneta) | giorni dentro (media) | rendimento totale | rendimento annuo | drawdown massimo | statistica (p.b. al giorno) | p | esito |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---|",
    `| regola, ${N} monete | ${numero(cambiAnno, 1)} | ${percento(giorniDentro)} | ${percento(rendimentoTotale)} | ${percento((1 + rendimentoTotale) ** (1 / anni) - 1)} | ${percento(drawdown)} | ${numero(giudizio.osservata * 10000)} | ${numero(giudizio.p, 5)} | ${giudizio.passa ? "**passa**" : "non passa"} |`,
    `| buy and hold a pesi uguali | — | 100,00% | ${percento(rendimentoBH)} | ${percento((1 + rendimentoBH) ** (1 / anni) - 1)} | ${percento(drawdownBH)} | — | — | — |`,
    "",
    "## Per moneta (solo informativo)",
    "",
    "| moneta | operazioni | giorni dentro |",
    "|---|---:|---:|",
    ...monete.map((m) => `| ${m.coppia} | ${numero(turnoverLineare(m.e) / 2, 0)} | ${percento(m.e.reduce((s, x) => s + x, 0) / W)} |`),
    "",
    "## Anno per anno (solo informativo; il primo anno è parziale)",
    "",
    "| anno | portafoglio | buy and hold |",
    "|---|---:|---:|",
    ...annuale.map((a) => `| ${a.anno} | ${percento(a.regola)} | ${percento(a.buyAndHold)} |`),
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) XBTEUR escluso dall'universo: è lo stesso asset di XBTUSD. (b) Condizione aggiuntiva: nessun giorno mancante nel periodo, per il confronto del portafoglio. (c) Liquidità a rendimento zero, come negli altri test. (d) Esposizione sul giorno successivo al segnale, come nella replica. (e) Prezzi Kraken, periodo fuori dal campione di Detzel (CoinDesk, fino al 30 giugno 2018). (f) Esclusione entro 30 giorni dallo zero: scelta di questo test. (g) Giudice sul rendimento medio giornaliero del portafoglio.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  ];
  fs.writeFileSync(daRadice("report", "detzel-140-indietro.md"), righe.join("\n") + "\n", "utf8");

  const dataOggi = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ COPPIE, PRIMO_GIORNO_PRIMA, FINE, FINESTRA, COSTO_LATO, ESCLUDI, ALFA }))
    .digest("hex")
    .slice(0, 10);
  const riga =
    `| ${dataOggi} | detzel-140-indietro | portafoglio (${N} monete) | ${impronta} | 1 lug 2018 → 31 dic 2020 | ${numero(operazioni, 0)} | ` +
    `rendimento ${percento(rendimentoTotale)} (buy and hold ${percento(rendimentoBH)}) | ` +
    `${numero((rendimentoTotale - rendimentoBH) * 100)} punti | ${percento(drawdown)} | ` +
    `verifica all'indietro, media 140 giorni: ${giudizio.passa ? "passa" : "non passa"}; statistica ${numero(giudizio.osservata * 10000)} p.b. al giorno; p ${numero(giudizio.p, 5)} |`;
  fs.appendFileSync(registroPath, riga + "\n", "utf8");

  console.log(`Verifica scritta in report/detzel-140-indietro.md: ${N} monete, ${giudizio.passa ? "passa" : "non passa"}.`);
}

try {
  main();
} catch (errore) {
  console.error(`verifica interrotta: ${errore.message}`);
  process.exitCode = 1;
}
