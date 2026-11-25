FROM node:22-alpine AS build
WORKDIR /src
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY web web
COPY design design
ARG PUBLIC_COUNTRIES=nz
ENV PUBLIC_COUNTRIES=$PUBLIC_COUNTRIES
RUN test -s web/public/data/nz/reaches.bin \
  && test -s web/public/data/nz/reaches.pmtiles \
  && test -s web/public/data/nz/names.json
RUN if echo ",${PUBLIC_COUNTRIES}," | grep -q ',au,'; then \
      test -s web/public/data/au/reaches.bin \
      && test -s web/public/data/au/reaches.pmtiles \
      && test -s web/public/data/au/names.json; \
    fi
RUN cd web && npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html
