/**
 * Shared Firebase configuration
 * Used across content scripts, background, and popup
 */

export const firebaseConfig = {
  apiKey: "AIzaSyAs9RtsXMRPeD5vpORJcWLDb1lEJZ3nUWI",
  authDomain: "xonapp.firebaseapp.com",
  databaseURL: "https://xonapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xonapp",
  storageBucket: "xonapp.appspot.com",
  messagingSenderId: "892472148061",
  appId: "1:892472148061:web:f22a5c4ffd25858726cdb4",
};

// Note: This configuration is used across multiple contexts:
// - Background script (via compat libs and importScripts)
// - Content scripts (via modern Firebase SDK)
// - Popup (via modern Firebase SDK)
// TODO: Consider moving credentials to environment variables for better security
