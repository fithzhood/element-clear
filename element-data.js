/* Element Battle — dati di gioco (elementi, mostri, quest, boss, artefatti).
   Nessuna logica: solo tabelle. Il motore sta in element.js */
(function (global) {
'use strict';

/* ---------------------------------------------------------------- elementi */

const ELEMENTS = ['fire', 'water', 'nature', 'light', 'darkness'];
const BASIC    = ['fire', 'water', 'nature'];

/* lettera usata nei nomi dei file degli artefatti (armi/, img/art/) */
const LETTER = { fire: 'f', water: 'w', nature: 'n', light: 'l', darkness: 'd' };

const ELEMENT_INFO = {
    fire:     { label: 'Fire',     hue: 18,  color: '#ff7a33', deep: '#5a1b06', glow: '#ffb06a' },
    water:    { label: 'Water',    hue: 199, color: '#38b6f0', deep: '#062f4a', glow: '#8fe0ff' },
    nature:   { label: 'Nature',   hue: 132, color: '#5fd167', deep: '#0d3a19', glow: '#a8f0a4' },
    light:    { label: 'Light',    hue: 44,  color: '#ffc94a', deep: '#4a3405', glow: '#ffe9a8' },
    darkness: { label: 'Darkness', hue: 264, color: '#a385f5', deep: '#2a1350', glow: '#d3befd' }
};

/* chi è super efficace contro chi, fra i tre elementi base */
const STRONG_VS = { fire: 'nature', nature: 'water', water: 'fire' };

/* ------------------------------------------------------- parametri di gioco */

/* Manopole del bilanciamento, raccolte qui perche' il banco di prova (_bot.html)
   possa misurarne le varianti senza toccare il motore. */
const BAL = {
    /* Mano di partenza: cinque per tipo. Luce e buio partivano da zero e li si
       trovava solo nei pacchetti; ora si comincia con tutto il repertorio in
       mano, e anche le quest che li richiedono sono disponibili dall'onda 1.
       Ma non cinque: la luce costa quasi zero (spendi 1, ne torna 1 a caso),
       e partendo con cinque luci la campagna si chiudeva nel 99% delle
       partite. Due a testa e' il compromesso. */
    start:       { fire: 5, water: 5, nature: 5, light: 2, darkness: 2 },
    packDiv:     10,     /* attacchi per pacchetto = PV massimi / packDiv          */
    /* Tetto agli attacchi guadagnati per onda (pacchetti e quest).
       Misurato col bot: portarlo da 6 a 3 non sposta niente, perche' nel finale
       il ritmo lo dettano gli scudi, non i pacchetti. Lasciato aperto. */
    rewardCap:   99,
    bossPack:    true,   /* il boss paga anche il bottino in attacchi              */
    bossShields: true,   /* gli scudi rigenerano anche dopo un boss                */

    /* Manopole delle armi. Misurato col bot il 28 ago 2026: raccogliendo SOLO
       spade la campagna si chiude nel 4% delle partite, SOLO scudi nel 34%.
       Le armi allungano gli attacchi, gli scudi te ne danno di nuovi, e la
       partita finisce quando gli attacchi finiscono: per questo non c'e'
       partita.

       Alzare il solo danno NON serve: a +4 e a +6 la campagna resta al 4-5%,
       misurato due volte. Quello che sposta e' la dotazione, perche' paga nella
       valuta giusta. Con +3 e dotazione 6 le spade da sole chiudono il 25%:
       una scelta vera, ancora un filo sotto agli scudi. Cosi' lo scudo resta
       la rendita e la spada l'anticipo che salva la corsa. */
    weapon1:     3,      /* danno in piu' di un'arma a un elemento solo            */
    weapon2:     2,      /* ...e di una a due elementi, per ciascuno dei due       */
    weaponGrant: 6,      /* attacchi del suo tipo regalati quando la si raccoglie  */

    /* Benedizioni. La prosperita' e' un anticipo secco senza coda: dopo che le
       spade hanno preso la loro dotazione era diventata la carta piu' debole
       del mazzo, per questo paga 4 per tipo e non 3. */
    blessingGrant: 4,    /* attacchi per ogni tipo dati dalla prosperita'          */

    /* Sfide dei boss. Piu' mordono, piu' ha senso spendere una scelta per la
       calma del saggio, che le annulla; e il boss disarmato paga il doppio. */
    chDevour:    2,      /* Devouring Aura: divisore (2 = meta', 1 = tutti)       */
    chConvert:   5,      /* Conversion Aura: quanti attacchi converte              */
    chReflect:   5,      /* Reflective Aura: danno per ogni attacco perso          */
    chArmor:     1,      /* Elemental Armor: danno tolto in piu' a ogni colpo      */
    /* La luce rendeva un attacco a caso a ogni colpo, sempre: era un motore che
       si autoalimentava, e chi partiva bene non si fermava piu'.

       Adesso guarda una cosa sola: **il tipo di cui si ha di meno**. Se ne
       restano meno di `onda / lightRefundDiv`, la luce ne rende uno; se anche
       il piu' scarso e' rifornito, non rende niente. Rattoppa i buchi, non
       riempie la dispensa — e la regola si legge guardando i pulsanti, senza
       dover sommare la mano.

       La soglia e' legata all'onda e non fissa: a onda 8 basta avere due tipi
       forniti perche' la luce taccia, a onda 80 la stessa scorta e' miseria.
       Quello che conta non e' quanto hai, ma quanto hai **per l'onda in cui
       sei**. */
    lightRefundDiv: 4,

    /* Modificatori dei nemici. La probabilita' non scala con l'onda ma con
       **quanti attacchi hai in mano**: e' la risposta al difetto piu' vecchio
       del gioco, che passata l'onda 21 non aveva piu' attrito. Chi va bene
       incontra un gioco piu' cattivo, chi arranca lo incontra piu' mite, e la
       corsa non si appiattisce mai in discesa.
       Quanti se ne possono prendere insieme, invece, scala con l'onda: una
       decina in piu' di onde, un posto in piu'. */
    modFrom:  30,     /* sotto questi attacchi in mano non ne esce nessuno    */
    modFull:  70,     /* da qui in su la probabilita' e' al massimo           */
    modMax:   1,      /* probabilita' massima, per ogni posto disponibile     */
    /* La salita non e' dritta ma curva: con esponente 2 la probabilita' resta
       bassa per buona parte della corsa e si impenna solo quando la mano e'
       davvero piena. Una rampa lineare li faceva uscire gia' troppo presto —
       a meta' strada erano gia' uno su due. */
    modCurve: 2,
    /* Secondo lucchetto, spento di serie (0 = non si guarda): oltre al tipo
       scarso, pretende che anche la **mano intera** stia sotto onda/questo.
       Serve perche' la sola condizione sul tipo piu' scarso non frena niente —
       con quattro tipi e pacchetti casuali un buco c'e' quasi sempre. */
    lightRefundTotal: 0,

    nerfedPicks: 2,      /* artefatti da scegliere se il boss arriva senza sfida.
                            Misurato: a 2 la calma del saggio resta un affare
                            mediocre (25% contro 28%), a 3 va in pari, a 4
                            diventa la carta obbligata (39%). */
    /* Con `nerfedPicks` sceso da 3 a 2 la calma restava troppo cara: costa una
       scelta adesso e paga un artefatto in meno dopo. Il pareggio non lo fa
       un terzo artefatto — misurato, non sposta niente perche' la partita si
       decide all'onda 21 — ma **attacchi di luce alla morte di quel boss**:
       arrivano subito, e la luce e' la valuta che riaccende il motore. */
    nerfedLight: 5
};

/* ------------------------------------------------------------------ mostri */

/* Un nome per ogni elemento e per ognuno dei 10 livelli di illustrazione. */
const MONSTER_NAMES = {
    fire:     ['Ember Whelp', 'Cinder Hound', 'Blaze Courser', 'Magma Saurian', 'Pyre Golem',
               'Ashen Cerberus', 'Searing Horror', 'Flame Effigy', 'Cinder Dragon', 'The Everburning'],
    water:    ['Tide Sprite', 'Squall Maw', 'Reef Stalker', 'Glacier Brute', 'Brine Siren',
               'Abyss Sovereign', 'Bilge Amphibian', 'Tide Maiden', 'Wave Serpent', 'The Endless Tide'],
    nature:   ['Leaf Sprout', 'Thornleaf', 'Moss Golem', 'Snapping Bloom', 'Grove Warden',
               'Thorn Reaver', 'Rose Matriarch', 'Worldtree Scion', 'Verdant Wyrm', 'The Green Eternal'],
    light:    ['Glim Mote', 'Dawn Swarm', 'Halo Wisp', 'Prism Golem', 'Radiant Phoenix',
               'Rainbow Chimera', 'Lumen Effigy', 'Zenith Knight', 'Dawn Drake', 'The First Light'],
    darkness: ['Gloom Mite', 'Gloom Maw', 'Umbral Serpent', 'Void Reaver', 'Nightwing Baron',
               'Devouring Eye', 'Abyssal Horror', 'Dread Reaper', 'Nightfall Dragon', 'The Last Dark']
};
/* Livello di illustrazione da punti vita massimi: 10-19 -> 1, 20-29 -> 2, ... 100+ -> 10.
   (Il vecchio gioco saltava il livello 3: cinque illustrazioni non uscivano mai.) */
function artTier(maxHp) {
    return Math.min(10, Math.max(1, Math.floor((maxHp - 10) / 10) + 1));
}

/* ------------------------------------------------------------------- danno */

/*  Tabella originale, invariata:
      darkness  incatenato 14 · contro light 10 · altrimenti 7
      light     contro darkness 8 · altrimenti 3
      base      4 · x2 se super efficace · /2 se resistito
    noSuper toglie il solo bonus di super efficacia (sfida "Elemental Armor"). */
function baseDamage(attack, enemy, chainedDarkness, noSuper) {
    if (attack === 'darkness') {
        if (chainedDarkness) return 14;
        if (enemy === 'light') return noSuper ? 7 : 10;
        return 7;
    }
    if (attack === 'light') {
        if (enemy === 'darkness') return noSuper ? 3 : 8;
        return 3;
    }
    let d = 4;
    if (STRONG_VS[attack] === enemy) { if (!noSuper) d *= 2; }
    else if (STRONG_VS[enemy] === attack) d /= 2;
    return d;
}

function isSuperEffective(attack, enemy) {
    return STRONG_VS[attack] === enemy ||
           (attack === 'light' && enemy === 'darkness') ||
           (attack === 'darkness' && enemy === 'light');
}

function isNotEffective(attack, enemy) {
    return STRONG_VS[enemy] === attack ||
           (attack === 'light' && enemy === 'light') ||
           (attack === 'darkness' && enemy === 'darkness');
}

/* elemento super efficace contro `element` (usato dalla quest Path of Resistance) */
function counterOf(element) {
    switch (element) {
        case 'fire':     return ['water'];
        case 'water':    return ['nature'];
        case 'nature':   return ['fire'];
        case 'light':    return ['darkness'];
        case 'darkness': return ['light'];
        default:         return [];
    }
}

/* Attacchi guadagnati per onda: cresce con i PV del nemico, ma non oltre BAL.rewardCap. */
function rewardUnit(maxHp) {
    return Math.min(Math.floor(maxHp / BAL.packDiv), BAL.rewardCap);
}

/* ------------------------------------------------------------------ quest */

/* Le quest sono descritte come dati; il motore le valuta.
   `avail(g)` decide se la quest può essere proposta con gli attacchi in mano. */
const QUESTS = [
    {
        type: 'exactZero', title: 'Perfect Balance',
        desc: 'Defeat the enemy with exactly 0 HP',
        avail: () => true,
        reward: g => ({ kind: 'element', element: 'light', amount: Math.max(1, rewardUnit(g.enemy.maxHp)) })
    },
    {
        type: 'singleType', title: 'Pure Specialist',
        desc: 'Win using only one type of attack',
        avail: () => true,
        reward: () => ({ kind: 'halfUsed' })
    },
    {
        type: 'fireSpecialist', title: 'Fire Specialist', element: 'fire',
        desc: 'Win using only fire attacks',
        avail: g => g.attacks.fire > 0,
        reward: () => ({ kind: 'halfUsed' })
    },
    {
        type: 'waterSpecialist', title: 'Water Specialist', element: 'water',
        desc: 'Win using only water attacks',
        avail: g => g.attacks.water > 0,
        reward: () => ({ kind: 'halfUsed' })
    },
    {
        type: 'natureSpecialist', title: 'Nature Specialist', element: 'nature',
        desc: 'Win using only nature attacks',
        avail: g => g.attacks.nature > 0,
        reward: () => ({ kind: 'halfUsed' })
    },
    {
        type: 'darknessSpecialist', title: 'Darkness Specialist', element: 'darkness',
        desc: 'Win using only darkness attacks',
        avail: g => g.attacks.darkness > 0,
        reward: () => ({ kind: 'halfUsed' })
    },
    {
        type: 'noSuperEffective', title: 'Path of Resistance',
        desc: 'Win without using super effective attacks',
        avail: () => true,
        reward: g => ({ kind: 'counterNext', amount: Math.max(2, rewardUnit(g.enemy.maxHp) + 1) })
    },
    {
        type: 'useAllTypes', title: 'Master of Elements',
        desc: 'Use at least one attack of each type',
        avail: g => ELEMENTS.every(e => g.attacks[e] > 0),
        reward: g => ({ kind: 'random', amount: Math.max(2, rewardUnit(g.enemy.maxHp) + 1) })
    }
].concat(ELEMENTS.map(element => ({
    type: 'lastHit_' + element, title: {
        fire: 'Blazing Finale', water: 'Tidal Execution', nature: 'Natural Conclusion',
        light: 'Divine Judgment', darkness: 'Shadow Strike'
    }[element],
    element: element,
    desc: 'Defeat the enemy with a ' + element + ' attack',
    avail: g => g.attacks[element] > 0,
    reward: g => ({ kind: 'element', element: element, amount: Math.max(1, rewardUnit(g.enemy.maxHp)) })
})));

/* ------------------------------------------------------------------- boss */

/* Il boss compare quando i PV massimi sono un multiplo di 10 >= 20:
   onde 11, 21, 31... cioè esattamente a ogni cambio di illustrazione. */
function isBossHp(maxHp) { return maxHp >= 20 && maxHp % 10 === 0; }

const CHALLENGES = [
    {
        type: 'noEffectiveDamage',
        title: 'Elemental Armor',
        desc: 'The boss ignores super effective damage'
    },
    {
        type: 'halfElementAttacks',
        title: 'Devouring Aura',
        desc: 'You lose half of your $ELEMENT attacks'
    },
    {
        type: 'conversionAura',
        title: 'Conversion Aura',
        desc: 'Your most abundant attack is converted into the type the boss resists'
    },
    {
        type: 'reflectiveAura',
        title: 'Reflective Aura',
        desc: 'Every 8 damage dealt, you lose a random attack'
    }
];

/* ---------------------------------------------------------- modificatori */

/* Nove modi di rendere un combattimento piu' scomodo. Toccano cose diverse
   apposta — i punti vita, l'economia delle quest, gli artefatti, quanto si
   vede delle ricompense, il danno — cosi' due modificatori insieme non sono
   mai la stessa cosa detta due volte. */
const MODIFIERS = [
    { id: 'ward',   title: 'Warded',   desc: 'Ten more hit points than its wave says' },
    { id: 'mute',   title: 'Mute',     desc: 'No quest in this fight: nothing extra to earn' },
    { id: 'seal',   title: 'Sealed',   desc: 'Your artifacts do nothing here — no bonus damage, no attacks back' },
    { id: 'curse',  title: 'Cursed',   desc: 'For three waves every reward is a mystery: you pick blind' },
    { id: 'dull',   title: 'Dulling',  desc: 'Every attack of yours hits for 1 less' },
    { id: 'scale',  title: 'Scaled',   desc: 'Super effective attacks are not doubled' },
    { id: 'toll',   title: 'Toll',     desc: 'It takes 2 attacks from you the moment it arrives' },
    { id: 'greed',  title: 'Ravenous', desc: 'The spoils from this fight are one attack smaller' },
    { id: 'thorns', title: 'Thorned',  desc: 'Every third hit you land costs you one extra attack' }
];

const MODIFIER_BY_ID = {};
MODIFIERS.forEach(m => { MODIFIER_BY_ID[m.id] = m; });

/* Quanti ne puo' portare un nemico: nessuno nella prima decina, uno nella
   seconda, due nella terza, e cosi' via. */
function modSlots(wave) {
    return Math.max(0, Math.floor((wave - 1) / 10));
}

/* Probabilita' che un posto sia occupato, in funzione di quanti attacchi ha in
   mano il giocatore. Sotto `modFrom` e' zero, sopra `modFull` e' `modMax`. */
function modChance(totalAttacks) {
    const a = BAL.modFrom, b = BAL.modFull;
    if (totalAttacks <= a) return 0;
    if (totalAttacks >= b) return BAL.modMax;
    const t = (totalAttacks - a) / (b - a);
    return Math.pow(t, BAL.modCurve) * BAL.modMax;
}

/* ------------------------------------------------------------- artefatti */

/* slot: weapon (+danno) · shield (recupero a fine combattimento) · blessing (effetto unico)
   img:  codice del file in img/art/<img>.webp — null = illustrazione mancante */
function pair(a, b) {
    return [LETTER[a], LETTER[b]].sort().join('');
}

const ARTIFACTS = [];

/* armi singole: +2 danno */
[['fire', 'Burning Inferno Blade'], ['water', 'Deep Ocean Blade'], ['nature', 'Ancient Forest Blade'],
 ['light', 'Radiant Purity Blade'], ['darkness', 'Dark Abyss Blade']
].forEach(([el, name]) => ARTIFACTS.push({
    id: 'w1' + LETTER[el], slot: 'weapon', img: 'w1' + LETTER[el], name: name,
    desc: ELEMENT_INFO[el].label + ' attacks deal +2 damage',
    els: [el], bonus: { [el]: 2 }
}));

/* armi doppie: +1 danno a due elementi */
[['darkness', 'fire', 'Abyssal Firesword'], ['darkness', 'light', 'Sun and Moon Blade'],
 ['darkness', 'nature', 'Dark Nature Scythe'], ['darkness', 'water', 'Dark Water Sword'],
 ['fire', 'light', 'Burning Light Staff'], ['fire', 'nature', 'Fire and Nature Axe'],
 ['fire', 'water', 'Fire and Water Sword'], ['light', 'nature', 'Luminous Nature Bow'],
 ['light', 'water', 'Luminous Water Dagger'], ['nature', 'water', 'Natural Balance Chain']
].forEach(([a, b, name]) => ARTIFACTS.push({
    id: 'w2' + pair(a, b), slot: 'weapon', img: 'w2' + pair(a, b), name: name,
    desc: ELEMENT_INFO[a].label + ' and ' + ELEMENT_INFO[b].label.toLowerCase() + ' attacks deal +1 damage',
    els: [a, b], bonus: { [a]: 1, [b]: 1 }
}));

/* scudi singoli: +2 attacchi dopo ogni combattimento */
[['fire', 'Eternal Flame Shield'], ['water', 'Eternal Waterfall Shield'], ['nature', 'Lush Forest Shield'],
 ['light', 'Radiant Aurora Shield'], ['darkness', 'Perpetual Eclipse Shield']
].forEach(([el, name]) => ARTIFACTS.push({
    id: 's1' + LETTER[el], slot: 'shield', img: 's1' + LETTER[el], name: name,
    desc: 'Recover 2 ' + ELEMENT_INFO[el].label.toLowerCase() + ' attacks after combat',
    els: [el], regen: { [el]: 2 }
}));

/* scudi doppi: +1 e +1 dopo ogni combattimento */
[['fire', 'light', 'Flame and Light Shield'], ['fire', 'water', 'Fire and Water Shield'],
 ['nature', 'water', 'Water and Nature Shield'], ['light', 'water', 'Water and Light Shield'],
 ['darkness', 'water', 'Water and Darkness Shield'], ['light', 'nature', 'Nature and Light Shield'],
 ['darkness', 'nature', 'Nature and Darkness Shield'], ['darkness', 'light', 'Light and Darkness Shield'],
 ['fire', 'nature', 'Fire and Nature Shield'], ['darkness', 'fire', 'Fire and Darkness Shield']
].forEach(([a, b, name]) => ARTIFACTS.push({
    id: 's2' + pair(a, b), slot: 'shield', img: 's2' + pair(a, b), name: name,
    desc: 'Recover 1 ' + ELEMENT_INFO[a].label.toLowerCase() + ' and 1 ' +
          ELEMENT_INFO[b].label.toLowerCase() + ' attack after combat',
    els: [a, b], regen: { [a]: 1, [b]: 1 }
}));

/* benedizioni: effetto immediato */
ARTIFACTS.push({
    id: 'b1', slot: 'blessing', img: 'b1',
    name: 'Ancestral Mage Prosperity',
    desc: 'Immediately gain 3 attacks of each type',
    els: ELEMENTS.slice(), grant: 3
});
ARTIFACTS.push({
    id: 'b2', slot: 'blessing', img: 'b2',
    name: "Sage's Absolute Calm",
    desc: 'The next boss challenge has no effect',
    els: ['light'], skipChallenge: true
});

/* Bonus e descrizione delle armi si ricavano da BAL, non si scrivono a mano
   nella tabella: il banco di prova cambia le manopole a gioco gia' caricato e
   deve poter richiamare applyBal() per rimettere tutto in riga. */
function applyBal() {
    /* la prosperita' ancestrale: quanto da' e cosa dice */
    const prosp = ARTIFACTS.find(a => a.id === 'b1');
    if (prosp) {
        prosp.grant = BAL.blessingGrant;
        prosp.desc = 'Immediately gain ' + BAL.blessingGrant + ' attacks of each type';
    }

    /* la calma del saggio: la meta' del suo valore e' il boss disarmato che
       paga di piu', e se non lo dice la carta nessuno la sceglie */
    const calma = ARTIFACTS.find(a => a.id === 'b2');
    if (calma) {
        calma.desc = 'The next boss challenge has no effect · that boss pays ' +
                     BAL.nerfedPicks + ' artifacts instead of 1' +
                     (BAL.nerfedLight > 0
                        ? ' and ' + BAL.nerfedLight + ' light attacks when it falls' : '');
    }

    /* le sfide dei boss: la descrizione segue i numeri, non li ripete a mano */
    const QUANTO = { 1: 'all your', 2: 'half of your', 3: 'a third of your', 4: 'a quarter of your' };
    CHALLENGES.forEach(c => {
        if (c.type === 'halfElementAttacks')
            c.desc = 'You lose ' + (QUANTO[BAL.chDevour] || 'some of your') + ' $ELEMENT attacks';
        if (c.type === 'conversionAura')
            c.desc = BAL.chConvert + ' of your most abundant attacks turn into the type the boss resists';
        if (c.type === 'reflectiveAura')
            c.desc = 'Every ' + BAL.chReflect + ' damage dealt, you lose a random attack';
        if (c.type === 'noEffectiveDamage')
            c.desc = 'The boss ignores super effective damage' +
                     (BAL.chArmor > 0 ? ' and shrugs off ' + BAL.chArmor + ' from every hit' : '');
    });

    ARTIFACTS.forEach(a => {
        if (a.slot !== 'weapon') return;
        const n = a.els.length === 1 ? BAL.weapon1 : BAL.weapon2;
        a.bonus = {};
        a.els.forEach(e => { a.bonus[e] = n; });
        const g = BAL.weaponGrant;
        a.desc = a.els.length === 1
            ? ELEMENT_INFO[a.els[0]].label + ' attacks deal +' + n + ' damage' +
              (g > 0 ? ' · +' + g + ' ' + ELEMENT_INFO[a.els[0]].label.toLowerCase() +
                       ' attacks right now' : '')
            : ELEMENT_INFO[a.els[0]].label + ' and ' +
              ELEMENT_INFO[a.els[1]].label.toLowerCase() + ' attacks deal +' + n + ' damage' +
              (g > 0 ? ' · +' + Math.ceil(g / 2) + ' of each right now' : '');
    });
}
applyBal();

const ARTIFACT_BY_ID = {};
ARTIFACTS.forEach(a => { ARTIFACT_BY_ID[a.id] = a; });

/* --------------------------------------------------------------- esporta */

global.ElementData = {
    ELEMENTS, BASIC, LETTER, ELEMENT_INFO, STRONG_VS, BAL,
    MONSTER_NAMES, artTier,
    baseDamage, isSuperEffective, isNotEffective, counterOf,
    QUESTS, CHALLENGES, isBossHp, rewardUnit,
    MODIFIERS, MODIFIER_BY_ID, modSlots, modChance,
    ARTIFACTS, ARTIFACT_BY_ID, applyBal
};

})(window);
