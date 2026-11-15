BINGO DUEL - UPDATED SOURCE

LOCAL RUN
1. Install Node.js 18 or newer.
2. Keep index.html, file.js, style.css, and server.js in the same folder.
3. Open a terminal in that folder and run: node server.js
4. On the host computer open: http://localhost:3000
5. For same-Wi-Fi play, share the LAN URL printed in the terminal.

PLAYING FROM DIFFERENT NETWORKS / MOBILE DATA
A 192.168.x.x URL is a private local-network address. It cannot be reached from a friend on mobile data or another Wi-Fi network.
Expose/deploy this Node server on a public host that supports long-lived HTTP Server-Sent Events (SSE), and run exactly ONE server instance because rooms are currently held in server memory.
Set PUBLIC_URL to the public HTTPS origin, for example:
  PUBLIC_URL=https://your-public-domain.example node server.js
The app will then generate invitation links using that public URL.

For a quick temporary test with ngrok:
1. Run node server.js
2. In another terminal run: ngrok http 3000
3. Set PUBLIC_URL to the HTTPS forwarding URL and restart the Node server.
   Example (macOS/Linux): PUBLIC_URL=https://your-name.ngrok-free.app node server.js
4. Create a NEW room and share its new invite link.

IMPORTANT DEPLOYMENT NOTES
- Use a persistent Node process and a host/proxy that supports Server-Sent Events (SSE).
- Use one server instance only; multiple instances will not share the in-memory room state.
- Rooms are temporary and disappear if the server restarts. For durable rooms / multi-instance scaling, add Redis or a database-backed room store.
- HTTPS public URLs are recommended, especially when opening the invite link on phones.
