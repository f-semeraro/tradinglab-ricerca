/**
 * scripts/b-giornaliera.js — la variante «B giornaliera», due test: A sull'universo 2020, B sul ciclo 2018–2020.
 * Pre-registrata in registro/esperimenti.md (sezione del 25 ottobre 2026, commit 32c7415).
 *
 *     node scripts/b-giornaliera.js
 *
 * Un'esecuzione sola. Legge le candele giornaliere in EUR da dati/archivio/b-universo-2020/, calcola il
 * portafoglio giornaliero, il buy and hold e liu-b sulle stesse monete, applica il giudizio dei due test
 * (N = 2, soglia 0,025 per test), scrive report/b-giornaliera.md, report/dati/b-giornaliera.json e una riga nel registro.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { serieGiornaliera, esposizione, giudicaGiornaliera } from "../lib/giornaliera.js";
import { serieSettimanale, periodo, curvaPortafoglio as curvaSettimanale, giudica as giudicaSettimanale } from "../lib/bSettimane.js";
import { curvaPortafoglio as curvaDaily } from "../lib/verifica140.js";
import { permanenzeLineari } from "../lib/rotazione.js";
import { drawdownMassimo } from "../lib/settimane.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const daRadice = (...parti) => path.join(RADICE, ...parti);
const CARTELLA = daRadice("dati", "archivio", "b-universo-2020");

const CALENDARIO = "2013-01-01";
const COSTO = 0.003; // 0,30% per operazione, andata e ritorno
const LATO = 0.0015; // 0,15% per lato
const ESCLUDI = 28; // spostamenti entro 28 giorni dallo zero
const ALFA = 0.05;
const N_TEST = 2;
const ALFA_TEST = ALFA / N_TEST;
const GIORNI_ANNO = 365.25;
const ESCLUDI_SETTIMANE = 4; // liu-b: spostamenti entro 4 settimane, come nei test precedenti

const TEST = [
  {
    id: "A",
    etichetta: "universo 2020",
    monete: ["ADAEUR", "BCHEUR", "DASHEUR", "EOSEUR", "ETCEUR", "ETHEUR", "GNOEUR", "LTCEUR", "QTUMEUR", "REPEUR", "XLMEUR", "XMREUR", "XRPEUR", "XTZEUR", "ZECEUR"],
    da: "2021-01-04",
    a: "2026-06-28",
    daSettimane: "2021-01-03",
    wSettimane: 286,
    atteso: 2002
  },
  {
    id: "B",
    etichetta: "ciclo 2018–2020",
    monete: ["XBTEUR", "LTCEUR", "ETCEUR", "ETHEUR"],
    da: "2018-07-02",
    a: "2020-12-27",
    daSettimane: "2018-07-01",
    wSettimane: 130,
    atteso: 910
  }
];

const numero = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace(".", ",") : "—");
const percento = (v, d = 2) => `${numero(v * 100, d)}%`;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Le candele giornaliere di una coppia fino a `fine`, in ordine di data. */
function caricaCandele(coppia, fine) {
  const righe = fs.readFileSync(path.join(CARTELLA, `${coppia}_1440.csv`), "utf8").trim().split("\n");
  const candele = [];
  for (const riga of righe) {
    const v = riga.split(",");
    const d = iso(Number(v[0]) * 1000);
    if (d > fine) break;
    candele.push({ date: d, close: Number(v[4]) });
  }
  return candele;
}

/** Il rendimento totale, l'annuo e il drawdown massimo di una curva in base 1. */
function metriche(curva, anni) {
  const rendimento = curva[curva.length - 1] - 1;
  return {
    rendimento,
    annuo: (1 + rendimento) ** (1 / anni) - 1,
    drawdown: drawdownMassimo(curva, 0, curva.length - 1)
  };
}

/** Il rendimento per ciascun anno, dalle date (la prima è la base) e dalla curva. */
function annuale(date, curva) {
  const anni = [...new Set(date.slice(1).map((d) => Number(d.slice(0, 4))))];
  const ultimoDi = (anno) => {
    let k = 0;
    for (let i = 0; i < date.length; i++) if (date[i].startsWith(`${anno}-`)) k = i;
    return k;
  };
  return anni.map((anno, j) => {
    const fine = ultimoDi(anno);
    const inizio = j === 0 ? 0 : ultimoDi(anno - 1);
    return { anno, rendimento: curva[fine] / curva[inizio] - 1 };
  });
}

/** La curva del portafoglio a pesi uguali senza ribilanciamento, come da pre-registrazione: la media delle curve delle monete. */
function curvaSenzaRibilanciamento(monete) {
  const curve = monete.map((m) => curvaDaily([{ e: m.e, R: m.R }], LATO));
  return curve[0].map((_, k) => curve.reduce((somma, c) => somma + c[k], 0) / curve.length);
}

function analizzaTest(t) {
  // il portafoglio giornaliero: esposizioni e rendimenti sul calendario di partenza
  const giornaliere = t.monete.map((coppia) => {
    const candele = caricaCandele(coppia, t.a);
    const serie = serieGiornaliera(candele, t.a, CALENDARIO);
    const ultimoIndice = serie.presente.lastIndexOf(true);
    const expo = esposizione(serie, ultimoIndice);
    const rend = serie.close.map((c, i) => (i === 0 || c === null || serie.close[i - 1] === null ? 0 : c / serie.close[i - 1] - 1));
    const iS = serie.date.indexOf(t.da);
    const iE = serie.date.indexOf(t.a);
    const E = expo.slice(iS, iE + 1);
    if (E.length !== t.atteso) throw new Error(`${coppia}: periodo di ${E.length} giorni, atteso ${t.atteso}`);
    return {
      coppia,
      E,
      R: rend.slice(iS, iE + 1),
      ATT: E.map((_, k) => (iS + k <= ultimoIndice ? 1 : 0)),
      date: [serie.date[iS - 1], ...serie.date.slice(iS, iE + 1)]
    };
  });
  const date = giornaliere[0].date;

  const monete = giornaliere.map((g) => ({ e: g.E, R: g.R, attiva: g.ATT }));
  const giudizio = giudicaGiornaliera({ monete, costo: COSTO, alfa: ALFA_TEST, escludi: ESCLUDI });
  const curvaP = curvaSenzaRibilanciamento(monete);
  const curvaBH = curvaSenzaRibilanciamento(monete.map((m) => ({ e: m.attiva, R: m.R })));
  const operazioniP = giornaliere.reduce((s, g) => s + permanenzeLineari(g.E).length, 0);
  const anni = t.atteso / GIORNI_ANNO;
  const N = giornaliere.length;

  // liu-b sulle stesse monete, con il motore settimanale dei test precedenti
  const settimanali = t.monete.map((coppia) => {
    const candele = caricaCandele(coppia, t.a);
    const serie = serieSettimanale({ date: candele.map((c) => c.date), close: candele.map((c) => c.close) }, t.a);
    return { coppia, ...periodo(serie, { da: t.daSettimane, W: t.wSettimane }) };
  });
  const curvaL = curvaSettimanale(settimanali, LATO, "H");
  const curvaLBH = curvaSettimanale(settimanali, LATO, "attiva");
  const operazioniL = settimanali.reduce((s, m) => s + permanenzeLineari(m.H).length, 0);
  // il giudizio di liu-b è solo informativo: alfa 0,05, come nel suo test
  const giudizioL = giudicaSettimanale(settimanali, { costo: COSTO, alfa: ALFA, escludi: ESCLUDI_SETTIMANE });

  const perMoneta = giornaliere.map((g, i) => ({
    coppia: g.coppia,
    operazioni: permanenzeLineari(g.E).length,
    giorniDentro: g.E.reduce((s, x) => s + x, 0) / g.E.length,
    netto: curvaDaily([{ e: g.E, R: g.R }], LATO).at(-1) - 1,
    buyAndHold: curvaDaily([{ e: g.ATT, R: g.R }], LATO).at(-1) - 1,
    liuB: curvaSettimanale([settimanali[i]], LATO, "H").at(-1) - 1,
    liuBBuyAndHold: curvaSettimanale([settimanali[i]], LATO, "attiva").at(-1) - 1
  }));

  return {
    ...t,
    giudizio,
    giudizioLiuB: giudizioL,
    portafoglio: { ...metriche(curvaP, anni), operazioniAnno: operazioniP / N / anni },
    buyAndHold: metriche(curvaBH, anni),
    liuB: { ...metriche(curvaL, anni), operazioniAnno: operazioniL / N / anni },
    perMoneta,
    annualeP: annuale(date, curvaP),
    annualeL: annuale(settimanali[0].date, curvaL),
    annualeBH: annuale(date, curvaBH),
    curve: { date, portafoglio: curvaP, buyAndHold: curvaBH, dateLiuB: settimanali[0].date, liuB: curvaL, liuBBuyAndHold: curvaLBH }
  };
}

function main() {
  const registroPath = daRadice("registro", "esperimenti.md");
  const registro = fs.readFileSync(registroPath, "utf8");
  if (registro.includes("| b-giornaliera |")) throw new Error("la variante giornaliera è già stata eseguita");

  const risultati = TEST.map(analizzaTest);
  const passa = risultati.every((r) => r.giudizio.passa);

  fs.mkdirSync(daRadice("report", "dati"), { recursive: true });
  fs.writeFileSync(
    daRadice("report", "dati", "b-giornaliera.json"),
    JSON.stringify(Object.fromEntries(risultati.map((r) => [r.id, r.curve]))) + "\n",
    "utf8"
  );

  const righeTabella = risultati.flatMap((r) => [
    `| ${r.id} · ${r.etichetta} | portafoglio giornaliero | ${percento(r.portafoglio.rendimento)} | ${percento(r.portafoglio.annuo)} | ${percento(r.portafoglio.drawdown)} | ${numero(r.portafoglio.operazioniAnno, 1)} | ${numero(r.giudizio.p, 5)} | ${r.giudizio.passa ? "**passa**" : "non passa"} |`,
    `| ${r.id} · ${r.etichetta} | buy and hold, stesse monete | ${percento(r.buyAndHold.rendimento)} | ${percento(r.buyAndHold.annuo)} | ${percento(r.buyAndHold.drawdown)} | — | — | — |`,
    `| ${r.id} · ${r.etichetta} | liu-b, stesse monete | ${percento(r.liuB.rendimento)} | ${percento(r.liuB.annuo)} | ${percento(r.liuB.drawdown)} | ${numero(r.liuB.operazioniAnno, 1)} | ${numero(r.giudizioLiuB.p, 5)} (informativo) | informativo |`
  ]);

  const righeReport = [
    "# La variante «B giornaliera» della regola B, con controllo giornaliero dell'ingresso",
    "",
    "Pre-registrazione: registro/esperimenti.md, sezione «variante «B giornaliera» della regola B», commit 32c7415. Il test A non è indipendente da liu-b: l'idea nasce dai suoi risultati sugli stessi periodi.",
    "",
    `**Verdetto:** ${passa ? "passa" : "non passa"}. Per passare servono entrambi i test, ciascuno con p ≤ ${numero(ALFA_TEST, 3)} e somma netta positiva.`,
    "",
    "| test | strategia | rendimento totale | rendimento annuo | drawdown massimo | operazioni all'anno per moneta | p | esito |",
    "|---|---|---:|---:|---:|---:|---:|---|",
    ...righeTabella,
    "",
    "## Giudizio",
    "",
    ...risultati.map((r) =>
      `- ${r.id} (${r.etichetta}): ${r.giudizio.spostamenti} spostamenti (esclusi entro ${ESCLUDI} giorni dallo zero), p minimo ${numero(1 / (r.giudizio.spostamenti + 1), 5)}, somma netta per operazione ${numero(r.giudizio.osservata * 100)} punti.`
    ),
    "",
    "## Per moneta (solo come informazione)",
    ""
  ];
  for (const r of risultati) {
    righeReport.push(`### ${r.id} · ${r.etichetta}`, "", "| moneta | operazioni | giorni dentro | rendimento giornaliero | buy and hold | liu-b | buy and hold liu-b |", "|---|---:|---:|---:|---:|---:|---:|");
    for (const m of r.perMoneta) {
      righeReport.push(`| ${m.coppia} | ${m.operazioni} | ${percento(m.giorniDentro)} | ${percento(m.netto)} | ${percento(m.buyAndHold)} | ${percento(m.liuB)} | ${percento(m.liuBBuyAndHold)} |`);
    }
    righeReport.push("", "Anno per anno (solo come informazione):", "", "| anno | giornaliera | buy and hold | liu-b |", "|---|---:|---:|---:|");
    for (const p of r.annualeP) {
      const b = r.annualeBH.find((a) => a.anno === p.anno);
      const l = r.annualeL.find((a) => a.anno === p.anno);
      righeReport.push(`| ${p.anno} | ${percento(p.rendimento)} | ${percento(b.rendimento)} | ${l ? percento(l.rendimento) : "—"} |`);
    }
    righeReport.push("");
  }
  righeReport.push(
    "## Scostamenti dal metodo",
    "",
    "Quelli dichiarati nella pre-registrazione, lettere da (a) a (f): (a) il test A non è indipendente da liu-b; (b) il test B include ETH; (c) l'esclusione entro 28 giorni dallo zero è scelta di questo test; (d) nella nulla le operazioni hanno durata variabile; (e) liu-b usa il motore settimanale dei test precedenti; (f) giorni senza candela e monete tolte dal listino seguono le regole della pre-registrazione.",
    "",
    "---",
    "",
    "Simulazione su carta. Nessuna operazione reale, nessuna chiave, nessuna consulenza."
  );
  fs.writeFileSync(daRadice("report", "b-giornaliera.md"), righeReport.join("\n") + "\n", "utf8");

  const dataOggi = new Date().toISOString().slice(0, 16).replace("T", " ");
  const impronta = crypto
    .createHash("sha256")
    .update(JSON.stringify({ TEST, COSTO, LATO, ESCLUDI, ALFA, N_TEST }))
    .digest("hex")
    .slice(0, 10);
  const sintesiRighe = risultati.map((r) => `${r.id}: p ${numero(r.giudizio.p, 5)}, ${r.giudizio.passa ? "passa" : "non passa"}`).join("; ");
  const rigaRegistro =
    `| ${dataOggi} | b-giornaliera | A (15 monete) + B (4 monete) | ${impronta} | 4 gen 2021 → 28 giu 2026; 2 lug 2018 → 27 dic 2020 | ` +
    `${risultati.map((r) => r.perMoneta.reduce((s, m) => s + m.operazioni, 0)).join(" / ")} | ` +
    `${risultati.map((r) => `${r.id} ${percento(r.portafoglio.rendimento)} (buy and hold ${percento(r.buyAndHold.rendimento)}, liu-b ${percento(r.liuB.rendimento)})`).join("; ")} | ` +
    `${risultati.map((r) => `${r.id} ${numero((r.portafoglio.rendimento - r.buyAndHold.rendimento) * 100)} punti`).join(" / ")} | ` +
    `${risultati.map((r) => percento(r.portafoglio.drawdown)).join(" / ")} | ` +
    `variante giornaliera, N = 2: ${sintesiRighe}; verdetto ${passa ? "passa" : "non passa"} |`;
  const separatore = registro.endsWith("\n") ? "" : "\n";
  fs.appendFileSync(registroPath, separatore + rigaRegistro + "\n", "utf8");

  console.log(`Variante giornaliera scritta in report/b-giornaliera.md: ${passa ? "passa" : "non passa"}. ${sintesiRighe}.`);
}

try {
  main();
} catch (errore) {
  console.error(`test interrotto: ${errore.message}`);
  process.exitCode = 1;
}
