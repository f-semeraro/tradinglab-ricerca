/**
 * scripts/conferma-crypto.js — test di conferma della regola B su altre crypto (pre-registrato).
 *
 *     node scripts/conferma-crypto.js
 *
 * Universo: le coppie EUR di laboratorio.json, tolto il Bitcoin, con i nomi dell'archivio Kraken.
 * Entrano le monete con almeno 104 domeniche con prezzo prima del 4 gennaio 2021 e al massimo il
 * 2% di domeniche senza prezzo nel periodo. Periodo: domeniche dal 3 gennaio 2021 al 28 giugno 2026.
 * Un'unica ipotesi, N = 1, alfa 0,05. Il report sovrascrive quello precedente solo se il registro
 * non contiene già la riga della conferma.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { aggiornaStoria } from "../lib/prova.js";
import { rendimentiSettimanali, segnali, settimaneDentro, curvaCapitale, drawdownMassimo } from "../lib/settimane.js";
import { giudicaRotazione, permanenzeLineari } from "../lib/rotazione.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);

const UNIVERSO = [
  ["ETHEUR", "ETH"], ["XRPEUR", "XRP"], ["SOLEUR", "SOL"], ["LINKEUR", "LINK"], ["ZECEUR", "ZEC"],
  ["XDGEUR", "DOGE"], ["ADAEUR", "ADA"], ["SUIEUR", "SUI"], ["LTCEUR", "LTC"], ["TRXEUR", "TRX"],
  ["NEAREUR", "NEAR"], ["UNIEUR", "UNI"], ["BCHEUR", "BCH"], ["AAVEEUR", "AAVE"], ["XLMEUR", "XLM"],
  ["AVAXEUR", "AVAX"], ["ALGOEUR", "ALGO"], ["ATOMEUR", "ATOM"], ["FILEUR", "FIL"]
];
const DOMENICA_INIZIO = "2021-01-03";
const DOMENICA_FINE = "2026-06-28";
const MIN_DOMENICHE_PRIMA = 104;
const MAX_BUCHI_PERCENTUALE = 2;
const ALFA = 0.05;
const COSTO = (2 * (0.1 + 0.05)) / 100; // 0,30% per operazione, andata e ritorno

function candeleArchivio(coppia) {
  const percorso = dentro("dati", "archivio", `${coppia}_1440.csv`);
  if (!fs.existsSync(percorso)) throw new Error(`manca ${path.relative(RADICE, percorso)}`);
  return fs.readFileSync(percorso, "utf8").trim().split("\n").map((riga) => {
    const v = riga.split(",");
    return { momento: Number(v[0]), chiusura: Number(v[4]) };
  });
}

const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");

/** Inclusione: la regola fissata nella pre-registrazione, applicata ai conteggi. */
function valuta(coppia, nome) {
  const storia = aggiornaStoria([], candeleArchivio(coppia));
  // i conteggi si fanno per data: una moneta che parte dopo il 2021 non ha indici validi in quel periodo
  const prezzoAl = new Map(storia.map((r) => [r.data, r.chiusura]));
  const domeniche = [];
  for (let t = Date.parse(DOMENICA_INIZIO); t <= Date.parse(DOMENICA_FINE); t += 7 * 86400000) {
    domeniche.push(new Date(t).toISOString().slice(0, 10));
  }
  const prima = storia.filter((r) => r.data <= DOMENICA_INIZIO && r.chiusura !== null).length;
  const buchi = domeniche.filter((d) => prezzoAl.get(d) === undefined || prezzoAl.get(d) === null).length;
  const motivi = [];
  if (prima < MIN_DOMENICHE_PRIMA) motivi.push(`storia corta: ${prima} domeniche prima del 4/1/2021`);
  if ((buchi / domeniche.length) * 100 > MAX_BUCHI_PERCENTUALE) motivi.push(`${buchi} domeniche senza prezzo nel periodo`);
  return {
    coppia,
    nome,
    storia,
    S0: storia.findIndex((r) => r.data === DOMENICA_INIZIO),
    S1: storia.findIndex((r) => r.data === DOMENICA_FINE),
    prima,
    buchi,
    incluso: motivi.length === 0,
    motivi
  };
}

/** Le serie di una moneta inclusa sulle W settimane del periodo, con la regola B. */
function serieMoneta(v) {
  const { storia, S0, S1 } = v;
  const close = storia.map((r) => r.chiusura);
  const rend = rendimentiSettimanali(close);
  const dentroArr = settimaneDentro(segnali("B", rend), 1);
  const W = S1 - S0;
  const R = Array.from({ length: W }, (_, i) => rend[S0 + 1 + i]);
  const H = Array.from({ length: W }, (_, i) => (dentroArr[S0 + 1 + i] ? 1 : 0));
  if (R.some((r) => r === null)) throw new Error(`${v.nome}: rendimenti mancanti nel periodo`);
  // curve per il portafoglio: la regola, e il buy and hold della stessa moneta
  const tuttaDentro = new Array(close.length).fill(false);
  for (let k = S0 + 1; k <= S1; k++) tuttaDentro[k] = true;
  const curvaRegola = curvaCapitale(close, dentroArr, S0, S1, COSTO);
  const curvaBH = curvaCapitale(close, tuttaDentro, S0, S1, COSTO);
  return {
    R,
    H,
    W,
    regola: Array.from({ length: W + 1 }, (_, i) => curvaRegola[S0 + i]),
    buyAndHold: Array.from({ length: W + 1 }, (_, i) => curvaBH[S0 + i])
  };
}

function main() {
  const valutazioni = UNIVERSO.map(([coppia, nome]) => valuta(coppia, nome));
  const incluse = valutazioni.filter((v) => v.incluso);
  if (incluse.length === 0) throw new Error("nessuna moneta supera la regola di inclusione");

  const registro = fs.readFileSync(dentro("registro", "esperimenti.md"), "utf8");
  if (registro.includes("| regola-B-altre-crypto |")) throw new Error("la conferma su altre crypto è già stata eseguita");

  const serie = incluse.map(serieMoneta);
  const N = incluse.length;
  const W = serie[0].W;
  const monete = serie.map((s) => ({ R: s.R, H: s.H }));
  const giudizio = giudicaRotazione({ monete, costo: COSTO, alfa: ALFA });

  // portafoglio a pesi uguali, senza ribilanciamento: somma delle quote, ciascuna 1/N
  const sommaPesata = (chiave) =>
    Array.from({ length: W + 1 }, (_, i) => serie.reduce((somma, s) => somma + s[chiave][i] / N, 0));
  const portafoglio = sommaPesata("regola");
  const portafoglioBH = sommaPesata("buyAndHold");
  const rendPortafoglio = (portafoglio[W] - 1) * 100;
  const rendBH = (portafoglioBH[W] - 1) * 100;
  const ddPortafoglio = drawdownMassimo(portafoglio, 0, W) * 100;
  const ddBH = drawdownMassimo(portafoglioBH, 0, W) * 100;

  const dataOggi = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = crypto.createHash("sha256").update(JSON.stringify({ UNIVERSO, COSTO, ALFA })).digest("hex").slice(0, 10);

  const righe = [
    "# Conferma della regola B su altre crypto",
    "",
    `Pre-registrazione: registro/esperimenti.md, sezione «test di conferma della regola B su altre crypto» (commit 80345e0). Periodo: domeniche dal ${DOMENICA_INIZIO} al ${DOMENICA_FINE}, ${W} settimane.`,
    `Giudice: rotazione circolare comune, ${giudizio.spostamenti} spostamenti (tutti tranne lo zero), senza seme. N = 1, alfa ${numero(ALFA)}.`,
    `Costi: ${numero(COSTO * 100)}% per operazione, andata e ritorno.`,
    "",
    "## Risultato complessivo",
    "",
    `| statistica osservata (somma netta, punti) | p | soglia | esito |`,
    "|---:|---:|---:|---|",
    `| ${numero(giudizio.osservata * 100)} | ${numero(giudizio.p, 4)} | ${numero(ALFA, 2)} | ${giudizio.passa ? "**passa**" : "non passa"} |`,
    "",
    `Risoluzione del p: il minimo raggiungibile con ${giudizio.spostamenti} spostamenti è ${numero(1 / (giudizio.spostamenti + 1), 4)}.`,
    "",
    "## Portafoglio a pesi uguali contro buy and hold",
    "",
    "| portafoglio | rendimento totale | drawdown massimo |",
    "|---|---:|---:|",
    `| regola B | ${numero(rendPortafoglio)}% | ${numero(ddPortafoglio)}% |`,
    `| buy and hold a pesi uguali | ${numero(rendBH)}% | ${numero(ddBH)}% |`,
    "",
    "## Per moneta (solo informativo)",
    "",
    "| moneta | operazioni | rendimento netto regola | buy and hold |",
    "|---|---:|---:|---:|",
    ...serie.map((s, i) => {
      const v = incluse[i];
      return `| ${v.nome} | ${permanenzeLineari(s.H).length} | ${numero((s.regola[W] - 1) * 100)}% | ${numero((s.buyAndHold[W] - 1) * 100)}% |`;
    }),
    "",
    "## Monete incluse ed escluse",
    "",
    "| moneta | esito | domeniche prima del 4/1/2021 | domeniche senza prezzo nel periodo | motivo |",
    "|---|---|---:|---:|---|",
    ...valutazioni.map((v) => `| ${v.nome} | ${v.incluso ? "inclusa" : "esclusa"} | ${v.prima} | ${v.buchi} | ${v.motivi.join("; ") || "—"} |`),
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) Test di conferma su altre crypto, non replica di Liu e Tsyvinski. (b) Giudice: rotazione circolare comune, al posto della permutazione del test su Bitcoin. (c) Portafoglio a pesi uguali, senza ribilanciamento.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  ];
  fs.mkdirSync(dentro("report"), { recursive: true });
  fs.writeFileSync(dentro("report", "conferma-crypto.md"), righe.join("\n") + "\n", "utf8");

  const riga = `| ${dataOggi} | regola-B-altre-crypto | ${N} monete | ${impronta} | 4 gen 2021 → 28 giu 2026 | ` +
    `${serie.reduce((somma, s) => somma + permanenzeLineari(s.H).length, 0)} | ` +
    `portafoglio ${numero(rendPortafoglio)}% (buy and hold ${numero(rendBH)}%) | ${numero(rendPortafoglio - rendBH)} punti | ${numero(ddPortafoglio)}% | ` +
    `p ${numero(giudizio.p, 4)}, ${giudizio.passa ? "passa" : "non passa"}; ${N} monete incluse, ${valutazioni.length - N} escluse |`;
  fs.appendFileSync(dentro("registro", "esperimenti.md"), riga + "\n", "utf8");

  console.log(`Conferma scritta in report/conferma-crypto.md: ${N} monete, p ${numero(giudizio.p, 4)}, ${giudizio.passa ? "passa" : "non passa"}.`);
}

try {
  main();
} catch (errore) {
  console.error(`conferma interrotta: ${errore.message}`);
  process.exitCode = 1;
}
