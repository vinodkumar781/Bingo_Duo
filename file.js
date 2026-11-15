const $ = s => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
let me = null, S = null, es = null, titles = [], lastCalled = 0, lastKey = "";

const boardEl = $("#board"), cells = [];
for (let i = 0; i < 25; i++) {
    const b = el("button", "box square");
    b.addEventListener("click", () => pick(Number(b.textContent)));
    boardEl.appendChild(b); cells.push(b);
}

async function post(path, extra) {
    try {
        const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...me, ...extra }) });
        const d = await res.json();
        if (!res.ok) { alert(d.error || "Something went wrong"); return null; }
        return d;
    } catch (e) {
        alert(location.protocol === "file:" ? "Open the game through the server: run 'node server.js' then visit http://localhost:3000"
            : "Cannot reach the game server. Make sure 'node server.js' is running.");
        return null;
    }
}
const pick = n => { if (S && S.phase === "playing" && S.turn === me.id) post("/api/pick", { n }); };
const nameOf = id => (S.players.find(p => p.id === id) || {}).name || "";
const getName = () => $("#player1").value.trim() || "Player";

// ----- create / join via invite link -----
const inviteCode = (new URLSearchParams(location.search).get("room") || "").toUpperCase();
if (location.protocol === "file:") { $("#join-info").textContent = "Run 'node server.js' and open http://localhost:3000"; $("#join-info").style.display = "block"; }
else if (inviteCode) {
    fetch("/api/info?code=" + inviteCode).then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
        $("#join-info").style.display = "block";
        if (ok && !d.full) {
            $("#join-info").textContent = `${d.host} invited you to a Bingo Duel! Enter your username to join.`;
            $("#create-room").style.display = "none"; $("#join-room").style.display = "block";
        } else $("#join-info").textContent = ok ? "This room already has two players." : "This invite link is no longer valid.";
    }).catch(() => {});
}
async function enter(path, extra) { me = null; const d = await post(path, extra); if (d) connect(d); }
$("#create-room").onclick = () => enter("/api/create", { name: getName() });
$("#join-room").onclick = () => enter("/api/join", { name: getName(), code: inviteCode });
$("#start-game").onclick = () => post("/api/start");
$("#claim-btn").onclick = () => post("/api/claim");
$("#random-pick").onclick = () => {
    const done = new Set(S.called.map(c => c.n)), left = S.you.card.filter(n => !done.has(n));
    pick(left[Math.floor(Math.random() * left.length)]);
};
$("#copy-link").onclick = () => {
    const i = $("#invite-link"); i.select();
    (navigator.clipboard ? navigator.clipboard.writeText(i.value) : Promise.reject()).catch(() => document.execCommand("copy"));
    $("#copy-link").textContent = "Copied!"; setTimeout(() => $("#copy-link").textContent = "Copy Invite Link", 1500);
};
$("#share-link").onclick = () => {
    const url = $("#invite-link").value;
    if (navigator.share) navigator.share({ title: "Bingo Duel", text: "Join my Bingo Duel!", url }).catch(() => {});
    else $("#copy-link").click();
};

function connect(d) {
    me = { id: d.id, code: d.code };
    try { sessionStorage.setItem("bingo-session", JSON.stringify(me)); } catch (e) {}
    if (es) es.close();
    es = new EventSource(`/api/events?code=${me.code}&id=${me.id}`);
    es.onmessage = e => render(JSON.parse(e.data));
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) { try { sessionStorage.removeItem("bingo-session"); } catch (e) {} location.href = location.pathname; } };
}

let base = location.origin, prevCalled = new Set(), prevCount = {}, confettiKey = "";
// Prefer an explicitly configured public URL (ngrok/deployed domain). On a
// local development server, fall back to the first LAN address for same-Wi-Fi play.
fetch("/api/config").then(r => r.json()).then(c => {
    if (c.publicUrl) base = c.publicUrl.replace(/\/$/, "");
    else if (/^(localhost|127\.)/.test(location.hostname) && c.urls && c.urls[0]) base = c.urls[0];
    if (S) $("#invite-link").value = `${base}/?room=${S.code}`;
}).catch(() => {});

function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove("show"), 1800); }
function confetti() {
    const cols = ["#D45757", "#4CAF50", "#CB4B16", "#eee8d5", "#586E75"];
    for (let i = 0; i < 60; i++) {
        const c = el("span", "conf"); c.style.left = Math.random() * 100 + "vw"; c.style.background = cols[i % 5];
        c.style.animationDelay = Math.random() * 1.2 + "s"; document.body.appendChild(c); setTimeout(() => c.remove(), 5000);
    }
}

function render(s) {
    S = s;
    const opp = s.players.find(p => p.id !== me.id), lobby = s.phase === "lobby";
    const myTurn = s.phase === "playing" && s.turn === me.id;
    const called = new Set(s.called.map(c => c.n)), win = new Set(s.you.cells);

    $("#setup").style.display = "none";
    document.body.classList.add("inroom");
    document.body.classList.toggle("game-started", !lobby);
    $("#room-info").style.display = lobby ? "flex" : "none";
    $("#room-code-label").textContent = s.code;
    $("#invite-link").value = `${base}/?room=${s.code}`;
    $("#invite-link").parentElement.style.display = opp ? "none" : "flex";
    $("#invite-hint").style.display = (opp || !/^(localhost|127\.)/.test(location.hostname)) ? "none" : "block";

    const pl = $("#players"); pl.innerHTML = "";
    [0, 1].forEach(i => {
        const p = s.players[i], row = el("span", "chip" + (p && p.host ? " host" : ""));
        if (p) { row.appendChild(el("span", "avatar", p.name[0].toUpperCase())); row.appendChild(el("span", "dot" + (p.online ? " on" : ""))); row.append(`Player ${i + 1}: ${p.name}${p.id === me.id ? " (you)" : ""} - ${p.online ? "Online" : "Offline"}`); }
        else row.textContent = `Player ${i + 1}: waiting for friend...`;
        pl.appendChild(row);
    });
    $("#start-game").style.display = (s.you.host && lobby && opp) ? "block" : "none";

    // dashboard: names, last/total, and B-I-N-G-O letters crossed per completed line
    const dash = $("#dash"); dash.innerHTML = "";
    dash.style.display = lobby ? "none" : "flex";
    s.players.forEach((p, i) => {
        const mine = s.called.filter(c => c.by === p.id), last = mine[mine.length - 1];
        const c = el("div", "pcard" + (p.id === me.id ? " me" : "") + (s.turn === p.id && s.phase === "playing" ? " turn" : ""));
        const nm = el("b"); nm.append(el("span", "dot" + (p.online ? " on" : "")), `PLAYER ${i + 1} - ${p.name}`);
        const L = el("div", "blet"); "BINGO".split("").forEach((ch, k) => L.appendChild(el("span", k < s.you.count ? "x" : "", ch)));
        const info = el("div", "info"); info.append(nm, ...(p.id === me.id ? [L] : []), `Last selected: ${last ? last.n : "-"}`, el("br"), `Total selected: ${mine.length}`);
        c.append(el("span", "avatar", p.name[0].toUpperCase()), info);
        dash.appendChild(c);
        if (p.id === me.id) {
            if (prevCount.me != null && s.you.count > prevCount.me && s.you.count <= 5) toast(`You crossed "${"BINGO"[s.you.count - 1]}"!`);
            prevCount.me = s.you.count;
        }
    });
    const lastCall = s.called[s.called.length - 1];
    let note = s.msg || (lastCall ? `${nameOf(lastCall.by)} called number: ${lastCall.n}` : "");
    if (s.phase === "playing" && opp && !opp.online) note = `${opp.name} disconnected - waiting for them to reconnect...`;
    $("#msg").textContent = note; $("#msg").style.display = note && !lobby ? "block" : "none";

    // my card (new crosses pop in)
    s.you.card.forEach((n, i) => {
        const fresh = called.has(n) && !prevCalled.has(n) && prevCalled.size + 1 >= called.size;
        cells[i].textContent = n;
        cells[i].className = (win.has(i) ? "box circle filled" : called.has(n) ? "box square filled" : "box square") + (fresh ? " pop" : "");
    });
    prevCalled = called;
    boardEl.classList.toggle("myturn", myTurn);
    $("#claim-box").style.display = s.you.canClaim ? "flex" : "none";
    $("#actions").style.display = myTurn ? "flex" : "none";

    $("#history-wrap").style.display = s.called.length ? "flex" : "none";
    const h = $("#history"); h.innerHTML = "";
    s.called.forEach((c, i) => h.appendChild(el("span", "chip" + (c.by === me.id ? " mine" : "") + (i === s.called.length - 1 ? " latest" : ""), `${nameOf(c.by)}: ${c.n}`)));

    if (s.called.length !== lastCalled) {
        if (lastCall) updateTitle(`${nameOf(lastCall.by).toUpperCase()} CALLED ${lastCall.n}`, lastCall.by === me.id);
        lastCalled = s.called.length;
    }
    let key, text, isX = false;
    if (s.phase === "over") { key = "over" + s.winnerId; text = `${nameOf(s.winnerId).toUpperCase()} WINS!`; isX = s.winnerId === me.id; if (confettiKey !== key + s.called.length) { confettiKey = key + s.called.length; confetti(); } }
    else if (s.phase === "verifying") { key = "ver" + s.claim.by; text = "VERIFYING BINGO"; }
    else if (s.phase === "claiming") { key = "claim" + s.you.canClaim; text = s.you.canClaim ? "BINGO! CLAIM IT" : "PLEASE WAIT..."; isX = s.you.canClaim; }
    else if (s.phase === "playing") { key = "turn" + s.turn + s.called.length; text = myTurn ? "YOUR TURN - PICK A NUMBER" : `${nameOf(s.turn).toUpperCase()}'S TURN`; isX = myTurn; }
    else { key = "lobby" + !!opp; text = !opp ? "WAITING FOR FRIEND" : s.you.host ? "FRIEND JOINED - START!" : "WAITING FOR HOST"; }
    if (key !== lastKey) { lastKey = key; updateTitle(text, isX); }
    overlay(s, called);
}

const mini = (card, called, win) => { const g = el("div", "mini"); card.forEach((n, i) => g.appendChild(el("span", win && win.has(i) ? "win" : called.has(n) ? "on" : "", n))); return g; };

function overlay(s, called) {
    const box = $("#reveal"); box.innerHTML = "";
    if (s.phase === "verifying") {
        const mineClaim = s.claim.by === me.id, who = nameOf(s.claim.by);
        box.appendChild(el("h2", "", mineClaim ? "BINGO CLAIMED!" : `${who.toUpperCase()} HAS CLAIMED BINGO!`));
        box.appendChild(el("div", "", "Numbers not selected yet"));
        const cols = el("div", "row");
        s.players.forEach(p => {
            const col = el("div", "remcol"), rem = s.remaining[p.id], chips = el("div", "rem");
            col.appendChild(el("b", "", p.id === me.id ? `${p.name} (you)` : p.name));
            rem.forEach(n => chips.appendChild(el("span", "chip", n)));
            if (!rem.length) chips.appendChild(el("span", "chip latest", "All selected!"));
            col.append(chips, el("small", "", `${rem.length} left`)); cols.appendChild(col);
        });
        box.appendChild(cols);
        if (mineClaim) box.appendChild(el("p", "", `Waiting for ${s.players.find(p => p.id !== me.id).name} to verify...`));
        else {
            const r = el("div", "row"), v = el("button", "", "VERIFY BINGO"), j = el("button", "", "REJECT BINGO");
            v.onclick = () => post("/api/verify"); j.onclick = () => post("/api/reject");
            r.append(v, j); box.appendChild(r);
        }
    } else if (s.phase === "over") {
        const w = nameOf(s.winnerId);
        box.appendChild(el("h2", "", `${w.toUpperCase()} WINS!`));
        box.appendChild(el("div", "", s.msg));
        box.appendChild(el("div", "", `${w}'s Bingo card`));
        box.appendChild(mini(s.final.cards[s.winnerId], called, new Set(s.final.cells)));
        const r = el("div", "row"), a = el("button", "", "Play Again"), l = el("button", "", "Return to Lobby");
        a.onclick = () => post("/api/again"); l.onclick = () => post("/api/lobby");
        r.append(a, l); box.appendChild(r);
    } else { box.style.display = "none"; return; }
    box.style.display = "flex";
}

function updateTitle(name, isX) { titles.push({ name, isX }); if (titles.length == 1) updateIndividualTitle(); }
function updateIndividualTitle() {
    let title = titles[0], status1 = $("#status-1"), status2 = $("#status-2");
    status2.textContent = title.name; status2.className = title.isX ? "x" : "o";
    status1.style.transition = "left 0.5s ease"; status2.style.transition = "left 0.5s ease";
    status1.style.left = "-50%"; status2.style.left = "50%";
    setTimeout(() => {
        status1.style.transition = ""; status2.style.transition = "";
        status1.style.left = "50%"; status2.style.left = "200%";
        status1.textContent = title.name; status1.className = title.isX ? "x" : "o";
        titles.shift();
        if (titles.length > 0) requestAnimationFrame(updateIndividualTitle);
    }, 500);
}

// reconnect after refresh / connection loss
try { const sv = JSON.parse(sessionStorage.getItem("bingo-session")); if (sv && (!inviteCode || inviteCode === String(sv.code).toUpperCase())) connect(sv); } catch (e) {}
