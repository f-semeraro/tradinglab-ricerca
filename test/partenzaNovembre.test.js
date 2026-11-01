import { test } from "node:test";
import assert from "node:assert/strict";

import { decisioniSettimanali, nuovoStatoProva, passoPerCoppia } from "../lib/prova.js";
import { richiesteDaFare, richiestaGiornalieraDaFare } from "../lib/politicaRichieste.js";
import { serieGiornaliera, esposizione } from "../lib/giornaliera.js";

const GIORNO = 86400000;
const SETTIMANA = 7 * GIORNO;
const ORA = 3600000;
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const ms = (data) => Date.parse(`${data}T00:00:00Z`);
const LAB = { fusoOrario: "Europe/Rome", capitaleIniziale: 100 };
const COPPIA = "XBTEUR";
const STRATEGIA = {
  nome: "b-portafoglio",
  tipo: "settimanale",
  portafoglio: true,
  variante: "B",
  settimaneDentro: 1,
  percentile: 0.8,
  metodoPercentile: "R7",
  lato: "lungo",
  partenza: "2026-11-02",
  coppie: [COPPIA],
  costi: { commissionePercentoPerLato: 0.1, slippagePercento: 0.05 },
  rischio: { quotaCapitalePercento: 100, posizioniMassime: 1, perditaMassimaGiornalieraPercento: 6 }
};

/** Sessanta domeniche piatte a 100, l'ultima a `ultima`: così l'ultima domenica dà il segnale. */
function storiaFinoA(ultimaDomenica, ultima) {
  const fine = ms(ultimaDomenica);
  const date = [];
  for (let t = fine - 59 * SETTIMANA; t <= fine; t += SETTIMANA) date.push(iso(t));
  return date.map((data, k) => ({ data, chiusura: k === date.length - 1 ? ultima : 100 }));
}

/** La candela oraria che apre al momento indicato, con la sua chiusura. */
const candela = (data, chiusura) => ({ momento: ms(data) / 1000, chiusura });

test("un giro di domenica sera, prima di lunedì, non decide nulla: né posizioni, né benchmark, né istantanee", () => {
  const storia = storiaFinoA("2026-10-25", 120);
  assert.equal(decisioniSettimanali(storia).apre, true, "il segnale c'è: senza la partenza entrerebbe il 26 ottobre");
  const stato = nuovoStatoProva({ lab: LAB, coppia: COPPIA });
  const eseguiti = passoPerCoppia({ stato, strategia: STRATEGIA, storia, orarie: [candela("2026-10-26", 121)], coppia: COPPIA });
  assert.deepEqual(eseguiti, []);
  assert.equal(stato.posizione, null);
  assert.ok(!stato.benchmark?.mercato, "il benchmark non si registra prima della partenza");
  assert.equal(stato.istantanee.length, 0);
});

test("il primo giro dopo le 00:00 di lunedì 2 novembre decide sulla domenica 1 novembre e apre al prezzo della candela delle 00:00", () => {
  const storia = storiaFinoA("2026-11-01", 120);
  assert.equal(decisioniSettimanali(storia).apre, true);
  const stato = nuovoStatoProva({ lab: LAB, coppia: COPPIA });
  // il giro delle 00:07: la candela oraria delle 00:00 non è ancora stata richiesta
  const primo = passoPerCoppia({ stato, strategia: STRATEGIA, storia, orarie: [], coppia: COPPIA });
  assert.deepEqual(primo, []);
  assert.ok(stato.prova.inSospeso, "l'apertura resta in sospeso");
  // il giro delle 05:00 trova la candela: il prezzo è quello della candela, non quello del momento del giro
  const dopo = passoPerCoppia({ stato, strategia: STRATEGIA, storia, orarie: [candela("2026-11-02", 130)], coppia: COPPIA });
  assert.equal(dopo.length, 1);
  assert.equal(dopo[0].tipo, "apertura");
  assert.equal(dopo[0].prezzo, 130);
  assert.notEqual(stato.posizione, null);
});

test("domenica sera e poi lunedì: la prima decisione valida è quella del 1 novembre, e l'istantanea parte dal 2 novembre", () => {
  const stato = nuovoStatoProva({ lab: LAB, coppia: COPPIA });
  passoPerCoppia({ stato, strategia: STRATEGIA, storia: storiaFinoA("2026-10-25", 120), orarie: [candela("2026-10-26", 121)], coppia: COPPIA });
  const eseguiti = passoPerCoppia({ stato, strategia: STRATEGIA, storia: storiaFinoA("2026-11-01", 120), orarie: [candela("2026-11-02", 130)], coppia: COPPIA });
  assert.equal(eseguiti[0]?.prezzo, 130);
  assert.equal(stato.istantanee[0].momento, ms("2026-11-02") / 1000);
});

test("variante giornaliera: nessuna posizione prima del 1 novembre; il primo giorno dentro è il 2 novembre", () => {
  // prezzi a 100 fino al 26 ottobre, poi a 110: il segnale cadrebbe già il 27 ottobre
  const giorni = Array.from({ length: 100 }, (_, k) => iso(ms("2026-08-01") + k * GIORNO));
  const candele = giorni.map((data) => ({ date: data, close: data < "2026-10-27" ? 100 : 110 }));
  const serie = serieGiornaliera(candele, "2026-11-08", "2026-08-01");
  const i = (data) => serie.date.indexOf(data);
  assert.equal(esposizione(serie, serie.close.length)[i("2026-10-28")], 1, "senza il vincolo sarebbe entrato il 27 ottobre");
  const expo = esposizione(serie, serie.close.length, i("2026-11-01"));
  assert.ok(expo.slice(i("2026-10-27"), i("2026-11-01") + 1).every((x) => x === 0), "nessuna posizione dal 27 ottobre al 1 novembre");
  assert.equal(expo[i("2026-11-02")], 1, "entrata sul segnale del 1 novembre");
});

test("richieste di liu-b: la domenica sera non consuma quelle di lunedì", () => {
  const domenicaSera = ms("2026-11-01") + 23 * ORA + 7 * 60000;
  const sera = richiesteDaFare({ adessoMs: domenicaSera, ultimaGiornaliera: "2026-10-25", ultimaOraria: "2026-10-25" });
  assert.equal(sera.domenica, "2026-10-25");
  assert.equal(sera.giornaliera, false);
  assert.equal(sera.oraria, false);
  const lunedi = richiesteDaFare({ adessoMs: ms("2026-11-02") + 7 * 60000, ultimaGiornaliera: "2026-10-25", ultimaOraria: "2026-10-25" });
  assert.equal(lunedi.domenica, "2026-11-01");
  assert.equal(lunedi.giornaliera, true, "la richiesta giornaliera del 1 novembre è ancora da fare");
  assert.equal(lunedi.oraria, false, "l'oraria del lunedì aspetta l'1:00");
  const lunedi1 = richiesteDaFare({ adessoMs: ms("2026-11-02") + ORA + 7 * 60000, ultimaGiornaliera: "2026-11-01", ultimaOraria: "2026-10-25" });
  assert.equal(lunedi1.oraria, true, "l'oraria delle 00:00–01:00 si richiede dopo l'1:00");
});

test("richieste della variante giornaliera: la domenica sera, con il tentativo già registrato, non ne fa un'altra; il lunedì dopo mezzanotte sì", () => {
  assert.equal(richiestaGiornalieraDaFare({ adessoMs: ms("2026-11-01") + 23 * ORA, ultimoTentativo: "2026-11-01" }).fare, false);
  assert.equal(richiestaGiornalieraDaFare({ adessoMs: ms("2026-11-02") + 7 * 60000, ultimoTentativo: "2026-11-01" }).fare, true);
});
