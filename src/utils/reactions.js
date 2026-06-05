import fetch from 'node-fetch';


const WAIFU_API_KEY = process.env.WAIFU_API_KEY;


export const actions = [
    "hug", "kiss", "slap", "pat", "cuddle",
    "poke", "bite", "tickle", "wave", "highfive",
    "feed", "wink", "smile", "blush", "cry",
    "dance", "yeet", "nom", "glomp", "bonk",
    "kick", "punch", "handhold", "sleep", "happy"
];

/**
 * 🧠 API SUPPORT MAP
 */
const apiMap = {
    nekos: ["hug", "kiss", "slap", "pat", "cuddle", "tickle", "feed", "wink", "poke", "smile", "blush"],
    waifu: ["hug", "kiss", "slap", "pat", "smile", "wave", "highfive", "nom", "bite", "glomp", "kick", "bonk"],
    otaku: ["hug", "kiss", "slap", "pat", "cuddle", "poke", "dance", "cry", "wave"],
    nekoslife: ["hug", "kiss", "pat", "tickle", "feed"],
    purrbot: ["hug", "kiss", "pat", "slap", "tickle", "cuddle"],
    nekosapi: ["hug", "kiss", "pat", "slap"],
    someRandom: ["hug", "kiss", "pat", "cuddle", "poke", "wave"],
    tenor: actions
};


const apis = [
    {
        name: "nekos",
        url: (t) => `https://nekos.best/api/v2/${t}?amount=20`,
        parse: (d) => {
            const results = d?.results;
            if (!Array.isArray(results) || !results.length) return [];
            return results.map(x => x?.url).filter(Boolean);
        }
    },
    {
        name: "waifu",
        url: (t) => `https://api.waifu.pics/sfw/${t}`,
        headers: () => ({
            Authorization: `Bearer ${WAIFU_API_KEY}`
        }),
        parse: (d) => {
            if (!d?.url) return [];
            return [d.url];
        }
    },
    {
        name: "otaku",
        url: (t) => `https://otakugifs.xyz/gif?reaction=${t}`,
        parse: (d) => {
            if (!d?.url) return [];
            return [d.url];
        }
    },
    {
        name: "nekoslife",
        url: (t) => `https://nekos.life/api/v2/img/${t}`,
        parse: (d) => {
            if (!d?.url) return [];
            return [d.url];
        }
    },
    {
        name: "purrbot",
        url: (t) => `https://purrbot.site/api/img/sfw/${t}/gif`,
        parse: (d) => {
            if (!d?.link) return [];
            return [d.link];
        }
    },
    {
        name: "nekosapi",
        url: (t) => `https://nekosapi.com/api/v2/images/${t}?limit=20`,
        parse: (d) => {
            const results = d?.data;
            if (!Array.isArray(results) || !results.length) return [];
            return results.map(x => x?.url).filter(Boolean);
        }
    },
    {
        name: "someRandom",
        url: (t) => `https://some-random-api.ml/animu/${t}`,
        parse: (d) => {
            if (!d?.link) return [];
            return [d.link];
        }
    },
    {
        name: "tenor",
        url: (t) => {
            const q = encodeURIComponent(`anime ${t}`);
            return `https://g.tenor.com/v1/search?q=${q}&key=LIVDSRZULELA&limit=30`;
        },
        parse: (d) => {
            const results = d?.results;
            if (!Array.isArray(results) || !results.length) return [];
            return results
                .map(r => r?.media?.[0]?.gif?.url)
                .filter(Boolean);
        }
    }
];


const gifPoolCache = new Map();
const CACHE_TIME = 1000 * 60 * 10; // 10 min


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
    const uniqueUrls = [...new Set(urls.filter(Boolean))];

    gifPoolCache.set(type, {
        urls: uniqueUrls,
        expire: Date.now() + CACHE_TIME
    });
}

function getRecentHistory(type) {
    return recentHistory.get(type) || [];
}

function addToRecentHistory(type, url) {
    const history = recentHistory.get(type) || [];

    history.push(url);

    while (history.length > HISTORY_LIMIT) {
        history.shift();
    }

    recentHistory.set(type, history);
}

function pickNonRecent(type, urls) {
    if (!urls?.length) return null;

    const history = getRecentHistory(type);
    const filtered = urls.filter(url => !history.includes(url));

    const source = filtered.length ? filtered : urls;
    return source[Math.floor(Math.random() * source.length)];
}


function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}


function fetchWithTimeout(url, options = {}, timeout = 4000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    return fetch(url, {
        ...options,
        signal: controller.signal
    }).finally(() => clearTimeout(id));
}


async function collectGifs(type) {
    const validApis = apis.filter(api =>
        !apiMap[api.name] || apiMap[api.name].includes(type)
    );

    if (!validApis.length) return [];

    const shuffled = shuffle(validApis);
    const allUrls = [];

    for (const api of shuffled) {
        try {
            const res = await fetchWithTimeout(api.url(type), {
                headers: api.headers ? api.headers() : {}
            });

            if (!res.ok) continue;

            const data = await res.json();
            const results = api.parse(data);

            if (Array.isArray(results) && results.length) {
                allUrls.push(...results);
            }
        } catch (err) {
            console.warn(`[GIF ERROR] ${api.name}:`, err.message);
        }
    }

    return [...new Set(allUrls)];
}


export async function getGif(type) {
    let pool = getPool(type);

    if (!pool || !pool.length) {
        pool = await collectGifs(type);
        if (pool.length) {
            setPool(type, pool);
        }
    }

    if (!pool || !pool.length) {
        return null;
    }

    let selected = pickNonRecent(type, pool);

    if (!selected) {
        pool = await collectGifs(type);

        if (pool.length) {
            setPool(type, pool);
            selected = pickNonRecent(type, pool);
        }
    }

    if (!selected) {
        return null;
    }

    addToRecentHistory(type, selected);
    return selected;
}


export function getText(type, user, target) {
    const userTag = `<@${user.id}>`;
    const targetTag = target ? `<@${target.id}>` : null;

    const texts = {
        hug: {
            target: [(u, t) => `🤗 ${u} hugs ${t}!`],
            solo: [(u) => `🫂 ${u} needs a hug...`]
        },
        kiss: {
            target: [(u, t) => `😘 ${u} kisses ${t}!`],
            solo: [(u) => `💋 ${u} blows a kiss...`]
        },
        slap: {
            target: [(u, t) => `💥 ${u} slaps ${t}!`],
            solo: [(u) => `💥 ${u} slaps the air...`]
        },
        pat: {
            target: [(u, t) => `🥰 ${u} pats ${t}!`],
            solo: [(u) => `🥰 ${u} pats themselves`]
        },
        cuddle: {
            target: [(u, t) => `🫂 ${u} cuddles ${t}!`],
            solo: [(u) => `🫂 ${u} wants to cuddle...`]
        },
        poke: {
            target: [(u, t) => `👉 ${u} pokes ${t}!`],
            solo: [(u) => `👉 ${u} pokes nothing...`]
        },
        bite: {
            target: [(u, t) => `🩸 ${u} bites ${t}!`],
            solo: [(u) => `🩸 ${u} bites air...`]
        },
        tickle: {
            target: [(u, t) => `🤣 ${u} tickles ${t}!`],
            solo: [(u) => `🤣 ${u} laughs randomly`]
        },
        wave: {
            target: [(u, t) => `👋 ${u} waves at ${t}!`],
            solo: [(u) => `👋 ${u} waves...`]
        },
        highfive: {
            target: [(u, t) => `✋ ${u} high-fives ${t}!`],
            solo: [(u) => `✋ ${u} high-fives themselves`]
        },
        feed: {
            target: [(u, t) => `🍓 ${u} feeds ${t}!`],
            solo: [(u) => `🍓 ${u} eats alone...`]
        },
        wink: {
            target: [(u, t) => `😉 ${u} winks at ${t}!`],
            solo: [(u) => `😉 ${u} winks`]
        },
        smile: {
            target: [(u, t) => `😊 ${u} smiles at ${t}!`],
            solo: [(u) => `😊 ${u} smiles`]
        },
        blush: {
            target: [(u, t) => `😳 ${u} blushes at ${t}!`],
            solo: [(u) => `😳 ${u} is blushing...`]
        },
        cry: {
            target: [(u, t) => `😭 ${u} cries because of ${t}...`],
            solo: [(u) => `😭 ${u} cries...`]
        },
        dance: {
            target: [(u, t) => `💃 ${u} dances with ${t}!`],
            solo: [(u) => `💃 ${u} dances alone`]
        },
        yeet: {
            target: [(u, t) => `💨 ${u} YEETS ${t}!`],
            solo: [(u) => `💨 ${u} yeets something invisible`]
        },
        nom: {
            target: [(u, t) => `🍖 ${u} noms on ${t}!`],
            solo: [(u) => `🍖 ${u} is eating...`]
        },
        glomp: {
            target: [(u, t) => `💥 ${u} glomps ${t}!`],
            solo: [(u) => `💥 ${u} jumps around wildly`]
        },
        bonk: {
            target: [(u, t) => `🔨 ${u} bonks ${t}!`],
            solo: [(u) => `🔨 ${u} bonks themselves`]
        },
        kick: {
            target: [(u, t) => `🦶 ${u} kicks ${t}!`],
            solo: [(u) => `🦶 ${u} kicks air`]
        },
        punch: {
            target: [(u, t) => `👊 ${u} punches ${t}!`],
            solo: [(u) => `👊 ${u} shadowboxes`]
        },
        handhold: {
            target: [(u, t) => `🤝 ${u} holds ${t}'s hand`],
            solo: [(u) => `🤝 ${u} holds their own hand...`]
        },
        sleep: {
            target: [(u, t) => `😴 ${u} falls asleep next to ${t}`],
            solo: [(u) => `😴 ${u} falls asleep...`]
        },
        happy: {
            target: [(u, t) => `😄 ${u} is happy with ${t}!`],
            solo: [(u) => `😄 ${u} is happy!`]
        }
    };

    const action = texts[type];
    if (!action) return `${userTag} does something...`;

    const list = target ? action.target : action.solo;
    const fn = list[Math.floor(Math.random() * list.length)];

    return target ? fn(userTag, targetTag) : fn(userTag);
}