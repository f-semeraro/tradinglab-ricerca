import { test } from "node:test";
import assert from "node:assert/strict";

import {
  offsetMinuti,
  istanteUTC,
  giorniISO,
  giornoPrecedente,
  rendimentiGiorno,
  segnoVariante,
  eleggibile
} from "../lib/sessioni.js";
import { giudicaGiorni } from "../lib/giudice.js";
import { generatore } from "../lib/ricerca.js";

const NY = "America/New_York";
const utc = (anno, mese, giorno, ore, minuti) => Date.UTC(anno, mese - 1, giorno, ore, minuti) / 1000;

test("offsetMinuti: New York è a −4 ore con l'ora legale, a −5 senza", () => {
  assert.equal(offsetMinuti(utc(2021, 7, 1, 12, 0), NY), -240);
  assert.equal(offsetMinuti(utc(2021, 1, 15, 12, 0), NY), -300);
});

test("istanteUTC: le 9:45 di New York cambiano con l'ora legale", () => {
  assert.equal(istanteUTC("2021-03-15", 9, 45, NY), utc(2021, 3, 15, 13, 45), "con ora legale: 13:45 UTC");
  assert.equal(istanteUTC("2021-03-12", 9, 45, NY), utc(2021, 3, 12, 14, 45), "senza ora legale: 14:45 UTC");
  assert.equal(istanteUTC("2021-11-05", 9, 45, NY), utc(2021, 11, 5, 13, 45), "ancora con ora legale, dopo il 14 marzo");
  assert.equal(istanteUTC("2021-11-09", 9, 45, NY), utc(2021, 11, 9, 14, 45), "ora solare, dopo il 7 novembre");
});

test("giorniISO: estremi inclusi, in ordine; giornoPrecedente attraversa l'anno", () => {
  assert.deepEqual(giorniISO("2021-01-01", "2021-01-03"), ["2021-01-01", "2021-01-02", "2021-01-03"]);
  assert.equal(giornoPrecedente("2021-01-01"), "2020-12-31");
  assert.equal(giornoPrecedente("2021-03-01"), "2021-02-28");
});

/** Una mappa di chiusure con i prezzi che servono per un giorno, alle ore dello studio. */
function mappaDiUnGiorno(dataISO, { p1700Ieri, p945, p1600, p1630, p1700 }) {
  const mappa = new Map();
  const precedente = giornoPrecedente(dataISO);
  // il prezzo alle ore X è la chiusura della candela che termina a X: la candela inizia X − 900 s
  mappa.set(istanteUTC(precedente, 17, 0, NY) - 900, p1700Ieri);
  mappa.set(istanteUTC(dataISO, 9, 45, NY) - 900, p945);
  mappa.set(istanteUTC(dataISO, 16, 0, NY) - 900, p1600);
  mappa.set(istanteUTC(dataISO, 16, 30, NY) - 900, p1630);
  mappa.set(istanteUTC(dataISO, 17, 0, NY) - 900, p1700);
  return mappa;
}

test("rendimentiGiorno: i tre rendimenti dello studio sui prezzi alle ore giuste", () => {
  const mappa = mappaDiUnGiorno("2021-03-15", { p1700Ieri: 100, p945: 101, p1600: 200, p1630: 202, p1700: 204 });
  const g = rendimentiGiorno(mappa, "2021-03-15", NY);
  assert.ok(Math.abs(g.rONFH - 0.01) < 1e-12);
  assert.ok(Math.abs(g.rSLH - 0.01) < 1e-12);
  assert.ok(Math.abs(g.rLH - (204 / 202 - 1)) < 1e-12);
});

test("rendimentiGiorno: un prezzo mancante dà null, mai un numero inventato", () => {
  const mappa = mappaDiUnGiorno("2021-03-15", { p1700Ieri: 100, p945: 101, p1600: 200, p1630: 202, p1700: 204 });
  mappa.delete(istanteUTC("2021-03-15", 16, 30, NY) - 900);
  const g = rendimentiGiorno(mappa, "2021-03-15", NY);
  assert.equal(g.rSLH, null);
  assert.equal(g.rLH, null);
  assert.ok(g.rONFH !== null);
});

test("segnoVariante: le tre regole dello studio, con i segni che contano", () => {
  assert.equal(segnoVariante("inizio", { rONFH: 0.01 }), 1);
  assert.equal(segnoVariante("inizio", { rONFH: -0.01 }), -1);
  assert.equal(segnoVariante("penultima", { rSLH: -0.01 }), 1);
  assert.equal(segnoVariante("penultima", { rSLH: 0.01 }), -1);
  assert.equal(segnoVariante("combinata", { rONFH: 0.01, rSLH: -0.01 }), 1);
  assert.equal(segnoVariante("combinata", { rONFH: -0.01, rSLH: 0.01 }), -1);
  assert.equal(segnoVariante("combinata", { rONFH: 0.01, rSLH: 0.01 }), 0, "concordi: fuori");
  assert.equal(segnoVariante("combinata", { rONFH: -0.01, rSLH: -0.01 }), 0, "concordi: fuori");
});

test("eleggibile: un giorno conta per una variante solo se servono tutti i suoi ingressi", () => {
  const completo = { rONFH: 0.01, rSLH: -0.01, rLH: 0.02 };
  assert.equal(eleggibile("combinata", completo), true);
  assert.equal(eleggibile("combinata", { ...completo, rSLH: null }), false);
  assert.equal(eleggibile("inizio", { ...completo, rSLH: null }), true);
  assert.equal(eleggibile("inizio", { ...completo, rLH: null }), false);
});

test("giudicaGiorni: scegliere i giorni giusti passa, scegliere quelli sbagliati no", () => {
  // 200 giorni: 100 con +2% e 100 con −1%. Operare sui +2% dovrebbe battere il caso.
  const eleggibili = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 0.02 : -0.01));
  const sceltiGiusti = Array.from({ length: 100 }, (_, k) => ({ indice: 2 * k, segno: 1 }));
  const sceltiSbagliati = Array.from({ length: 100 }, (_, k) => ({ indice: 2 * k + 1, segno: 1 }));
  const base = { eleggibili, costoPerOperazione: 0.003, permutazioni: 2000, N: 3, alfa: 0.05 };

  const bravo = giudicaGiorni({ ...base, osservate: sceltiGiusti, rng: generatore(1) });
  assert.equal(bravo.passa, true, bravo.motivi.join("; "));
  assert.ok(bravo.statisticaNetta > 0);

  const sbagliato = giudicaGiorni({ ...base, osservate: sceltiSbagliati, rng: generatore(1) });
  assert.equal(sbagliato.passa, false);
  assert.ok(sbagliato.statisticaNetta < 0);
});
