FROM node:22-alpine AS build
WORKDIR /src
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web web
COPY design design
RUN test -s web/public/data/reaches.bin \
  && test -s web/public/data/reaches.pmtiles \
  && test -s web/public/data/names.json
RUN cd web && npm run build

FROM nginx:alpine
COPY --from=build /src/web/dist /usr/share/nginx/html
