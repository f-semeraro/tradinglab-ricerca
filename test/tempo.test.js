import {
  test } from "node:test";
import assert from "node:assert/strict";

import {
  idCandela,
  candelaInCorso,
  ultimaCandelaChiusa,
  soloCandeleChiuse,
  giornoLocale,
  giornoUTCInSecondi,
  durataLeggibile,
  formattaOra,
  formattaMomento,
  etichettaGiorno
} from "../lib/tempo.js";

/* Riferimento: 2026-08-27T14:37:23Z = 1787841443 secondi UTC.
   Con candele da 15 minuti, la candela che lo contiene apre alle 14:30:00Z. */
const MOMENTO_META_CANDELA = Math.floor(Date.UTC(2026, 7, 27, 14, 37, 23) / 1000);
const APERTURA_ATTESA = Math.floor(Date.UTC(2026, 7, 27, 14, 30, 0) / 1000);

test("idCandela: un momento a metà candela cade sull'apertura di quella candela", () => {
  assert.equal(idCandela(MOMENTO_META_CANDELA, 15), APERTURA_ATTESA);
});

test("idCandela: un momento esattamente sul confine apre la candela nuova", () => {
  const confine = Math.floor(Date.UTC(2026, 7, 27, 14, 45, 0) / 1000);
  assert.equal(idCandela(confine, 15), confine);
});

test("idCandela: un secondo prima del confine sta ancora nella candela precedente", () => {
  const unSecondoPrima = Math.floor(Date.UTC(2026, 7, 27, 14, 44, 59) / 1000);
  assert.equal(idCandela(unSecondoPrima, 15), APERTURA_ATTESA);
});

test("idCandela: funziona anche con intervalli diversi", () => {
  assert.equal(idCandela(MOMENTO_META_CANDELA, 60), Math.floor(Date.UTC(2026, 7, 27, 14, 0, 0) / 1000));
  assert.equal(idCandela(MOMENTO_META_CANDELA, 5), Math.floor(Date.UTC(2026, 7, 27, 14, 35, 0) / 1000));
});

test("idCandela: rifiuta un intervallo che non ha senso", () => {
  assert.throws(() => idCandela(MOMENTO_META_CANDELA, 0), TypeError);
  assert.throws(() => idCandela(MOMENTO_META_CANDELA, -15), TypeError);
  assert.throws(() => idCandela(undefined, 15), TypeError);
});

test("ultimaCandelaChiusa: è la candela prima di quella in corso", () => {
  const adessoMs = MOMENTO_META_CANDELA * 1000;
  assert.equal(candelaInCorso(15, adessoMs), APERTURA_ATTESA);
  assert.equal(ultimaCandelaChiusa(15, adessoMs), APERTURA_ATTESA - 15 * 60);
});

test("soloCandeleChiuse: scarta l'ultima se è ancora in corso", () => {
  const adessoMs = MOMENTO_META_CANDELA * 1000;
  const candele = [
    { momento: APERTURA_ATTESA - 30 * 60, chiusura: 1 },
    { momento: APERTURA_ATTESA - 15 * 60, chiusura: 2 },
    { momento: APERTURA_ATTESA, chiusura: 3 } // questa è ancora aperta
  ];
  const chiuse = soloCandeleChiuse(candele, 15, adessoMs);
  assert.equal(chiuse.length, 2);
  assert.equal(chiuse[chiuse.length - 1].momento, APERTURA_ATTESA - 15 * 60);
});

test("soloCandeleChiuse: se l'ultima è già chiusa non tocca niente", () => {
  const adessoMs = MOMENTO_META_CANDELA * 1000;
  const candele = [
    { momento: APERTURA_ATTESA - 30 * 60, chiusura: 1 },
    { momento: APERTURA_ATTESA - 15 * 60, chiusura: 2 }
  ];
  assert.equal(soloCandeleChiuse(candele, 15, adessoMs).length, 2);
});

test("soloCandeleChiuse: un elenco vuoto resta vuoto, senza esplodere", () => {
  assert.deepEqual(soloCandeleChiuse([], 15), []);
  assert.deepEqual(soloCandeleChiuse(undefined, 15), []);
});

test("soloCandeleChiuse: non modifica l'elenco che riceve", () => {
  const adessoMs = MOMENTO_META_CANDELA * 1000;
  const candele = [{ momento: APERTURA_ATTESA - 15 * 60 }, { momento: APERTURA_ATTESA }];
  soloCandeleChiuse(candele, 15, adessoMs);
  assert.equal(candele.length, 2);
});

test("giornoLocale: le 23:40 di Roma restano di oggi, non di domani", () => {
  // 2026-08-27T21:40:00Z sono le 23:40 di Roma (ora legale, UTC+2)
  const seraTardi = Math.floor(Date.UTC(2026, 7, 27, 21, 40, 0) / 1000);
  assert.equal(giornoLocale(seraTardi, "Europe/Rome"), "2026-08-27");
  // la stessa istantanea, letta in UTC, sarebbe ancora il 27: prendiamone una
  // che in UTC è già il 28 ma a Roma no
  const dopoMezzanotteUtc = Math.floor(Date.UTC(2026, 7, 27, 22, 30, 0) / 1000);
  assert.equal(giornoLocale(dopoMezzanotteUtc, "Europe/Rome"), "2026-08-28");
  assert.equal(giornoLocale(dopoMezzanotteUtc, "UTC"), "2026-08-27");
});

test("durataLeggibile: minuti sotto l'ora, ore e minuti sopra", () => {
  assert.equal(durataLeggibile(0, 11 * 60), "11 m");
  assert.equal(durataLeggibile(0, 3 * 3600 + 15 * 60), "3 h 15 m");
  assert.equal(durataLeggibile(100, 100), "0 m");
});

/* ------------------------- giorni in UTC ---------------------------- */

test("giornoUTCInSecondi: una data buona diventa la sua mezzanotte UTC", () => {
  assert.equal(giornoUTCInSecondi("2026-03-01"), Date.UTC(2026, 2, 1) / 1000);
});

test("giornoUTCInSecondi: una data inventata non scivola nel mese dopo", () => {
  // Date.UTC da solo trasformerebbe il 30 febbraio nel 2 marzo, in silenzio:
  // una finestra di backtest spostata così è un errore che non si trova più
  assert.equal(giornoUTCInSecondi("2026-02-30"), null);
  assert.equal(giornoUTCInSecondi("2026-13-01"), null);
  assert.equal(giornoUTCInSecondi("2026-00-10"), null);
});

test("giornoUTCInSecondi: il formato è AAAA-MM-GG e basta", () => {
  assert.equal(giornoUTCInSecondi("01/03/2026"), null);
  assert.equal(giornoUTCInSecondi("2026-3-1"), null);
  assert.equal(giornoUTCInSecondi(""), null);
  assert.equal(giornoUTCInSecondi(null), null);
});

/* ------------------------- il tempo si passa da fuori ------------------------- */

test("senza orologio esplicito la candela in corso non si decide: si lancia un errore", () => {
  assert.throws(() => candelaInCorso(15), /adessoMs va passato esplicitamente/);
  assert.throws(() => ultimaCandelaChiusa(15), /adessoMs va passato esplicitamente/);
  assert.throws(() => soloCandeleChiuse([{ momento: 0 }], 15), /adessoMs va passato esplicitamente/);
});

test("senza fuso esplicito le date non si formattano: niente default dall'ambiente", () => {
  assert.throws(() => formattaOra(1787841443), /fuso va passato esplicitamente/);
  assert.throws(() => formattaMomento(1787841443), /fuso va passato esplicitamente/);
  assert.throws(() => giornoLocale(1787841443), /fuso va passato esplicitamente/);
  assert.throws(() => etichettaGiorno(1787841443), /fuso va passato esplicitamente/);
});

test("con orologio e fuso espliciti il risultato non dipende da quando si esegue", () => {
  const ieri = Date.UTC(2026, 7, 27, 12, 0, 0);
  const oggi = Date.UTC(2030, 0, 1, 12, 0, 0);
  // stessa domanda, due «adesso» diversi: la risposta la decide chi chiama, non l'orologio
  assert.equal(candelaInCorso(15, ieri), candelaInCorso(15, ieri));
  assert.notEqual(candelaInCorso(15, ieri), candelaInCorso(15, oggi));
});
