import { test } from "node:test";
import assert from "node:assert/strict";

import {
  domeniche,
  rendimentiSettimanali,
  percentileR7,
  segnali,
  settimaneDentro,
  permanenze,
  curvaCapitale,
  drawdownMassimo
} from "../lib/settimane.js";

const GIORNO = 86400;
const LUNEDI_4_GENNAIO_2021 = Date.UTC(2021, 0, 4) / 1000;

test("domeniche: le chiusure di domenica, con null dove manca una domenica in mezzo", () => {
  // domeniche 3 e 17 gennaio 2021 presenti, domenica 10 mancante
  const candele = [
    { momento: Date.UTC(2021, 0, 3) / 1000, chiusura: 100 },
    { momento: Date.UTC(2021, 0, 17) / 1000, chiusura: 113 }
  ];
  const d = domeniche(candele);
  assert.deepEqual(d.date, ["2021-01-03", "2021-01-10", "2021-01-17"]);
  assert.deepEqual(d.close, [100, null, 113]);
});

test("rendimentiSettimanali: chiusura su chiusura meno 1, null dove manca un prezzo", () => {
  const r = rendimentiSettimanali([100, 110, null, 99]);
  assert.equal(r[0], null);
  assert.ok(Math.abs(r[1] - 0.1) < 1e-12);
  assert.equal(r[2], null);
  assert.equal(r[3], null);
});

test("percentileR7: interpolazione lineare sui valori ordinati", () => {
  assert.ok(Math.abs(percentileR7([1, 2, 3, 4, 5], 0.8) - 4.2) < 1e-12);
  assert.equal(percentileR7([], 0.8), null);
});

test("segnali: A guarda il segno; B e C guardano l'80° percentile del passato, mai del futuro", () => {
  const r = [null, 0.1, -0.05];
  assert.deepEqual(segnali("A", r), [null, true, false]);

  const rend = [0.01, 0.02, 0.03, 0.04, 0.05, 0.2, 0.001];
  const sig = segnali("B", rend);
  assert.equal(sig[0], null, "nessun passato");
  assert.equal(sig[5], true, "0,2 supera il 80° percentile dei precedenti");
  assert.equal(sig[6], false, "0,001 non supera il percentile che include 0,2");
});

test("segnali: nessuno sguardo al futuro, i segnali precedenti non cambiano", () => {
  const base = [0.01, -0.02, 0.03, 0.04, 0.05, 0.06, 0.07];
  const futuro = [...base.slice(0, 5), 9, 9];
  const senza = segnali("B", base);
  const con = segnali("B", futuro);
  assert.deepEqual(con.slice(0, 5), senza.slice(0, 5));
});

test("settimaneDentro: una settimana con L = 1, e L = 3 con ripartenza del conteggio", () => {
  assert.deepEqual(settimaneDentro([true, false, false, true, false], 1), [false, true, false, false, true]);
  assert.deepEqual(
    settimaneDentro([true, false, true, false, false, false], 3),
    [false, true, true, true, true, true]
  );
});

test("permanenze: ingresso alla domenica prima, uscita alla domenica dell'ultima settimana tenuta", () => {
  const dentro = [false, true, true, false, true, false];
  assert.deepEqual(permanenze(dentro, 1, 5), [
    { entrata: 0, uscita: 2 },
    { entrata: 3, uscita: 4 }
  ]);
});

test("permanenze: una permanenza iniziata prima della finestra entra alla prima domenica", () => {
  const dentro = [false, true, true, true];
  assert.deepEqual(permanenze(dentro, 2, 3), [{ entrata: 1, uscita: 3 }]);
});

test("curvaCapitale: i costi entrano all'ingresso e all'uscita, mezzo per lato", () => {
  const close = [100, 110, 121];
  const curva = curvaCapitale(close, [false, true, false], 0, 2, 0.003);
  const atteso = 1.1 * (1 - 0.0015) * (1 - 0.0015);
  assert.ok(Math.abs(curva[2] - atteso) < 1e-12);
});

test("drawdownMassimo: dalla punta più alta al minimo successivo", () => {
  const curva = [1, 1.2, 0.9, 1.0];
  assert.ok(Math.abs(drawdownMassimo(curva, 0, 3) - (0.9 / 1.2 - 1)) < 1e-12);
});
