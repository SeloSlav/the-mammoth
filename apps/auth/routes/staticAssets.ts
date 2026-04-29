import fs from "fs";
import path from "path";
import type { Hono } from "hono";

/** Root-level PNG assets used by HTML pages (favicon, social preview). */
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

  app.get("/og-social.jpg", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "og-social.jpg");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=604800",
        },
      });
    } catch (error) {
      console.error("[Static] Failed to serve og-social.jpg:", error);
      return c.text("Not found", 404);
    }
  });

  app.get("/the-mammoth-logo.png", async (c) => {
    try {
      const imagePath = path.join(process.cwd(), "the-mammoth-logo.png");
      const imageBuffer = fs.readFileSync(imagePath);
      return new Response(new Uint8Array(imageBuffer), {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error) {
      console.error("[Static] Failed to serve the-mammoth-logo.png:", error);
      return c.text("Not found", 404);
    }
  });

}
