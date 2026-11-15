import { test } from "node:test";
import assert from "node:assert/strict";

import { COLONNE_REGISTRO, INTESTAZIONE_REGISTRO, rigaRegistro, giaRegistrato } from "../lib/registro.js";
import { impronta, improntaDi } from "../lib/impronta.js";

const RIGA = {
  data: "2026-11-15 10:00",
  strategia: "b-giornaliera",
  coppia: "A (15 monete)",
  impronta: "d5c7ae4368",
  periodo: "4 gen 2021 → 28 giu 2026",
  operazioni: 925,
  capitale: "rendimento 327,89%",
  vsCompratoEBasta: "273,84 punti",
  drawdown: "-36,29%",
  nota: "prima | seconda\nterza"
};

test("rigaRegistro: dieci celle, nell'ordine delle colonne, e una nota non può rompere la tabella", () => {
  const riga = rigaRegistro(RIGA);
  assert.equal(riga.split("|").length - 1, COLONNE_REGISTRO.length + 1);
  assert.doesNotMatch(riga, /\n/);
  assert.ok(riga.startsWith("| 2026-11-15 10:00 | b-giornaliera | A (15 monete) | d5c7ae4368 |"));
});

test("rigaRegistro: senza nota l'ultima cella resta vuota", () => {
  const { nota, ...senzaNota } = RIGA;
  assert.ok(rigaRegistro(senzaNota).endsWith("| -36,29% |  |"));
});

test("INTESTAZIONE_REGISTRO: la tabella ha le dieci colonne", () => {
  const intestazione = INTESTAZIONE_REGISTRO.split("\n").find((r) => r.startsWith("| data"));
  assert.equal(intestazione.split("|").length - 2, COLONNE_REGISTRO.length);
});

test("giaRegistrato: conta solo la colonna della strategia, con il nome esatto", () => {
  const registro = [INTESTAZIONE_REGISTRO, rigaRegistro({ ...RIGA, strategia: "b-giornaliera-correzione", nota: "correzione di b-giornaliera" })].join("\n");
  assert.equal(giaRegistrato(registro, "b-giornaliera-correzione"), true);
  assert.equal(giaRegistrato(registro, "b-giornaliera"), false, "né un nome più lungo né una nota valgono");
  assert.equal(giaRegistrato(registro.replace(/\n/g, "\r\n"), "b-giornaliera-correzione"), true);
});

test("impronta: non dipende dall'ordine delle chiavi né dal nome; improntaDi vale per qualunque valore", () => {
  const a = { nome: "uno", ingresso: { rsi: { periodi: 14, sotto: 32 } }, costi: { x: 1, y: 2 } };
  const b = { costi: { y: 2, x: 1 }, ingresso: { rsi: { sotto: 32, periodi: 14 } }, nome: "due" };
  assert.equal(impronta(a), impronta(b));
  assert.notEqual(impronta(a), impronta({ ...a, costi: { x: 1, y: 3 } }));
  assert.match(improntaDi({ W: 286, alfa: 0.05 }), /^[0-9a-f]{10}$/);
});
