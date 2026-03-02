/**
 * Colyseus server entry point.
 * Run with: npm run server
 * @module server/index
 */

// Must be the first import — polyfills Symbol.metadata before any schema decorators run.
import "./polyfill.js";

import { defineServer, defineRoom } from "colyseus";
import { LobbyRoom } from "./rooms/LobbyRoom.js";
import { MatchRoom } from "./rooms/MatchRoom.js";

/** Default server port. */
const PORT = parseInt(process.env.PORT || "2567", 10);

const server = defineServer({
    rooms: {
        lobby: defineRoom(LobbyRoom),
        match: defineRoom(MatchRoom),
    },
});

server.listen(PORT).then(() => {
    console.log(`[Server] Listening on ws://localhost:${PORT}`);
    console.log("[Server] Rooms: lobby, match");
});
