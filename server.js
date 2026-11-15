// Bingo Duel server (no dependencies). Run: node server.js -> http://localhost:3000
// The server is the only authority: it owns cards, validates picks, lines, claims and verification.
const os = require("os"), http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = process.env.PORT || 3000;
// Set PUBLIC_URL to your deployed domain or temporary tunnel URL, e.g. https://your-app.example.com
const LINES_TO_WIN = 5;                     // 5 completed lines = B-I-N-G-O
const rooms = {};
const FILES = { "/": "index.html", "/index.html": "index.html", "/file.js": "file.js", "/style.css": "style.css" };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LINES = [];
for (let i = 0; i < 5; i++) { LINES.push([0,1,2,3,4].map(j => i*5+j), [0,1,2,3,4].map(j => j*5+i)); }
LINES.push([0,6,12,18,24], [4,8,12,16,20]);

const shuffle = a => { for (let i = a.length-1; i > 0; i--) { const j = crypto.randomInt(i+1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const newCard = r => { let c, k; do { c = shuffle(Array.from({length:25}, (_, i) => i+1)); k = c.join(); } while (r.used.has(k)); r.used.add(k); return c; };
const newCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let c; do { c = Array.from({length:5}, () => A[crypto.randomInt(A.length)]).join(""); } while (rooms[c]); return c; };
const lines = (r, p) => { const c = new Set(r.called.map(x => x.n)); return LINES.filter(l => l.every(i => c.has(p.card[i]))); };
const opp = (r, id) => [...r.players.values()].find(p => p.id !== id);

function snap(r, p) {
    const cl = r.claim, cp = cl && r.players.get(cl.by), mine = lines(r, p);
    return {
        code: r.code, phase: r.phase, turn: r.turn, called: r.called, msg: r.msg, winnerId: r.winnerId,
        you: { id: p.id, host: p.id === r.hostId, card: p.card, cells: [...new Set(mine.flat())], count: mine.length, canClaim: r.phase === "claiming" && mine.length >= LINES_TO_WIN },
        players: [...r.players.values()].map(q => ({ id: q.id, name: q.name, host: q.id === r.hostId, online: q.online })),
        remaining: (r.phase === "verifying" || r.phase === "over") ? Object.fromEntries([...r.players.values()].map(q => [q.id, q.card.filter(n => !r.called.some(c => c.n === n))])) : null,
        claim: cl && { by: cl.by, nums: cl.cells.map(i => cp.card[i]) },
        final: r.phase === "over" ? { cards: Object.fromEntries([...r.players.values()].map(q => [q.id, q.card])), cells: r.winCells } : null
    };
}
const broadcast = r => { for (const p of r.players.values()) if (p.res) p.res.write(`data: ${JSON.stringify(snap(r, p))}\n\n`); };
function reset(r, phase) {
    clearTimeout(r.timer);
    Object.assign(r, { phase, called: [], claim: null, winnerId: null, winCells: null, msg: "", used: new Set(), turn: phase === "playing" ? r.turn : null });
    for (const p of r.players.values()) p.card = newCard(r);
}
function resolve(r, rejected) {                  // server re-validates the claim, whatever the opponent pressed
    clearTimeout(r.timer);
    const c = r.claim, p = r.players.get(c.by);
    if (lines(r, p).length >= LINES_TO_WIN) {
        Object.assign(r, { phase: "over", winnerId: p.id, winCells: c.cells, msg: rejected ? `Rejection overruled: ${p.name}'s BINGO is valid!` : `${p.name} completed a valid BINGO!` });
    } else { r.claim = null; r.phase = "playing"; r.msg = "The claim was invalid. Game resumes."; }
    broadcast(r);
}
const addPlayer = (r, name) => {
    const p = { id: crypto.randomBytes(8).toString("hex"), name: String(name || "").trim().slice(0, 20) || "Player", res: null, online: false };
    p.card = newCard(r); r.players.set(p.id, p); return p;
};
const lanUrls = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === "IPv4" && !i.internal).map(i => `http://${i.address}:${PORT}`);
const body = req => new Promise(ok => { let b = ""; req.on("data", c => b += c); req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch { ok({}); } }); });
const send = (res, code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };

http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (req.method === "GET" && FILES[url.pathname]) {
        const f = FILES[url.pathname];
        return fs.readFile(path.join(__dirname, f), (e, d) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] }); res.end(d); });
    }
    if (req.method === "GET" && url.pathname === "/api/config") return send(res, 200, { publicUrl: process.env.PUBLIC_URL || "", urls: lanUrls() });
    if (req.method === "GET" && url.pathname === "/api/info") {
        const r = rooms[(url.searchParams.get("code") || "").toUpperCase()];
        return r ? send(res, 200, { host: r.players.get(r.hostId).name, full: r.players.size >= 2 }) : send(res, 404, { error: "Room not found" });
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
        const r = rooms[url.searchParams.get("code")], p = r && r.players.get(url.searchParams.get("id"));
        if (!p) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
        p.res = res; p.online = true;
        // Keep proxy-hosted SSE connections alive and prevent idle timeouts.
        const heartbeat = setInterval(() => { if (p.res === res) res.write(": ping\n\n"); }, 20000);
        req.on("close", () => {
            clearInterval(heartbeat);
            if (p.res === res) { p.res = null; p.online = false; broadcast(r); }
            setTimeout(() => { if (![...r.players.values()].some(q => q.online)) { clearTimeout(r.timer); delete rooms[r.code]; } }, 600000);
        });
        return broadcast(r);
    }
    if (req.method !== "POST") { res.writeHead(404); return res.end(); }
    const b = await body(req);
    if (url.pathname === "/api/create") {
        const r = { code: newCode(), players: new Map(), hostId: null, used: new Set() };
        const p = addPlayer(r, b.name); r.hostId = p.id; reset(r, "lobby"); rooms[r.code] = r;
        return send(res, 200, { code: r.code, id: p.id });
    }
    const r = rooms[String(b.code || "").toUpperCase()];
    if (!r) return send(res, 404, { error: "Room not found" });
    if (url.pathname === "/api/join") {
        if (r.players.size >= 2) return send(res, 400, { error: "This room already has two players" });
        const p = addPlayer(r, b.name); broadcast(r); return send(res, 200, { code: r.code, id: p.id });
    }
    const me = r.players.get(b.id), o = me && opp(r, me.id);
    if (!me) return send(res, 403, { error: "Not in this room" });
    const bad = m => send(res, 400, { error: m });
    switch (url.pathname) {
        case "/api/start":
            if (me.id !== r.hostId) return bad("Only the host can start");
            if (!o) return bad("Wait for your friend to join");
            if (r.phase !== "lobby") return bad("Already started");
            r.phase = "playing"; r.turn = r.hostId; broadcast(r); return send(res, 200, {});
        case "/api/pick": {
            const n = Number(b.n);
            if (r.phase !== "playing" || r.turn !== me.id) return bad("Not your turn");
            if (!Number.isInteger(n) || n < 1 || n > 25 || r.called.some(c => c.n === n)) return bad("Number not available");
            r.called.push({ n, by: me.id }); r.turn = o.id; r.msg = "";
            const w = [...r.players.values()].filter(p => lines(r, p).length >= LINES_TO_WIN);
            if (w.length) { r.phase = "claiming"; r.msg = "A BINGO is being checked. Selection paused."; }
            broadcast(r); return send(res, 200, {});
        }
        case "/api/claim": {
            const L = lines(r, me);
            if (r.phase !== "claiming" || L.length < LINES_TO_WIN) return bad("No completed line to claim");
            r.claim = { by: me.id, cells: L[0] }; r.phase = "verifying"; r.msg = `${me.name} has claimed BINGO!`;
            if (!o.online) resolve(r, false);
            else { r.timer = setTimeout(() => r.claim && r.phase === "verifying" && resolve(r, false), 20000); broadcast(r); }
            return send(res, 200, {});
        }
        case "/api/verify": case "/api/reject":
            if (r.phase !== "verifying" || r.claim.by === me.id) return bad("Nothing to verify");
            resolve(r, url.pathname === "/api/reject"); return send(res, 200, {});
        case "/api/again":
            if (r.phase !== "over") return bad("Game not finished");
            r.turn = r.winnerId === me.id ? o.id : me.id; reset(r, "playing"); broadcast(r); return send(res, 200, {});
        case "/api/lobby":
            if (r.phase !== "over") return bad("Game not finished");
            reset(r, "lobby"); broadcast(r); return send(res, 200, {});
    }
    bad("Bad request");
}).listen(PORT, "0.0.0.0", () => {
    console.log(`Bingo Duel running on port ${PORT}`);
    if (process.env.PUBLIC_URL) console.log(`Public invite base: ${process.env.PUBLIC_URL}`);
    else lanUrls().forEach(u => console.log(`  Same-Wi-Fi invite base: ${u}`));
});
