# Multi-stage: build with devDependencies, ship only the compiled output +
# production node_modules, so the runtime image doesn't carry TypeScript,
# tsx, or type packages it will never execute.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/migrations ./dist/migrations
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
