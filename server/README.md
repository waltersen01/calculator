# Live-Verbindung über Enable Banking (optional)

Mit der Live-Verbindung ruft Finanzkompass Kontostand und Umsätze automatisch ab, statt dass du CSV-Dateien importierst. Grundlage ist PSD2: Du erteilst deiner Bank eine Freigabe für einen **regulierten Kontoinformationsdienst** – hier [Enable Banking](https://enablebanking.com). Die Anmeldung findet auf der Seite deiner Bank statt (z. B. mit S-pushTAN). Finanzkompass sieht keine Zugangsdaten und kann keine Zahlungen auslösen.

Die Enable Banking API verlangt signierte Anfragen. Den privaten Schlüssel darf die App nicht enthalten, deshalb verwahrt ihn ein kleiner **Proxy**, den du selbst betreibst – als Docker-Container neben der App oder als Cloudflare Worker.

```
iPhone / Browser ──► Proxy (dein Schlüssel) ──► api.enablebanking.com ──► deine Bank
        ▲                                                                    │
        └──────────── Anmeldung und Freigabe direkt bei der Bank ◄───────────┘
```

## 1. Enable Banking einrichten

1. Konto bei Enable Banking anlegen und im **Control Panel** eine Anwendung für die **Produktionsumgebung** registrieren.
2. Als **Redirect-URL** genau die Adresse eintragen, unter der du die App öffnest, mit Schrägstrich am Ende – zum Beispiel `http://localhost:8080/`. Die App zeigt dir die passende Adresse unter **Profil → Live-Verbindung** an.
3. Die private Schlüsseldatei (`.pem`), die du beim Registrieren erhältst, sicher aufbewahren und die **Application ID** notieren.
4. Für die private Nutzung deine eigenen Konten im Control Panel verknüpfen, um die Anwendung freizuschalten. Folge dabei den Hinweisen im Control Panel.

> Akzeptiert das Control Panel für die Redirect-URL nur `https://`, brauchst du eine HTTPS-Adresse für die App, zum Beispiel über Cloudflare Tunnel oder Tailscale Serve, oder du hostest die App auf GitHub Pages und nutzt den Cloudflare Worker (Variante B).

## 2a. Proxy mit Docker (empfohlen für das Docker-Setup)

Im Projektordner (z. B. `D:\Finanzguru_clone`):

1. `.env.example` nach `.env` kopieren und ausfüllen:
   - `EB_APP_ID` – die Application ID
   - `ACCESS_TOKEN` – ein langes Zufallspasswort, z. B. in PowerShell:
     `[guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")`
   - `ALLOWED_ORIGIN` – die Adresse(n), unter der du die App öffnest, ohne Pfad, kommagetrennt, z. B. `http://localhost:8080,http://192.168.178.20:8080`
2. Den privaten Schlüssel als `secrets\enablebanking.pem` speichern. Unter Linux oder macOS zusätzlich `chmod 644 secrets/enablebanking.pem`, damit der Proxy ohne Root-Rechte ihn lesen kann.
3. Starten:
   ```powershell
   docker compose --profile live up -d --build
   ```
   `start-windows.cmd` startet den Proxy automatisch mit, sobald `.env` und der Schlüssel vorhanden sind.
4. In der App **Profil → Live-Verbindung** öffnen. Der Proxy wird als `/api` erkannt; trage das `ACCESS_TOKEN` ein und tippe auf **Speichern und testen**.
5. Danach **Konto verbinden → Sparkasse (bzw. Trade Republic) → Live verbinden**, deine Bank wählen und die Freigabe bei der Bank bestätigen.

`.env` und `secrets/` stehen in `.gitignore` und landen nicht im Repository. Ob der Proxy eingerichtet ist, zeigt `docker compose logs proxy`.

## 2b. Proxy als Cloudflare Worker

1. Im Cloudflare-Dashboard unter **Workers & Pages** einen Worker anlegen und den Inhalt von [`enablebanking-proxy.js`](enablebanking-proxy.js) als Code einfügen.
2. Unter **Settings → Variables and Secrets** hinterlegen:
   - `EB_APP_ID` (Text)
   - `EB_PRIVATE_KEY` (Secret) – kompletter Inhalt der `.pem`-Datei
   - `ACCESS_TOKEN` (Secret)
   - `ALLOWED_ORIGIN` (Text), z. B. `https://dein-name.github.io`
3. In der App als Proxy-Adresse die Worker-Adresse eintragen, z. B. `https://finanzkompass.dein-name.workers.dev`, dazu das Zugriffstoken.

## Was der Proxy tut – und was nicht

- Er signiert jede Anfrage mit einem kurzlebigen Token (JWT, RS256) und leitet sie an `api.enablebanking.com` weiter.
- Er lässt nur Anfragen mit deinem `ACCESS_TOKEN` zu und reicht nur die Endpunkte für Kontoinformationen durch (Banken, Freigabe, Sitzung, Kontostand, Umsätze). Zahlungsfunktionen sind gesperrt.
- Browseranfragen von fremden Adressen und Rücksprünge zu fremden Seiten lehnt er ab (`ALLOWED_ORIGIN`).
- Er speichert nichts: keine Umsätze, keine Freigaben. Die Daten landen nur im Browser deines Geräts.

Freigaben gelten je nach Bank bis zu 180 Tage. Läuft eine ab, zeigt die App beim Konto **Freigabe erneuern** an.

## Dateien

| Datei | Zweck |
| --- | --- |
| `enablebanking-proxy.js` | Proxy-Logik (Cloudflare Worker, wird auch im Docker-Container genutzt) |
| `node-server.mjs` | Startet den Proxy als Node-Server im Container, liest den Schlüssel aus `/run/secrets` |
| `Dockerfile` | Image auf Basis von `node:22-alpine`, ohne weitere Abhängigkeiten |
