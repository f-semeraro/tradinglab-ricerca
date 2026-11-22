import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { datiDashboard, paginaDashboard, statoGiro, graficoCurve, MANCANTE } from "../lib/dashboard.js";
import { testoSintesi } from "../lib/sintesi.js";
import { nuovoStatoProva } from "../lib/prova.js";
import { nuovoStato } from "../lib/simulazione.js";
import { datiDaDisco } from "../scripts/dashboard.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAB = { capitaleIniziale: 100, fusoOrario: "Europe/Rome", mercato: "SOLEUR", intervalloMinuti: 60 };
const ORA = 3600000;
const GIRO = Date.parse("2026-11-22T11:04:00Z");

/** Il testo visibile di una sezione della pagina, senza tag e senza grafico. */
function sezione(html, id) {
  const inizio = html.indexOf(`<section id="${id}">`);
  assert.ok(inizio >= 0, `manca la sezione ${id}`);
  const fine = html.indexOf("</section>", inizio);
  return html.slice(inizio, fine).replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/** Un laboratorio appena partito: due monete nel portafoglio, una prova settimanale e una a blocchi, nessun dato. */
function laboratorioVuoto() {
  return [
    ...["AAAEUR", "BBBEUR"].map((coppia) => ({
      nome: "b-portafoglio", coppia, stato: nuovoStatoProva({ lab: LAB, coppia }), storia: [], settimanale: true, portafoglio: true, partenza: "2026-11-02"
    })),
    { nome: "liu-b", coppia: "XBTEUR", stato: nuovoStatoProva({ lab: LAB, coppia: "XBTEUR" }), storia: [], settimanale: true, portafoglio: false, partenza: null },
    { nome: "rsi-base", coppia: "SOLEUR", intervallo: 60, stato: nuovoStato({ capitaleIniziale: 100, mercato: "SOLEUR", intervalloMinuti: 60, fusoOrario: LAB.fusoOrario }), partenza: null }
  ];
}

test("un dato che non esiste ancora si scrive, e non diventa mai uno zero", () => {
  const html = paginaDashboard(datiDashboard({ lab: LAB, elementi: laboratorioVuoto(), ultimoGiroMs: GIRO, adessoMs: GIRO + ORA }));

  const portafoglio = sezione(html, "prova-b-portafoglio");
  assert.match(portafoglio, new RegExp(`rendimento ${MANCANTE}`));
  assert.match(portafoglio, new RegExp(`drawdown massimo ${MANCANTE}`));
  assert.match(portafoglio, /Curva non ancora disponibile/);
  assert.doesNotMatch(portafoglio, /0,00%/, "nessuno zero al posto di un rendimento che non c'è");

  assert.match(sezione(html, "prova-liu-b-XBTEUR"), new RegExp(`rendimento ${MANCANTE}`));
  assert.match(sezione(html, "prova-rsi-base-SOLEUR"), /capitale in attesa di candele/);
  assert.doesNotMatch(sezione(html, "prova-rsi-base-SOLEUR"), /0,00/);
  assert.match(html, /Nessuna operazione chiusa, per ora/);
});

test("senza nessun giro registrato la pagina lo dice, e l'avviso è visibile", () => {
  const html = paginaDashboard(datiDashboard({ lab: LAB, elementi: laboratorioVuoto(), ultimoGiroMs: null, adessoMs: GIRO }));
  assert.match(html, new RegExp(`Ultimo giro: <strong>${MANCANTE}</strong>`));
  assert.match(html, /<p class="avviso" id="giro-fermo">Il giro: nessun giro registrato\.<\/p>/);
});

test("un giro fermo da più di 24 ore accende l'avviso rosso; uno di un'ora fa no, ma il browser lo ricontrolla", () => {
  assert.deepEqual(
    { fermo: statoGiro({ ultimoGiroMs: GIRO, adessoMs: GIRO + 25 * ORA }).fermo, ore: statoGiro({ ultimoGiroMs: GIRO, adessoMs: GIRO + 25 * ORA }).ore },
    { fermo: true, ore: 25 }
  );
  assert.equal(statoGiro({ ultimoGiroMs: GIRO, adessoMs: GIRO + 24 * ORA }).fermo, false, "a 24 ore esatte non è ancora fermo");

  const fermo = paginaDashboard(datiDashboard({ lab: LAB, elementi: laboratorioVuoto(), ultimoGiroMs: GIRO, adessoMs: GIRO + 25 * ORA }));
  assert.match(fermo, /<p class="avviso" id="giro-fermo">Il giro è fermo da più di 24 ore: da <span>25,0<\/span> ore/);

  const vivo = paginaDashboard(datiDashboard({ lab: LAB, elementi: laboratorioVuoto(), ultimoGiroMs: GIRO, adessoMs: GIRO + ORA }));
  assert.match(vivo, /<p class="avviso" id="giro-fermo" hidden>/);
  assert.match(vivo, /Ultimo giro: <strong>22 nov 2026, 12:04<\/strong> \(ora di Roma\)/);
  // la pagina pubblicata non si aggiorna da sola: il controllo si rifà nel browser con l'orologio di chi guarda
  assert.ok(vivo.includes(`var ultimo = ${GIRO};`));
  assert.match(vivo, /if \(avviso && ore > 24\)/);
});

test("la pagina non fa richieste di rete: niente script, fogli di stile, immagini o caratteri da fuori", () => {
  const html = paginaDashboard(datiDashboard({ lab: LAB, elementi: laboratorioVuoto(), ultimoGiroMs: GIRO, adessoMs: GIRO + ORA }));
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /<script[^>]+src=|<link(?![^>]*href="data:)[^>]*href=|<img|@import|url\(/);
});

test("graficoCurve: due linee, il buy and hold tratteggiato; con una sola istantanea niente curva", () => {
  const curva = [{ momento: 1793577600, valore: 100 }, { momento: 1794182400, valore: 98 }, { momento: 1794787200, valore: 99.5 }];
  const curvaBH = curva.map((p, i) => ({ ...p, valore: 100 - 5 * i }));
  const svg = graficoCurve(curva, curvaBH, LAB.fusoOrario);
  assert.equal((svg.match(/<polyline/g) ?? []).length, 2);
  assert.match(svg, /class="bh"/);
  assert.match(graficoCurve(curva.slice(0, 1), [], LAB.fusoOrario), /Curva non ancora disponibile/);
});

test("sugli stessi dati la pagina scrive i numeri della SINTESI, prova per prova", () => {
  const ultimoGiroPath = path.join(RADICE, "risultati", "ultimo-giro.json");
  if (!fs.existsSync(ultimoGiroPath)) return; // un clone senza risultati: niente da confrontare
  // un'ora dopo l'ultimo giro, come quando il workflow genera la pagina
  const adessoMs = JSON.parse(fs.readFileSync(ultimoGiroPath, "utf8")).ultimoGiroMs + ORA;
  const { lab, elementi, giornaliera, ultimoGiroMs } = datiDaDisco(RADICE, adessoMs);
  const sintesi = testoSintesi(elementi, lab, { adessoMs, ultimoGiroPrecedente: ultimoGiroMs, giornaliera });
  const html = paginaDashboard(datiDashboard({ lab, elementi, giornaliera, ultimoGiroMs, adessoMs }));

  const righe = sintesi.split("\n").filter((r) => r.startsWith("| ") && !r.startsWith("| strategia"));
  assert.ok(righe.length >= 4, "la sintesi ha almeno una riga per prova");
  let confrontati = 0;
  for (const riga of righe) {
    const celle = riga.split("|").map((c) => c.trim());
    const nome = celle[1];
    const id = /^[A-Z0-9]+$/.test(celle[2]) && !/^\d+$/.test(celle[2]) ? `prova-${nome}-${celle[2]}` : `prova-${nome}`;
    const testo = sezione(html, id);
    // ogni numero con i decimali della riga di sintesi compare, identico, nella sezione della prova
    for (const valore of celle.slice(3).join(" ").match(/-?\d+,\d+/g) ?? []) {
      assert.ok(testo.includes(valore), `${id}: «${valore}» della SINTESI non c'è nella pagina`);
      confrontati += 1;
    }
    // e le operazioni chiuse sono le stesse
    const operazioni = /operazioni chiuse (\d+)/.exec(testo)?.[1];
    assert.ok(celle.includes(operazioni), `${id}: operazioni chiuse ${operazioni} non sono nella riga «${riga}»`);
  }
  assert.ok(confrontati >= 10, `confrontati solo ${confrontati} numeri`);
});
