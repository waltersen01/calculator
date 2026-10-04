# Finanzkompass – Finanz-App im Stil von Finanzguru für das iPhone 17

Eine Web-App, die die wichtigsten Funktionen von Multibanking-Apps wie Finanzguru nachbaut: Konten, Verträge, Kontostandsprognose, Ausgabenanalyse und Budgets. Sie ist für das **iPhone 17** gebaut (402 × 874 pt, Safe Areas oben 62 pt und unten 34 pt) und nutzt das Liquid-Glass-Design von iOS 26. Auf großen Bildschirmen erscheint die App in einem iPhone-17-Rahmen.

![Übersicht, Verträge, Analyse und Kontodetails](docs/screens.jpg)

> **Demo mit Beispieldaten.** Es gibt keine Verbindung zu echten Banken, und die App fragt keine Zugangsdaten ab. Name und Logo sind bewusst eigenständig, weil „Finanzguru“ eine geschützte Marke ist. Kein offizielles Produkt von Finanzguru.

## Funktionen

**Übersicht**
- Gesamtsaldo über alle Konten mit Veränderung seit Monatsbeginn, Beträge per Auge-Symbol ausblendbar
- Kontostandsprognose bis Monatsende: Ist-Verlauf, gestrichelte Prognose, Gehaltseingang, tiefster Stand
- Hinweise wie Preiserhöhungen, Wechselfristen (z. B. Kfz-Versicherung bis 30.11.), Abo-Check, Rücklagen und Budget-Warnungen
- Monatsbilanz (Einnahmen, Ausgaben, Gespart), anstehende Abbuchungen, letzte Umsätze, Pull-to-Refresh

**Verträge**
- Fixkosten pro Monat oder Jahr, aufgeteilt nach Bereichen
- Rücklagenrechner für jährliche und vierteljährliche Verträge, Sparpotenzial
- Vertragsdetails: nächste Zahlung, Kündigungsfrist, frühester Kündigungstermin, Gläubiger-ID, Mandatsreferenz, Preisentwicklung, Zahlungshistorie
- **Kündigungsservice** in drei Schritten mit fertigem Kündigungsschreiben (Demo, es wird nichts verschickt)
- Tarifvergleich, Erinnerung an Kündigungsfristen, eigene Verträge anlegen

**Analyse**
- Ausgaben und Einnahmen pro Monat mit Vormonatsvergleich (im laufenden Monat fair bis zum gleichen Tag)
- Säulendiagramm der letzten 6 Monate, Kategorien mit Anteilen, Sparquote
- Budgets mit Fortschrittsbalken, Tagesbudget und Warnstufen
- Kategorie-Details mit Verlauf, häufigsten Händlern und Umsätzen

**Konten & Umsätze**
- Girokonto, Kreditkarte, Tagesgeld und ETF-Depot mit Saldoverlauf (30 Tage, 90 Tage, 1 Jahr)
- Volltextsuche und Filter über alle Umsätze
- Umsatzdetails mit Buchungstag, Wertstellung, Verwendungszweck und Notizen
- Kategorie ändern, auf Wunsch für alle Umsätze desselben Händlers
- „Konto hinzufügen“ legt ein Beispielkonto an, ohne Zugangsdaten abzufragen

**Profil**
- Hell, Dunkel oder System, Beträge ausblenden, simulierte Face-ID-Sperre
- Plus-Abo (Demo), Datenschutz-Infos, Demo-Daten zurücksetzen

Alle Daten werden beim Start deterministisch erzeugt: 12 Monate Umsätze mit Gehalt, Miete, Verträgen, Supermarkt, Restaurants, Sparplan und Kreditkartenabrechnung, inklusive deutscher Feiertage und Bankarbeitstage. Änderungen wie Kündigungen, Budgets, Kategorien und Notizen speichert der Browser lokal (`localStorage`).

## Starten

Die App braucht keinen Build-Schritt und keine Abhängigkeiten.

```bash
# im Projektordner
python3 -m http.server 8000
# oder
npx serve .
```

Dann `http://localhost:8000` öffnen. Ein Doppelklick auf `index.html` funktioniert ebenfalls, nur das Web-App-Manifest wird dann nicht geladen.

## Auf dem iPhone 17 nutzen

1. Die App hosten, zum Beispiel mit GitHub Pages: im Repository unter **Settings → Pages** „Deploy from a branch“ wählen und den Branch mit dieser App sowie den Ordner `/ (root)` angeben.
2. Die Pages-Adresse auf dem iPhone in Safari öffnen.
3. **Teilen → Zum Home-Bildschirm** wählen. Die App startet dann ohne Browserleiste wie eine native App, mit eigenem Icon und angepasster Statusleiste.

Im Vollbild berücksichtigt die App die Dynamic Island und den Home-Indikator über `env(safe-area-inset-*)`. Als Home-Bildschirm-App kannst du außerdem vom linken Rand wischen, um zurückzugehen.

![Desktop-Ansicht mit iPhone-17-Rahmen](docs/desktop.jpg)

## Projektstruktur

```
index.html              Einstieg, PWA-Metadaten
manifest.webmanifest    Web-App-Manifest
css/app.css             Design-Tokens (Hell/Dunkel), iPhone-Rahmen, Komponenten
js/core.js              HTML-Templates mit Escaping, Formatierung (de-DE), Datum, Feiertage, Zufall
js/config.js            App-Name und Demo-Person
js/icons.js             Icon-Set (SVG)
js/data.js              Katalog (Kategorien, Banken, Händler, Verträge) und Umsatz-Generator
js/store.js             Zustand und Auswertungen: Salden, Prognose, Analyse, Verträge, Hinweise
js/ui.js                Bausteine: Zeilen, Logos, Sheets, Toasts, Bestätigungen
js/charts.js            SVG-Diagramme mit Tooltip und Tastaturbedienung
js/router.js            Tabs mit eigenem Navigationsstapel, Hash-URLs, Übergänge
js/screens/*.js         Übersicht, Verträge, Analyse, Konten, Profil
js/app.js               Start, Theme, Gerätrahmen, Sperrbildschirm
assets/                 App-Icons
```

## Anpassen

- **Name und Person:** `js/config.js`
- **Farben:** Tokens am Anfang von `css/app.css`, jeweils für Hell und Dunkel
- **Verträge, Händler, Konten:** `js/data.js`
