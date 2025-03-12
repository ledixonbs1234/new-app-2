// typings.d.ts
declare function importScripts(...urls: string[]): void;
declare namespace firebase {
    function initializeApp(config: object): any;
    // ... other Firebase methods
  }