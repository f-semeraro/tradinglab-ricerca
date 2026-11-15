/**
 * lib/impronta.js — l'impronta di una configurazione: corta, stabile, uguale per configurazioni uguali.
 *
 * Funzioni pure. L'impronta non dipende dall'ordine delle chiavi nel file né dal nome della
 * strategia: due file che dicono la stessa cosa hanno la stessa impronta, e un esperimento
 * ripetuto si riconosce nel registro.
 */

import { createHash } from "node:crypto";

/** Lo stesso valore con le chiavi degli oggetti in ordine alfabetico, a ogni livello. */
export function canonico(valore) {
  if (Array.isArray(valore)) return valore.map(canonico);
  if (valore && typeof valore === "object") {
    return Object.fromEntries(Object.keys(valore).sort().map((k) => [k, canonico(valore[k])]));
  }
  return valore;
}

/** I primi dieci caratteri dello SHA-256 della forma canonica di un valore qualsiasi. */
export function improntaDi(valore) {
  return createHash("sha256").update(JSON.stringify(canonico(valore))).digest("hex").slice(0, 10);
}

/** L'impronta di una strategia: tutta la configurazione tranne il nome. */
export function impronta(strategia) {
  const { nome, ...senzaNome } = strategia;
  return improntaDi(senzaNome);
}
