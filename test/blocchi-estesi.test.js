import { test } from "node:test";
import assert from "node:assert/strict";

import { valuta, condizioniIngresso } from "../lib/strategia.js";
import { candeleNecessarie } from "../lib/configurazione.js";

/* I blocchi MACD e Bollinger, come entrano nella decisione. Il resto della
   configurazione è quella di prova: uscite e rischio non c'entrano con l'ingresso. */
const BASE = {
  mercato: "PROVA/EUR",
  uscita: { presaDiProfittoPercento: 8, stopDiPerditaPercento: 4, tempoMassimoCandele: 5 },
  rischio: { quotaCapitalePercento: 100, posizioniMassime: 1, perditaMassimaGiornalieraPercento: 6 },
  costi: { commissionePercentoPerLato: 0.26, slippagePercento: 0.05 }
};

const conIngresso = (ingresso) => ({ ...BASE, ingresso });

const PRIMO_MOMENTO = Math.floor(Date.UTC(2026, 7, 20, 0, 0, 0) / 1000);
const DURATA = 60 * 60;

/** Una candela piatta al prezzo indicato, con volume costante. */
function candela(indice, prezzo) {
  return {
    momento: PRIMO_MOMENTO + indice * DURATA,
    apertura: prezzo,
    massimo: prezzo,
    minimo: prezzo,
    chiusura: prezzo,
    volume: 100
  };
}

const serie = (prezzi) => prezzi.map((p, i) => candela(i, p));

/* ------------------------------ Bollinger ------------------------------ */

const BOLLINGER_SOTTO = conIngresso({ bollinger: { periodi: 20, deviazioni: 2, lato: "sotto" } });
const BOLLINGER_SOPRA = conIngresso({ bollinger: { periodi: 20, deviazioni: 2, lato: "sopra" } });

test("Bollinger sotto: scatta quando la chiusura scende sotto la banda inferiore", () => {
  const candele = serie([...Array(19).fill(100), 90]);

  const co = condizioniIngresso(candele, BOLLINGER_SOTTO);
  assert.equal(co.bollinger.soddisfatta, true);

  const segnale = valuta(candele, null, BOLLINGER_SOTTO);
  assert.equal(segnale.azione, "compra");
  assert.match(segnale.motivo, /sotto la banda inferiore di Bollinger/);
  assert.ok(segnale.condizioni.bandaInferiore > 90, "la banda inferiore è sopra la chiusura che l'ha rotta");
});

test("Bollinger sotto: su prezzi piatti la chiusura sta sulla banda e non scatta", () => {
  const candele = serie(Array(20).fill(100));
  assert.equal(condizioniIngresso(candele, BOLLINGER_SOTTO).bollinger.soddisfatta, false);
  assert.equal(valuta(candele, null, BOLLINGER_SOTTO), null);
});

test("Bollinger sopra: scatta quando la chiusura sale sopra la banda superiore", () => {
  const candele = serie([...Array(19).fill(100), 110]);
  const segnale = valuta(candele, null, BOLLINGER_SOPRA);
  assert.equal(segnale.azione, "compra");
  assert.match(segnale.motivo, /sopra la banda superiore di Bollinger/);
});

/* -------------------------------- MACD -------------------------------- */

const MACD = conIngresso({ macd: { veloce: 12, lenta: 26, segnale: 9 } });

test("MACD: scatta sul rialzo netto, non sul ribasso", () => {
  const rialzo = serie([...Array(35).fill(100), 102, 104, 106, 108, 110]);
  const segnale = valuta(rialzo, null, MACD);
  assert.equal(segnale.azione, "compra");
  assert.match(segnale.motivo, /MACD a .* sopra la linea di segnale/);

  const ribasso = serie([...Array(35).fill(100), 98, 96, 94, 92, 90]);
  assert.equal(valuta(ribasso, null, MACD), null);
});

test("MACD con candele insufficienti non decide niente", () => {
  const candele = serie(Array(30).fill(100)); // servono 34
  assert.equal(condizioniIngresso(candele, MACD).macd.soddisfatta, null);
  assert.equal(valuta(candele, null, MACD), null);
});

/* ------------------------ candele necessarie ------------------------ */

test("candeleNecessarie: il MACD e Bollinger contano le candele che usano davvero", () => {
  assert.equal(candeleNecessarie(MACD), 34);
  assert.equal(candeleNecessarie(BOLLINGER_SOTTO), 20);
});

/* ------------------------------ validazione ------------------------------ */

test("la validazione rifiuta un lato di Bollinger sbagliato e un MACD con veloce più lunga della lenta", async () => {
  const { leggiStrategia, ConfigurazioneNonValida } = await import("../lib/configurazione.js");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blocchi-estesi-"));
  try {
    const base = {
      ingresso: { bollinger: { periodi: 20, deviazioni: 2, lato: "giu" }, macd: { veloce: 26, lenta: 12, segnale: 9 } },
      uscita: { presaDiProfittoPercento: 8, stopDiPerditaPercento: 4, tempoMassimoCandele: 48 },
      rischio: { quotaCapitalePercento: 100, posizioniMassime: 1, perditaMassimaGiornalieraPercento: 6 },
      costi: { commissionePercentoPerLato: 0.4, slippagePercento: 0.05 }
    };
    const file = path.join(dir, "strategia.json");
    fs.writeFileSync(file, JSON.stringify(base));

    assert.throws(
      () => leggiStrategia(file),
      (errore) => {
        assert.ok(errore instanceof ConfigurazioneNonValida);
        assert.match(errore.message, /ingresso\.bollinger\.lato/);
        assert.match(errore.message, /ingresso\.macd/);
        return true;
      }
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
