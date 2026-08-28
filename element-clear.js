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
            ending:    $('#ending'),
            endlessTag: $('#endless-tag'),
            over:      $('#gameover'),
            overText:  $('#gameover-score'),
            toast:     $('#toast'),
            sound:     $('#btn-sound')
        };

        Particles.init($('#particles'));

        this.best     = this.loadBest();
        this.phase    = 'idle';
        this.busy     = false;

        this.bindUi();
        if (DEBUG) this.bindDebugKeys();
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
                phase: this.phase
            }));
        } catch (e) { /* quota piena: si continua senza salvare */ }
    }

    hasSave() { return !!localStorage.getItem(SAVE_KEY); }

    /* --------------------------------------------------------- avvio/uscita */

    showStart() {
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
        if (this.totalAttacks() === 0 && this.enemy.hp > 0) this.gameOver();
    }

    enterGame() {
        this.dom.start.hidden = true;
        this.dom.game.hidden = false;
        this.phase = 'fight';
        Particles.resize();
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
        if (this.enemy.boss) { Sfx.boss(); this.dom.portrait.classList.add('boss-enter');
                               setTimeout(() => this.dom.portrait.classList.remove('boss-enter'), 900); }
        this.save();
        if (this.totalAttacks() === 0) this.gameOver();
    }

    /* -------------------------------------------------- quest e sfide boss */

    pickQuestOrChallenge() {
        this.quest = null;
        this.challenge = null;

        if (!this.enemy.boss) {
            const pool = D.QUESTS.filter(q => q.avail(this));
            if (pool.length) this.quest = rand(pool);
            return;
        }

        if (this.skipChallenge) {
            this.skipChallenge = false;
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
            const lost = Math.floor((this.attacks[e] || 0) / 2);
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
                const n = Math.min(maxAmount, 3);
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
        if (element === 'light')         this.addRandomAttack();
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
            if (this.challenge.reflected >= 8) {
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

    addRandomAttack() {
        const t = rand(ELEMENTS.filter(e => e !== 'light'));
        this.attacks[t]++;
        this.floatOnButton(t, +1);
        Sfx.gain();
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

        gains.forEach(([t, n]) => {
            if (!t || n <= 0) return;
            this.attacks[t] += n;
            this.floatOnButton(t, +n);
        });
        if (gains.some(([, n]) => n > 0)) Sfx.reward();
        this.toast('Quest complete — ' + this.quest.title);
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

        if (this.questIsComplete()) this.grantQuestReward();
        this.quest = null;
        this.renderQuest();

        await sleep(650);
        this.busy = false;

        if (this.enemy.boss) {
            if (D.BAL.bossShields) this.applyShields();
            this.showArtifacts();
        } else {
            this.applyShields();
            this.showPackages();
        }
    }

    applyShields() {
        const gained = {};
        this.artifacts.forEach(a => {
            if (!a.regen) return;
            Object.keys(a.regen).forEach(e => {
                this.attacks[e] += a.regen[e];
                gained[e] = (gained[e] || 0) + a.regen[e];
            });
        });
        Object.keys(gained).forEach(e => this.floatOnButton(e, +gained[e]));
        if (Object.keys(gained).length) { Sfx.gain(); this.renderAttacks(); }
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

        ELEMENTS.forEach(e => {
            const riga = el('div', 'leg-row ' + e);
            if (D.isSuperEffective(e, prossimo)) riga.classList.add('super');
            else if (D.isNotEffective(e, prossimo)) riga.classList.add('weak');

            const chip = el('span', 'leg-sigil');
            chip.appendChild(sigil(e));
            riga.appendChild(chip);
            riga.appendChild(el('span', 'leg-name', ELEMENT_INFO[e].label));

            const hai = el('span', 'leg-have');
            hai.appendChild(el('b', null, String(this.attacks[e] || 0)));
            hai.appendChild(el('span', 'leg-have-lbl', 'in hand'));
            if ((this.attacks[e] || 0) === 0) hai.classList.add('zero');
            riga.appendChild(hai);

            riga.appendChild(el('b', 'leg-dmg', String(this.previewDamage(e, prossimo))));

            let nota = '';
            if (e === 'light')    nota = 'gives back a random attack';
            if (e === 'darkness') nota = 'costs another attack · 14 chained';
            riga.appendChild(el('span', 'leg-note', nota));
            leg.appendChild(riga);
        });
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
        q.onclick = () => this.takePackage(mystery, kind, q);
        this.dom.rewardIn.appendChild(q);

        this.dom.reward.hidden = false;
        Sfx.reward();
    }

    async takePackage(pack, mysteryKind, node) {
        if (this.busy) return;
        this.busy = true;
        Sfx.tap();

        if (mysteryKind) this.revealMystery(mysteryKind, node);
        await sleep(mysteryKind ? 750 : 120);

        this.dom.reward.hidden = true;

        Object.keys(pack).forEach(e => {
            this.attacks[e] += pack[e];
            this.floatOnButton(e, +pack[e]);
        });
        if (Object.keys(pack).length) Sfx.gain();

        this.busy = false;
        this.nextWave();
    }

    revealMystery(kind, node) {
        const label = { skull: '☠', '-1': '-1', ok: '✓', '+1': '+1', x2: 'x2' }[kind];
        const cls   = { skull: 'bad', '-1': 'warn', ok: 'ok', '+1': 'good', x2: 'great' }[kind];
        const tag = el('div', 'mystery-reveal ' + cls, label);
        node.appendChild(tag);
        if (kind === 'skull' || kind === '-1') Sfx.loss(); else Sfx.gain();
    }

    showArtifacts() {
        this.phase = 'artifact';
        this.renderNextPanel(false);
        const pool = D.ARTIFACTS.slice();
        const picks = [];
        for (let i = 0; i < 4 && pool.length; i++) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);

        this.dom.rewardTtl.textContent = 'The boss falls — claim an artifact';
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

    async takeArtifact(a) {
        if (this.busy) return;
        this.busy = true;
        Sfx.tap();
        this.dom.reward.hidden = true;

        /* bottino del boss: senza, l'onda del boss e' l'unica che non paga nulla */
        if (D.BAL.bossPack) {
            const spoils = this.makePack(this.packSize());
            Object.keys(spoils).forEach(e => { this.attacks[e] += spoils[e]; this.floatOnButton(e, +spoils[e]); });
            if (Object.keys(spoils).length) Sfx.gain();
        }

        if (a.slot === 'blessing') {
            if (a.grant)         { ELEMENTS.forEach(e => { this.attacks[e] += a.grant; this.floatOnButton(e, +a.grant); }); Sfx.gain(); }
            if (a.skipChallenge) { this.skipChallenge = true; this.toast('The next boss challenge will not bite'); }
        } else {
            this.artifacts.push(a);
            this.toast('Artifact claimed — ' + a.name);
        }

        this.busy = false;
        this.nextWave();
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

        const url = 'img/mon/' + e.element + e.tier + '.webp';
        this.dom.art.style.backgroundImage = 'url("' + url + '")';
        this.dom.backdrop.style.backgroundImage = 'url("' + url + '")';
        this.dom.swirl.style.backgroundImage = 'url("img/bg/' + e.element + '.webp")';

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
            if (count <= 0 || locked) btn.classList.add('off');
            btn.disabled = count <= 0 || locked;

            const ring = el('div', 'atk-ring');
            ring.appendChild(sigil(e));
            btn.appendChild(ring);
            btn.appendChild(el('div', 'atk-dmg', String(dmg)));
            btn.appendChild(el('div', 'atk-count', String(count)));
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
