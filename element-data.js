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
    start:       { fire: 5, water: 5, nature: 5, light: 0, darkness: 0 },
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
    weaponGrant: 6       /* attacchi del suo tipo regalati quando la si raccoglie  */
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
    ARTIFACTS, ARTIFACT_BY_ID, applyBal
};

})(window);
