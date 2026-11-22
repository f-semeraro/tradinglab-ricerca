/**
 * scripts/dashboard.js — la pagina pubblica del laboratorio, in _site/index.html.
 *
 *     npm run dashboard
 *
 * Legge soltanto: risultati/ e dati/, come li ha lasciati l'ultimo giro. Non scarica niente, non decide
 * niente e non scrive in risultati/. I numeri vengono dalle stesse funzioni di risultati/SINTESI.md.
 * Il workflow laboratorio la genera dopo ogni giro e la pubblica su GitHub Pages, senza committarla.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { caricaLaboratorio, caricaStrategie, elementiSalvati } from "../lib/laboratorio.js";
import { sintesiGiornaliera } from "../lib/giornalieraProva.js";
import { datiDashboard, paginaDashboard } from "../lib/dashboard.js";
import { leggiJson, scriviAtomico } from "../lib/persistenza.js";

const RADICE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** I dati della pagina come li vede l'istante `adessoMs`, letti dal laboratorio in `radice`. */
export function datiDaDisco(radice, adessoMs) {
  const lab = caricaLaboratorio(radice);
  const strategie = caricaStrategie(radice, lab);
  const { elementi, storieGiornaliere } = elementiSalvati(radice, strategie, lab);
  const giornaliere = strategie.filter((s) => s.giornaliera);
  const giornaliera = giornaliere.length === 0 ? null : sintesiGiornaliera({
    nome: giornaliere[0].nome,
    strategia: giornaliere[0].strategia,
    storie: storieGiornaliere,
    portafoglio: elementi.filter((e) => e.portafoglio),
    capitale: lab.capitaleIniziale,
    adessoMs,
    verdetto: leggiJson(path.join(radice, "risultati", giornaliere[0].nome, "verdetto.json"))
  });
  const ultimoGiroMs = leggiJson(path.join(radice, "risultati", "ultimo-giro.json"))?.ultimoGiroMs ?? null;
  return { lab, elementi, giornaliera, ultimoGiroMs };
}

function main() {
  const adessoMs = Date.now();
  const { lab, elementi, giornaliera, ultimoGiroMs } = datiDaDisco(RADICE, adessoMs);
  const pagina = paginaDashboard(datiDashboard({ lab, elementi, giornaliera, ultimoGiroMs, adessoMs }));
  scriviAtomico(path.join(RADICE, "_site", "index.html"), pagina);
  console.log(`Dashboard scritta in _site/index.html (${Math.round(pagina.length / 1024)} kB).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (errore) {
    console.error(`dashboard non generata: ${errore.message}`);
    process.exitCode = 1;
  }
}
