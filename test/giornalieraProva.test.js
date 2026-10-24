import { test } from "node:test";
import assert from "node:assert/strict";

import { serieGiornaliera, esposizione } from "../lib/giornaliera.js";
import {
  aggiornaStoriaGiornaliera,
  problemiGiornaliera,
  datiPortafoglio,
  avvisiGiornaliera,
  giudizio,
  curvaSenzaRibilanciamento
} from "../lib/giornalieraProva.js";
import { richiestaGiornalieraDaFare } from "../lib/politicaRichieste.js";

const GIORNO = 86400000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const candeleDa = (inizio, prezzi) =>
  prezzi.map((close, i) => ({ date: iso(Date.parse(inizio) + i * GIORNO), close }));
const storiaDa = (inizio, prezzi) =>
  prezzi.map((chiusura, i) => ({ data: iso(Date.parse(inizio) + i * GIORNO), chiusura }));

test("esposizione: con primaDecisione nessuna posizione prima di quel giorno", () => {
  // il salto del 10% cade al giorno 30: con la prima decisione al giorno 40 non si entra mai
  const prezzi = [...Array(30).fill(100), ...Array(30).fill(110)];
  const serie = serieGiornaliera(candeleDa("2020-01-01", prezzi), "2020-02-29", "2020-01-01");
  const expo = esposizione(serie, prezzi.length - 1, 40);
  assert.ok(expo.every((x) => x === 0), "nessun ingresso prima del giorno 40");
});

test("richiestaGiornalieraDaFare: una richiesta al giorno, dopo le 01:00 UTC, anche se fallisce", () => {
  const ore = (h) => Date.parse("2026-10-26T00:00:00Z") + h * 3600000;
  assert.equal(richiestaGiornalieraDaFare({ adessoMs: ore(0.5), ultimoTentativo: null }).fare, false);
  assert.equal(richiestaGiornalieraDaFare({ adessoMs: ore(1.2), ultimoTentativo: null }).fare, true);
  assert.equal(richiestaGiornalieraDaFare({ adessoMs: ore(1.2), ultimoTentativo: "2026-10-26" }).fare, false);
  assert.equal(richiestaGiornalieraDaFare({ adessoMs: ore(25), ultimoTentativo: "2026-10-26" }).fare, true);
});

test("aggiornaStoriaGiornaliera: unisce in ordine, a parità di giorno vince la candela nuova, e rifarla non cambia nulla", () => {
  const storia = [{ data: "2026-10-20", chiusura: 1 }, { data: "2026-10-21", chiusura: 2 }];
  const nuove = [
    { momento: Date.parse("2026-10-21") / 1000, chiusura: 2.5 },
    { momento: Date.parse("2026-10-22") / 1000, chiusura: 3 }
  ];
  const unita = aggiornaStoriaGiornaliera(storia, nuove);
  assert.deepEqual(unita, [
    { data: "2026-10-20", chiusura: 1 },
    { data: "2026-10-21", chiusura: 2.5 },
    { data: "2026-10-22", chiusura: 3 }
  ]);
  assert.deepEqual(aggiornaStoriaGiornaliera(unita, nuove), unita);
});

test("datiPortafoglio: una moneta attiva non esce alla fine della finestra", () => {
  // il salto al giorno 30 apre la posizione al giorno 35 (prima decisione: 5 febbraio); a fine 8 febbraio è ancora dentro
  const prezzi = [...Array(30).fill(100), ...Array(30).fill(110)];
  const dati = datiPortafoglio({
    storie: { ATT: storiaDa("2020-01-01", prezzi) },
    partenza: "2020-02-06",
    fine: "2020-02-08"
  });
  assert.equal(dati.giorni, 3);
  assert.deepEqual(dati.monete[0].e, [1, 1, 1]);
  assert.equal(dati.monete[0].tolta, false);
});

test("datiPortafoglio: una moneta tolta da più di 7 giorni esce all'ultima candela e non entra più", () => {
  const prezzi = [...Array(30).fill(100), ...Array(30).fill(110)];
  const dati = datiPortafoglio({
    storie: { TOLTA: storiaDa("2020-01-01", prezzi.slice(0, 20)) },
    partenza: "2020-02-06",
    fine: "2020-02-29"
  });
  assert.equal(dati.monete[0].tolta, true);
  assert.ok(dati.monete[0].e.every((x) => x === 0));
  assert.ok(dati.monete[0].attiva.every((x) => x === 0));
});

test("problemiGiornaliera: una strategia valida non ha problemi; partenza non lunedì o costi diversi sono problemi", () => {
  const valida = {
    tipo: "giornaliera",
    variante: "B",
    percentile: 0.8,
    metodoPercentile: "R7",
    lato: "lungo",
    partenza: "2026-10-26",
    coppie: ["XBTEUR"],
    costi: { commissionePercentoPerLato: 0.1, slippagePercento: 0.05 }
  };
  assert.deepEqual(problemiGiornaliera(valida), []);
  assert.ok(problemiGiornaliera({ ...valida, partenza: "2026-10-27" }).length > 0);
  assert.ok(problemiGiornaliera({ ...valida, costi: { commissionePercentoPerLato: 0.2, slippagePercento: 0.05 } }).length > 0);
});

test("avvisiGiornaliera: avvisa per una giornata assente dopo 24 ore, non per le monete tolte", () => {
  const adesso = Date.parse("2026-10-26T10:00:00Z"); // la giornata X è il 24 ottobre
  const completa = [{ data: "2026-10-23", chiusura: 1 }, { data: "2026-10-24", chiusura: 1 }, { data: "2026-10-25", chiusura: 1 }];
  const senza = [{ data: "2026-10-23", chiusura: 1 }, { data: "2026-10-25", chiusura: 1 }];
  const tolta = [{ data: "2026-10-01", chiusura: 1 }];
  assert.deepEqual(avvisiGiornaliera({ storie: { AAA: completa }, adessoMs: adesso, fine: "2026-10-25" }), []);
  const avvisi = avvisiGiornaliera({ storie: { AAA: senza, BBB: tolta }, adessoMs: adesso, fine: "2026-10-25" });
  assert.equal(avvisi.length, 1);
  assert.match(avvisi[0], /2026-10-24/);
  assert.match(avvisi[0], /AAA/);
  assert.doesNotMatch(avvisi[0], /BBB/);
});

test("giudizio: con 364 giorni gli spostamenti sono 307, come nella pre-registrazione", () => {
  const W = 364;
  const e = Array.from({ length: W }, (_, i) => (i > 100 && i < 150 ? 1 : 0));
  const g = giudizio([{ e, R: Array(W).fill(0.001), attiva: Array(W).fill(1) }]);
  assert.equal(g.spostamenti, 307);
});

test("giudizio: senza operazioni la prova non passa", () => {
  const W = 120;
  const g = giudizio([{ e: Array(W).fill(0), R: Array(W).fill(0.01), attiva: Array(W).fill(1) }]);
  assert.equal(g.passa, false);
  assert.ok(g.motivi.some((m) => m.includes("somma netta")));
});

test("curvaSenzaRibilanciamento: due monete uguali danno la curva di una sola", () => {
  const m = { e: [1, 1, 0, 0], R: [0.01, -0.02, 0.03, 0.01] };
  assert.deepEqual(curvaSenzaRibilanciamento([m, { ...m }]), curvaSenzaRibilanciamento([m]));
  assert.deepEqual(curvaSenzaRibilanciamento([]), [1]);
});
