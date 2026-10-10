# Finanzkompass – Web-App im Container (statische Dateien über nginx, ohne Root-Rechte)
FROM nginxinc/nginx-unprivileged:1.27-alpine

LABEL org.opencontainers.image.title="Finanzkompass" \
      org.opencontainers.image.description="Finanz-App im Stil von Finanzguru: CSV-Import für Sparkasse und Trade Republic, Verträge, Prognose, Analyse"

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY index.html manifest.webmanifest /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
