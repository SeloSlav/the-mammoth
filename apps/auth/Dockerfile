# OpenAuth server — use with Railway "Dockerfile" builder to avoid Railpack build-secret requirements.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
# Install devDependencies too (TypeScript, @types/*) — NODE_ENV must not be production until after `tsc`.
RUN npm ci

COPY . ./
RUN npm run build

ENV NODE_ENV=production
RUN npm prune --omit=dev

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 4001

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
