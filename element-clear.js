/* Element Battle — motore.
   File generato: non si modifica a mano. */
(function () {
'use strict';

const D = window.ElementData;
const { ELEMENTS, BASIC, ELEMENT_INFO, MONSTER_NAMES } = D;

/* ------------------------------------------------------------ parametri */

const PARAMS   = new URLSearchParams(location.search);
const DEBUG    = PARAMS.has('debug');
const FAST     = PARAMS.has('fast');          // azzera le attese: usato dal banco di prova
const SAVE_KEY = 'elementBattle.save.v2';
/* La marca di versione che sta gia' sul tag <script>. Serve ai file che il
   gioco chiede da solo (i brani): senza, un brano sostituito resterebbe nella
   cache della CDN e del telefono. Css e js la ricevono dall'html. */
const VER = ((document.currentScript && document.currentScript.src || '').match(/\?v=\d+/) || [''])[0];
/* Ultima ondata della campagna: PV massimi 100, il boss dell'ultimo livello di illustrazione. */
const FINAL_WAVE = 91;
const HS_KEY   = 'elementBattle.best.v2';

const ms = n => FAST ? 0 : n;

/* --------------------------------------------------------------- utility */

const $  = sel => document.querySelector(sel);
const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
};
const rand  = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = n => new Promise(r => setTimeout(r, ms(n)));

/* ------------------------------------------------------ precarico immagini

   Le figure dei mostri pesano una cinquantina di KB l'una e stanno su un
   dominio remoto (anche l'APK carica il sito, non se le porta dentro):
   chiederle nell'istante in cui il mostro entra in scena vuol dire vederle
   comparire a fasce, come uno scaricamento lento di trent'anni fa.

   Qui si prendono in anticipo, su tre livelli:
     - quello che serve adesso mette in pausa il sottofondo finche' non e' suo;
     - chi arriva dopo e' gia' deciso un'onda prima, e scavalca la coda;
     - tutto il resto dell'archivio scende in sottofondo mentre si gioca, due
       per volta e a bassa priorita'.

   Gli oggetti Image restano nella mappa apposta: finche' sono vivi il browser
   tiene in memoria anche il bitmap gia' decodificato, e lo scambio e'
   istantaneo pure la seconda volta che si incontra lo stesso mostro. */
const Preload = {
    cache:   new Map(),      /* url -> { img, done, fatto } */
    coda:    [],
    aperte:  0,
    urgenti: 0,
    MAX:     2,

    /* Vera solo quando l'immagine e' scesa TUTTA: a meta' non si mostra. */
    ready(url) { const v = this.cache.get(url); return !!(v && v.fatto); },

    /* Serve adesso: parte davanti a tutti e ferma il sottofondo. */
    urge(url) {
        if (this.ready(url)) return this.cache.get(url).done;
        this.urgenti++;
        const done = this.start(url, 'high');
        done.then(() => { this.urgenti--; this.pump(); });
        return done;
    },

    /* Servira' piu' avanti: in coda. Con `avanti` passa davanti alla coda lunga. */
    soon(urls, avanti) {
        const nuovi = [];
        urls.forEach(url => {
            if (this.cache.has(url)) return;
            const i = this.coda.indexOf(url);
            if (i >= 0) { if (!avanti) return; this.coda.splice(i, 1); }
            nuovi.push(url);
        });
        if (avanti) this.coda.unshift.apply(this.coda, nuovi);
        else        this.coda.push.apply(this.coda, nuovi);
        this.pump();
    },

    start(url, priorita) {
        const gia = this.cache.get(url);
        if (gia) return gia.done;
        const img = new Image();
        if ('fetchPriority' in img) img.fetchPriority = priorita;
        const voce = { img: img, fatto: false };
        voce.done = new Promise(res => {
            /* anche l'errore chiude la voce: un buco fra le figure non deve
               lasciare il ritratto spento per sempre */
            const chiudi = () => { voce.fatto = true; res(img); };
            /* decode() sposta la decodifica fuori dal disegno: il primo
               fotogramma con la figura dentro non salta */
            img.onload  = () => { if (img.decode) img.decode().then(chiudi, chiudi); else chiudi(); };
            img.onerror = chiudi;
        });
        this.cache.set(url, voce);
        img.src = url;
        return voce.done;
    },

    pump() {
        while (!this.urgenti && this.aperte < this.MAX && this.coda.length) {
            const url = this.coda.shift();
            if (this.cache.has(url)) continue;
            this.aperte++;
            this.start(url, 'low').then(() => { this.aperte--; this.pump(); });
        }
    }
};

/* Cosa c'era davvero dietro il punto interrogativo, detto rispetto ai pacchetti
   che si vedevano: senza questo metro, "+1" o "x2" non vogliono dire niente. */
const MYSTERY_INFO = {
    skull: { mark: '\u2620', cls: 'bad',   name: 'Empty hands',
             desc: 'The pack was a trap. Nothing at all.' },
    '-1':  { mark: '\u22121', cls: 'warn', name: 'Thin pack',
             desc: 'One attack less than the packs you could see.' },
    ok:    { mark: '=',  cls: 'ok',    name: 'Fair pack',
             desc: 'As many attacks as the packs you could see.' },
    '+1':  { mark: '+1', cls: 'good',  name: 'Rich pack',
             desc: 'One attack more than the packs you could see.' },
    x2:    { mark: '\u00d72', cls: 'great', name: 'Double pack',
             desc: 'Twice the attacks of the packs you could see.' }
};

const monsterUrl = (element, tier) => 'img/mon/' + element + tier + '.webp';
const auraUrl    = element => 'img/bg/' + element + '.webp';

/* Tutte le figure, nell'ordine in cui il gioco le incontra: prima le velature
   di sfondo, poi i mostri livello per livello, infine gli artefatti. */
function tutteLeFigure() {
    const lista = ELEMENTS.map(auraUrl);
    for (let tier = 1; tier <= 10; tier++) ELEMENTS.forEach(e => lista.push(monsterUrl(e, tier)));
    D.ARTIFACTS.forEach(a => { if (a.img) lista.push('img/art/' + a.img + '.webp'); });
    return lista;
}

/* Chi ha chiesto di risparmiare dati non si merita qualche MB non richiesto:
   gli resta il precarico mirato, che e' una figura per onda. */
function risparmioDati() {
    const c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
}

/* --------------------------------------------------------------- suoni */

/* Effetti sonori sintetizzati: nessun file da scaricare. */
const Sfx = {
    ctx: null,
    on: localStorage.getItem('elementBattle.sound') !== 'off',
    ensure() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    tone(freq, dur, type, gain, slide) {
        if (!this.on) return;
        const ctx = this.ensure();
        if (!ctx) return;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'sine';
        o.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), ctx.currentTime + dur);
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(gain || 0.12, ctx.currentTime + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        o.connect(g).connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + dur + 0.02);
    },
    noise(dur, gain) {
        if (!this.on) return;
        const ctx = this.ensure();
        if (!ctx) return;
        const len = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 1400;
        src.buffer = buf;
        g.gain.value = gain || 0.1;
        src.connect(f).connect(g).connect(ctx.destination);
        src.start();
    },
    hit(element, strong) {
        const base = { fire: 240, water: 300, nature: 200, light: 640, darkness: 110 }[element] || 240;
        this.tone(base * (strong ? 1.5 : 1), 0.16, 'triangle', 0.14, base * 0.5);
        this.noise(0.12, strong ? 0.16 : 0.08);
    },
    gain()    { this.tone(660, 0.1, 'sine', 0.1, 990); },
    loss()    { this.tone(320, 0.12, 'sawtooth', 0.08, 160); },
    kill()    { this.tone(180, 0.5, 'sine', 0.16, 60); this.noise(0.35, 0.14); },
    boss()    { this.tone(90, 0.7, 'sawtooth', 0.12, 55); },
    reward()  { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'sine', 0.1), i * 70)); },
    over()    { [400, 330, 260, 180].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.12), i * 150)); },
    tap()     { this.tone(880, 0.05, 'square', 0.05); },
    toggle()  {
        this.on = !this.on;
        localStorage.setItem('elementBattle.sound', this.on ? 'on' : 'off');
        if (this.on) this.tap();
        return this.on;
    }
};

/* ------------------------------------------------------------ particelle */

const Particles = {
    canvas: null, ctx: null, items: [], running: false,
    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        addEventListener('resize', () => this.resize());
    },
    resize() {
        if (!this.canvas) return;
        const r = this.canvas.getBoundingClientRect();
        const dpr = Math.min(2, devicePixelRatio || 1);
        this.canvas.width  = Math.max(1, Math.round(r.width  * dpr));
        this.canvas.height = Math.max(1, Math.round(r.height * dpr));
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.w = r.width; this.h = r.height;
    },
    burst(element, power) {
        if (!this.ctx) return;
        this.resize();
        const n = clamp(14 + power * 2, 14, 48);
        const cx = this.w / 2, cy = this.h / 2;
        const info = ELEMENT_INFO[element];
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 190;
            let p = {
                x: cx + (Math.random() - .5) * this.w * .5,
                y: cy + (Math.random() - .5) * this.h * .5,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0, max: .5 + Math.random() * .6,
                r: 2 + Math.random() * 4,
                color: Math.random() < .5 ? info.color : info.glow,
                kind: element
            };
            if (element === 'fire')     { p.vy = -60 - Math.random() * 200; p.vx *= .35; }
            if (element === 'water')    { p.vy = Math.abs(p.vy) * .7 - 120; p.g = 460; }
            if (element === 'nature')   { p.spin = Math.random() * 6; p.r = 3 + Math.random() * 4; }
            if (element === 'light')    { p.r = 1.5 + Math.random() * 3; p.max = .35 + Math.random() * .4; }
            if (element === 'darkness') { p.vx *= .5; p.vy *= .5; p.r = 5 + Math.random() * 9; }
            this.items.push(p);
        }
        this.start();
    },
    start() {
        if (this.running) return;
        this.running = true;
        let last = performance.now();
        const loop = now => {
            const dt = Math.min(.05, (now - last) / 1000); last = now;
            const c = this.ctx;
            c.clearRect(0, 0, this.w, this.h);
            for (let i = this.items.length - 1; i >= 0; i--) {
                const p = this.items[i];
                p.life += dt;
                if (p.life >= p.max) { this.items.splice(i, 1); continue; }
                p.x += p.vx * dt; p.y += p.vy * dt;
                p.vy += (p.g || 120) * dt;
                p.vx *= .985; p.vy *= .985;
                const k = 1 - p.life / p.max;
                c.globalAlpha = p.kind === 'darkness' ? k * .55 : k;
                c.fillStyle = p.color;
                if (p.kind === 'nature') {
                    c.save(); c.translate(p.x, p.y); c.rotate(p.life * (p.spin || 3));
                    c.beginPath(); c.ellipse(0, 0, p.r * 1.6, p.r * .7, 0, 0, 6.283); c.fill(); c.restore();
                } else if (p.kind === 'light') {
                    c.beginPath();
                    c.moveTo(p.x, p.y - p.r * 2.4); c.lineTo(p.x + p.r * .7, p.y);
                    c.lineTo(p.x, p.y + p.r * 2.4); c.lineTo(p.x - p.r * .7, p.y);
                    c.closePath(); c.fill();
                } else {
                    c.beginPath(); c.arc(p.x, p.y, p.r * k, 0, 6.283); c.fill();
                }
            }
            c.globalAlpha = 1;
            if (this.items.length) requestAnimationFrame(loop);
            else { this.running = false; c.clearRect(0, 0, this.w, this.h); }
        };
        requestAnimationFrame(loop);
    }
};

/* ---------------------------------------------------------------- musica

   Due brani veri, generati con Suno e chiusi su se stessi con ffmpeg
   (`audio/chiudi-loop.py`): `musica/tema.ogg` per le onde normali,
   `musica/boss.ogg` per i boss. Stessa tonalita' (Re minore) e stesso
   livello (-18 LUFS), cosi' il passaggio si fa in **dissolvenza incrociata**
   invece che con un taglio.

   Perche' Ogg Opus e non m4a: misurato, l'AAC restituisce 512 campioni piu'
   di quelli che ha ricevuto (riempimento in testa). Sono undici millesimi di
   secondo, e bastano a far sentire la giunta a ogni giro. Opus e Vorbis
   rendono la lunghezza esatta.

   Perche' Web Audio e non un `<audio loop>`: serve la dissolvenza incrociata
   fra due brani, e serve che il giro si richiuda al campione. Un
   AudioBufferSourceNode con `loop = true` fa tutte e due le cose; un
   elemento <audio> nessuna delle due in modo affidabile.

   Il boss si scarica **solo quando serve**: sono 800 KB che nelle prime nove
   onde non servono a niente. Se all'onda 10 non e' ancora sceso, il tema
   normale continua e il boss entra appena e' pronto — nessun silenzio. */
const Music = {
    on: localStorage.getItem('elementBattle.music') !== 'off',
    ctx: null, master: null,
    voci: {},            /* nome -> { src, gain } delle voci che stanno suonando */
    acceso: false,       /* la partita e' in corso e il giocatore vuole musica */
    sospesa: false,      /* fermata dal telefono in tasca, da riprendere al ritorno */
    boss: false,
    INCROCIO: 1.8,       /* secondi di dissolvenza fra tema e boss */

    brani: {
        tema: { url: 'musica/tema.ogg' + VER },
        boss: { url: 'musica/boss.ogg' + VER }
    },

    /* Una rampa a potenza costante dal guadagno di adesso alla meta (1 o 0),
       sulla stessa curva a seno che ffmpeg chiama `qsin`. Due rampe lineari
       sommate darebbero un avvallamento di 3 dB a meta' strada, perche' i due
       brani sono materiale scorrelato e si sommano in potenza, non in
       ampiezza. Partendo dal punto in cui la curva si trova adesso, un
       passaggio interrotto a meta' riparte senza scalino. */
    rampa(param, meta, quanto) {
        const t = this.ctx.currentTime;
        const v = Math.min(1, Math.max(0, param.value));
        /* dove siamo sulla curva: 0 = tutto giu', 1 = tutto su */
        const x0 = (meta ? Math.asin(v) : Math.acos(v)) / (Math.PI / 2);
        const durata = Math.max(0.04, quanto * (1 - x0));
        const n = 32, c = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const x = x0 + (1 - x0) * (i / (n - 1));
            c[i] = meta ? Math.sin(x * Math.PI / 2) : Math.cos(x * Math.PI / 2);
        }
        c[n - 1] = meta ? 1 : 0.0001;
        /* `cancelScheduledValues` non ferma una curva **gia' partita**: toglie
           solo gli appuntamenti futuri. Serve `cancelAndHoldAtTime`, che la
           interrompe e tiene il valore raggiunto. */
        if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
        else param.cancelScheduledValues(t);
        try { param.setValueCurveAtTime(c, t, durata); }
        catch (e) { param.linearRampToValueAtTime(c[n - 1], t + durata); }
        return durata;
    },

    carica(nome) {
        const b = this.brani[nome], ctx = this.ctx;
        if (b.buffer)  return Promise.resolve(b.buffer);
        if (b.chiesto) return b.chiesto;
        if (!ctx)      return Promise.resolve(null);
        b.chiesto = fetch(b.url)
            .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
            .then(a => new Promise((ok, no) => ctx.decodeAudioData(a, ok, no)))
            .then(buf => { b.buffer = buf; return buf; })
            /* un brano che non scende non deve fermare il gioco, e non deve
               nemmeno restare in un errore per sempre: si potra' riprovare */
            .catch(() => { b.chiesto = null; return null; });
        return b.chiesto;
    },

    accendi(nome, quanto) {
        const ctx = this.ctx, b = this.brani[nome];
        if (!b.buffer) return;
        const gia = this.voci[nome];
        if (gia) {
            /* stava uscendo: lo si riporta su da dov'e', non si ricomincia il
               brano. Senza questo, boss-normale-boss in fretta accendeva una
               seconda copia sovrapposta alla prima. */
            clearTimeout(gia.chiudi); gia.chiudi = 0;
            this.rampa(gia.gain.gain, 1, quanto);
            return;
        }
        const src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = b.buffer;
        src.loop = true;
        g.gain.value = 0.0001;
        src.connect(g).connect(this.master);
        src.start();
        this.voci[nome] = { src: src, gain: g, chiudi: 0 };
        this.rampa(g.gain, 1, quanto);
    },

    spegni(nome, quanto) {
        const v = this.voci[nome];
        if (!v || v.chiudi) return;
        const durata = this.rampa(v.gain.gain, 0, quanto);
        /* la sorgente si ferma davvero, ma solo a dissolvenza finita: se nel
           frattempo la scena torna indietro, `accendi` annulla questo
           appuntamento e la riporta su */
        v.chiudi = setTimeout(() => {
            delete this.voci[nome];
            try { v.src.stop(); } catch (e) {}
        }, durata * 1000 + 80);
    },

    /* porta le voci a combaciare con quello che la scena chiede adesso */
    aggiorna() {
        if (!this.acceso || !this.ctx) return;
        const vuole = this.boss ? 'boss' : 'tema';
        const sistema = () => {
            this.accendi(vuole, this.INCROCIO);
            Object.keys(this.voci).forEach(n => {
                if (n !== vuole) this.spegni(n, this.INCROCIO);
            });
        };
        if (this.brani[vuole].buffer) return sistema();
        this.carica(vuole).then(buf => {
            /* nel frattempo la scena puo' essere gia' cambiata, o la partita
               finita: allora questo brano non lo vuole piu' nessuno */
            if (!buf || !this.acceso || this.boss !== (vuole === 'boss')) return;
            sistema();
        });
    },

    start() {
        if (!this.on || FAST) return;
        const ctx = Sfx.ensure();
        if (!ctx) return;
        if (this.ctx !== ctx) { this.ctx = ctx; this.master = null; this.voci = {}; }
        if (!this.master) {
            this.master = ctx.createGain();
            this.master.gain.value = 0;
            this.master.connect(ctx.destination);
        }
        this.acceso = true;
        const p = this.master.gain, t = ctx.currentTime;
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
        p.setTargetAtTime(1, t, 0.7);                                /* entra piano */
        this.aggiorna();
        /* il boss scende in sottofondo appena il tema e' a posto, cosi' all'onda
           10 e' gia' li'. Chi risparmia dati se lo prende quando servira'. */
        if (!risparmioDati()) this.carica('tema').then(() => this.carica('boss'));
    },

    stop(subito) {
        this.acceso = false;
        if (!this.ctx || !this.master) return;
        const t = this.ctx.currentTime, quanto = subito ? 0.08 : 0.6;
        const p = this.master.gain;
        if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t);
        p.setTargetAtTime(0, t, quanto / 3);
        /* le sorgenti si fermano davvero: col telefono in tasca non deve
           restare un decodificatore acceso a masticare */
        Object.keys(this.voci).forEach(n => {
            const v = this.voci[n];
            clearTimeout(v.chiudi);
            delete this.voci[n];
            try { v.src.stop(t + quanto + 0.15); } catch (e) {}
        });
    },

    /* L'elemento del mostro non cambia piu' la musica: con brani veri
       cambierebbe brano, e sarebbe un continuo entra-ed-esci. Resta il salto
       di intensita' sui boss, che era la cosa che si sentiva. */
    scena(element, boss) {
        boss = !!boss;
        if (boss === this.boss) return;
        this.boss = boss;
        this.aggiorna();
    },

    toggle() {
        this.on = !this.on;
        localStorage.setItem('elementBattle.music', this.on ? 'on' : 'off');
        if (this.on) this.start(); else this.stop();
        return this.on;
    }
};

/* col telefono in tasca la musica non deve continuare a suonare */
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (Music.acceso) { Music.sospesa = true; Music.stop(true); }
    } else if (Music.sospesa) {
        Music.sospesa = false;
        Music.start();
    }
});

/* ==================================================================== gioco */

class Game {
    constructor() {
        this.dom = {
            app:       $('#app'),
            start:     $('#start'),
            game:      $('#game'),
            best:      $('#best-val'),
            wave:      $('#wave-val'),
            nextChip:  $('#next-chip'),
            arena:     $('#arena'),
            name:      $('#enemy-name'),
            hpFill:    $('#hp-fill'),
            hpGhost:   $('#hp-ghost'),
            hpText:    $('#hp-text'),
            portrait:  $('#portrait'),
            art:       $('#portrait-art'),
            badge:     $('#badge'),
            ribbon:    $('#boss-ribbon'),
            shelf:     $('#shelf'),
            quest:     $('#quest'),
            attacks:   $('#attacks'),
            backdrop:  $('#fx-backdrop'),
            swirl:     $('#fx-swirl'),
            reward:    $('#reward'),
            rewardIn:  $('#reward-inner'),
            rewardTtl: $('#reward-title'),
            rewardNext: $('#reward-next'),
            rewardLegend: $('#reward-legend'),
            owned:        $('#reward-owned'),
            help:         $('#help'),
            helpRows:     $('#help-rows'),
            helpNotes:    $('#help-notes'),
            helpGo:       $('#btn-help-go'),
            ending:    $('#ending'),
            endlessTag: $('#endless-tag'),
            over:      $('#gameover'),
            overText:  $('#gameover-score'),
            report:       $('#report'),
            reportTtl:    $('#report-title'),
            reportBody:   $('#report-body'),
            reportGo:     $('#btn-report-go'),
            artshow:      $('#artshow'),
            artshowKind:  $('#artshow-kind'),
            artshowArt:   $('#artshow-art'),
            artshowName:  $('#artshow-name'),
            artshowDesc:  $('#artshow-desc'),
            artshowGo:    $('#btn-artshow-go'),
            mystery:      $('#mystery'),
            mysteryMark:  $('#mystery-mark'),
            mysteryName:  $('#mystery-name'),
            mysteryDesc:  $('#mystery-desc'),
            mysteryChips: $('#mystery-chips'),
            mysteryGo:    $('#btn-mystery-go'),
            toast:     $('#toast'),
            sound:     $('#btn-sound'),
            music:     $('#btn-music')
        };

        Particles.init($('#particles'));

        this.best     = this.loadBest();
        this.phase    = 'idle';
        this.busy     = false;

        this.bindUi();
        if (DEBUG) this.bindDebugKeys();

        /* Il precarico parte subito: mentre si legge la schermata iniziale
           scendono le velature e i mostri di primo livello, che sono i primi
           che si vedranno. Non nel banco di prova, dove sarebbero decine di
           richieste per partita e non servirebbero a niente. */
        if (!FAST && !risparmioDati()) Preload.soon(tutteLeFigure());

        if (PARAMS.has('auto')) this.newGame(); else this.showStart();
    }

    /* -------------------------------------------------------- salvataggio */

    loadBest() {
        try {
            const b = JSON.parse(localStorage.getItem(HS_KEY));
            if (b && typeof b.normal === 'number') return b;
        } catch (e) { /* niente */ }
        return { normal: 10 };
    }

    saveBest() { localStorage.setItem(HS_KEY, JSON.stringify(this.best)); }

    save() {
        if (this.phase === 'gameover' || !this.enemy) return;
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                wave: this.wave,
                attacks: this.attacks,
                enemy: { element: this.enemy.element, hp: this.enemy.hp, maxHp: this.enemy.maxHp },
                nextElement: this.nextElement,
                lastAttack: this.lastAttack,
                artifacts: this.artifacts.map(a => a.id),
                endless: this.endless,
                skipChallenge: this.skipChallenge,
                questType: this.quest ? this.quest.type : null,
                questFailed: this.questFailed,
                qs: this.qs,
                challenge: this.challenge ? { type: this.challenge.type, reflected: this.challenge.reflected || 0 } : null,
                bossNerfed: !!this.bossNerfed,
                phase: this.phase
            }));
        } catch (e) { /* quota piena: si continua senza salvare */ }
    }

    hasSave() { return !!localStorage.getItem(SAVE_KEY); }

    /* --------------------------------------------------------- avvio/uscita */

    showStart() {
        Music.stop();
        this.dom.start.hidden = false;
        this.dom.game.hidden = true;
        const cont = $('#btn-continue');
        cont.disabled = !this.hasSave();
        $('#start-best').textContent = this.best.normal;
    }

    newGame() {
        localStorage.removeItem(SAVE_KEY);
        this.wave     = 1;
        this.attacks  = Object.assign({}, D.BAL.start);
        this.enemy    = null;
        this.nextElement = null;
        this.lastAttack  = null;
        this.artifacts   = [];
        this.endless     = false;
        this.skipChallenge = false;
        this.quest = null; this.challenge = null; this.questFailed = false;
        this.resetQuestState();

        if (DEBUG && PARAMS.has('wave')) this.wave = Math.max(1, parseInt(PARAMS.get('wave'), 10) || 1);
        if (DEBUG && PARAMS.has('el'))   this.nextElement = PARAMS.get('el');

        this.enterGame();
        this.createEnemy();
    }

    continueGame() {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { s = null; }
        if (!s || !s.enemy || !s.attacks) { this.newGame(); return; }

        this.wave        = s.wave;
        this.attacks     = s.attacks;
        this.nextElement = s.nextElement;
        this.lastAttack  = s.lastAttack;
        this.artifacts   = (s.artifacts || []).map(id => D.ARTIFACT_BY_ID[id]).filter(Boolean);
        this.endless     = !!s.endless;
        this.skipChallenge = !!s.skipChallenge;
        this.questFailed = !!s.questFailed;
        this.bossNerfed  = !!s.bossNerfed;
        this.qs          = s.qs || this.freshQuestState();

        const maxHp = s.enemy.maxHp;
        this.enemy = {
            element: s.enemy.element, hp: s.enemy.hp, maxHp: maxHp,
            tier: D.artTier(maxHp), boss: D.isBossHp(maxHp),
            name: MONSTER_NAMES[s.enemy.element][D.artTier(maxHp) - 1]
        };

        /* La sfida del boss viene ripristinata SENZA riapplicare l'effetto d'ingresso:
           altrimenti ricaricando la partita si perdevano di nuovo gli attacchi. */
        this.challenge = null;
        this.quest = null;
        if (s.challenge) {
            const def = D.CHALLENGES.find(c => c.type === s.challenge.type);
            if (def) this.challenge = Object.assign({}, def, { reflected: s.challenge.reflected || 0 });
        } else if (s.questType) {
            const def = D.QUESTS.find(q => q.type === s.questType);
            if (def) this.quest = def;
        }

        this.enterGame();
        this.phase = 'fight';
        this.renderAll();
        this.prefetchNext();
        if (this.totalAttacks() === 0 && this.enemy.hp > 0) this.gameOver();
    }

    enterGame() {
        this.dom.start.hidden = true;
        this.dom.game.hidden = false;
        this.phase = 'fight';
        Particles.resize();
        Music.start();
    }

    /* ------------------------------------------------------------- nemico */

    freshQuestState() { return { usedType: null, usedCount: 0, usedElements: [], superUsed: false }; }
    resetQuestState() { this.qs = this.freshQuestState(); }

    createEnemy() {
        if (!this.nextElement) {
            this.nextElement = this.enemy === null ? rand(BASIC) : rand(ELEMENTS);
        }
        const maxHp = 10 + (this.wave - 1);
        const tier  = D.artTier(maxHp);
        this.enemy = {
            element: this.nextElement,
            hp: maxHp, maxHp: maxHp, tier: tier,
            boss: D.isBossHp(maxHp),
            name: MONSTER_NAMES[this.nextElement][tier - 1]
        };
        this.nextElement = rand(ELEMENTS);
        this.lastAttack  = null;
        this.questFailed = false;
        this.resetQuestState();

        this.pickQuestOrChallenge();
        this.renderAll();
        /* dopo renderAll, non prima: chi e' in scena adesso ha la precedenza
           sulla figura di chi arrivera' fra un'onda */
        this.prefetchNext();
        if (this.enemy.boss) { Sfx.boss(); this.dom.portrait.classList.add('boss-enter');
                               setTimeout(() => this.dom.portrait.classList.remove('boss-enter'), 900); }
        this.save();
        if (this.totalAttacks() === 0) this.gameOver();
    }

    /* Chi arriva dopo e' gia' deciso: la sua figura si scarica adesso, mentre
       si combatte questa onda, cosi' allo scambio e' gia' in memoria. */
    prefetchNext() {
        if (!this.nextElement) return;
        const pvDopo = 10 + this.wave;      /* il prossimo e' l'onda wave + 1 */
        Preload.soon([monsterUrl(this.nextElement, D.artTier(pvDopo)),
                      auraUrl(this.nextElement)], true);
    }

    /* -------------------------------------------------- quest e sfide boss */

    pickQuestOrChallenge() {
        this.quest = null;
        this.challenge = null;
        this.bossNerfed = false;

        if (!this.enemy.boss) {
            const pool = D.QUESTS.filter(q => q.avail(this));
            if (pool.length) this.quest = rand(pool);
            return;
        }

        if (this.skipChallenge) {
            this.skipChallenge = false;
            /* boss arrivato disarmato: paghera' il doppio */
            this.bossNerfed = true;
            this.toast("The sage's calm holds. No challenge.");
            return;
        }

        let def;
        if (DEBUG && PARAMS.has('boss')) {
            def = D.CHALLENGES.find(c => c.type === PARAMS.get('boss')) || rand(D.CHALLENGES);
        } else {
            def = rand(D.CHALLENGES);
        }
        this.challenge = Object.assign({}, def, { reflected: 0 });
        this.applyChallengeEntry();
    }

    /* L'elemento che il boss "resiste": quello che gli fa meno danno. */
    resistedBy(element) {
        let best = null, bestDmg = Infinity;
        ELEMENTS.forEach(e => {
            const d = D.baseDamage(e, element, false, false);
            if (d < bestDmg) { bestDmg = d; best = e; }
        });
        return best;
    }

    applyChallengeEntry() {
        const c = this.challenge;
        if (!c) return;

        if (c.type === 'halfElementAttacks') {
            const e = this.enemy.element;
            const lost = Math.floor((this.attacks[e] || 0) / D.BAL.chDevour);
            if (lost > 0) {
                this.attacks[e] -= lost;
                this.floatOnButton(e, -lost);
                Sfx.loss();
            }
        }

        if (c.type === 'conversionAura') {
            let maxType = null, maxAmount = 0;
            ELEMENTS.forEach(e => { if (this.attacks[e] > maxAmount) { maxAmount = this.attacks[e]; maxType = e; } });
            const target = this.resistedBy(this.enemy.element);
            if (maxType && target && maxType !== target) {
                const n = Math.min(maxAmount, D.BAL.chConvert);
                this.attacks[maxType] -= n;
                this.attacks[target]  += n;
                this.floatOnButton(maxType, -n);
                this.floatOnButton(target, +n);
                Sfx.loss();
            }
        }
    }

    challengeDescription() {
        if (!this.challenge) return '';
        return this.challenge.desc.replace('$ELEMENT', ELEMENT_INFO[this.enemy.element].label.toLowerCase());
    }

    /* ------------------------------------------------------------- danno */

    damageOf(element) {
        const chained = element === 'darkness' && this.lastAttack === 'darkness';
        const noSuper = !!(this.challenge && this.challenge.type === 'noEffectiveDamage');
        let d = D.baseDamage(element, this.enemy.element, chained, noSuper);
        this.artifacts.forEach(a => { if (a.bonus && a.bonus[element]) d += a.bonus[element]; });
        /* la corazza elementale non toglie solo il super: smorza ogni colpo */
        if (noSuper) d = Math.max(1, d - D.BAL.chArmor);
        return d;
    }

    /* danno che farebbe un attacco contro `target` in un combattimento nuovo:
       niente catena del buio (si riparte da zero) e niente sfida del boss in corso */
    previewDamage(element, target) {
        let d = D.baseDamage(element, target, false, false);
        this.artifacts.forEach(a => { if (a.bonus && a.bonus[element]) d += a.bonus[element]; });
        return d;
    }

    totalAttacks() { return ELEMENTS.reduce((s, e) => s + (this.attacks[e] || 0), 0); }

    /* ------------------------------------------------------------ attacco */

    async attack(element) {
        if (this.phase !== 'fight' || this.busy) return;
        if ((this.attacks[element] || 0) <= 0) return;

        const dmg     = this.damageOf(element);
        const chained = element === 'darkness' && this.lastAttack === 'darkness';

        this.attacks[element]--;
        if (element === 'light')         this.lightRefund();
        else if (element === 'darkness') this.removeRandomAttack();

        this.enemy.hp -= dmg;
        this.lastAttack = element;
        this.trackQuest(element);

        /* effetti */
        Sfx.hit(element, D.isSuperEffective(element, this.enemy.element) || chained);
        Particles.burst(element, dmg);
        this.shake(dmg);
        this.flashPortrait(element);
        this.floatDamage(dmg, element);
        this.renderHp();
        this.renderAttacks();

        /* aura riflettente del boss */
        if (this.challenge && this.challenge.type === 'reflectiveAura') {
            this.challenge.reflected = (this.challenge.reflected || 0) + dmg;
            if (this.challenge.reflected >= D.BAL.chReflect) {
                this.challenge.reflected = 0;
                const pool = ELEMENTS.filter(e => this.attacks[e] > 0);
                if (pool.length) {
                    const t = rand(pool);
                    this.attacks[t]--;
                    this.floatOnButton(t, -1);
                    Sfx.loss();
                    this.renderAttacks();
                }
            }
        }

        if (this.enemy.hp <= 0) { await this.victory(); return; }

        this.save();
        if (this.totalAttacks() === 0) this.gameOver();
    }

    /* Sotto quanti attacchi di UN tipo la luce interviene. */
    lightSoglia() { return D.BAL.lightRefundMax; }

    /* Vero se il prossimo colpo di luce rendera' un attacco: guarda soltanto il
       tipo di cui si ha di meno, che e' anche quello che verrebbe rimborsato.
       Spendere luce non cambia quel conto (la luce non e' mai il bersaglio),
       quindi quello che dice il pulsante e' quello che succede. */
    lightArmata() { return (this.attacks[this.lightBersaglio()] || 0) < this.lightSoglia(); }

    /* Il tipo di cui si e' piu' poveri, fra quelli diversi dalla luce. A parita'
       vince il primo nell'ordine degli elementi: deve essere prevedibile, non
       casuale, se no non si puo' pianificare. */
    lightBersaglio() {
        const altri = ELEMENTS.filter(e => e !== 'light');
        let scelto = altri[0];
        altri.forEach(e => { if ((this.attacks[e] || 0) < (this.attacks[scelto] || 0)) scelto = e; });
        return scelto;
    }

    /* Rende un attacco solo se la mano e' sotto la soglia. Va chiamata DOPO
       aver speso il colpo di luce: conta la mano com'e' rimasta. */
    lightRefund() {
        if (!this.lightArmata()) return false;
        const t = this.lightBersaglio();
        this.attacks[t]++;
        this.floatOnButton(t, +1);
        Sfx.gain();
        return true;
    }

    removeRandomAttack() {
        const pool = ELEMENTS.filter(e => e !== 'darkness' && this.attacks[e] > 0);
        if (!pool.length) return;
        const t = rand(pool);
        this.attacks[t]--;
        this.floatOnButton(t, -1);
        Sfx.loss();
    }

    /* -------------------------------------------------------------- quest */

    trackQuest(element) {
        if (D.isSuperEffective(element, this.enemy.element)) this.qs.superUsed = true;
        if (!this.qs.usedElements.includes(element)) this.qs.usedElements.push(element);

        const q = this.quest;
        if (!q || this.questFailed) return;

        const single = q.type === 'singleType' || /Specialist$/.test(q.type);
        if (single) {
            if (!this.qs.usedType) {
                this.qs.usedType = element;
                this.qs.usedCount = 1;
                if (q.element && element !== q.element) this.failQuest();
            } else if (element !== this.qs.usedType) {
                this.failQuest();
            } else {
                this.qs.usedCount++;
            }
        }
        if (q.type === 'noSuperEffective' && this.qs.superUsed) this.failQuest();
    }

    failQuest() {
        this.questFailed = true;
        this.renderQuest();
    }

    questIsComplete() {
        const q = this.quest;
        if (!q || this.questFailed) return false;
        const dead = this.enemy.hp <= 0;
        switch (q.type) {
            case 'exactZero':        return this.enemy.hp === 0;
            case 'noSuperEffective': return dead && !this.qs.superUsed;
            case 'useAllTypes':      return dead && ELEMENTS.every(e => this.qs.usedElements.includes(e));
            case 'singleType':
            case 'fireSpecialist': case 'waterSpecialist': case 'natureSpecialist': case 'darknessSpecialist':
                return dead && !!this.qs.usedType;
            default:
                if (q.type.indexOf('lastHit_') === 0) return dead && this.lastAttack === q.type.split('_')[1];
                return false;
        }
    }

    grantQuestReward() {
        const r = this.quest.reward(this);
        const gains = [];
        if (r.kind === 'element')  gains.push([r.element, r.amount]);
        if (r.kind === 'random')   gains.push([rand(ELEMENTS), r.amount]);
        if (r.kind === 'halfUsed') gains.push([this.qs.usedType, Math.floor(this.qs.usedCount * 0.5)]);
        if (r.kind === 'counterNext') D.counterOf(this.nextElement).forEach(t => gains.push([t, r.amount]));

        const dati = [];
        gains.forEach(([t, n]) => {
            if (!t || n <= 0) return;
            this.attacks[t] += n;
            this.floatOnButton(t, +n);
            dati.push([t, n]);
        });
        if (dati.length) Sfx.reward();
        /* niente messaggino: la quest la racconta il resoconto dell'onda, con
           il bollo e i gettoni del premio. Due volte la stessa cosa e' rumore. */
        return dati;   /* serve al resoconto: quanto ha pagato, elemento per elemento */
    }

    /* ------------------------------------------------------------ vittoria */

    async victory() {
        this.phase = 'resolve';
        this.busy = true;

        Sfx.kill();
        this.dom.portrait.classList.add('defeated');
        this.renderHp();
        this.renderAttacks();

        /* record: vale anche per i boss (nel vecchio gioco i boss non contavano) */
        const score = this.enemy.maxHp;
        const key = 'normal';
        if (score > this.best[key]) { this.best[key] = score; this.saveBest(); this.renderTop(); this.toast('New record: ' + score); }

        /* il resoconto va raccolto adesso: fra due righe la quest non c'e' piu' */
        const resoconto = {
            wave: this.wave, boss: !!this.enemy.boss,
            quest: this.quest ? { title: this.quest.title, desc: this.quest.desc,
                                  fatta: this.questIsComplete(), premi: [] } : null,
            sfida: this.challenge ? { title: this.challenge.title }
                 : (this.enemy.boss && this.bossNerfed
                     ? { title: "The sage's calm held", saltata: true } : null),
            scudi: []
        };
        if (resoconto.quest && resoconto.quest.fatta) resoconto.quest.premi = this.grantQuestReward();
        /* il boss disarmato paga anche in luce: da quando ne paga due di
           artefatti invece di tre, il solo sconto non ripagava piu' la scelta
           spesa per la calma del saggio */
        if (this.enemy.boss && this.bossNerfed && D.BAL.nerfedLight > 0) {
            this.attacks.light += D.BAL.nerfedLight;
            this.floatOnButton('light', +D.BAL.nerfedLight);
            this.renderAttacks();
            Sfx.reward();
            if (resoconto.sfida) resoconto.sfida.premi = [['light', D.BAL.nerfedLight]];
        }
        this.quest = null;
        this.renderQuest();

        await sleep(650);
        this.busy = false;

        if (!this.enemy.boss || D.BAL.bossShields) resoconto.scudi = this.applyShields();

        await this.showReport(resoconto);

        if (this.enemy.boss) this.showArtifacts();
        else                 this.showPackages();
    }

    applyShields() {
        const gained = {};
        const dettaglio = [];
        this.artifacts.forEach(a => {
            if (!a.regen) return;
            const premi = [];
            Object.keys(a.regen).forEach(e => {
                this.attacks[e] += a.regen[e];
                gained[e] = (gained[e] || 0) + a.regen[e];
                premi.push([e, a.regen[e]]);
            });
            dettaglio.push({ artefatto: a, premi: ordinaPremi(premi) });
        });
        Object.keys(gained).forEach(e => this.floatOnButton(e, +gained[e]));
        if (Object.keys(gained).length) { Sfx.gain(); this.renderAttacks(); }
        return dettaglio;   /* il resoconto elenca scudo per scudo */
    }

    /* --------------------------------------------------- resoconto dell'onda */

    /* Quello che prima passava come qualche numero volante sui pulsanti — quest
       riuscita o fallita, cosa ha fruttato, quanti attacchi hanno restituito gli
       scudi — qui si legge fermo, prima di scegliere il bottino. */
    showReport(r) {
        const box = this.dom.reportBody;
        box.innerHTML = '';
        let ritardo = 0;
        const blocco = cls => {
            const b = el('div', 'rep-block ' + cls);
            b.style.animationDelay = ritardo + 'ms';
            ritardo += 70;
            box.appendChild(b);
            return b;
        };

        if (r.quest) {
            const b = blocco(r.quest.fatta ? 'ok' : 'ko');
            const testa = el('div', 'rep-head');
            testa.appendChild(el('span', 'rep-kind', 'Quest'));
            testa.appendChild(el('span', 'rep-stamp', r.quest.fatta ? 'complete' : 'failed'));
            b.appendChild(testa);
            b.appendChild(el('div', 'rep-title', r.quest.title));
            b.appendChild(el('div', 'rep-desc', r.quest.desc));

            const riga = el('div', 'rep-line');
            riga.appendChild(el('span', 'rep-lbl', 'Reward'));
            if (r.quest.premi.length)   riga.appendChild(chipRow(r.quest.premi));
            else if (r.quest.fatta)     riga.appendChild(el('span', 'rep-none', 'nothing to give'));
            else                        riga.appendChild(el('span', 'rep-none', 'lost'));
            b.appendChild(riga);
        }

        if (r.sfida) {
            const b = blocco('ok');
            const testa = el('div', 'rep-head');
            testa.appendChild(el('span', 'rep-kind', 'Boss challenge'));
            testa.appendChild(el('span', 'rep-stamp', r.sfida.saltata ? 'skipped' : 'survived'));
            b.appendChild(testa);
            b.appendChild(el('div', 'rep-title', r.sfida.title));
            if (r.sfida.premi && r.sfida.premi.length) {
                const riga = el('div', 'rep-line');
                riga.appendChild(el('span', 'rep-lbl', 'Reward'));
                riga.appendChild(chipRow(r.sfida.premi));
                b.appendChild(riga);
            }
        }

        if (r.scudi.length) {
            const b = blocco('shields');
            b.appendChild(el('div', 'rep-kind', 'Shields'));
            r.scudi.forEach(s => {
                const riga = el('div', 'rep-shield');
                riga.appendChild(artifactThumb(s.artefatto, true));
                riga.appendChild(el('span', 'rep-shield-name', s.artefatto.name));
                riga.appendChild(chipRow(s.premi));
                b.appendChild(riga);
            });
        }

        /* onda senza quest, senza sfida e senza scudi: non c'e' niente da leggere */
        if (!box.children.length) return Promise.resolve();

        this.dom.reportTtl.textContent = r.boss ? 'The boss falls' : 'Wave ' + r.wave + ' cleared';
        this.dom.reportGo.textContent  = r.boss ? 'Claim an artifact' : 'Claim your spoils';
        this.phase = 'report';
        Sfx.reward();
        return this.attendiTocco(this.dom.report, this.dom.reportGo);
    }

    /* Apre un pannello e aspetta che si tocchi il suo pulsante. Al banco di prova
       (FAST) non si aspetta: il pannello resta costruito ma non si mostra, cosi'
       le verifiche possono leggerlo senza che il bot resti piantato. */
    attendiTocco(pannello, bottone) {
        if (FAST) return Promise.resolve();
        pannello.hidden = false;
        return new Promise(res => {
            bottone.onclick = () => { pannello.hidden = true; bottone.onclick = null; res(); };
        });
    }

    /* ---------------------------------------------------------- ricompense */

    packSize() { return D.rewardUnit(this.enemy.maxHp); }

    makePack(n) {
        const p = {};
        for (let i = 0; i < n; i++) { const e = rand(ELEMENTS); p[e] = (p[e] || 0) + 1; }
        return p;
    }

    /* Intestazione della schermata di ricompensa: si sceglie in funzione di CHI
       arriva dopo, quindi il prossimo nemico e la tabella dei danni contro di lui
       vanno mostrati qui, non lasciati da ricordare a memoria. */
    renderNextPanel(conLegenda) {
        const prossimo = this.nextElement;
        /* l'onda non e' ancora stata incrementata: il prossimo nemico e' wave+1 */
        const ondaDopo = this.wave + 1;
        const pvDopo = 10 + (ondaDopo - 1);
        const boss = D.isBossHp(pvDopo);

        const box = this.dom.rewardNext;
        box.hidden = false;
        /* la collezione la rimette in piedi solo la schermata degli artefatti */
        this.dom.owned.hidden = true;
        box.className = prossimo + (boss ? ' is-boss' : '');
        const slot = box.querySelector('.rn-sigil');
        slot.innerHTML = '';
        slot.appendChild(sigil(prossimo));
        box.querySelector('.rn-name').textContent = ELEMENT_INFO[prossimo].label;
        box.querySelector('.rn-meta').textContent = 'wave ' + ondaDopo + ' · ' + pvDopo + ' hp';
        box.querySelector('.rn-boss').hidden = !boss;

        const leg = this.dom.rewardLegend;
        leg.innerHTML = '';
        leg.hidden = !conLegenda;
        if (!conLegenda) return;

        ELEMENTS.forEach(e => leg.appendChild(this.legendRow(e, prossimo, this.previewDamage(e, prossimo))));
    }

    /* Una riga della tabella degli attacchi. La usano in due: la legenda delle
       ricompense (contro chi arriva) e il prontuario (contro chi e' in scena).
       Stessa riga, cosi' le due non possono raccontare cose diverse. */
    legendRow(e, contro, dmg) {
        const riga = el('div', 'leg-row ' + e);
        const su = D.isSuperEffective(e, contro);
        const giu = D.isNotEffective(e, contro);
        if (su) riga.classList.add('super');
        else if (giu) riga.classList.add('weak');

        const chip = el('span', 'leg-sigil');
        chip.appendChild(sigil(e));
        riga.appendChild(chip);
        riga.appendChild(el('span', 'leg-name', ELEMENT_INFO[e].label));

        const hai = el('span', 'leg-have');
        hai.appendChild(el('b', null, String(this.attacks[e] || 0)));
        hai.appendChild(el('span', 'leg-have-lbl', 'in hand'));
        if ((this.attacks[e] || 0) === 0) hai.classList.add('zero');
        riga.appendChild(hai);

        /* la spada dice che il numero accanto e' il danno */
        const spada = el('span', 'leg-sword');
        spada.appendChild(sigil('sword'));
        riga.appendChild(spada);
        riga.appendChild(el('b', 'leg-dmg', String(dmg)));
        riga.appendChild(el('span', 'leg-arrow', su ? '▲' : (giu ? '▼' : '')));
        riga.appendChild(el('span', 'leg-note', this.attackNote(e)));
        return riga;
    }

    /* L'effetto speciale di un elemento, detto in una riga. Per la luce dice
       anche se in questo momento e' carica o no: e' la parte che il giocatore
       deve poter leggere senza indovinarla. */
    attackNote(e) {
        if (e === 'light') {
            return this.lightArmata()
                ? 'ready: +1 ' + this.lightBersaglio()
                : 'pays only a type left under ' + this.lightSoglia();
        }
        if (e === 'darkness') return '−1 other attack · 14 if chained';
        const forte = D.STRONG_VS[e];
        const debole = ELEMENTS.find(x => D.STRONG_VS[x] === e);
        return '×2 vs ' + forte + ' · ½ vs ' + debole;
    }

    /* ------------------------------------------------------- prontuario */

    showHelp() {
        const righe = this.dom.helpRows;
        righe.innerHTML = '';
        const contro = this.enemy ? this.enemy.element : 'fire';
        ELEMENTS.forEach(e => righe.appendChild(
            this.legendRow(e, contro, this.enemy ? this.damageOf(e) : D.baseDamage(e, contro, false, false))));

        const note = this.dom.helpNotes;
        note.innerHTML = '';
        const dice = (titolo, testo) => {
            const b = el('div', 'help-note');
            b.appendChild(el('b', null, titolo));
            b.appendChild(el('span', null, testo));
            note.appendChild(b);
        };
        dice('The wheel', 'Fire burns nature, nature drinks water, water quenches fire. Double damage forward, half damage back.');
        dice('Light', 'Weak on its own. It pays back 1 attack of the type you have least of — but only while you are down to fewer than ' +
                      this.lightSoglia() + ' of it. It patches holes; it does not fill the pantry. With every type stocked, light gives nothing.');
        dice('Darkness', 'Hits hard but eats one other attack every time. Two darkness in a row and the second one hits for 14.');
        dice('Attacks are the clock', 'Every attack you spend is gone. The game ends when your hand is empty, not when your health runs out.');

        this.dom.help.hidden = false;
        this.dom.helpGo.onclick = () => { this.dom.help.hidden = true; };
    }

    showPackages() {
        this.phase = 'reward';
        this.renderNextPanel(true);
        const size = this.packSize();
        const made = [];
        const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

        for (let i = 0; i < 3; i++) {
            let p, tries = 0;
            do { p = this.makePack(size); tries++; } while (made.some(m => same(m, p)) && tries < 10);
            made.push(p);
        }

        const r = Math.random();
        let mystery, kind;
        if (r < 0.05)      { mystery = {};                             kind = 'skull'; }
        else if (r < 0.25) { mystery = this.makePack(Math.max(1, size - 1)); kind = '-1'; }
        else if (r < 0.65) { mystery = this.makePack(size);            kind = 'ok'; }
        else if (r < 0.90) { mystery = this.makePack(size + 1);        kind = '+1'; }
        else               { mystery = this.makePack(size * 2);        kind = 'x2'; }

        this.dom.rewardTtl.textContent = 'Choose your spoils';
        this.dom.rewardIn.innerHTML = '';
        this.dom.rewardIn.className = 'packs';

        made.forEach((p, i) => {
            const card = el('button', 'pack');
            card.style.animationDelay = (i * 60) + 'ms';
            const row = el('div', 'pack-row');
            Object.keys(p).sort().forEach(e => {
                const chip = el('span', 'pack-chip ' + e);
                chip.appendChild(sigil(e));
                chip.appendChild(el('b', null, String(p[e])));
                row.appendChild(chip);
            });
            card.appendChild(row);
            card.onclick = () => this.takePackage(p);
            this.dom.rewardIn.appendChild(card);
        });

        const q = el('button', 'pack mystery');
        q.style.animationDelay = '180ms';
        q.appendChild(el('div', 'pack-q', '?'));
        q.onclick = () => this.takePackage(mystery, kind);
        this.dom.rewardIn.appendChild(q);

        this.dom.reward.hidden = false;
        Sfx.reward();
    }

    async takePackage(pack, mysteryKind, node) {
        if (this.busy) return;
        this.busy = true;
        Sfx.tap();

        if (mysteryKind) await this.revealMystery(mysteryKind, pack);
        else             await sleep(120);

        this.dom.reward.hidden = true;

        Object.keys(pack).forEach(e => {
            this.attacks[e] += pack[e];
            this.floatOnButton(e, +pack[e]);
        });
        if (Object.keys(pack).length) Sfx.gain();

        this.busy = false;
        this.nextWave();
    }

    /* Il punto interrogativo non deve restare un mistero anche dopo averlo scelto:
       si dice cosa c'era dentro e quanto vale rispetto ai pacchetti che si
       vedevano, con gli attacchi elencati uno per uno. */
    revealMystery(kind, pack) {
        const info = MYSTERY_INFO[kind] || MYSTERY_INFO.ok;
        this.dom.mysteryMark.className   = info.cls;
        this.dom.mysteryMark.textContent = info.mark;
        this.dom.mysteryName.textContent = info.name;
        this.dom.mysteryDesc.textContent = info.desc;

        const chips = this.dom.mysteryChips;
        chips.innerHTML = '';
        const premi = ordinaPremi(Object.keys(pack).map(e => [e, pack[e]]));
        if (premi.length) chips.appendChild(chipRow(premi));
        else              chips.appendChild(el('span', 'rep-none', 'no attacks gained'));

        if (kind === 'skull' || kind === '-1') Sfx.loss(); else Sfx.gain();
        return this.attendiTocco(this.dom.mystery, this.dom.mysteryGo);
    }

    showArtifacts(rimaste) {
        this.phase = 'artifact';
        this.renderNextPanel(false);

        let picks = rimaste;
        if (!picks) {
            /* un boss arrivato senza sfida paga di piu': e' quello che rende
               sensato spendere una scelta per la calma del saggio */
            this.artifactPicks = this.bossNerfed ? D.BAL.nerfedPicks : 1;
            /* e si offrono carte in piu', se no all'ultima scelta non si
               sceglie piu' niente: si prende quello che avanza */
            const quante = 4 + Math.max(0, this.artifactPicks - 1);
            const pool = D.ARTIFACTS.slice();
            picks = [];
            for (let i = 0; i < quante && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        this.artifactOffer = picks;

        this.dom.rewardTtl.textContent =
            this.artifactPicks > 1 ? 'The boss falls unarmed — claim ' + this.artifactPicks + ' artifacts'
                                   : (rimaste ? 'One more artifact'
                                              : 'The boss falls — claim an artifact');

        /* Quello che si ha gia' resta sotto gli occhi mentre si sceglie: senza,
           per sapere se un doppione conviene bisognava ricordarselo. */
        this.renderOwned();
        this.dom.rewardIn.innerHTML = '';
        this.dom.rewardIn.className = 'artifacts';

        picks.forEach((a, i) => {
            const card = el('button', 'artifact-card ' + a.slot);
            card.style.animationDelay = (i * 70) + 'ms';
            card.style.setProperty('--a1', ELEMENT_INFO[a.els[0]].color);
            card.style.setProperty('--a2', ELEMENT_INFO[a.els[a.els.length - 1]].color);
            card.appendChild(artifactThumb(a));
            const txt = el('div', 'artifact-text');
            txt.appendChild(el('div', 'artifact-name', a.name));
            txt.appendChild(el('div', 'artifact-desc', a.desc));
            card.appendChild(txt);
            card.onclick = () => this.takeArtifact(a);
            this.dom.rewardIn.appendChild(card);
        });

        this.dom.reward.hidden = false;
        Sfx.reward();
    }

    /* La collezione posseduta, dentro il pannello della scelta. */
    renderOwned() {
        const box = this.dom.owned;
        box.innerHTML = '';
        if (!this.artifacts.length) { box.hidden = true; return; }
        box.hidden = false;
        box.appendChild(el('span', 'owned-lbl', 'yours'));
        const riga = el('div', 'owned-row');
        const conta = new Map();
        this.artifacts.forEach(a => conta.set(a.id, (conta.get(a.id) || 0) + 1));
        conta.forEach((n, id) => {
            const a = D.ARTIFACT_BY_ID[id];
            const chip = el('button', 'owned-item ' + a.slot);
            chip.style.setProperty('--a1', ELEMENT_INFO[a.els[0]].color);
            chip.style.setProperty('--a2', ELEMENT_INFO[a.els[a.els.length - 1]].color);
            chip.appendChild(artifactThumb(a, true));
            if (n > 1) chip.appendChild(el('span', 'shelf-n', '×' + n));
            chip.onclick = () => this.toast(a.name + (n > 1 ? ' ×' + n : '') + ' — ' + a.desc);
            riga.appendChild(chip);
        });
        box.appendChild(riga);
    }

    async takeArtifact(a) {
        if (this.busy) return;
        this.busy = true;
        Sfx.tap();

        /* boss disarmato: si sceglie piu' di una volta, e fra una scelta e
           l'altra il pannello resta aperto con le carte rimaste */
        this.artifactPicks = (this.artifactPicks || 1) - 1;
        if (this.artifactPicks > 0) {
            this.claimArtifact(a);
            this.renderShelf();
            await this.showArtifactCard(a);
            this.busy = false;
            this.showArtifacts(this.artifactOffer.filter(x => x !== a));
            return;
        }

        this.dom.reward.hidden = true;

        /* bottino del boss: senza, l'onda del boss e' l'unica che non paga nulla */
        if (D.BAL.bossPack) {
            const spoils = this.makePack(this.packSize());
            Object.keys(spoils).forEach(e => { this.attacks[e] += spoils[e]; this.floatOnButton(e, +spoils[e]); });
            if (Object.keys(spoils).length) Sfx.gain();
        }

        this.claimArtifact(a);
        await this.showArtifactCard(a);

        this.busy = false;
        this.nextWave();
    }

    /* L'illustrazione dell'artefatto e' grande 320 px e nel gioco si vede solo
       da 46 nello scaffale: qui la si guarda in faccia una volta, appena presa.
       Le benedizioni comprese: sono le uniche che nello scaffale non ci finiscono
       nemmeno, e altrimenti non le si vedrebbe mai. */
    showArtifactCard(a) {
        const box = this.dom.artshowArt;
        box.style.setProperty('--a1', ELEMENT_INFO[a.els[0]].color);
        box.style.setProperty('--a2', ELEMENT_INFO[a.els[a.els.length - 1]].color);
        box.innerHTML = '';
        box.className = a.img ? '' : 'placeholder';
        if (a.img) {
            const url = 'img/art/' + a.img + '.webp';
            box.style.backgroundImage = 'url("' + url + '")';
            Preload.urge(url);
        } else {
            box.style.backgroundImage = 'none';
            const glyph = el('div', 'thumb-glyph');
            a.els.slice(0, 2).forEach(e => glyph.appendChild(sigil(e)));
            box.appendChild(glyph);
            box.appendChild(el('div', 'thumb-slot', a.slot));
        }
        this.dom.artshowKind.textContent = a.slot;
        this.dom.artshowName.textContent = a.name;
        this.dom.artshowDesc.textContent = a.desc;
        Sfx.reward();
        return this.attendiTocco(this.dom.artshow, this.dom.artshowGo);
    }

    /* Effetto di un artefatto raccolto: benedizione subito, arma o scudo nello
       scaffale (con la dotazione, se e' un'arma). */
    claimArtifact(a) {
        if (a.slot === 'blessing') {
            if (a.grant)         { ELEMENTS.forEach(e => { this.attacks[e] += a.grant; this.floatOnButton(e, +a.grant); }); Sfx.gain(); }
            if (a.skipChallenge) this.skipChallenge = true;
        } else {
            this.artifacts.push(a);
            /* un'arma senza attacchi del suo tipo non serve a niente: se la
               manopola e' accesa, arriva con la sua dotazione */
            if (a.slot === 'weapon' && D.BAL.weaponGrant > 0) {
                const n = a.els.length === 1 ? D.BAL.weaponGrant
                                             : Math.ceil(D.BAL.weaponGrant / 2);
                a.els.forEach(e => { this.attacks[e] += n; this.floatOnButton(e, +n); });
                Sfx.gain();
            }
            /* nemmeno qui: l'artefatto lo si e' appena visto in grande, con
               nome e descrizione */
        }
    }

    nextWave() {
        if (!this.endless && this.wave >= FINAL_WAVE) { this.showEnding(); return; }
        this.wave++;
        this.dom.portrait.classList.remove('defeated');
        this.phase = 'fight';
        this.createEnemy();
    }

    /* ------------------------------------------------------------- finale */

    showEnding() {
        Music.stop();
        this.phase = 'ending';
        localStorage.removeItem(SAVE_KEY);
        $('#ending-stats').innerHTML =
            '<span><b>' + this.wave + '</b>waves cleared</span>' +
            '<span><b>' + this.artifacts.length + '</b>artifacts</span>' +
            '<span><b>' + this.best.normal + '</b>best score</span>';
        this.dom.ending.hidden = false;
        Sfx.reward();
        setTimeout(() => Sfx.reward(), 320);
    }

    startEndless() {
        this.dom.ending.hidden = true;
        this.endless = true;
        this.wave++;
        this.dom.portrait.classList.remove('defeated');
        this.phase = 'fight';
        this.createEnemy();
        this.toast('Endless run — the tide never stops');
    }

    /* ----------------------------------------------------------- game over */

    gameOver() {
        if (this.phase === 'gameover') return;
        Music.stop();
        this.phase = 'gameover';
        localStorage.removeItem(SAVE_KEY);
        Sfx.over();
        this.dom.overText.innerHTML =
            'You fell at <b>wave ' + this.wave + '</b><br><span>best score ' +
            this.best.normal + '</span>';
        this.dom.over.hidden = false;
        this.renderAttacks();
    }

    /* ------------------------------------------------------------ rendering */

    renderAll() {
        this.renderTop();
        this.renderEnemy();
        this.renderHp();
        this.renderAttacks();
        this.renderQuest();
        this.renderShelf();
    }

    renderTop() {
        this.dom.best.textContent = this.best.normal;
        this.dom.wave.textContent = this.wave;
        this.dom.endlessTag.hidden = !this.endless;
        this.dom.nextChip.className = 'chip next ' + this.nextElement;
        const slot = this.dom.nextChip.querySelector('.sigil-slot');
        slot.innerHTML = '';
        slot.appendChild(sigil(this.nextElement));
    }

    renderEnemy() {
        const e = this.enemy;
        this.dom.app.dataset.element = e.element;
        this.dom.app.classList.toggle('boss', !!e.boss);

        const url = monsterUrl(e.element, e.tier);
        this.dom.art.style.backgroundImage = 'url("' + url + '")';
        this.dom.backdrop.style.backgroundImage = 'url("' + url + '")';
        this.dom.swirl.style.backgroundImage = 'url("' + auraUrl(e.element) + '")';

        /* Se la figura non e' ancora scesa tutta (prima partita, memoria vuota)
           il ritratto resta spento e si accende quando l'immagine e' intera:
           meglio un attimo di buio che vederla arrivare a fasce. Lo sfondo
           sfocato non ha il problema, e resta com'e'. */
        const pronta = Preload.ready(url);
        this.dom.art.classList.toggle('waiting', !pronta);
        if (!pronta) Preload.urge(url).then(() => {
            if (this.enemy === e) this.dom.art.classList.remove('waiting');
        });
        Preload.urge(auraUrl(e.element));

        Music.scena(e.element, e.boss);

        this.dom.name.textContent = e.name;
        this.dom.ribbon.hidden = !e.boss;
        this.dom.badge.innerHTML = '';
        this.dom.badge.appendChild(sigil(e.element));
        this.dom.portrait.classList.toggle('defeated', e.hp <= 0);

    }

    renderHp() {
        const e = this.enemy;
        const pct = clamp(e.hp / e.maxHp, 0, 1) * 100;
        this.dom.hpFill.style.width = pct + '%';
        this.dom.hpText.textContent = Math.max(0, e.hp) + ' / ' + e.maxHp;
        clearTimeout(this._ghostT);
        this._ghostT = setTimeout(() => { this.dom.hpGhost.style.width = pct + '%'; }, ms(220));
    }

    renderAttacks() {
        const box = this.dom.attacks;
        box.innerHTML = '';
        const locked = this.phase !== 'fight' || this.busy;

        ELEMENTS.forEach(e => {
            const count = this.attacks[e] || 0;
            const dmg   = this.damageOf(e);
            const btn = el('button', 'atk ' + e);
            btn.dataset.element = e;
            if (D.isSuperEffective(e, this.enemy.element) &&
                !(this.challenge && this.challenge.type === 'noEffectiveDamage')) btn.classList.add('super');
            else if (D.isNotEffective(e, this.enemy.element)) btn.classList.add('weak');
            if (e === 'darkness' && this.lastAttack === 'darkness') btn.classList.add('chained');
            /* la luce carica si vede: senza, la soglia sarebbe una regola invisibile */
            if (e === 'light' && this.lightArmata()) btn.classList.add('charged');
            if (count <= 0 || locked) btn.classList.add('off');
            btn.disabled = count <= 0 || locked;

            const ring = el('div', 'atk-ring');
            ring.appendChild(sigil(e));
            btn.appendChild(ring);
            btn.appendChild(el('div', 'atk-dmg', String(dmg)));
            btn.appendChild(el('div', 'atk-count', String(count)));
            if (btn.classList.contains('charged'))
                btn.appendChild(el('div', 'atk-mark', '+1'));
            btn.onclick = () => this.attack(e);
            box.appendChild(btn);
        });
    }

    renderQuest() {
        const box = this.dom.quest;
        box.innerHTML = '';
        box.className = '';

        if (this.challenge) {
            box.className = 'challenge';
            box.appendChild(el('div', 'q-kind', 'BOSS CHALLENGE'));
            box.appendChild(el('div', 'q-title', this.challenge.title));
            box.appendChild(el('div', 'q-desc', this.challengeDescription()));
            return;
        }
        if (!this.quest) { box.className = 'empty'; return; }

        box.className = 'quest' + (this.questFailed ? ' failed' : '');
        box.appendChild(el('div', 'q-kind', this.questFailed ? 'QUEST FAILED' : 'QUEST'));
        box.appendChild(el('div', 'q-title', this.quest.title));
        box.appendChild(el('div', 'q-desc', this.quest.desc));

        const r = this.quest.reward(this);
        const rew = el('div', 'q-reward');
        rew.appendChild(el('span', 'q-reward-lbl', 'Reward'));
        if (r.kind === 'halfUsed') {
            rew.appendChild(el('span', null, 'half the attacks you spend'));
        } else if (r.kind === 'random') {
            rew.appendChild(el('b', null, String(r.amount)));
            rew.appendChild(el('span', null, ' of a random type'));
        } else if (r.kind === 'counterNext') {
            rew.appendChild(el('b', null, String(r.amount)));
            D.counterOf(this.nextElement).forEach(t => {
                const c = el('span', 'q-chip ' + t); c.appendChild(sigil(t)); rew.appendChild(c);
            });
        } else {
            rew.appendChild(el('b', null, String(r.amount)));
            const c = el('span', 'q-chip ' + r.element); c.appendChild(sigil(r.element)); rew.appendChild(c);
        }
        box.appendChild(rew);
    }

    renderShelf() {
        const box = this.dom.shelf;
        box.innerHTML = '';
        if (!this.artifacts.length) { box.hidden = true; return; }
        box.hidden = false;

        const counts = new Map();
        this.artifacts.forEach(a => counts.set(a.id, (counts.get(a.id) || 0) + 1));
        counts.forEach((n, id) => {
            const a = D.ARTIFACT_BY_ID[id];
            const chip = el('button', 'shelf-item ' + a.slot);
            chip.style.setProperty('--a1', ELEMENT_INFO[a.els[0]].color);
            chip.style.setProperty('--a2', ELEMENT_INFO[a.els[a.els.length - 1]].color);
            chip.appendChild(artifactThumb(a, true));
            if (n > 1) chip.appendChild(el('span', 'shelf-n', '×' + n));
            chip.onclick = () => this.toast(a.name + (n > 1 ? ' ×' + n : '') + ' — ' + a.desc);
            box.appendChild(chip);
        });
    }

    /* ---------------------------------------------------------- effetti UI */

    shake(power) {
        const a = this.dom.arena;
        a.style.setProperty('--shake', clamp(2 + power * 0.6, 2, 14) + 'px');
        a.classList.remove('shaking');
        void a.offsetWidth;
        a.classList.add('shaking');
    }

    flashPortrait(element) {
        const p = this.dom.portrait;
        p.style.setProperty('--flash', ELEMENT_INFO[element].glow);
        p.classList.remove('hit');
        void p.offsetWidth;
        p.classList.add('hit');
    }

    floatDamage(dmg, element) {
        const host = this.dom.portrait;
        const n = el('div', 'float-dmg ' + element, '-' + dmg);
        n.style.left = (28 + Math.random() * 44) + '%';
        host.appendChild(n);
        setTimeout(() => n.remove(), 900);
    }

    floatOnButton(element, delta) {
        requestAnimationFrame(() => {
            const btn = this.dom.attacks.querySelector('.atk.' + element);
            if (!btn) return;
            const n = el('div', 'float-pip ' + (delta > 0 ? 'up' : 'down'), (delta > 0 ? '+' : '') + delta);
            btn.appendChild(n);
            setTimeout(() => n.remove(), 900);
        });
    }

    toast(text) {
        const t = this.dom.toast;
        t.textContent = text;
        t.classList.remove('show');
        void t.offsetWidth;
        t.classList.add('show');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(() => t.classList.remove('show'), ms(2200));
    }

    /* ------------------------------------------------------------ comandi */

    bindUi() {
        $('#btn-new').onclick      = () => { Sfx.ensure(); this.newGame(); };
        $('#btn-continue').onclick = () => { Sfx.ensure(); this.continueGame(); };
        $('#btn-retry').onclick    = () => { this.dom.over.hidden = true; this.newGame(); };
        $('#btn-menu').onclick     = () => { this.dom.over.hidden = true; this.showStart(); };
        $('#btn-endless').onclick  = () => this.startEndless();
        $('#btn-ending-menu').onclick = () => { this.dom.ending.hidden = true; this.showStart(); };
        this.dom.sound.onclick     = () => {
            const on = Sfx.toggle();
            this.dom.sound.classList.toggle('muted', !on);
            this.dom.sound.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
        };
        this.dom.sound.classList.toggle('muted', !Sfx.on);

        this.dom.music.onclick = () => {
            Sfx.ensure();
            const on = Music.toggle();
            this.dom.music.classList.toggle('muted', !on);
            this.dom.music.setAttribute('aria-label', on ? 'Music on' : 'Music off');
        };
        this.dom.music.classList.toggle('muted', !Music.on);

        $('#btn-help').onclick = () => { Sfx.tap(); this.showHelp(); };
    }

    bindDebugKeys() {
        addEventListener('keydown', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            const map = { f: 'fire', w: 'water', n: 'nature', l: 'light', d: 'darkness' };
            const k = e.key.toLowerCase();
            if (map[k]) { this.attacks[map[k]]++; this.renderAttacks(); this.floatOnButton(map[k], +1); return; }
            if (k === '+' || k === '=') { this.wave++; this.createEnemy(); return; }
            if (k === '-' && this.wave > 1) { this.wave--; this.createEnemy(); return; }
            if (k === 'k' && this.enemy) { this.enemy.hp = 0; this.victory(); return; }
            if (k === 'q') { this.pickQuestOrChallenge(); this.renderQuest(); this.renderAttacks(); return; }
        });
    }
}

/* -------------------------------------------------------- pezzi condivisi */

function sigil(element) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'sigil ' + element);
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#sig-' + element);
    svg.appendChild(use);
    return svg;
}

/* Premi sempre nell'ordine dei cinque elementi, non in quello in cui capitano. */
function ordinaPremi(coppie) {
    return coppie.filter(([, n]) => n > 0)
                 .sort((a, b) => ELEMENTS.indexOf(a[0]) - ELEMENTS.indexOf(b[0]));
}

/* Riga di gettoni "+3 <sigillo>": la stessa lettura dei pacchetti. */
function chipRow(coppie) {
    const row = el('div', 'rep-chips');
    ordinaPremi(coppie).forEach(([e, n]) => {
        const c = el('span', 'rep-chip ' + e);
        c.appendChild(el('b', null, '+' + n));
        c.appendChild(sigil(e));
        row.appendChild(c);
    });
    return row;
}

/* Miniatura di un artefatto: illustrazione se esiste, altrimenti stemma disegnato. */
function artifactThumb(a, small) {
    const box = document.createElement('div');
    box.className = 'thumb' + (small ? ' small' : '') + (a.img ? '' : ' placeholder');
    if (a.img) {
        box.style.backgroundImage = 'url("img/art/' + a.img + '.webp")';
    } else {
        const glyph = el('div', 'thumb-glyph');
        a.els.slice(0, 2).forEach(e => glyph.appendChild(sigil(e)));
        box.appendChild(glyph);
        box.appendChild(el('div', 'thumb-slot', a.slot === 'shield' ? 'shield' : 'blessing'));
    }
    return box;
}

/* --------------------------------------------------------------- avvio */

function boot() {
    try {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
            document.body.classList.add('capacitor');
        }
        window.__elFx = Particles;   /* esposto per il banco di prova */
        window.__elMusic = Music;    /* idem: `_musica.html` collauda i due brani */
        window.__el = new Game();
    } catch (err) {
        console.error(err);
        document.body.insertAdjacentHTML('beforeend',
            '<pre style="position:fixed;inset:0;background:#100;color:#f88;padding:16px;overflow:auto;z-index:99">' +
            (err && err.stack ? err.stack : err) + '</pre>');
    }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();
