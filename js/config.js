/* Finanzkompass – Konfiguration. App-Name und Demo-Person lassen sich hier ändern. */
(function (FK) {
  'use strict';
  FK.config = {
    appName: 'Finanzkompass',
    tagline: 'Deine Finanzen auf Kurs',
    version: '1.0.0',
    storageKey: 'finanzkompass:v1',
    // Demo-Person (frei erfunden)
    user: {
      firstName: 'Alex',
      lastName: 'Neumann',
      email: 'alex.neumann@example.de',
      street: 'Lindenstraße 12',
      zip: '50674',
      city: 'Köln',
    },
  };
})(window.FK);
