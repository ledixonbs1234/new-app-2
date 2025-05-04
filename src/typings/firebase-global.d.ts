// This file provides global type declarations for Firebase when loaded via importScripts.

declare namespace firebase {
  namespace database {
    interface Database {
      ref(path?: string): Reference;
      // Add other methods from firebase.database.Database if needed
    }

    interface Reference {
      // Add necessary methods/properties from firebase.database.Reference here
      key: string | null;
      parent: Reference | null;
      root: Reference;
      child(path: string): Reference;
      on(eventType: string, callback: (snapshot: DataSnapshot) => any, cancelCallback?: (error: Error) => any, context?: any): (snapshot: DataSnapshot) => any;
      get(): Promise<DataSnapshot>;
      set(value: any): Promise<void>; // Added set method
      remove(): Promise<void>; // Added remove method
      // ... other methods you use
    }

    interface DataSnapshot {
      val(): any;
      exists(): boolean;
      key: string | null;
      // Add other methods/properties from firebase.database.DataSnapshot if needed
      child(path: string): DataSnapshot;
      forEach(action: (a: DataSnapshot) => boolean): boolean;
      hasChild(path: string): boolean;
      hasChildren(): boolean;
      numChildren(): number;
      ref: Reference;
      // ...
    }
  }
  // Add other Firebase namespaces (auth, firestore, etc.) if needed
}