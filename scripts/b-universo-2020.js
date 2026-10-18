/**
 * scripts/b-universo-2020.js — la regola B di Liu e Tsyvinski su un universo senza senno di poi:
 * monete scelte con i dati fino al 31 dicembre 2020. Pre-registrata in registro/esperimenti.md
 * (commit 4cdd7e3, corretta in aa388bf prima dell'esecuzione).
 *
 *     node scripts/b-universo-2020.js
 *
 * Un'esecuzione sola. Legge le candele giornaliere estratte in dati/archivio/b-universo-2020/,
 * applica la regola di universo, scrive report/b-universo-2020.md, report/dati/b-universo-2020.json
 * e una riga nel registro.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { separaCoppia, costruisciUniverso, STABLECOIN, BITCOIN, VALUTE } from "../lib/bUniverso.js";
import { serieSettimanale, periodo, equity, curvaPortafoglio, giudica, COSTO, LATO } from "../lib/bSettimane.js";
import { permanenzeLineari, rendimentoSettimane } from "../lib/rotazione.js";
import { drawdownMassimo } from "../lib/settimane.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const daRadice = (...parti) => path.join(RADICE, ...parti);
const CARTELLA = daRadice("dati", "archivio", "b-universo-2020");

const INIZIO_STORIA = "2019-01-07"; // 104 settimane complete prima del 4 gennaio 2021
const FINE_STORIA = "2021-01-03";
const PRIMO_CAMBIO = "2020-03-12"; // primo giorno con cambio EUR/USD nell'archivio: inizio della finestra di liquidità
const DA_PERIODO = "2021-01-03"; // la domenica che chiude la settimana prima del periodo
const FINE = "2026-06-28";
const W = 286; // dal 4 gennaio 2021 al 28 giugno 2026
const TOP = 20; // le venti monete più liquide nel 2020
const ESCLUDI = 4; // spostamenti entro 4 settimane dallo zero, in entrambe le direzioni
const ALFA = 0.05;
const GIORNO = 86400000;
const GIORNI_ANNO = 365.25;

// il test di conferma (report/conferma-crypto.md), per il confronto
const CONFERMA = { monete: 7, portafoglio: 241.58, buyAndHold: 143.5, p: 0.0105, operazioni: 248 };

const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");
const percento = (v, d = 2) => `${numero(v * 100, d)}%`;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

function mediana(valori) {
  const x = [...valori].sort((a, b) => a - b);
  const m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}

/** Le righe giornaliere di un file dell'archivio fino a FINE, in ordine di data. */
function leggiRighe(nome) {
  const date = [];
  const close = [];
  const volume = [];
  for (const riga of fs.readFileSync(path.join(CARTELLA, `${nome}_1440.csv`), "utf8").trim().split("\n")) {
    const v = riga.split(",");
    const giorno = iso(Number(v[0]) * 1000);
    if (giorno > FINE) break;
    date.push(giorno);
    close.push(Number(v[4]));
    volume.push(Number(v[5]));
  }
  return { date, close, volume };
}

/** I giorni senza candela tra da e a, estremi compresi. */
function giorniMancanti(presenti, da, a) {
  const mancanti = [];
  for (let t = Date.parse(da); t <= Date.parse(a); t += GIORNO) {
    if (!presenti.has(iso(t))) mancanti.push(iso(t));
  }
  return mancanti;
}

function main() {
  const registroPath = daRadice("registro", "esperimenti.md");
  const registro = fs.readFileSync(registroPath, "utf8");
  if (registro.includes("| b-universo-2020 |")) throw new Error("il test sull'universo 2020 è già stato eseguito");

  // il tasso EUR/USD di ciascun giorno, con il giorno precedente se manca
  const eurusd = leggiRighe("EURUSD");
  const tassi = new Map(eurusd.date.map((d, k) => [d, eurusd.close[k]]));
  const tassoDi = (giorno) => {
    let t = Date.parse(giorno);
    for (let i = 0; i < 8; i++, t -= GIORNO) {
      if (tassi.has(iso(t))) return tassi.get(iso(t));
    }
    throw new Error(`tasso EUR/USD mancante intorno al ${giorno}`);
  };

  // primo passaggio: solo storia e liquidità del 2020, fino al 31 dicembre 2020 per la liquidità
  const riepilogo = [];
  for (const file of fs.readdirSync(CARTELLA).filter((f) => f.endsWith("_1440.csv"))) {
    const nome = file.replace(/_1440\.csv$/, "");
    const sep = separaCoppia(nome);
    if (!sep) continue;
    const { date, close, volume } = leggiRighe(nome);
    if (date.length === 0) continue;
    const presenti = new Set(date);
    const valori2020 = [];
    date.forEach((d, k) => {
      if (d >= PRIMO_CAMBIO && d <= "2020-12-31" && volume[k] > 0) {
        const controvalore = volume[k] * close[k];
        valori2020.push(sep.quota === "USD" ? controvalore / tassoDi(d) : controvalore);
      }
    });
    riepilogo.push({
      nome,
      base: sep.base,
      quota: sep.quota,
      primo: date[0],
      ultimo: date[date.length - 1],
      mancanti: giorniMancanti(presenti, INIZIO_STORIA, FINE_STORIA),
      mediana2020: valori2020.length ? mediana(valori2020) : 0
    });
  }

  const considerate = costruisciUniverso(
    riepilogo.map((s) => ({ nome: s.nome, base: s.base, mediana2020: s.mediana2020, mancanti: s.mancanti })),
    { top: TOP }
  );
  const incluse = considerate.filter((r) => r.incluso);
  if (incluse.length === 0) throw new Error("nessuna moneta supera la regola di universo");
  const tolte = riepilogo.filter((s) => s.ultimo < "2026-06-01").sort((a, b) => a.ultimo.localeCompare(b.ultimo));

  // secondo passaggio: le serie complete delle monete incluse, fino al 28 giugno 2026
  const monete = incluse.map((r) => {
    const { date, close } = leggiRighe(r.coppia);
    const serie = serieSettimanale({ date, close }, FINE);
    const p = periodo(serie, { da: DA_PERIODO, W });
    return { coppia: r.coppia, base: r.base, ultimo: date[date.length - 1], ...p };
  });
  const giorni = monete[0].date;
  if (monete.some((m) => m.date.join() !== giorni.join())) throw new Error("le monete non hanno le stesse settimane");
  if (giorni[W] !== FINE) throw new Error(`il periodo non finisce al ${FINE}: ${giorni[W]}`);

  const giudizio = giudica(
    monete.map((m) => ({ H: m.H, R0: m.R0, attiva: m.attiva })),
    { costo: COSTO, alfa: ALFA, escludi: ESCLUDI }
  );
  const curva = curvaPortafoglio(monete, LATO, "H");
  const curvaBH = curvaPortafoglio(monete, LATO, "attiva");
  const N = monete.length;
  const anni = (W * 7) / GIORNI_ANNO;
  const rendimentoTotale = curva[W] - 1;
  const rendimentoBH = curvaBH[W] - 1;
  const drawdown = drawdownMassimo(curva, 0, W);
  const drawdownBH = drawdownMassimo(curvaBH, 0, W);
  const operazioni = monete.reduce((s, m) => s + permanenzeLineari(m.H).length, 0);

  const ultimoDi = (anno) => {
    let k = 0;
    for (let i = 0; i <= W; i++) if (giorni[i].startsWith(`${anno}-`)) k = i;
    return k;
  };
  const annuale = [2021, 2022, 2023, 2024, 2025, 2026].map((anno) => ({
    anno,
    regola: curva[ultimoDi(anno)] / curva[ultimoDi(anno - 1)] - 1,
    buyAndHold: curvaBH[ultimoDi(anno)] / curvaBH[ultimoDi(anno - 1)] - 1
  }));

  const perMoneta = monete.map((m) => {
    const runs = permanenzeLineari(m.H);
    return {
      coppia: m.coppia,
      operazioni: runs.length,
      giorniDentro: m.H.reduce((s, x) => s + x, 0) / W,
      netto: equity(m.H, m.R0, LATO)[W] - 1,
      buyAndHold: equity(m.attiva, m.R0, LATO)[W] - 1,
      sommaNettaOperazioni: runs.reduce((s, run) => s + rendimentoSettimane(m.R0, run) - COSTO, 0),
      ultimo: m.ultimo
    };
  });

  fs.mkdirSync(daRadice("report", "dati"), { recursive: true });
  fs.writeFileSync(
    daRadice("report", "dati", "b-universo-2020.json"),
    JSON.stringify({ test: "b-universo-2020", monete: monete.map((m) => m.coppia), giorni, portafoglio: curva, buyAndHold: curvaBH }) + "\n",
    "utf8"
  );

  const righe = [
    "# Regola B su un universo senza senno di poi (monete scelte con dati fino al 31 dicembre 2020)",
    "",
    "Pre-registrazione: registro/esperimenti.md, sezione «regola B su un universo senza senno di poi», commit 4cdd7e3, corretta in aa388bf prima dell'esecuzione.",
    "",
    `**Verdetto:** ${giudizio.passa ? "passa" : "non passa"}. p ${numero(giudizio.p, 5)} contro soglia ${numero(ALFA, 2)}; somma netta per operazione ${numero(giudizio.osservata * 100)} punti.`,
    "",
    `Periodo: dal 4 gennaio 2021 al 28 giugno 2026, ${W} settimane. Giudice: rotazione circolare comune, ${giudizio.spostamenti} spostamenti (s = 5…281), senza seme. N = 1, alfa ${numero(ALFA, 2)}. Il minimo raggiungibile di p è ${numero(1 / (giudizio.spostamenti + 1), 5)}.`,
    `Costi: ${numero(LATO * 100)}% per lato, ${numero(COSTO * 100)}% per operazione.`,
    "",
    "## Confronto con il test di conferma",
    "",
    "| | test di conferma (universo 2026) | questo test (universo 2020) |",
    "|---|---:|---:|",
    `| monete | ${CONFERMA.monete} | ${N} |`,
    `| portafoglio a pesi uguali | +${numero(CONFERMA.portafoglio)}% | ${percento(rendimentoTotale)} |`,
    `| buy and hold a pesi uguali | +${numero(CONFERMA.buyAndHold)}% | ${percento(rendimentoBH)} |`,
    `| p | ${numero(CONFERMA.p, 4)} | ${numero(giudizio.p, 5)} |`,
    `| esito | passa | ${giudizio.passa ? "passa" : "non passa"} |`,
    "",
    "## Universo: tutte le monete considerate",
    "",
    "| base | coppia scelta | liquidità mediana 2020 (€ al giorno) | esito | motivo |",
    "|---|---|---:|---|---|",
    ...considerate.map((r) => `| ${r.base} | ${r.coppia} | ${numero(r.mediana2020, 0)} | ${r.incluso ? "**inclusa**" : "esclusa"} | ${r.motivo} |`),
    "",
    `Esclusioni di tipo: Bitcoin (${BITCOIN.join(", ")}), stablecoin e token ancorati (${STABLECOIN.length} simboli), valute tradizionali (${VALUTE.join(", ")}).`,
    "",
    "## Monete tolte dal listino durante il periodo",
    "",
    "| moneta | ultima candela |",
    "|---|---|",
    ...monete.filter((m) => m.ultimo < FINE).map((m) => `| ${m.coppia} | ${m.ultimo} |`),
    monete.some((m) => m.ultimo < FINE) ? "" : "Nessuna delle monete incluse è stata tolta dal listino prima del 28 giugno 2026.",
    "",
    `Coppie EUR/USD dell'archivio tolte dal listino prima del 1 giugno 2026: ${tolte.length} (tutte le coppie, incluse quelle non considerate).`,
    "",
    "| coppia | ultima candela |",
    "|---|---|",
    ...tolte.map((s) => `| ${s.nome} | ${s.ultimo} |`),
    "",
    "## Portafoglio a pesi uguali contro il buy and hold",
    "",
    "| portafoglio | cambi all'anno (per moneta) | rendimento totale | rendimento annuo | drawdown massimo |",
    "|---|---:|---:|---:|---:|",
    `| regola B, ${N} monete | ${numero(perMoneta.reduce((s, m) => s + m.operazioni, 0) / N / anni, 1)} | ${percento(rendimentoTotale)} | ${percento((1 + rendimentoTotale) ** (1 / anni) - 1)} | ${percento(drawdown)} |`,
    `| buy and hold a pesi uguali | — | ${percento(rendimentoBH)} | ${percento((1 + rendimentoBH) ** (1 / anni) - 1)} | ${percento(drawdownBH)} |`,
    "",
    "## Per moneta (solo informativo)",
    "",
    "| moneta | operazioni | settimane dentro | rendimento netto regola | buy and hold | somma netta per operazione |",
    "|---|---:|---:|---:|---:|---:|",
    ...perMoneta.map(
      (m) =>
        `| ${m.coppia} | ${m.operazioni} | ${percento(m.giorniDentro)} | ${percento(m.netto)} | ${percento(m.buyAndHold)} | ${numero(m.sommaNettaOperazioni * 100)} punti |`
    ),
    "",
    "## Anno per anno (solo informativo; il primo anno parte dal 4 gennaio)",
    "",
    "| anno | regola B | buy and hold |",
    "|---|---:|---:|",
    ...annuale.map((a) => `| ${a.anno} | ${percento(a.regola)} | ${percento(a.buyAndHold)} |`),
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) Test nuovo sull'universo 2020, non replica di Liu e Tsyvinski. (b) Giudice: rotazione circolare comune con esclusione entro 4 settimane dallo zero. (c) Percentile sul primo dato disponibile di ciascuna moneta. (d) Liquidità in euro con EURUSD giornaliero dell'archivio. (e) Settimana senza scambi, moneta tolta dal listino e nulla come da pre-registrazione. (f) Il test legge i prezzi fino al 28 giugno 2026.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  ];
  fs.writeFileSync(daRadice("report", "b-universo-2020.md"), righe.join("\n") + "\n", "utf8");

  const dataOggi = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ TOP, ESCLUDI, ALFA, DA_PERIODO, W, FINE, LATO, COSTO, INIZIO_STORIA, FINE_STORIA }))
    .digest("hex")
    .slice(0, 10);
  const riga =
    `| ${dataOggi} | b-universo-2020 | portafoglio (${N} monete) | ${impronta} | 4 gen 2021 → 28 giu 2026 | ${operazioni} | ` +
    `rendimento ${percento(rendimentoTotale)} (buy and hold ${percento(rendimentoBH)}) | ` +
    `${numero((rendimentoTotale - rendimentoBH) * 100)} punti | ${percento(drawdown)} | ` +
    `regola B su universo 2020: ${giudizio.passa ? "passa" : "non passa"}; somma netta ${numero(giudizio.osservata * 100)} punti; p ${numero(giudizio.p, 5)} |`;
  fs.appendFileSync(registroPath, riga + "\n", "utf8");

  console.log(`Test scritto in report/b-universo-2020.md: ${N} monete, ${giudizio.passa ? "passa" : "non passa"}.`);
}

try {
  main();
} catch (errore) {
  console.error(`test interrotto: ${errore.message}`);
  process.exitCode = 1;
}
