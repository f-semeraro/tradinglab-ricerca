import { test } from "node:test";
import assert from "node:assert/strict";

import {
  apriPosizione,
  chiudiPosizione,
  valorePortafoglio,
  risultatoNonRealizzato,
  prezzoConSlippage,
  EsecuzioneImpossibile
} from "../lib/portafoglio.js";

const STRATEGIA = {
  rischio: { quotaCapitalePercento: 100, posizioniMassime: 1 },
  costi: { commissionePercentoPerLato: 0.26, slippagePercento: 0.05 }
};

const statoNuovo = () => ({
  configurazione: { capitaleIniziale: 100, mercato: "SOLEUR" },
  capitale: 100,
  posizione: null,
  operazioni: []
});

const SEGNALE_INGRESSO = { mercato: "SOLEUR", motivo: "RSI a 29,4 sotto la soglia di 32", condizioni: { rsi: 29.4 }, id: "s1" };
const SEGNALE_USCITA = { mercato: "SOLEUR", motivo: "presa di profitto", condizioni: { scattata: "presaDiProfitto" } };

/* ---------------------- la verifica che conta ----------------------- */

test("apri e chiudi allo STESSO prezzo: il risultato è negativo, ed è tutto costi", () => {
  const stato = statoNuovo();

  apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });
  const operazione = chiudiPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_USCITA, momento: 4600 });

  assert.ok(operazione.risultatoEuro < 0, "senza costi dentro, questo test passerebbe con zero: e da lì in poi tutti i numeri sarebbero ottimisti");

  // due commissioni (0,26% ciascuna) più due slippage (0,05% ciascuno) ≈ 0,62%
  assert.ok(
    Math.abs(operazione.risultatoPercento + 0.618) < 0.01,
    `atteso circa −0,62%, ottenuto ${operazione.risultatoPercento}`
  );

  // e le commissioni registrate sono davvero due
  assert.ok(operazione.commissioniTotali > 0);
  assert.ok(Math.abs(operazione.commissioniTotali - (operazione.commissioneIngresso + operazione.commissioneUscita)) < 1e-12);
});

test("lo slippage peggiora il prezzo in tutte e due le direzioni", () => {
  assert.ok(prezzoConSlippage(100, 0.05, "compra") > 100, "in acquisto si paga di più");
  assert.ok(prezzoConSlippage(100, 0.05, "vendi") < 100, "in vendita si incassa di meno");
});

/* ---------------------------- apertura ------------------------------ */

test("apertura: con quota 100% il capitale finisce a zero, mai sotto", () => {
  const stato = statoNuovo();
  const posizione = apriPosizione(stato, { prezzoMercato: 93.18, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });

  assert.ok(posizione.quantita > 0, "la quantità non è mai negativa");
  assert.ok(stato.capitale >= 0, "il capitale non va mai sotto zero");
  assert.ok(stato.capitale < 1e-9, "con quota 100% il capitale è tutto impegnato");

  // controvalore + commissione = quello che è uscito dal capitale
  const uscito = posizione.controvaloreIngresso + posizione.commissioneIngresso;
  assert.ok(Math.abs(uscito - 100) < 1e-9);
});

test("apertura: con quota parziale resta capitale libero", () => {
  const stato = statoNuovo();
  const strategiaMeta = { ...STRATEGIA, rischio: { ...STRATEGIA.rischio, quotaCapitalePercento: 50 } };
  apriPosizione(stato, { prezzoMercato: 100, strategia: strategiaMeta, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });
  assert.ok(Math.abs(stato.capitale - 50) < 1e-9);
});

test("apertura: non si apre una seconda posizione sopra la prima", () => {
  const stato = statoNuovo();
  apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });
  assert.throws(
    () => apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 2000, candela: 1800 }),
    EsecuzioneImpossibile
  );
});

test("apertura: un prezzo impossibile non esegue, e lo dice", () => {
  const stato = statoNuovo();
  assert.throws(
    () => apriPosizione(stato, { prezzoMercato: 0, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 }),
    /Prezzo di mercato non utilizzabile/
  );
  assert.equal(stato.posizione, null, "e non lascia il portafoglio a metà strada");
  assert.equal(stato.capitale, 100);
});

test("apertura: senza capitale non si esegue", () => {
  const stato = statoNuovo();
  stato.capitale = 0;
  assert.throws(
    () => apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 }),
    /Capitale non sufficiente/
  );
});

/* ---------------------------- chiusura ------------------------------ */

test("chiusura: un guadagno vero resta un guadagno anche con i costi dentro", () => {
  const stato = statoNuovo();
  apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });
  const operazione = chiudiPosizione(stato, { prezzoMercato: 108, strategia: STRATEGIA, segnale: SEGNALE_USCITA, momento: 4600 });

  assert.ok(operazione.risultatoEuro > 0);
  // +8% lordo meno lo 0,62% di costi
  assert.ok(Math.abs(operazione.risultatoPercento - 7.34) < 0.05, `ottenuto ${operazione.risultatoPercento}`);
  assert.ok(Math.abs(stato.capitale - (100 + operazione.risultatoEuro)) < 1e-9);
});

test("chiusura: l'operazione finisce nello storico, numerata e leggibile", () => {
  const stato = statoNuovo();
  apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });
  chiudiPosizione(stato, { prezzoMercato: 104, strategia: STRATEGIA, segnale: SEGNALE_USCITA, momento: 4600 });

  assert.equal(stato.operazioni.length, 1);
  assert.equal(stato.posizione, null);

  const operazione = stato.operazioni[0];
  assert.equal(operazione.numero, 1);
  assert.equal(operazione.durataSecondi, 3600);
  assert.equal(operazione.motivoIngresso, "RSI a 29,4 sotto la soglia di 32");
  assert.equal(operazione.motivoUscita, "presa di profitto");
  assert.equal(operazione.uscitaScattata, "presaDiProfitto");
});

test("chiusura: la numerazione prosegue con le operazioni successive", () => {
  const stato = statoNuovo();
  for (let i = 0; i < 3; i++) {
    apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000 * (i + 1), candela: 900 });
    chiudiPosizione(stato, { prezzoMercato: 101, strategia: STRATEGIA, segnale: SEGNALE_USCITA, momento: 2000 * (i + 1) });
  }
  assert.deepEqual(stato.operazioni.map((o) => o.numero), [1, 2, 3]);
});

test("chiusura: senza una posizione aperta non si chiude niente", () => {
  const stato = statoNuovo();
  assert.throws(
    () => chiudiPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_USCITA, momento: 4600 }),
    /nessuna posizione da chiudere/
  );
});

/* ------------------------- valore corrente --------------------------- */

test("valorePortafoglio: capitale libero più il controvalore di quello che hai in mano", () => {
  const stato = statoNuovo();
  assert.equal(valorePortafoglio(stato, 100), 100);

  apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });
  const valore = valorePortafoglio(stato, 110);
  assert.ok(valore > 100, "se il prezzo sale, il portafoglio vale di più");
  assert.ok(valore < 110, "ma non più di quanto avresti senza costi di ingresso");
});

test("risultatoNonRealizzato: dice quanto stai messo bene sulla posizione aperta", () => {
  const stato = statoNuovo();
  apriPosizione(stato, { prezzoMercato: 100, strategia: STRATEGIA, segnale: SEGNALE_INGRESSO, momento: 1000, candela: 900 });

  const fermo = risultatoNonRealizzato(stato.posizione, 100);
  assert.ok(fermo.euro < 0, "appena aperta sei già sotto, per i costi di ingresso");

  const salito = risultatoNonRealizzato(stato.posizione, 110);
  assert.ok(salito.euro > 0);
  assert.equal(risultatoNonRealizzato(null, 100), null);
});
