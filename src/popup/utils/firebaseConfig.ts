// firebaseConfig.ts
import { initializeApp } from "firebase/app";
import { getStorage, getDownloadURL, uploadBytes, ref as storageRef } from "firebase/storage";
import { getDatabase,update,remove,push, ref,serverTimestamp, set, get, child, DataSnapshot, onValue } from "firebase/database";
const firebaseConfig = {
    apiKey: "AIzaSyAs9RtsXMRPeD5vpORJcWLDb1lEJZ3nUWI",
    authDomain: "xonapp.firebaseapp.com",
    databaseURL:
      "https://xonapp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "xonapp",
    storageBucket: "xonapp.appspot.com",
    messagingSenderId: "892472148061",
    appId: "1:892472148061:web:f22a5c4ffd25858726cdb4",
  };

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const db = getDatabase(app);

export { storage, db,update ,storageRef,serverTimestamp, getDownloadURL, uploadBytes, ref, set, get, child, DataSnapshot, onValue ,remove,push};