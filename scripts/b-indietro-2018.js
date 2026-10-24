/**
 * scripts/b-indietro-2018.js — verifica all'indietro della regola B di Liu e Tsyvinski su un secondo ciclo
 * di mercato, luglio 2018 – dicembre 2020. Pre-registrata in registro/esperimenti.md (sezione del 24 ottobre 2026).
 *
 *     node scripts/b-indietro-2018.js
 *
 * Un'esecuzione sola. Legge le candele giornaliere in EUR (dati/archivio/b-universo-2020/) fino al 27 dicembre
 * 2020 compreso, applica la regola di universo della pre-registrazione, scrive report/b-indietro-2018.md,
 * report/dati/b-indietro-2018.json e una riga nel registro.
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
// la stessa estrazione EUR/USD del test 2020: contiene anche le coppie in EUR di questo periodo
const CARTELLA = daRadice("dati", "archivio", "b-universo-2020");

const INIZIO_STORIA = "2016-07-04"; // 104 settimane complete prima del 2 luglio 2018
const FINE_STORIA = "2018-07-01";
const LIQ_DA = "2018-01-01"; // finestra della liquidità: primo semestre 2018
const LIQ_A = "2018-06-30";
const DA_PERIODO = "2018-07-01"; // la domenica che decide la prima settimana del periodo
const FINE = "2020-12-27"; // ultima domenica del periodo: il test non legge le candele successive
const W = 130; // dal 2 luglio 2018 al 27 dicembre 2020
const TOP = 20;
const ESCLUDI = 4; // spostamenti entro 4 settimane dallo zero, in entrambe le direzioni
const ALFA = 0.05;
const GIORNO = 86400000;
const GIORNI_ANNO = 365.25;

// il test sull'universo 2020 (report/b-universo-2020.md), per il confronto
const CONFRONTO_2020 = { monete: 15, portafoglio: 238.07, buyAndHold: 54.04, p: 0.0036 };

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
  if (registro.includes("| b-indietro-2018 |")) throw new Error("il test sul ciclo 2018–2020 è già stato eseguito");

  // primo passaggio: solo coppie in EUR; storia e liquidità del primo semestre 2018
  const riepilogo = [];
  let saltate = 0;
  for (const file of fs.readdirSync(CARTELLA).filter((f) => f.endsWith("_1440.csv"))) {
    const nome = file.replace(/_1440\.csv$/, "");
    const sep = separaCoppia(nome);
    if (!sep || sep.quota !== "EUR") {
      saltate += 1;
      continue;
    }
    const { date, close, volume } = leggiRighe(nome);
    if (date.length === 0) continue;
    const presenti = new Set(date);
    const valori = [];
    date.forEach((d, k) => {
      if (d >= LIQ_DA && d <= LIQ_A && volume[k] > 0) valori.push(volume[k] * close[k]);
    });
    riepilogo.push({
      nome,
      base: sep.base,
      primo: date[0],
      ultimo: date[date.length - 1],
      mancanti: giorniMancanti(presenti, INIZIO_STORIA, FINE_STORIA),
      mediana: valori.length ? mediana(valori) : 0
    });
  }

  const considerate = costruisciUniverso(
    riepilogo.map((s) => ({ nome: s.nome, base: s.base, mediana2020: s.mediana, mancanti: s.mancanti })),
    { top: TOP, soloEur: true, ammettiBitcoin: true }
  );
  const incluse = considerate.filter((r) => r.incluso);
  if (incluse.length === 0) throw new Error("nessuna moneta supera la regola di universo");

  // secondo passaggio: le serie complete delle monete incluse, fino al 27 dicembre 2020
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
  const annuale = [2018, 2019, 2020].map((anno, j) => {
    const fine = ultimoDi(anno);
    const inizio = j === 0 ? 0 : ultimoDi(anno - 1);
    return { anno, regola: curva[fine] / curva[inizio] - 1, buyAndHold: curvaBH[fine] / curvaBH[inizio] - 1 };
  });

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
    daRadice("report", "dati", "b-indietro-2018.json"),
    JSON.stringify({ test: "b-indietro-2018", monete: monete.map((m) => m.coppia), giorni, portafoglio: curva, buyAndHold: curvaBH }) + "\n",
    "utf8"
  );

  const tolte = monete.filter((m) => m.ultimo < FINE);
  const righe = [
    "# Regola B su un secondo ciclo di mercato (luglio 2018 – dicembre 2020)",
    "",
    "Pre-registrazione: registro/esperimenti.md, sezione «verifica all'indietro della regola B su un secondo ciclo di mercato», scritta il 24 ottobre 2026 prima di qualsiasi calcolo.",
    "",
    `**Verdetto:** ${giudizio.passa ? "passa" : "non passa"}. p ${numero(giudizio.p, 5)} contro soglia ${numero(ALFA, 2)}; somma netta per operazione ${numero(giudizio.osservata * 100)} punti.`,
    "",
    `Periodo: dal 2 luglio 2018 al 27 dicembre 2020, ${W} settimane. Giudice: rotazione circolare comune, ${giudizio.spostamenti} spostamenti (s = 5…125), senza seme. N = 1, alfa ${numero(ALFA, 2)}. Il minimo raggiungibile di p è ${numero(1 / (giudizio.spostamenti + 1), 5)}.`,
    `Costi: ${numero(LATO * 100)}% per lato, ${numero(COSTO * 100)}% per operazione.`,
    "",
    "## Confronto con il test sull'universo 2020",
    "",
    "| | universo 2020 (dati fino al 2020) | questo test (ciclo 2018–2020) |",
    "|---|---:|---:|",
    `| monete | ${CONFRONTO_2020.monete} | ${N} |`,
    `| portafoglio a pesi uguali | +${numero(CONFRONTO_2020.portafoglio)}% | ${percento(rendimentoTotale)} |`,
    `| buy and hold a pesi uguali | +${numero(CONFRONTO_2020.buyAndHold)}% | ${percento(rendimentoBH)} |`,
    `| p | ${numero(CONFRONTO_2020.p, 5)} | ${numero(giudizio.p, 5)} |`,
    `| esito | passa | ${giudizio.passa ? "passa" : "non passa"} |`,
    "",
    "## Universo: tutte le monete considerate (solo coppie in EUR)",
    "",
    "| base | coppia | liquidità mediana 2018 (€ al giorno) | esito | motivo |",
    "|---|---|---:|---|---|",
    ...considerate.map(
      (r) => `| ${r.base} | ${r.coppia} | ${r.mediana2020 === null ? "—" : numero(r.mediana2020, 0)} | ${r.incluso ? "**inclusa**" : "esclusa"} | ${r.motivo} |`
    ),
    "",
    `Monete considerate: solo coppie in EUR. Esclusioni di tipo: stablecoin e token ancorati (${STABLECOIN.length} simboli), valute tradizionali (${VALUTE.join(", ")}). Bitcoin ammesso (XBTEUR).`,
    "",
    "## Monete tolte dal listino durante il periodo",
    "",
    tolte.length
      ? ["| moneta | ultima candela |", "|---|---|", ...tolte.map((m) => `| ${m.coppia} | ${m.ultimo} |`)].join("\n")
      : "Nessuna delle monete incluse è stata tolta dal listino prima del 27 dicembre 2020.",
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
    "## Anno per anno (solo informativo; il primo anno parte dal 2 luglio)",
    "",
    "| anno | regola B | buy and hold |",
    "|---|---:|---:|",
    ...annuale.map((a) => `| ${a.anno} | ${percento(a.regola)} | ${percento(a.buyAndHold)} |`),
    "",
    "## Scostamenti dal metodo",
    "",
    "(a) Test nuovo su un secondo ciclo di mercato, non replica di Liu e Tsyvinski. (b) Universo solo in EUR, Bitcoin incluso: scelta del test, dettata dall'archivio. (c) Giudice: rotazione circolare comune con esclusione entro 4 settimane dallo zero. (d) Percentile sul primo dato disponibile di ciascuna moneta. (e) Settimana senza scambi, moneta tolta dal listino e nulla come da pre-registrazione. (f) Periodo dello studio: la versione di lavoro finisce il 31 maggio 2018; la versione pubblicata non è verificata.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  ];
  fs.writeFileSync(daRadice("report", "b-indietro-2018.md"), righe.join("\n") + "\n", "utf8");

  const dataOggi = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ TOP, ESCLUDI, ALFA, DA_PERIODO, W, FINE, LATO, COSTO, INIZIO_STORIA, FINE_STORIA, LIQ_DA, LIQ_A }))
    .digest("hex")
    .slice(0, 10);
  const riga =
    `| ${dataOggi} | b-indietro-2018 | portafoglio (${N} monete) | ${impronta} | 2 lug 2018 → 27 dic 2020 | ${operazioni} | ` +
    `rendimento ${percento(rendimentoTotale)} (buy and hold ${percento(rendimentoBH)}) | ` +
    `${numero((rendimentoTotale - rendimentoBH) * 100)} punti | ${percento(drawdown)} | ` +
    `regola B su ciclo 2018–2020: ${giudizio.passa ? "passa" : "non passa"}; somma netta ${numero(giudizio.osservata * 100)} punti; p ${numero(giudizio.p, 5)} |`;
  fs.appendFileSync(registroPath, riga + "\n", "utf8");

  console.log(`Test scritto in report/b-indietro-2018.md: ${N} monete, ${giudizio.passa ? "passa" : "non passa"}. Saltate ${saltate} coppie non in EUR.`);
}

try {
  main();
} catch (errore) {
  console.error(`test interrotto: ${errore.message}`);
  process.exitCode = 1;
}
