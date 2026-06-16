import fetch from 'node-fetch';

/**
 * 🔞 NSFW Reaction Types
 * All supported by waifu.im /search endpoint (is_nsfw: true)
 */
export const nsfwActions = [
    "kiss",
    "cuddle",
    "hug",
    "pat",
    "blowjob",
    "ass",
    "hentai",
    "milf",
    "oral",
    "paizuri",
    "ecchi",
    "ero",
];


const waifuTagMap = {
    kiss:     "kiss",
    cuddle:   "cuddle",
    hug:      "hug",
    pat:      "pat",
    blowjob:  "blowjob",
    ass:      "ass",
    hentai:   "hentai",
    milf:     "milf",
    oral:     "oral",
    paizuri:  "paizuri",
    ecchi:    "ecchi",
    ero:      "ero",
};

// ─── Pool & History Cache ────────────────────────────────────────────────────

const gifPoolCache = new Map();
const CACHE_TIME   = 1000 * 60 * 10; // 10 min

const recentHistory = new Map();
const HISTORY_LIMIT = 30;

function getPool(type) {
    const entry = gifPoolCache.get(type);
    if (!entry) return null;
    if (Date.now() > entry.expire) {
        gifPoolCache.delete(type);
        return null;
    }
    return entry.urls;
}

function setPool(type, urls) {
    gifPoolCache.set(type, {
        urls: [...new Set(urls.filter(Boolean))],
        expire: Date.now() + CACHE_TIME,
    });
}

function getRecentHistory(type) {
    return recentHistory.get(type) || [];
}

function addToRecentHistory(type, url) {
    const history = recentHistory.get(type) || [];
    history.push(url);
    while (history.length > HISTORY_LIMIT) history.shift();
    recentHistory.set(type, history);
}

function pickNonRecent(type, urls) {
    if (!urls?.length) return null;
    const history  = getRecentHistory(type);
    const filtered = urls.filter(url => !history.includes(url));
    const source   = filtered.length ? filtered : urls;
    return source[Math.floor(Math.random() * source.length)];
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(id));
}

/**
 * Fetch GIF/image pool from waifu.im for an NSFW tag.
 * Uses the /search endpoint with is_nsfw=true and gif=true.
 */
async function collectNsfwGifs(type) {
    const tag = waifuTagMap[type];
    if (!tag) return [];

    const url = `https://api.waifu.im/search?included_tags=${encodeURIComponent(tag)}&is_nsfw=true&gif=true&many=true&limit=30`;

    try {
        const res = await fetchWithTimeout(url, {
            headers: {
                "Accept": "application/json",
            },
        });

        if (!res.ok) {
            console.warn(`[NSFW GIF] waifu.im responded with ${res.status} for tag: ${tag}`);
            return [];
        }

        const data = await res.json();
        const images = data?.images;
        if (!Array.isArray(images) || !images.length) return [];

        return images.map(img => img?.url).filter(Boolean);

    } catch (err) {
        console.warn(`[NSFW GIF ERROR] ${type}:`, err.message);
        return [];
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns a (non-recently-seen) NSFW GIF URL for the given action type.
 * Falls back to a fresh fetch if the pool is empty or expired.
 */
export async function getNsfwGif(type) {
    let pool = getPool(type);

    if (!pool || !pool.length) {
        pool = await collectNsfwGifs(type);
        if (pool.length) setPool(type, pool);
    }

    if (!pool?.length) return null;

    let selected = pickNonRecent(type, pool);

    if (!selected) {
        pool = await collectNsfwGifs(type);
        if (pool.length) {
            setPool(type, pool);
            selected = pickNonRecent(type, pool);
        }
    }

    if (!selected) return null;

    addToRecentHistory(type, selected);
    return selected;
}

/**
 * Returns a formatted embed description for an NSFW reaction.
 */
export function getNsfwText(type, user, target) {
    const u = `<@${user.id}>`;
    const t = target ? `<@${target.id}>` : null;

    const texts = {
        kiss: {
            target: [(u, t) => `😘 ${u} küsst ${t} leidenschaftlich...`],
            solo:   [(u)    => `💋 ${u} bläst einen Kuss in die Luft...`],
        },
        cuddle: {
            target: [(u, t) => `🫂 ${u} kuschelt eng mit ${t}...`],
            solo:   [(u)    => `🫂 ${u} möchte kuscheln...`],
        },
        hug: {
            target: [(u, t) => `🤗 ${u} umarmt ${t} fest!`],
            solo:   [(u)    => `🫂 ${u} braucht eine Umarmung...`],
        },
        pat: {
            target: [(u, t) => `🥰 ${u} streichelt ${t} sanft...`],
            solo:   [(u)    => `🥰 ${u} streichelt sich selbst...`],
        },
        blowjob: {
            target: [(u, t) => `💦 ${u} verwöhnt ${t}... 🔞`],
            solo:   [(u)    => `💦 ${u} denkt an etwas Schmutziges... 🔞`],
        },
        ass: {
            target: [(u, t) => `🍑 ${u} checkt den Hintern von ${t} aus 👀`],
            solo:   [(u)    => `🍑 ${u} zeigt, was sie hat 🔞`],
        },
        hentai: {
            target: [(u, t) => `🔞 ${u} und ${t} in ihrem eigenen Anime-Arc...`],
            solo:   [(u)    => `🔞 ${u} ist in ihrem Hentai-Arc...`],
        },
        milf: {
            target: [(u, t) => `🍷 ${u} kann den Blick nicht von ${t} lassen...`],
            solo:   [(u)    => `🍷 ${u} strahlt reife Energie aus...`],
        },
        oral: {
            target: [(u, t) => `😛 ${u} bringt ${t} um den Verstand... 🔞`],
            solo:   [(u)    => `😛 ${u} denkt an Dinge... 🔞`],
        },
        paizuri: {
            target: [(u, t) => `🍒 ${u} überrascht ${t} auf eine ganz besondere Art... 🔞`],
            solo:   [(u)    => `🍒 ${u} weiß, was sie hat... 🔞`],
        },
        ecchi: {
            target: [(u, t) => `😏 ${u} und ${t} haben gerade einen sehr... interessanten Moment.`],
            solo:   [(u)    => `😏 ${u} macht Ecchi-Augen...`],
        },
        ero: {
            target: [(u, t) => `🌸 ${u} zieht die volle Aufmerksamkeit von ${t} auf sich... 🔞`],
            solo:   [(u)    => `🌸 ${u} zeigt ihre erotische Seite... 🔞`],
        },
    };

    const action = texts[type];
    if (!action) return `${u} tut etwas Unaussprechliches...`;

    const list = t ? action.target : action.solo;
    const fn   = list[Math.floor(Math.random() * list.length)];
    return t ? fn(u, t) : fn(u);
}