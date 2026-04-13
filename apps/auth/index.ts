/**
 * Auth service entry: loads env (`config.js`) via `server.js`, then starts the Hono/OpenAuth listener.
 */
import { startAuthServer } from "./server.js";

void startAuthServer().catch((err) => {
  console.error("[Auth] Fatal startup error:", err);
  process.exit(1);
});

export { startAuthServer };
export default startAuthServer;
