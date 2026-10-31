/* =====================================================================
   ДВИЖОК. Данные — в data.js.
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const esc = (s) =>
    String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );
const pad = (n) => String(n).padStart(2, "0");
const isMobile = () => matchMedia("(max-width:860px)").matches;

/* Линейный список шагов: остановка, затем её экспонаты (для остановок с museum) */
const items = [];
TOUR.stops.forEach((s, si) => {
    items.push({ s: si, e: -1 });
    (s.museum?.exhibits || []).forEach((_, ei) => items.push({ s: si, e: ei }));
});
const state = { pos: -1, visited: new Set(), floor: 1 };
const DEBUG = new URLSearchParams(location.search).has("debug");
let map = null,
    placemarks = [];

const curStop = () => (state.pos < 0 ? -1 : items[state.pos].s);
const stopPos = (si) => items.findIndex((it) => it.s === si && it.e === -1);
const exOf = (pos) => {
    const it = items[pos];
    return it.e < 0 ? null : TOUR.stops[it.s].museum.exhibits[it.e];
};
const museumOf = (pos) => TOUR.stops[items[pos].s].museum;
const nextPos = (pos) => {
    const it = items[pos],
        n = TOUR.stops[it.s].museum?.exhibits.length ?? 0;
    if (it.e >= 0 && it.e < n - 1) return pos + 1;
    return it.s + 1 < TOUR.stops.length ? stopPos(it.s + 1) : -1;
};
const prevPos = (pos) => {
    const it = items[pos];
    if (it.e > 0) return pos - 1;
    if (it.e === 0) return stopPos(it.s);
    if (it.s === 0) return -1;
    return stopPos(it.s - 1);
};
const card = () => $("card");

function placeholder(i, title) {
    const h = (215 + i * 23) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${h},55%,42%)"/><stop offset="1" stop-color="hsl(${(h + 40) % 360},60%,22%)"/></linearGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <text x="48" y="330" font-family="Unbounded,sans-serif" font-size="220" font-weight="700" fill="rgba(255,255,255,.18)">${pad(i + 1)}</text>
    <text x="52" y="530" font-family="Golos Text,sans-serif" font-size="34" fill="rgba(255,255,255,.85)">${esc(title)} — добавьте фото</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
    $("tourTitle").textContent = TOUR.title;
    $("tourSub").textContent = TOUR.subtitle;
    $("stCount").textContent = TOUR.stops.length;
    $("stops").innerHTML = TOUR.stops
        .map(
            (s, i) => `
    <li class="stop" data-i="${i}">
      <button><span class="num">${i + 1}</span>
        <span><h3>${esc(s.title)}</h3><small>${esc(s.subtitle)}${s.duration ? " · " + esc(s.duration) : ""}</small></span>
      </button>${i < TOUR.stops.length - 1 ? `<div class="leg" data-i="${i + 1}"></div>` : ""}</li>`,
        )
        .join("");
    $("stops")
        .querySelectorAll(".stop")
        .forEach(
            (li) =>
                (li.querySelector("button").onclick = () =>
                    openPos(stopPos(+li.dataset.i))),
        );
}
const stopVisited = (si) =>
    items.some((it, p) => it.s === si && state.visited.has(p));

function syncSidebar() {
    const cur = curStop();
    $("stops")
        .querySelectorAll(".stop")
        .forEach((li) => {
            const i = +li.dataset.i;
            li.classList.toggle("active", i === cur);
            li.classList.toggle("visited", stopVisited(i) && i !== cur);
            if (i === cur)
                li.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
    const done = TOUR.stops.filter((_, i) => stopVisited(i)).length;
    $("prog").style.width = (done / TOUR.stops.length) * 100 + "%";
    $("startBtn").textContent = state.visited.size
        ? "Продолжить экскурсию"
        : "Начать экскурсию";
}

/* ---------- Card ---------- */
function renderCard(pos) {
    const it = items[pos],
        s = TOUR.stops[it.s],
        ex = exOf(pos),
        o = ex || s,
        [lat, lon] = s.coords;
    const imgs = o.images?.length ? o.images : [{ src: "", caption: "" }];
    $("shots").innerHTML = imgs
        .map(
            (im) => `
    <figure class="shot"><img src="${esc(im.src || placeholder(pos, o.title))}" alt="${esc(im.caption || o.title)}" loading="lazy"
      data-ph="${placeholder(pos, o.title)}">${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ""}</figure>`,
        )
        .join("");
    $("shots")
        .querySelectorAll("img")
        .forEach((img) => {
            img.onerror = () => {
                img.onerror = null;
                img.src = img.dataset.ph;
            };
            img.onclick = () => openLightbox(img.src);
        });
    $("shots").scrollLeft = 0;
    $("dots").innerHTML =
        imgs.length > 1
            ? imgs
                  .map((_, k) => `<span class="${k ? "" : "on"}"></span>`)
                  .join("")
            : "";

    const texts = (o.text || []).map((t) => `<p class="t">${esc(t)}</p>`).join("");
    const plan = s.museum ? `<div class="plan" id="plan"></div>` : "";
    $("cardBody").innerHTML = ex
        ? `
    <p class="card-num">${pad(it.e + 1)}</p>
    <h2>${esc(ex.title)}</h2>
    <p class="card-sub">${esc(ex.room)} · экспонат ${it.e + 1} из ${s.museum.exhibits.length}</p>
    ${texts}
    ${plan}`
        : `
    <p class="card-num">${pad(it.s + 1)}</p>
    <h2>${esc(s.title)}</h2>
    <p class="card-sub">${esc(s.subtitle)}${s.duration ? " · " + esc(s.duration) : ""}</p>
    ${texts}
    ${s.facts?.length ? `<div class="facts">${s.facts.map(([k, v]) => `<div class="fact"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
    ${s.tip ? `<div class="tip">${esc(s.tip)}</div>` : ""}
    ${s.museum ? `<button class="enter" id="enterBtn">Осмотреть экспонаты</button>${plan}${exList(it.s)}` : ""}
    <div class="links">
      <a href="https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=pd" target="_blank" rel="noopener">Проложить маршрут сюда</a>
      <a href="https://yandex.ru/maps/?pt=${lon},${lat}&z=17&l=map" target="_blank" rel="noopener">Открыть в Яндекс Картах</a>
    </div>`;
    if (s.museum) {
        renderPlan();
        const b = $("enterBtn");
        if (b) b.onclick = () => openPos(stopPos(it.s) + 1);
        $("cardBody")
            .querySelectorAll(".exlist button")
            .forEach((b) => (b.onclick = () => openPos(+b.dataset.p)));
    }
    $("cardScroll").scrollTop = 0;
    $("prevBtn").disabled = prevPos(pos) < 0;
    $("nextBtn").textContent = nextPos(pos) < 0 ? "Завершить" : "Дальше";
}
$("shots").addEventListener("scroll", (e) => {
    const k = Math.round(e.target.scrollLeft / e.target.clientWidth);
    $("dots")
        .querySelectorAll("span")
        .forEach((d, j) => d.classList.toggle("on", j === k));
});

/* ---------- План музея ---------- */
function planSvg(pos, fwd, back) {
    const m = museumOf(pos),
        F = state.floor,
        it = items[pos],
        base = stopPos(it.s) + 1;
    const line = (path, cls) => {
        const runs = [];
        let run = [];
        (path || []).forEach((p) => {
            if (p && p[0] === F) run.push(p[1] + "," + p[2]);
            else {
                if (run.length > 1) runs.push(run);
                run = [];
            }
        });
        if (run.length > 1) runs.push(run);
        return runs
            .map((r) => `<polyline class="${cls}" points="${r.join(" ")}"/>`)
            .join("");
    };
    const edge = (p, dir, label) => {
        const tip = p[2] + dir * 40;
        return `<line class="ext" x1="${p[1]}" y1="${p[2]}" x2="${p[1]}" y2="${tip}"/><text class="extl" x="${p[1] + 18}" y="${tip + 12}">${label}</text>`;
    };

    let out = `<defs><marker id="arw" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z"/></marker></defs>`;
    m.exhibits.forEach((ex, k) => {
        if (ex.at[0] !== F) return;
        const cls =
            "room" +
            (k === it.e
                ? " cur"
                : state.visited.has(base + k) && base + k !== pos
                  ? " done"
                  : "");
        ex.areas.forEach(([x1, y1, x2, y2]) => {
            out += `<rect class="${cls}" x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}"/>`;
        });
    });
    out += line(fwd, "fwd");

    const entry = m.entry[0],
        exit = m.exhibits.at(-1).to.at(-1);
    if (entry[0] === F) out += edge(entry, -1, "Вход");
    if (exit[0] === F) out += edge(exit, 1, "Выход");
    return out;
}
function exList(si) {
    const base = stopPos(si) + 1;
    return `<ol class="exlist">${TOUR.stops[si].museum.exhibits
        .map(
            (ex, k) =>
                `<li><button data-p="${base + k}"><b>${k + 1}</b>${esc(ex.title)}<small>${esc(ex.room)}</small></button></li>`,
        )
        .join("")}</ol>`;
}
function planNote(pos, fwd) {
    const it = items[pos],
        m = museumOf(pos),
        F = state.floor;
    const change = fwd?.find((p) => p && p[0] !== F);
    if (change)
        return change[0] > F
            ? `Поднимитесь на ${change[0]} этаж по лестнице`
            : `Спуститесь на ${change[0]} этаж по лестнице`;
    const next = m.exhibits[it.e + 1];
    return next ? `Дальше — ${next.room}` : "Выход из музея";
}
function renderPlan() {
    const el = $("plan");
    if (!el || state.pos < 0) return;
    const pos = state.pos,
        it = items[pos],
        m = museumOf(pos),
        ex = exOf(pos);
    const fwd = ex ? [ex.at, ...ex.to] : m.entry;
    const back = it.e === 0 ? m.entry : it.e > 0 ? m.exhibits[it.e - 1].to : null;
    el.innerHTML = `
    <div class="seg">${Object.keys(m.plan)
        .map(
            (f) =>
                `<button data-f="${f}" class="${+f === state.floor ? "on" : ""}">${f} этаж</button>`,
        )
        .join("")}</div>
    <div class="plan-box">
      <img src="${m.plan[state.floor]}" alt="План ${state.floor} этажа">
      <svg viewBox="0 0 ${m.size[0]} ${m.size[1]}" preserveAspectRatio="none">${planSvg(pos, fwd, back)}</svg>
    </div>
    <p class="plan-note">${planNote(pos, fwd)}</p>`;
    el.querySelectorAll("button").forEach(
        (b) =>
            (b.onclick = () => {
                state.floor = +b.dataset.f;
                renderPlan();
            }),
    );
    el.querySelector(".plan-box").onclick = (e) => {
        if (!DEBUG) return openPlanFs();
        const r = el.querySelector("svg").getBoundingClientRect();
        const x = Math.round(((e.clientX - r.left) / r.width) * m.size[0]),
            y = Math.round(((e.clientY - r.top) / r.height) * m.size[1]);
        const txt = `[${state.floor}, ${x}, ${y}]`;
        el.querySelector(".plan-note").textContent = txt;
        navigator.clipboard?.writeText(txt);
    };
}
function openPlanFs() {
    $("planFsInner").innerHTML = $("plan").querySelector(".plan-box").outerHTML;
    $("planFs").classList.add("open");
}
$("planFs").onclick = () => $("planFs").classList.remove("open");

/* ---------- Открытие и закрытие ---------- */
function openPos(pos) {
    if (pos < 0 || pos >= items.length) return;
    if (pos < state.pos)
        [...state.visited].forEach((p) => p > pos && state.visited.delete(p));
    state.pos = pos;
    state.visited.add(pos);
    const ex = exOf(pos);
    state.floor = ex ? ex.at[0] : 1;
    renderCard(pos);
    card().classList.add("open");
    card().classList.remove("collapsed");
    syncSidebar();
    syncPins();
    flyTo(items[pos].s);
}
function closeCard() {
    card().classList.remove("open", "collapsed");
    state.pos = -1;
    syncSidebar();
    syncPins();
}
function setCollapsed(on) {
    card().classList.toggle("collapsed", on);
}
$("closeBtn").onclick = closeCard;
$("prevBtn").onclick = () => openPos(prevPos(state.pos));
$("nextBtn").onclick = () => {
    const n = nextPos(state.pos);
    if (n < 0) {
        closeCard();
        fitAll();
    } else openPos(n);
};
$("startBtn").onclick = () => {
    const next = items.findIndex((_, p) => !state.visited.has(p));
    openPos(next === -1 ? 0 : next);
};

/* Ручка карточки: тап сворачивает/разворачивает, протяжка вниз (телефон) или вправо (десктоп) — свернуть,
   вверх или влево — развернуть. Сворачивание не сбрасывает текущую остановку, поэтому синяя линия остаётся. */
let peekStart = null;
$("peek").onpointerdown = (e) => {
    peekStart = [e.clientX, e.clientY];
    $("peek").setPointerCapture(e.pointerId);
};
$("peek").onpointerup = (e) => {
    if (!peekStart) return;
    const dx = e.clientX - peekStart[0],
        dy = e.clientY - peekStart[1];
    peekStart = null;
    const d = isMobile() ? dy : dx;
    const collapsed = card().classList.contains("collapsed");
    if (Math.abs(d) < 10) setCollapsed(!collapsed);
    else if (d > 40) setCollapsed(true);
    else if (d < -40) setCollapsed(false);
};
$("peek").onpointercancel = () => (peekStart = null);

document.addEventListener("keydown", (e) => {
    if ($("planFs").classList.contains("open")) {
        if (e.key === "Escape") $("planFs").classList.remove("open");
        return;
    }
    if ($("lightbox").classList.contains("open")) {
        if (e.key === "Escape") $("lightbox").classList.remove("open");
        return;
    }
    if (state.pos < 0) return;
    if (e.key === "Escape") closeCard();
    if (e.key === "ArrowRight") $("nextBtn").click();
    if (e.key === "ArrowLeft") $("prevBtn").click();
});
function openLightbox(src) {
    $("lightbox").querySelector("img").src = src;
    $("lightbox").classList.add("open");
}
$("lightbox").onclick = () => $("lightbox").classList.remove("open");

/* ---------- Map ---------- */
function loadYmaps() {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(YANDEX_API_KEY)}&lang=ru_RU`;
        s.onload = () => (window.ymaps ? ymaps.ready(resolve) : reject());
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

function initMap() {
    map = new ymaps.Map(
        "map",
        {
            center: TOUR.stops[0].coords,
            zoom: 14,
            controls: ["zoomControl", "fullscreenControl"],
        },
        { suppressMapOpenBlock: true },
    );
    const Pin = ymaps.templateLayoutFactory.createClass(
        '<div class="pin{% if properties.active %} is-active{% endif %}{% if properties.visited %} is-visited{% endif %}">{{ properties.num }}</div>',
    );

    placemarks = TOUR.stops.map((s, i) => {
        const pm = new ymaps.Placemark(
            s.coords,
            {
                num: i + 1,
                hintContent: s.title,
                active: false,
                visited: false,
            },
            {
                iconLayout: Pin,
                iconShape: {
                    type: "Circle",
                    coordinates: [0, 0],
                    radius: 20,
                },
                hasBalloon: false,
                zIndex: 100,
            },
        );
        pm.events.add("click", () => openPos(stopPos(i)));
        map.geoObjects.add(pm);
        return pm;
    });
    drawRoute();
    fitAll();
}

/* ---------- Маршруты: пешком и транспорт ---------- */
const WALK = { color: "#3B4656", width: 4, dash: "shortdash" };
// Цвета транспорта подобраны так, чтобы не совпадать с цветами веток метро
const TRANSIT = {
    metro: { icon: "🚇", label: "Метро", color: "#6B7280" },
    bus: { icon: "🚌", label: "Автобус", color: "#00A3A3" },
    tram: { icon: "🚋", label: "Трамвай", color: "#C98A00" },
    trolleybus: {
        icon: "🚎",
        label: "Троллейбус",
        color: "#4DB5E6",
    },
    minibus: { icon: "🚐", label: "Маршрутка", color: "#C2478F" },
};
const legs = [],
    legMode = [],
    legObjs = []; // индекс i — участок от остановки i-1 к остановке i
let routeFailed = false,
    HtmlLayout = null;

const fmtMin = (m) => {
    m = Math.max(1, Math.round(m));
    return m >= 60
        ? Math.floor(m / 60) + " ч " + (m % 60) + " мин"
        : m + " мин";
};
const fmtDist = (m) =>
    m >= 1000
        ? (m / 1000).toFixed(1).replace(".", ",") + " км"
        : Math.round(m) + " м";
const toLL = (c) => [c[1], c[0]];
function haversine(a, b) {
    const R = 6371000,
        r = Math.PI / 180,
        dLat = (b[0] - a[0]) * r,
        dLon = (b[1] - a[1]) * r;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
function pathLen(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) d += haversine(pts[i - 1], pts[i]);
    return d;
}
function midPoint(pts) {
    const half = pathLen(pts) / 2;
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
        const s = haversine(pts[i - 1], pts[i]);
        if (d + s >= half) {
            const t = s ? (half - d) / s : 0;
            return [
                pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
                pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
            ];
        }
        d += s;
    }
    return pts[0];
}

// Не больше 3 запросов к сервису одновременно
let running = 0;
const waiting = [];
function schedule(fn) {
    return new Promise((res, rej) => {
        const run = () => {
            running++;
            fn()
                .then(res, rej)
                .finally(() => {
                    running--;
                    const n = waiting.shift();
                    if (n) n();
                });
        };
        running < 3 ? run() : waiting.push(run);
    });
}

async function requestPath(profile, pts) {
    // profile: "foot" | "car"; pts: [[lat,lon],...]
    if (ROUTING.provider === "ors") {
        const r = await fetch(
            "https://api.openrouteservice.org/v2/directions/" +
                (profile === "foot" ? "foot-walking" : "driving-car") +
                "/geojson",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: ROUTING.orsKey,
                },
                body: JSON.stringify({
                    coordinates: pts.map((c) => [c[1], c[0]]),
                }),
            },
        );
        if (!r.ok) throw new Error("ORS " + r.status);
        const f = (await r.json()).features[0];
        return {
            pts: f.geometry.coordinates.map(toLL),
            dist: f.properties.summary.distance,
        };
    }
    const url =
        "https://routing.openstreetmap.de/" +
        (profile === "foot"
            ? "routed-foot/route/v1/foot/"
            : "routed-car/route/v1/driving/") +
        pts.map((c) => c[1] + "," + c[0]).join(";") +
        "?overview=full&geometries=geojson";
    const r = await fetch(url);
    if (!r.ok) throw new Error("FOSSGIS " + r.status);
    const j = await r.json();
    if (j.code !== "Ok") throw new Error("FOSSGIS " + j.code);
    return {
        pts: j.routes[0].geometry.coordinates.map(toLL),
        dist: j.routes[0].distance,
    };
}
async function getPath(profile, pts) {
    const key =
        "route:" +
        ROUTING.provider +
        ":" +
        profile +
        ":" +
        pts.map((c) => c.join(",")).join(";");
    try {
        const c = localStorage.getItem(key);
        if (c) return JSON.parse(c);
    } catch (e) {}
    const res = await schedule(() => requestPath(profile, pts));
    try {
        localStorage.setItem(key, JSON.stringify(res));
    } catch (e) {}
    return res;
}

async function walkPiece(a, b) {
    let res = null;
    if (TOUR.routeMode === "pedestrian") {
        try {
            res = await getPath("foot", [a, b]);
        } catch (e) {
            console.warn("Пеший маршрут не построен:", e);
            routeFailed = true;
        }
    }
    if (!res) res = { pts: [a, b], dist: haversine(a, b) * 1.3 };
    return {
        kind: "walk",
        pts: res.pts,
        dist: res.dist,
        min: res.dist / 80,
    }; // ~4,8 км/ч
}
async function transitPiece(it) {
    const t = TRANSIT[it.mode] || TRANSIT.bus;
    const stations = it.points || it.stops;
    let pts = it.points;
    if (!pts) {
        pts = it.stops;
        if (TOUR.routeMode === "pedestrian") {
            try {
                pts = (await getPath("car", it.stops)).pts;
            } catch (e) {
                console.warn("Линия транспорта не построена по дорогам:", e);
                routeFailed = true;
            }
        }
    }
    return {
        kind: "transit",
        mode: it.mode,
        color: it.color || t.color,
        icon: t.icon,
        label: it.label || t.label,
        pts,
        stations,
        board: pts[0],
        alight: pts[pts.length - 1],
        min: it.min || 0,
        dist: pathLen(pts),
    };
}

// Сшивает куски участка в непрерывную линию. Транспортные линии не меняем:
// пешие куски дотягиваем до точек посадки/высадки, а где пешего нет, добавляем короткую соединительную линию.
function stitch(segs, from, to) {
    const out = [];
    let cur = from;
    const connect = (p) => {
        const d = haversine(cur, p);
        if (d < 1) return;
        const last = out[out.length - 1];
        if (last && last.kind === "walk") last.pts = last.pts.concat([p]);
        else
            out.push({
                kind: "walk",
                pts: [cur, p],
                dist: d,
                min: d / 80,
            });
        cur = p;
    };
    segs.forEach((s) => {
        if (s.kind === "walk") {
            if (haversine(cur, s.pts[0]) >= 1) s.pts = [cur].concat(s.pts);
            out.push(s);
            cur = s.pts[s.pts.length - 1];
        } else {
            connect(s.board);
            out.push(s);
            cur = s.alight;
        }
    });
    connect(to);
    return out;
}

async function buildLeg(i) {
    const from = TOUR.stops[i - 1].coords,
        to = TOUR.stops[i].coords,
        best = TOUR.stops[i].best;
    const w = await walkPiece(from, to);
    const leg = {
        walk: {
            segs: stitch([w], from, to),
            min: w.min,
            dist: w.dist,
        },
        best: null,
    };
    if (best && best.length) {
        const segs = [];
        let cur = from;
        const gap = async (p) => {
            if (haversine(cur, p) > 25) segs.push(await walkPiece(cur, p));
            cur = p;
        };
        for (const it of best) {
            const st = it.points || it.stops;
            await gap(st[0]);
            segs.push(await transitPiece(it));
            cur = st[st.length - 1];
        }
        await gap(to);
        const joined = stitch(segs, from, to);
        leg.best = {
            segs: joined,
            min: joined.reduce((a, s) => a + s.min, 0),
            dist: joined.reduce((a, s) => a + s.dist, 0),
        };
    }
    return leg;
}

// Самый быстрый вариант участка: транспорт только если он реально быстрее пешком
const fastest = (i) =>
    legs[i].best && legs[i].best.min < legs[i].walk.min ? "best" : "walk";
const hasSwitch = (i) => !!(legs[i] && legs[i].best);

function drawLeg(i) {
    (legObjs[i] || []).forEach((o) => map.geoObjects.remove(o));
    legObjs[i] = [];
    const add = (o) => {
        map.geoObjects.add(o);
        legObjs[i].push(o);
    };
    const html = (pt, h, z) =>
        add(
            new ymaps.Placemark(
                pt,
                { html: h },
                {
                    iconLayout: HtmlLayout,
                    interactivityModel: "default#transparent",
                    hasBalloon: false,
                    zIndex: z,
                },
            ),
        );
    const segs = legs[i][legMode[i]].segs;

    segs.forEach((s, k) => {
        if (s.kind === "walk") {
            const pl = new ymaps.Polyline(
                s.pts,
                {},
                {
                    strokeColor: WALK.color,
                    strokeWidth: WALK.width,
                    strokeStyle: WALK.dash,
                    strokeOpacity: 0.9,
                    zIndex: 10,
                    interactivityModel: "default#transparent",
                },
            );
            pl.base = {
                color: WALK.color,
                width: WALK.width,
                opacity: 0.9,
                z: 10,
                walk: true,
            };
            add(pl);
            return;
        }
        const pl = new ymaps.Polyline(
            s.pts,
            {},
            {
                strokeColor: s.color,
                strokeWidth: 6,
                strokeOpacity: 0.95,
                zIndex: 11,
                interactivityModel: "default#transparent",
            },
        );
        pl.base = {
            color: s.color,
            width: 6,
            opacity: 0.95,
            z: 11,
        };
        add(pl);
        s.stations
            .slice(1, -1)
            .forEach((p) =>
                html(
                    p,
                    `<div class="tdot" style="border-color:${s.color}"></div>`,
                    20,
                ),
            );
        const hadBefore = segs.slice(0, k).some((x) => x.kind === "transit"),
            hasAfter = segs.slice(k + 1).some((x) => x.kind === "transit");
        const stopHtml = (tr) =>
            `<div class="tstop" style="border-color:${s.color};${tr ? `box-shadow:0 0 0 3px #fff,0 0 0 6px ${s.color}` : ""}"></div>`;
        html(s.board, stopHtml(hadBefore), 30); // посадка (при пересадке — с кольцом)
        html(s.alight, stopHtml(hasAfter), 30); // высадка
        html(
            midPoint(s.pts),
            `<div class="tbadge" style="border-color:${s.color}">${s.icon} ${esc(s.label)}${s.min ? " · " + fmtMin(s.min) : ""}</div>`,
            40,
        );
    });
    styleLeg(i);
}

// Участок к текущей остановке — толще и ярче, пройденные — бледнее (толщина не меняется)
function styleLeg(i) {
    const current = i === curStop();
    const passed = i < curStop();
    const accent =
        getComputedStyle(document.documentElement)
            .getPropertyValue("--accent")
            .trim() || "#1F4FD8";
    (legObjs[i] || []).forEach((o) => {
        if (!o.base) return;
        const b = o.base;
        o.options.set({
            strokeColor: current && b.walk ? accent : b.color,
            strokeWidth: b.width + (current ? 2 : 0),
            strokeOpacity: current ? 1 : passed ? 0.35 : b.opacity,
            zIndex: b.z + (current ? 5 : 0),
        });
    });
}
function styleLegs() {
    for (let i = 1; i < TOUR.stops.length; i++) styleLeg(i);
}

function bestIcon(i) {
    const L = legs[i];
    if (L.best.min < L.walk.min) return "⚡";
    const t = L.best.segs.find((s) => s.kind === "transit");
    return t ? t.icon : "🚇";
}
function renderLegs() {
    document.querySelectorAll(".leg").forEach((el) => {
        const i = +el.dataset.i,
            L = legs[i];
        if (!L) {
            el.innerHTML = "";
            return;
        }
        if (hasSwitch(i)) {
            el.innerHTML = `<div class="seg" role="group" aria-label="Как добраться">
        <button data-m="walk" class="${legMode[i] === "walk" ? "on" : ""}">🚶 ${fmtMin(L.walk.min)}</button>
        <button data-m="best" class="${legMode[i] === "best" ? "on" : ""}">${bestIcon(i)} ${fmtMin(L.best.min)}</button></div>`;
            el.querySelectorAll("button").forEach(
                (b) => (b.onclick = () => setLegMode(i, b.dataset.m)),
            );
        } else {
            el.innerHTML = `<span class="leg-info">🚶 ${fmtMin(L.walk.min)}</span>`;
        }
    });
}
function updateStats() {
    let m = 0,
        min = 0;
    for (let i = 1; i < TOUR.stops.length; i++) {
        if (!legs[i]) return;
        const v = legs[i][legMode[i]];
        m += v.dist;
        min += v.min;
    }
    $("stDist").textContent = fmtDist(m);
    $("stTime").textContent = fmtMin(min);
}
function setLegMode(i, m) {
    legMode[i] = m;
    drawLeg(i);
    renderLegs();
    updateStats();
}

function drawRoute() {
    HtmlLayout = ymaps.templateLayoutFactory.createClass(
        "{{ properties.html|raw }}",
    );
    const wantBest = TOUR.defaultMode === "best";
    Promise.all(
        TOUR.stops.slice(1).map((_, k) => {
            const i = k + 1;
            return buildLeg(i).then((L) => {
                legs[i] = L;
                legMode[i] =
                    wantBest && hasSwitch(i) ? fastest(i) : "walk";
                drawLeg(i);
                renderLegs();
            });
        }),
    )
        .then(() => updateStats())
        .catch((e) => {
            console.error(e);
            notice(
                "Не удалось построить маршруты. Подробности в консоли браузера.",
            );
        });
}

function syncPins() {
    const cur = curStop();
    placemarks.forEach((pm, i) => {
        pm.properties.set({
            active: i === cur,
            visited: stopVisited(i) && i !== cur,
        });
        pm.options.set("zIndex", i === cur ? 1000 : 100);
    });
    styleLegs();
}

// Центрируем точку в видимой части карты: слева от карточки на десктопе, над шторкой на телефоне
function flyTo(si) {
    if (!map) return;
    const zoom = Math.max(map.getZoom(), 16),
        proj = map.options.get("projection");
    const px = proj.toGlobalPixels(TOUR.stops[si].coords, zoom);
    const shown =
        card().classList.contains("open") &&
        !card().classList.contains("collapsed");
    const off = isMobile()
        ? [0, shown ? $("map").clientHeight * 0.33 : 0]
        : [shown ? (card().offsetWidth + 16) / 2 : 0, 0];
    map.setCenter(
        proj.fromGlobalPixels([px[0] + off[0], px[1] + off[1]], zoom),
        zoom,
        { duration: 500 },
    );
}
function fitAll() {
    if (!map) return;
    map.setBounds(
        ymaps.util.bounds.fromPoints(TOUR.stops.map((s) => s.coords)),
        {
            checkZoomRange: true,
            zoomMargin: isMobile() ? 40 : [60, 60, 60, 60],
            duration: 400,
        },
    );
}

function notice(html) {
    $("notice").innerHTML = html;
    $("notice").hidden = false;
}

/* ---------- Start ---------- */
renderSidebar();
syncSidebar();
if (YANDEX_API_KEY.includes("ВСТАВЬТЕ")) {
    notice(
        "Карта не загружена: укажите ключ в <code>YANDEX_API_KEY</code> в файле data.js. Список остановок и карточки уже работают.",
    );
} else {
    loadYmaps()
        .then(initMap)
        .catch(() =>
            notice(
                "Не удалось загрузить Яндекс Карты. Проверьте ключ, интернет и ограничение ключа по домену (HTTP Referer).",
            ),
        );
}
