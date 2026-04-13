import { Buffer } from "buffer";
import crypto from "crypto";
import type { Hono } from "hono";
import jwt from "jsonwebtoken";
import { db } from "../database.js";
import { getPrivateKey, keyId } from "../jwt-keys.js";
import { ISSUER_URL } from "../config.js";

export function mountTokenEndpoint(app: Hono): void {
  app.post("/token", async (c) => {
    const form = await c.req.formData();
    const grantType = form.get("grant_type");
    const code = form.get("code");
    const redirectUriForm = form.get("redirect_uri");
    const clientIdForm = form.get("client_id");
    const codeVerifier = form.get("code_verifier");

    if (
      grantType !== "authorization_code" ||
      typeof code !== "string" ||
      typeof codeVerifier !== "string" ||
      typeof clientIdForm !== "string"
    ) {
      return c.text("invalid_request", 400);
    }

    const codeData = await db.getAuthCode(code);
    if (!codeData) {
      console.error(`[AuthServer] /token: Code ${code} not found.`);
      return c.text("invalid_grant", 400);
    }

    let calculatedChallenge: string;
    if (codeData.codeChallengeMethod === "S256") {
      const hash = crypto.createHash("sha256").update(codeVerifier).digest();
      calculatedChallenge = Buffer.from(hash).toString("base64url");
    } else {
      calculatedChallenge = codeVerifier;
      if (codeData.codeChallengeMethod !== "plain") {
        console.error(
          `[AuthServer] /token: Unsupported code_challenge_method: ${codeData.codeChallengeMethod}`,
        );
        return c.text("invalid_request", 400);
      }
    }

    if (calculatedChallenge !== codeData.codeChallenge) {
      console.error(
        `[AuthServer] /token: PKCE verification failed. Expected ${codeData.codeChallenge}, got ${calculatedChallenge}`,
      );
      await db.deleteAuthCode(code);
      return c.text("invalid_grant", 400);
    }

    if (clientIdForm !== codeData.clientId) {
      console.error("[AuthServer] /token: Client ID mismatch.");
      await db.deleteAuthCode(code);
      return c.text("invalid_grant", 400);
    }

    const userId = codeData.userId;
    await db.deleteAuthCode(code);

    console.log("[Token Endpoint] Code verified. Generating JWT...");

    const user = await db.getUserById(userId);
    const userEmail = user?.email;

    const payload = {
      iss: ISSUER_URL,
      sub: userId,
      aud: clientIdForm,
      iat: Math.floor(Date.now() / 1000),
      email: userEmail,
    };

    const signOptions: jwt.SignOptions = {
      algorithm: "RS256",
      expiresIn: "4h",
      keyid: keyId,
    };

    const privateKey = getPrivateKey();
    const idToken = jwt.sign(payload, privateKey, signOptions);
    const accessToken = idToken;

    const expiresInSeconds = 4 * 60 * 60;

    return c.json({
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: expiresInSeconds,
    });
  });
}
