import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "./store";
import { BuuGuiProps } from "../states/states";

export const getKhachLes = (state: RootState) => state.popup.khachLeList;
export const getKhachHangs = (state: RootState) => state.popup.khachHangList;
export const getKhachNuocMams = (state: RootState) => state.popup.khachNuocMamList;
export const getSelectedKH = (state: RootState) => state.popup.selectedKH;
export const getSelectedKhachNuocMam = (state: RootState) => state.popup.selectedKhachNuocMam;
export const getSelectedKhachLe = (state: RootState) => state.popup.selectedKhachLe;
export const getSelectedBG = (state: RootState) => state.popup.selectedBG;
export const getCheckOption = (state: RootState) => state.popup.checkOption;
export const getKeyMessage = (state: RootState) => state.popup.keyMessage;
export const getAccountPortal = (state: RootState) => state.popup.accountPortal;
export const getPasswordPortal = (state: RootState) => state.popup.passwordPortal;
export const getTokenPortal = (state: RootState) => state.popup.tokenPortal;
export const getBGFilled = createSelector(
  getSelectedKH,
  getCheckOption,
  (kh, check) => {
    const bgs: BuuGuiProps[] | undefined = kh?.BuuGuis.filter((bg) => {
      if (check.includes(0) && bg.TrangThai === "Đang đi thu gom") {
        return true;
      } else if (check.includes(1) && bg.TrangThai === "Đã phân hướng") {
        return true;
      } else if (check.includes(2) && bg.TrangThai === "Nhận hàng thành công") {
        return true;
      } else if (check.includes(3) && bg.TrangThai === "Đã chấp nhận") {
        return true;
      }
      return false;
    });
    return bgs;
  }
);
