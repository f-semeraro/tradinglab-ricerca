import { test } from "node:test";
import assert from "node:assert/strict";

import {
  generatore,
  campionaStrategia,
  impronta,
  valutaSuCoppie,
  sogliaT,
  statistiche,
  giudica,
  correlazioneMedia,
  coppieEffettive
} from "../lib/ricerca.js";
import { problemiStrategia } from "../lib/configurazione.js";

const COSTI = { commissionePercentoPerLato: 0.4, slippagePercento: 0.05 };
const RISCHIO = { quotaCapitalePercento: 100, posizioniMassime: 1, perditaMassimaGiornalieraPercento: 6 };
const BASE = { capitaleIniziale: 100, fusoOrario: "Europe/Rome" };

const GIORNO = 86400;
const PRIMO = Math.floor(Date.UTC(2024, 9, 27) / 1000);

/** Candele giornaliere con prezzi generati da un seme: sempre gli stessi. */
function serieCasuale(seme, quante) {
  const rng = generatore(seme);
  let prezzo = 100;
  return Array.from({ length: quante }, (_, i) => {
    prezzo = prezzo * (1 + (rng() - 0.5) * 0.06);
    return { momento: PRIMO + i * GIORNO, apertura: prezzo, massimo: prezzo * 1.01, minimo: prezzo * 0.99, chiusura: prezzo, volume: 100 + Math.floor(rng() * 50) };
  });
}

/* ------------------------------ seme ------------------------------ */

test("generatore: lo stesso seme dà sempre la stessa sequenza, tra zero e uno", () => {
  const a = generatore(20261017);
  const b = generatore(20261017);
  const sequenza = Array.from({ length: 50 }, () => a());
  assert.deepEqual(sequenza, Array.from({ length: 50 }, () => b()));
  assert.ok(sequenza.every((v) => v >= 0 && v < 1));
});

test("generatore: semi diversi danno sequenze diverse", () => {
  assert.notDeepEqual(
    Array.from({ length: 10 }, generatore(1)),
    Array.from({ length: 10 }, generatore(2))
  );
});

/* ------------------------- strategie campionate ------------------------- */

test("campionaStrategia: con lo stesso seme genera le stesse strategie", () => {
  const primo = Array.from({ length: 20 }, () => null);
  const r1 = generatore(7);
  const r2 = generatore(7);
  const s1 = primo.map(() => campionaStrategia(r1, { costi: COSTI, rischio: RISCHIO }));
  const s2 = primo.map(() => campionaStrategia(r2, { costi: COSTI, rischio: RISCHIO }));
  assert.deepEqual(s1, s2);
});

test("campionaStrategia: ogni strategia ha da uno a tre blocchi, e costi e rischio sono quelli veri", () => {
  const rng = generatore(42);
  for (let i = 0; i < 200; i++) {
    const s = campionaStrategia(rng, { costi: COSTI, rischio: RISCHIO });
    const quanti = Object.keys(s.ingresso).length;
    assert.ok(quanti >= 1 && quanti <= 3, `blocchi: ${quanti}`);
    assert.deepEqual(s.costi, COSTI);
    assert.deepEqual(s.rischio, RISCHIO);
  }
});

test("campionaStrategia: la maggioranza delle combinazioni è valida, e le coppie veloce/lenta lo sono sempre quando la validazione le accetta", () => {
  const rng = generatore(99);
  let valide = 0;
  for (let i = 0; i < 300; i++) {
    const s = campionaStrategia(rng, { costi: COSTI, rischio: RISCHIO });
    if (problemiStrategia(s).length === 0) {
      valide += 1;
      for (const nome of ["incrocioMedie", "tendenza", "macd"]) {
        if (s.ingresso[nome]) assert.ok(s.ingresso[nome].veloce < s.ingresso[nome].lenta);
      }
    }
  }
  assert.ok(valide > 150, `valide: ${valide} su 300`);
});

/* ------------------------------- identità ------------------------------- */

test("impronta: stessa strategia, stessa impronta, anche con le chiavi in un altro ordine", () => {
  const a = { ingresso: { rsi: { periodi: 14, sotto: 30 } }, uscita: { presaDiProfittoPercento: 8, stopDiPerditaPercento: 4, tempoMassimoCandele: 40 }, costi: COSTI, rischio: RISCHIO };
  const b = { rischio: RISCHIO, costi: COSTI, uscita: { tempoMassimoCandele: 40, stopDiPerditaPercento: 4, presaDiProfittoPercento: 8 }, ingresso: { rsi: { sotto: 30, periodi: 14 } } };
  assert.equal(impronta(a), impronta(b));
});

test("impronta: un parametro diverso cambia l'impronta, e il nome non conta", () => {
  const a = { ingresso: { rsi: { periodi: 14, sotto: 30 } }, uscita: { presaDiProfittoPercento: 8, stopDiPerditaPercento: 4, tempoMassimoCandele: 40 }, costi: COSTI, rischio: RISCHIO };
  const diversa = { ...a, ingresso: { rsi: { periodi: 14, sotto: 31 } } };
  assert.notEqual(impronta(a), impronta(diversa));
  assert.equal(impronta({ ...a, nome: "ricerca-x" }), impronta({ ...a, nome: "ricerca-y" }));
});

/* ---------------------------- nessuna sbirciata ---------------------------- */

test("valutaSuCoppie: le candele dopo la fine della finestra non cambiano il risultato", () => {
  const strategia = {
    ingresso: { rsi: { periodi: 14, sotto: 35 } },
    uscita: { presaDiProfittoPercento: 8, stopDiPerditaPercento: 4, tempoMassimoCandele: 40 },
    costi: COSTI,
    rischio: RISCHIO
  };
  const finestra = { da: PRIMO, a: PRIMO + 250 * GIORNO, intervallo: 1440 };

  const corta = { SOLEUR: serieCasuale(5, 300) };
  // il futuro: stesso passato, ma prezzi impazziti dopo la fine della finestra
  const futuro = serieCasuale(5, 300).map((c, i) => (i < 250 ? c : { ...c, chiusura: c.chiusura * 40, massimo: c.massimo * 40, minimo: c.minimo * 40 }));
  const lunga = { SOLEUR: futuro };

  assert.deepEqual(valutaSuCoppie(strategia, corta, finestra, BASE), valutaSuCoppie(strategia, lunga, finestra, BASE));
});

test("valutaSuCoppie: restituisce per ogni coppia la strategia, il comprato e basta e l'eccesso", () => {
  const strategia = {
    ingresso: { rsi: { periodi: 14, sotto: 35 } },
    uscita: { presaDiProfittoPercento: 8, stopDiPerditaPercento: 4, tempoMassimoCandele: 40 },
    costi: COSTI,
    rischio: RISCHIO
  };
  const serie = { AAA: serieCasuale(1, 300), BBB: serieCasuale(2, 300) };
  const risultati = valutaSuCoppie(strategia, serie, { da: PRIMO, a: PRIMO + 300 * GIORNO, intervallo: 1440 }, BASE);

  assert.equal(risultati.length, 2);
  for (const r of risultati) {
    assert.ok(Number.isFinite(r.strategia) && Number.isFinite(r.comprato));
    assert.ok(Math.abs(r.eccesso - (r.strategia - r.comprato)) < 1e-9);
  }
});

/* ------------------------------- giudizio ------------------------------- */

test("sogliaT: più prove, soglia più alta", () => {
  assert.ok(sogliaT(10) < sogliaT(100));
  assert.ok(sogliaT(100) < sogliaT(1000));
  assert.ok(Math.abs(sogliaT(10) - 3.46) < 0.01);
});

test("statistiche: media, deviazione standard e t su tre valori", () => {
  const s = statistiche([1, 2, 3]);
  assert.equal(s.media, 2);
  assert.ok(Math.abs(s.sd - 1) < 1e-12);
  assert.ok(Math.abs(s.t - 2 / (1 / Math.sqrt(3))) < 1e-12);
});

const vincenti = (eccesso, operazioni = 5) =>
  Array.from({ length: 20 }, (_, i) => ({ coppia: `P${i}`, eccesso: eccesso + (i % 2 ? 0.5 : -0.5), operazioni }));

test("giudica: passa solo con operazioni, maggioranza di coppie e t sopra la soglia", () => {
  const buono = giudica(vincenti(10, 10), { N: 100 });
  assert.equal(buono.passa, true, buono.motivi.join("; "));
});

test("giudica: un risultato piccolo o poco netto non passa, e dice perché", () => {
  const piccolo = giudica(vincenti(0.1, 10), { N: 100 });
  assert.equal(piccolo.passa, false);
  assert.ok(piccolo.motivi.some((m) => /t /.test(m)));

  const pochiTrade = giudica(vincenti(10, 0), { N: 100 });
  assert.equal(pochiTrade.passa, false);
  assert.ok(pochiTrade.motivi.some((m) => /operazioni/.test(m)));
});

test("giudica: più prove significano una soglia più alta, e lo stesso risultato può non passare più", () => {
  const risultati = Array.from({ length: 20 }, (_, i) => ({ coppia: `P${i}`, eccesso: 2 + (i % 2 ? 1 : -1) * 2, operazioni: 10 }));
  const con10 = giudica(risultati, { N: 10 });
  const con100000 = giudica(risultati, { N: 100000 });
  assert.ok(con100000.soglia > con10.soglia);
  assert.equal(con100000.passa, false);
});

/* ------------------------- coppie che si muovono insieme ------------------------- */

const serieDaRendimenti = (rendimenti) => {
  let prezzo = 100;
  return rendimenti.map((r, i) => {
    prezzo = prezzo * (1 + r);
    return { momento: PRIMO + i * GIORNO, chiusura: prezzo };
  });
};

test("correlazioneMedia: coppie identiche valgono 1, coppie indipendenti valgono vicino a zero", () => {
  const rng = generatore(3);
  const casuali = () => Array.from({ length: 200 }, () => (rng() - 0.5) * 0.04);
  const r = casuali();
  const identiche = { A: serieDaRendimenti(r), B: serieDaRendimenti(r) };
  assert.ok(Math.abs(correlazioneMedia(identiche, 0, Infinity) - 1) < 1e-9);

  const indipendenti = { A: serieDaRendimenti(casuali()), B: serieDaRendimenti(casuali()), C: serieDaRendimenti(casuali()) };
  assert.ok(Math.abs(correlazioneMedia(indipendenti, 0, Infinity)) < 0.25);
});

test("coppieEffettive: venti coppie molto correlate valgono poche prove indipendenti", () => {
  assert.equal(coppieEffettive(20, 0), 20);
  assert.equal(coppieEffettive(20, 1), 1);
  assert.ok(Math.abs(coppieEffettive(20, 0.7) - 20 / (1 + 19 * 0.7)) < 1e-12);
});

test("giudica: con le coppie correlate lo stesso risultato non passa più", () => {
  const risultati = Array.from({ length: 20 }, (_, i) => ({ coppia: `P${i}`, eccesso: 1.4 + (i % 2 ? 1 : -1), operazioni: 10 }));
  const senzaCorrelazione = giudica(risultati, { N: 10, correlazione: null });
  const molto = giudica(risultati, { N: 10, correlazione: 0.9 });
  assert.equal(senzaCorrelazione.passa, true, senzaCorrelazione.motivi.join("; "));
  assert.equal(molto.passa, false);
  assert.ok(molto.Meff < 2);
});
