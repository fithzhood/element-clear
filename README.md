# Element Battle — Clear

Un mostro alla volta. Cinque elementi in mano, contati: ogni colpo che tiri è un
colpo in meno. Quando finiscono, finisce la partita.

**Gioca:** https://fithzhood.github.io/element-clear/element-clear.html

## Come funziona

- Il nemico ha punti vita pari all'onda: 10 alla prima, 100 alla novantunesima.
- Fuoco > natura > acqua > fuoco. La luce fa poco male ma **regala un attacco**
  a ogni colpo, il buio ne fa tanto ma **te ne toglie uno**; due colpi di buio
  di fila fanno 14.
- Ogni vittoria dà un pacchetto di attacchi da scegliere fra quattro, uno dei
  quali è coperto. Nella schermata si vede chi arriva dopo e quanto gli fa male
  ogni attacco.
- Ogni onda ha una **quest** che, se rispettata, paga.
- A ogni cambio di illustrazione (onde 11, 21, … 91) arriva un **boss** con una
  delle quattro sfide, e paga in **artefatti**: armi (+danno) e scudi (attacchi
  che ricrescono a ogni combattimento).
- Onda 91, l'ultimo boss: finisce la campagna. Poi si può proseguire
  all'infinito.

## File

| file | cosa c'è dentro |
|---|---|
| `element-clear.html` | struttura e sigilli SVG |
| `element-clear.css` | tutto lo stile, tema per elemento |
| `element-data.js` | tabelle: danni, mostri, quest, boss, artefatti, bilanciamento |
| `element-clear.js` | motore, effetti, salvataggi |
| `img/` | illustrazioni ridotte in WebP |

I tre file `element-clear.*` sono **generati** e non si modificano a mano: si
producono dai sorgenti in `OneDrive\Documenti\app\Element` e si copiano qui.

## Parametri per il collaudo

`?debug` tasti scorciatoia e `window.__el` · `?auto` parte subito ·
`?fast` azzera le attese · `?wave=N` · `?el=fire` · `?boss=<tipo>`
