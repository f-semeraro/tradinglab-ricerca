import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  rigiocabile,
  finestraCandele,
  primaCandelaValutabile,
  eseguiBacktest,
  periodoDi,
  reportBacktest,
  rigaRegistroBacktest,
  riepilogoBacktest
} from "../lib/backtest.js";
import { nuovoStato, avanza } from "../lib/simulazione.js";
import { calcolaMetriche } from "../lib/metriche.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strategiaVera = JSON.parse(fs.readFileSync(path.join(RADICE, "strategie", "rsi-base.json"), "utf8"));

// Solo RSI: con tutte e tre le condizioni insieme su una serie sintetica non scatta mai.
const strategia = { ...strategiaVera, ingresso: { ...strategiaVera.ingresso, incrocioMedie: null, volume: null } };

const ORA = 3600;
const GIORNO = 86400;
const INIZIO = Date.UTC(2026, 2, 1) / 1000; // 1 marzo 2026, mezzanotte UTC
const BASE = { capitaleIniziale: 100, mercato: "SOLEUR", intervalloMinuti: 60, fusoOrario: "Europe/Rome" };

// Un'onda: dodici ore in discesa e dodici in salita. L'RSI scende sotto la soglia a ogni discesa.
function serie(n) {
  const candele = [];
  let prezzo = 100;
  for (let i = 0; i < n; i++) {
    const apertura = prezzo;
    prezzo = prezzo * (1 + (i % 24 < 12 ? -0.8 : 0.9) / 100 + 0.0003);
    candele.push({
      momento: INIZIO + i * ORA,
      apertura,
      massimo: Math.max(apertura, prezzo) * 1.001,
      minimo: Math.min(apertura, prezzo) * 0.999,
      chiusura: prezzo,
      volume: 10 + (i % 7)
    });
  }
  return candele;
}

test("rigiocabile: le strategie a blocchi sì, le prove in avanti con un tipo no", () => {
  assert.equal(rigiocabile(strategiaVera), true);
  assert.equal(rigiocabile({ tipo: "settimanale" }), false);
  assert.equal(rigiocabile({ tipo: "giornaliera" }), false);
});

test("finestraCandele: --da parte dalla mezzanotte del giorno, --a comprende tutto il suo giorno", () => {
  const candele = serie(24 * 5); // dall'1 al 5 marzo
  const { candele: finestra, escluse } = finestraCandele(candele, { da: INIZIO + GIORNO, a: INIZIO + 2 * GIORNO, intervalloMinuti: 60 });
  assert.equal(finestra.length, 48);
  assert.equal(finestra[0].momento, INIZIO + GIORNO);
  assert.equal(finestra.at(-1).momento, INIZIO + 3 * GIORNO - ORA);
  assert.equal(escluse, 0);
});

test("finestraCandele: senza date tiene tutto; con chiuseEntro toglie le candele non ancora chiuse a quell'istante e le conta", () => {
  const candele = serie(48);
  assert.equal(finestraCandele(candele, { intervalloMinuti: 60 }).candele.length, 48);
  const limite = INIZIO + 10 * ORA; // la candela delle 09:00 chiude alle 10:00: resta; quella delle 10:00 no
  const { candele: finestra, escluse } = finestraCandele(candele, { chiuseEntro: limite, intervalloMinuti: 60 });
  assert.equal(finestra.length, 10);
  assert.equal(escluse, 38);
});

test("finestraCandele: le candele escluse si contano dopo il filtro sulle date", () => {
  const candele = serie(24 * 3);
  const { candele: finestra, escluse } = finestraCandele(candele, { da: INIZIO + GIORNO, chiuseEntro: INIZIO + 2 * GIORNO, intervalloMinuti: 60 });
  assert.equal(finestra.length, 24);
  assert.equal(escluse, 24);
});

test("eseguiBacktest: è la stessa corsa del giro, avanza() più calcolaMetriche()", () => {
  const candele = serie(400);
  const { stato, metriche } = eseguiBacktest({ strategia, candele, base: BASE });

  const atteso = avanza(nuovoStato(BASE), candele, primaCandelaValutabile(strategia), candele.length, strategia);
  const ultimo = atteso.istantanee.at(-1);
  assert.deepEqual(stato, atteso);
  assert.deepEqual(metriche, calcolaMetriche(atteso, { prezzoMercato: ultimo.prezzo, prezzoBenchmark: null, adessoSecondi: ultimo.momento }));
  assert.ok(metriche.operazioni.chiuse > 0, "la serie a onda deve produrre operazioni");
});

test("eseguiBacktest: le candele da `a` in poi non contano, e senza candele da valutare si ferma", () => {
  const candele = serie(400);
  const impazzite = candele.map((c, i) => (i < 300 ? c : { ...c, chiusura: c.chiusura * 40, massimo: c.massimo * 40, minimo: c.minimo * 40 }));
  assert.deepEqual(
    eseguiBacktest({ strategia, candele, base: BASE, a: 300 }),
    eseguiBacktest({ strategia, candele: impazzite, base: BASE, a: 300 })
  );
  assert.throws(() => eseguiBacktest({ strategia, candele: candele.slice(0, primaCandelaValutabile(strategia)), base: BASE }), /nessuna candela da valutare/);
});

test("report e riga di registro: le stesse cifre, e ogni operazione ha la sua riga", () => {
  const candele = serie(400);
  const { stato, metriche } = eseguiBacktest({ strategia, candele, base: BASE });
  const report = reportBacktest({
    nome: "prova", impronta: "abc1234567", coppia: "SOLEUR", intervalloMinuti: 60, fonte: "dati/storico/SOLEUR-60.csv",
    candele, fuso: "Europe/Rome", escluse: 0, giorniEsclusi: 365, stato, metriche
  });
  const riga = rigaRegistroBacktest({
    data: "2026-11-15 10:00", nome: "prova", coppia: "SOLEUR", impronta: "abc1234567",
    periodo: periodoDi(candele, "Europe/Rome"), metriche, nota: "una | nota"
  });

  assert.match(report, /^# Backtest — prova su SOLEUR\n/);
  assert.match(report, /Ultimo anno incluso per scelta esplicita/);
  assert.equal(report.split("\n").filter((r) => /^\| \d+ \|/.test(r)).length, stato.operazioni.length);

  const capitale = riga.split("|")[7].trim();
  assert.ok(report.includes(`| capitale finale | ${capitale} |`), "il capitale del registro è quello del report");
  assert.ok(report.includes(periodoDi(candele, "Europe/Rome")));
  assert.equal(riga.split("|").length - 1, 11);
  assert.ok(riepilogoBacktest({ nome: "prova", coppia: "SOLEUR", metriche }).includes(capitale));
});

test("reportBacktest: con candele escluse dice quante e come includerle", () => {
  const candele = serie(400);
  const { stato, metriche } = eseguiBacktest({ strategia, candele, base: BASE });
  const report = reportBacktest({
    nome: "prova", impronta: "x", coppia: "SOLEUR", intervalloMinuti: 60, fonte: "f.csv",
    candele, fuso: "Europe/Rome", escluse: 12, giorniEsclusi: 365, stato, metriche
  });
  assert.match(report, /Escluse 12 candele dell'ultimo anno \(configurazione: 365 giorni\)/);
});
