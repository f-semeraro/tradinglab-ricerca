/**
 * lib/bUniverso.js — l'universo della regola B fissato con i dati fino al 31 dicembre 2020.
 *
 * Funzioni pure: le letture dell'archivio arrivano da fuori. Ogni coppia dell'archivio è
 * { nome, base, quota, primo, ultimo, mancanti, mediana2020 }:
 *   · nome: il simbolo dell'archivio (es. ADAEUR); base e quota lo separano;
 *   · primo, ultimo: prima e ultima candela, date ISO in UTC;
 *   · mancanti: i giorni senza candela tra il 7 gennaio 2019 e il 3 gennaio 2021;
 *   · mediana2020: mediana del controvalore giornaliero nel 2020, in euro.
 */

export const BITCOIN = ["XBT", "BTC"];
export const STABLECOIN = [
  "USDT", "USDC", "DAI", "EURT", "EURC", "TUSD", "PYUSD", "USD1", "USDG", "GUSD", "UST", "USTC",
  "USDE", "USDS", "FDUSD", "BUSD", "USDD", "USDQ", "USDR", "EUROP", "EURQ", "EURR"
];
export const VALUTE = ["EUR", "USD", "GBP", "CAD", "AUD", "CHF", "JPY", "AED"];

/** Separa il nome dell'archivio in base e quota, se la quota è EUR o USD. */
export function separaCoppia(nome) {
  const m = /^(.+)(EUR|USD)$/.exec(nome);
  return m ? { base: m[1], quota: m[2] } : null;
}

/** Il motivo di esclusione legato al tipo di asset, o null. */
export function motivoEsclusione(base) {
  if (BITCOIN.includes(base)) return "Bitcoin, già testato a parte";
  if (STABLECOIN.includes(base)) return "stablecoin o token ancorato a una valuta";
  if (VALUTE.includes(base)) return "valuta tradizionale: coppia tra valute";
  return null;
}

/**
 * Il simbolo senza prefisso X o Z, se il simbolo con prefisso esiste come doppione storico di Kraken;
 * altrimenti null. Esempio: XXRP è un doppione di XRP, se XRP esiste tra le basi.
 */
export function simboloSenzaPrefisso(base, basi) {
  if (base.length > 1 && (base[0] === "X" || base[0] === "Z") && basi.has(base.slice(1))) {
    return base.slice(1);
  }
  return null;
}

/**
 * L'universo: per ogni asset una sola coppia (EUR se esiste, altrimenti USD). Escluso ciò che è
 * Bitcoin, stablecoin, valuta, doppione o senza storia. Tra le monete rimaste, le `top` con la
 * liquidità mediana del 2020 più alta. Restituisce tutte le basi considerate, con esito e motivo.
 */
export function costruisciUniverso(coppie, { top, soloEur = false, ammettiBitcoin = false }) {
  const basi = new Set(coppie.map((c) => separaCoppia(c.nome).base));
  const perBase = new Map();
  for (const c of coppie) {
    const { base, quota } = separaCoppia(c.nome);
    if (!perBase.has(base)) perBase.set(base, {});
    perBase.get(base)[quota] = c;
  }

  const considerate = [];
  for (const [base, quote] of perBase) {
    const scelta = soloEur ? quote.EUR : (quote.EUR ?? quote.USD);
    const doppio = simboloSenzaPrefisso(base, basi);
    const esclusione = ammettiBitcoin && BITCOIN.includes(base) ? null : motivoEsclusione(base);
    const motivo = doppio ? `doppione di ${doppio}` : esclusione;
    if (!scelta) {
      considerate.push({ base, coppia: quote.USD.nome, mediana2020: null, incluso: false, motivo: "solo coppia in USD: fuori da questo universo" });
      continue;
    }
    const riga = {
      base,
      coppia: scelta.nome,
      mediana2020: scelta.mediana2020,
      incluso: false,
      motivo: ""
    };
    if (motivo) {
      riga.motivo = motivo;
    } else if (scelta.mancanti.length > 0) {
      riga.motivo = `storia insufficiente: ${scelta.mancanti.length} giorni senza candela, il primo il ${scelta.mancanti[0]}`;
    } else {
      riga.motivo = "candidata";
    }
    considerate.push(riga);
  }

  const candidate = considerate.filter((r) => r.motivo === "candidata").sort((a, b) => b.mediana2020 - a.mediana2020);
  candidate.forEach((r, i) => {
    if (i < top) {
      r.incluso = true;
      r.motivo = "inclusa";
    } else {
      r.motivo = `fuori dalle prime ${top} per liquidità 2020`;
    }
  });
  return considerate.sort((a, b) => a.base.localeCompare(b.base));
}
