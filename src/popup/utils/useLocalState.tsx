import { useState } from "react";

const useLocalStorage = (key: any, initialValue: any) => {
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      chrome.storage.local.get([key], (e) => {
        console.log("return",e)
        return e[key] ? e[key] : initialValue;
      });
    } catch (error) {
      console.log(error);
      return initialValue;
    }
  });

  const setValue = (value: any) => {
    try {
      setStoredValue(value);

      if (typeof window !== "undefined") {
        chrome.storage.local.set({[key]:value});
      }
    } catch (error) {
      console.log(error);
    }
  };
  return [storedValue, setValue];
};

export default useLocalStorage;
