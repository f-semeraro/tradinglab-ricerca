/**
 * scripts/giro.js — un giro del laboratorio, poi esce.
 *
 *     npm run giro
 *
 * Scarica le candele chiuse da Kraken (endpoint pubblico, nessuna chiave), fa
 * avanzare ogni strategia sulle candele che non ha ancora elaborato, salva lo
 * stato, e aggiorna la sintesi. GitHub Actions lo lancia ogni ora.
 *
 * Ordine delle scritture, per strategia: prima lo stato intero, poi il cursore.
 * Se il processo muore in mezzo, lo stato dice la verità (vedi lib/simulazione.js),
 * quindi nessuna candela viene contata due volte.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { candeleChiuse } from "../lib/kraken.js";
import { leggiStrategia, candeleNecessarie } from "../lib/configurazione.js";
import { nuovoStato, avanza, pianoDelGiro, ultimaCandelaElaborata } from "../lib/simulazione.js";
import { calcolaMetriche } from "../lib/metriche.js";
import { formattaMomento } from "../lib/tempo.js";
import { leggiJson, scriviJson, scriviAtomico } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dentro = (...parti) => path.join(RADICE, ...parti);

function caricaLaboratorio() {
  const lab = leggiJson(dentro("laboratorio.json"));
  if (!lab) throw new Error("manca laboratorio.json");
  for (const campo of ["mercato", "intervalloMinuti", "capitaleIniziale", "fusoOrario"]) {
    if (lab[campo] === undefined) throw new Error(`laboratorio.json: manca «${campo}»`);
  }
  return lab;
}

function caricaStrategie() {
  const cartella = dentro("strategie");
  const file = fs.readdirSync(cartella).filter((f) => f.endsWith(".json")).sort();
  if (file.length === 0) throw new Error("nessuna strategia in strategie/");
  // una strategia che non passa la validazione ferma il giro: meglio fermo che con valori inventati
  return file.map((f) => ({
    nome: path.basename(f, ".json"),
    strategia: leggiStrategia(path.join(cartella, f))
  }));
}

const numero = (valore, decimali = 2) =>
  Number.isFinite(valore) ? valore.toFixed(decimali).replace(".", ",") : "—";

/** La sintesi: deterministica, senza orologio di esecuzione, così cambia solo quando cambia lo stato. */
function sintesi(elementi, lab) {
  const fuso = lab.fusoOrario;
  const ultime = elementi.map((e) => ultimaCandelaElaborata(e.stato)).filter((m) => m !== null);
  const ultima = ultime.length > 0 ? Math.max(...ultime) : null;

  const righe = [
    "# Sintesi del laboratorio",
    "",
    `Mercato **${lab.mercato}**, candele da ${lab.intervalloMinuti} minuti, capitale di partenza ${numero(lab.capitaleIniziale)} €.`,
    ultima === null
      ? "Nessuna candela ancora elaborata."
      : `Ultima candela elaborata: quella che apre alle ${formattaMomento(ultima, fuso, { conAnno: true })} (ora di ${fuso}).`,
    "",
    "Il benchmark è il «comprato e basta» sullo stesso mercato, dallo stesso punto di partenza.",
    "",
    "| strategia | capitale | vs comprato e basta | operazioni chiuse | drawdown massimo | posizione aperta |",
    "|---|---:|---:|---:|---:|---|"
  ];

  const note = [];
  for (const { nome, stato } of elementi) {
    const ultimo = stato.istantanee.at(-1);
    if (!ultimo) {
      righe.push(`| ${nome} | in attesa di candele | — | — | — | — |`);
      continue;
    }
    const m = calcolaMetriche(stato, {
      prezzoMercato: ultimo.prezzo,
      prezzoBenchmark: null,
      adessoSecondi: ultimo.momento
    });
    const aperta = stato.posizione
      ? `sì, dal ${formattaMomento(stato.posizione.momentoIngresso, fuso, { conAnno: true })}`
      : "no";
    righe.push(
      `| ${nome} | ${numero(m.capitaleAttuale)} € (${numero(m.variazionePercento)}%) | ` +
      `${numero(m.benchmark.differenzaDalMercato)} punti | ` +
      `${m.operazioni.chiuse} | ${m.drawdownMassimo === null ? "—" : numero(m.drawdownMassimo) + "%"} | ${aperta} |`
    );
    if (stato.lacune.length > 0) {
      const candeleMancanti = stato.lacune.reduce((somma, l) => somma + l.candele, 0);
      const buchi = stato.lacune.length === 1 ? "buco" : "buchi";
      note.push(`- ${nome}: ${candeleMancanti} candele mancanti nei dati (${stato.lacune.length} ${buchi}), dichiarate e non inventate.`);
    }
  }

  righe.push("");
  if (note.length > 0) righe.push("## Buchi nei dati", "", ...note, "");
  righe.push(
    "---",
    "",
    "Portafoglio di carta: nessun ordine è inviato a nessun exchange, nessun soldo vero è in gioco. " +
    "Non è consulenza finanziaria."
  );
  return righe.join("\n") + "\n";
}

async function main() {
  const lab = caricaLaboratorio();
  const strategie = caricaStrategie();

  // l'orologio si legge qui, nella parte che parla con il mondo: il resto riceve i numeri
  const adessoMs = Date.now();
  const { candele, errore } = await candeleChiuse({
    coppia: lab.mercato,
    intervalloMinuti: lab.intervalloMinuti,
    adessoMs
  });

  if (errore) {
    console.error(`mercato non raggiungibile: ${errore}. Riprovo al prossimo giro.`);
    process.exitCode = 1;
    return;
  }
  if (candele.length === 0) {
    console.log("nessuna candela chiusa disponibile");
    return;
  }

  const elementi = [];
  for (const { nome, strategia } of strategie) {
    const cartella = dentro("risultati", nome);
    const statoPath = path.join(cartella, "stato.json");
    const cursorePath = path.join(cartella, "cursore.json");

    const stato = leggiJson(statoPath) ?? nuovoStato({
      capitaleIniziale: lab.capitaleIniziale,
      mercato: lab.mercato,
      intervalloMinuti: lab.intervalloMinuti,
      fusoOrario: lab.fusoOrario
    });

    const primaValutabile = candeleNecessarie(strategia) - 1;
    const { da, a, lacuna } = pianoDelGiro(stato, candele, primaValutabile, lab.intervalloMinuti);

    if (da < a) {
      if (lacuna) stato.lacune.push(lacuna);
      avanza(stato, candele, da, a, strategia);

      // prima lo stato intero, poi il cursore: vedi il commento in testa
      scriviJson(statoPath, stato);
      scriviJson(cursorePath, { ultimaCandelaElaborata: ultimaCandelaElaborata(stato) });
      console.log(`${nome}: ${a - da} candele elaborate`);
    } else {
      console.log(`${nome}: niente di nuovo`);
    }

    elementi.push({ nome, stato });
  }

  scriviAtomico(dentro("risultati", "SINTESI.md"), sintesi(elementi, lab));
}

main().catch((errore) => {
  console.error(`giro interrotto: ${errore.message}`);
  process.exitCode = 1;
});
