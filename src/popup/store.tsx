import { configureStore } from "@reduxjs/toolkit";
import popupSlice from "./popup.slice";
export const store = configureStore({
  reducer: {
    popup:popupSlice,
  },
});
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
