import { test } from "node:test";
import assert from "node:assert/strict";

import {
  drawdownMassimo,
  affidabilitaCampione,
  performanceGiornaliera,
  calcolaMetriche
} from "../lib/metriche.js";

/* --------------------------- drawdown ------------------------------- */

test("drawdownMassimo: la discesa più profonda da un picco al minimo successivo", () => {
  // 100 -> 120 (picco) -> 90 (−25% dal picco) -> 130 -> 117 (−10% dal nuovo picco)
  const istantanee = [100, 120, 90, 130, 117].map((portafoglio, i) => ({ momento: i, portafoglio }));
  const risultato = drawdownMassimo(istantanee);
  assert.ok(Math.abs(risultato - -25) < 1e-9, `atteso −25, ottenuto ${risultato}`);
});

test("drawdownMassimo: una salita continua non ha drawdown", () => {
  const istantanee = [100, 105, 110, 130].map((portafoglio, i) => ({ momento: i, portafoglio }));
  assert.equal(drawdownMassimo(istantanee), 0);
});

test("drawdownMassimo: il picco è quello raggiunto prima, non il valore iniziale", () => {
  // scende, poi risale sopra, poi scende di poco: il drawdown è il primo
  const istantanee = [100, 80, 200, 180].map((portafoglio, i) => ({ momento: i, portafoglio }));
  assert.ok(Math.abs(drawdownMassimo(istantanee) - -20) < 1e-9);
});

test("drawdownMassimo: senza serie non si inventa uno zero", () => {
  assert.equal(drawdownMassimo([]), null);
  assert.equal(drawdownMassimo([{ momento: 0, portafoglio: 100 }]), null);
  assert.equal(drawdownMassimo(undefined), null);
});

test("drawdownMassimo: le istantanee sballate non falsificano il numero", () => {
  // un NaN o uno zero scritti in un momento di stato incoerente darebbero −100%
  const istantanee = [
    { momento: 0, portafoglio: 100 },
    { momento: 1, portafoglio: NaN },
    { momento: 2, portafoglio: 0 },
    { momento: 3, portafoglio: 95 }
  ];
  assert.ok(Math.abs(drawdownMassimo(istantanee) - -5) < 1e-9);
});

/* ------------------------ etichetta campione ------------------------- */

test("affidabilitaCampione: sotto 30 non si conclude niente", () => {
  assert.equal(affidabilitaCampione(0).livello, "insufficiente");
  assert.equal(affidabilitaCampione(18).livello, "insufficiente");
  assert.equal(affidabilitaCampione(29).livello, "insufficiente");
  assert.equal(affidabilitaCampione(30).livello, "indicativo");
  assert.equal(affidabilitaCampione(100).livello, "indicativo");
  assert.equal(affidabilitaCampione(101).livello, "ragionevole");
});

/* ---------------------- performance giornaliera ---------------------- */

test("performanceGiornaliera: un'operazione delle 23:40 di Roma resta nella giornata di oggi", () => {
  const seraTardi = Math.floor(Date.UTC(2026, 7, 27, 21, 40, 0) / 1000); // 23:40 a Roma
  const dopoMezzanotte = Math.floor(Date.UTC(2026, 7, 27, 22, 30, 0) / 1000); // 00:30 del 28 a Roma

  const giornate = performanceGiornaliera(
    [
      { momentoUscita: seraTardi, risultatoEuro: 5 },
      { momentoUscita: dopoMezzanotte, risultatoEuro: 3 }
    ],
    "Europe/Rome"
  );

  assert.deepEqual(giornate, [
    { giorno: "2026-08-27", valore: 5 },
    { giorno: "2026-08-28", valore: 3 }
  ]);
});

test("performanceGiornaliera: più operazioni nello stesso giorno si sommano", () => {
  const momento = Math.floor(Date.UTC(2026, 7, 27, 10, 0, 0) / 1000);
  const giornate = performanceGiornaliera(
    [
      { momentoUscita: momento, risultatoEuro: 5 },
      { momentoUscita: momento + 3600, risultatoEuro: -2 }
    ],
    "Europe/Rome"
  );
  assert.equal(giornate.length, 1);
  assert.ok(Math.abs(giornate[0].valore - 3) < 1e-9);
});

/* --------------------------- il quadro ------------------------------- */

const INIZIO = Math.floor(Date.UTC(2026, 7, 20, 12, 0, 0) / 1000);

function statoDiProva() {
  return {
    configurazione: { capitaleIniziale: 100, obiettivo: 150, mercato: "SOLEUR", fusoOrario: "Europe/Rome" },
    capitale: 110,
    posizione: null,
    operazioni: [
      { numero: 1, risultatoEuro: 6, risultatoPercento: 6, commissioniTotali: 0.5, durataSecondi: 3600, momentoUscita: INIZIO + 86400 },
      { numero: 2, risultatoEuro: -2, risultatoPercento: -2, commissioniTotali: 0.5, durataSecondi: 1800, momentoUscita: INIZIO + 172800 },
      { numero: 3, risultatoEuro: 6, risultatoPercento: 6, commissioniTotali: 0.5, durataSecondi: 1800, momentoUscita: INIZIO + 259200 }
    ],
    segnali: {
      inAttesa: null,
      storico: [
        { stato: "confermato" }, { stato: "confermato" }, { stato: "confermato" },
        { stato: "rifiutato" }, { stato: "scaduto" }, { stato: "scaduto" }
      ]
    },
    benchmark: {
      mercato: { coppia: "SOLEUR", prezzoRiferimento: 100, quantita: 0.9974, momento: INIZIO },
      bitcoin: { coppia: "XXBTZEUR", prezzoRiferimento: 60000, quantita: 0.0016623, momento: INIZIO }
    },
    istantanee: [
      { momento: INIZIO, portafoglio: 100 },
      { momento: INIZIO + 86400, portafoglio: 106 },
      { momento: INIZIO + 172800, portafoglio: 104 },
      { momento: INIZIO + 259200, portafoglio: 110 }
    ]
  };
}

test("calcolaMetriche: i conti tornano su uno storico costruito a mano", () => {
  const stato = statoDiProva();
  const m = calcolaMetriche(stato, {
    prezzoMercato: 102,
    prezzoBenchmark: 61000,
    adessoSecondi: INIZIO + 259200
  });

  assert.equal(m.capitaleAttuale, 110);
  assert.ok(Math.abs(m.variazionePercento - 10) < 1e-9);

  assert.equal(m.operazioni.chiuse, 3);
  assert.equal(m.operazioni.vincenti, 2);
  assert.equal(m.operazioni.perdenti, 1);
  assert.ok(Math.abs(m.operazioni.winRate - 66.6666666) < 1e-4);
  assert.equal(m.operazioni.miglior, 6);
  assert.equal(m.operazioni.peggior, -2);
  assert.ok(Math.abs(m.operazioni.commissioniTotali - 1.5) < 1e-9);

  // benchmark: 0,9974 · 102 = 101,73…  ->  +1,7% circa
  assert.ok(m.benchmark.mercato.variazione > 1 && m.benchmark.mercato.variazione < 2);
  assert.ok(m.benchmark.differenzaDalMercato > 8, "la strategia sta sopra il comprato-e-basta");

  // drawdown: 106 -> 104 = −1,89%
  assert.ok(Math.abs(m.drawdownMassimo - -1.8867924528301887) < 1e-9);

  assert.deepEqual(m.segnali, { confermati: 3, rifiutati: 1, scaduti: 2, inAttesa: 0 });
  assert.equal(m.affidabilita.livello, "insufficiente");
  assert.equal(m.giorniFunzionamento, 3);
});

test("calcolaMetriche: senza operazioni chiuse restituisce null, non zeri", () => {
  const stato = statoDiProva();
  stato.operazioni = [];
  stato.istantanee = [{ momento: INIZIO, portafoglio: 100 }];
  stato.capitale = 100;

  const m = calcolaMetriche(stato, { prezzoMercato: 102, prezzoBenchmark: 61000, adessoSecondi: INIZIO });

  assert.equal(m.operazioni.chiuse, 0);
  assert.equal(m.operazioni.winRate, null, "uno zero qui sarebbe un'informazione falsa");
  assert.equal(m.operazioni.miglior, null);
  assert.equal(m.operazioni.peggior, null);
  assert.equal(m.operazioni.risultatoMedioVincenti, null);
  assert.equal(m.drawdownMassimo, null);
});

test("calcolaMetriche: senza prezzo il benchmark non si inventa un valore", () => {
  const stato = statoDiProva();
  const m = calcolaMetriche(stato, { prezzoMercato: null, prezzoBenchmark: null, adessoSecondi: INIZIO + 259200 });
  assert.equal(m.benchmark.mercato.valore, null);
  assert.equal(m.benchmark.mercato.variazione, null);
  assert.equal(m.benchmark.differenzaDalMercato, null);
});

test("calcolaMetriche: il tempo esposto tiene conto anche della posizione aperta", () => {
  const stato = statoDiProva();
  const senzaPosizione = calcolaMetriche(stato, { prezzoMercato: 102, adessoSecondi: INIZIO + 259200 });

  stato.posizione = { momentoIngresso: INIZIO + 200000, quantita: 1, controvaloreIngresso: 100, commissioneIngresso: 0.26 };
  const conPosizione = calcolaMetriche(stato, { prezzoMercato: 102, adessoSecondi: INIZIO + 259200 });

  assert.ok(conPosizione.tempoEspostoPercento > senzaPosizione.tempoEspostoPercento);
  assert.ok(conPosizione.tempoEspostoPercento <= 100);
});
