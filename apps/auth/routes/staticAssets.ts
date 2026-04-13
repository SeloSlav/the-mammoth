import fs from "fs";
import path from "path";
import type { Hono } from "hono";

/**
 * Root-level PNG assets used by HTML pages and OpenAuth password UI.
 */
export function mountStaticImageRoutes(app: Hono): void {
  app.get("/favicon.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "favicon.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error) {
      console.error("[Static] Failed to serve favicon.png:", error);
      return c.text("Not found", 404);
    }
  });

  app.get("/favicon.ico", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "favicon.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error) {
      return c.text("Not found", 404);
    }
  });

  app.get("/og-social.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "og-social.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error) {
      console.error("[Static] Failed to serve og-social.png:", error);
      return c.text("Not found", 404);
    }
  });

  app.get("/logo_alt.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "logo_alt.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), { headers: { "Content-Type": "image/png" } });
    } catch (error) {
      console.error("[Static] Failed to serve logo_alt.png:", error);
      return new Response("Image not found", { status: 404 });
    }
  });

  app.get("/auth/password/logo_alt.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "logo_alt.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), { headers: { "Content-Type": "image/png" } });
    } catch (error) {
      console.error("[Static] Failed to serve logo_alt.png:", error);
      return new Response("Image not found", { status: 404 });
    }
  });

  app.get("/login_background.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "login_background.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (error) {
      console.error("[Static] Failed to serve login_background.png:", error);
      return c.text("Image not found", 404);
    }
  });

  app.get("/auth/password/login_background.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "login_background.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (error) {
      console.error("[Static] Failed to serve login_background.png:", error);
      return c.text("Image not found", 404);
    }
  });
}
