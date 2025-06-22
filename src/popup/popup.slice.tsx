import { PayloadAction, createSlice, current } from "@reduxjs/toolkit";
import { BuuGuiProps, KhachHangProps, KhachLeProps, KhachNuocMamProps } from "../states/states";
import { set } from "firebase/database";


// ADD: Định nghĩa kiểu cho một đơn hàng
export interface Order {
  GOC: string;
  MAUSAC: string;
  NGUOINHAN: string;
  DIACHI: string;
  SDT: string;
  COD: number;
}

export interface PopupState {
  khachHangList: KhachHangProps[];
  tenKH: string;
  selectedKH: KhachHangProps | null;
  selectedBG: BuuGuiProps | null;
  checkOption: number[]
  keyMessage: string;
  passwordPortal: string
  accountPortal: string
  tokenPortal: string
  khachNuocMamList: KhachNuocMamProps[];
  khachLeList: KhachLeProps[];
  selectedKhachLe: KhachLeProps | null;
  selectedKhachNuocMam: KhachNuocMamProps | null;

  // ADD: Thêm trạng thái cho tính năng điền form
  orderData: Order[];
  currentIndex: number;
}


const initialState: PopupState = {
  keyMessage: "",
  khachHangList: [],
  khachNuocMamList: [],
  khachLeList: [],
  tenKH: "",
  accountPortal: "",
  passwordPortal: "",
  selectedBG: null,
  selectedKH: null,
  tokenPortal: "",
  selectedKhachNuocMam: null,
  selectedKhachLe: null,
  checkOption: [0, 1, 2],

  // ADD: Khởi tạo giá trị cho state mới
  orderData: [],
  currentIndex: 0,
};
export const popupSlice = createSlice({
  name: "popup",
  initialState,
  reducers: {
    setKhachHangs: (state, action: PayloadAction<KhachHangProps[]>) => {
      action.payload.forEach((m) => {
        m.countState.countChapNhan = m.BuuGuis.filter(
          (m) => m.TrangThai === "Đã chấp nhận"
        ).length;
        m.countState.countDangGom = m.BuuGuis.filter(
          (m) => m.TrangThai === "Đang đi thu gom"
        ).length;
        m.countState.countNhanHang = m.BuuGuis.filter(
          (m) => m.TrangThai === "Nhận hàng thành công"
        ).length;
        m.countState.countPhanHuong = m.BuuGuis.filter(
          (m) => m.TrangThai === "Đã phân hướng"
        ).length;
      });
      state.khachHangList = action.payload;
      state.selectedKH = null
      state.selectedBG = null
    },
    setSelectedKH: (state, action: PayloadAction<KhachHangProps>) => {
      state.selectedKH = action.payload;
      state.selectedBG = null
      //thuc hien chuyen doi du lieu trong nay
    },
    setKhachNuocMams: (state, action: PayloadAction<KhachNuocMamProps[]>) => {
      state.khachNuocMamList = action.payload;
      //thuc hien chuyen doi du lieu trong nay
    },
    setSelectedKhachNuocMam: (state, action: PayloadAction<KhachNuocMamProps>) => {
      state.selectedKhachNuocMam = action.payload;
    },
    setKhachLes: (state, action: PayloadAction<KhachLeProps[]>) => {
      state.khachLeList = action.payload;
      //thuc hien chuyen doi du lieu trong nay
    },
    setSelectedKhachLe: (state, action: PayloadAction<KhachLeProps>) => {
      state.selectedKhachLe = action.payload;
    },
    setKeyMessage: (state, action: PayloadAction<string>) => {
      state.keyMessage = action.payload
    },
    setAccountPortal: (state, action: PayloadAction<string>) => {
      state.accountPortal = action.payload
      console.log("setAccountPortal", state.accountPortal)
    },
    setPasswordPortal: (state, action: PayloadAction<string>) => {
      state.passwordPortal = action.payload
    },
    setSelectedBG: (state, action: PayloadAction<BuuGuiProps>) => {
      state.selectedBG = action.payload;
    },
    clearData: (_state) => {
      _state = initialState;
    },
    setTokenPortal: (state, action: PayloadAction<string>) => {
      state.tokenPortal = action.payload
    },
    setCheckChange: (state, action: PayloadAction<number[]>) => {
      state.checkOption = action.payload
    },
    sortNumber: (state) => {
      //thuc hien sort trong nay
      if (state.selectedKH?.BuuGuis) {
        const small = state.selectedKH?.BuuGuis.filter(m => Number(m.KhoiLuong) < 2000)
        const large = state.selectedKH?.BuuGuis.filter(m => Number(m.KhoiLuong) >= 2000)
        small.sort((a, b) => Number(b.MaBuuGui.substring(9, 11)) - Number(a.MaBuuGui.substring(9, 11)) || Number(b.MaBuuGui.substring(8, 9)) - Number(a.MaBuuGui.substring(8, 9)))
        large.sort((a, b) => Number(b.MaBuuGui.substring(9, 11)) - Number(a.MaBuuGui.substring(9, 11)) || Number(b.MaBuuGui.substring(8, 9)) - Number(a.MaBuuGui.substring(8, 9)))
        state.selectedKH.BuuGuis = large.concat(small)
        for (let i = 0; i < state.selectedKH?.BuuGuis?.length; i++) {
          state.selectedKH.BuuGuis[i].index = i + 1;
        }
        state.selectedBG = state.selectedKH.BuuGuis[0]
      }
    },
    sortWeight: (state) => {
      if (state.selectedKH?.BuuGuis) {
        state.selectedKH?.BuuGuis.sort((a, b) => Number(b.KhoiLuong) - Number(a.KhoiLuong))
        for (let i = 0; i < state.selectedKH?.BuuGuis?.length; i++) {
          state.selectedKH.BuuGuis[i].index = i + 1;
        }
        state.selectedBG = state.selectedKH.BuuGuis[0]
      }

    },
    //ADD: Thêm action để cập nhật dữ liệu đơn hàng
    setOrders: (state, action: PayloadAction<{ orders: Order[], from: 'popup' | 'background' }>) => {
      state.orderData = action.payload.orders;
      state.currentIndex = 0; // Reset current index when orders are set
      if (action.payload.from === 'popup') {
        // Nếu từ popup, có thể thực hiện thêm các hành động khác nếu cần
        chrome.runtime.sendMessage({ type: 'SAVE_ORDERS', payload: { orders: action.payload.orders, currentIndex: 0 } });
      }
    },
    setCurrentIndex: (state, action: PayloadAction<{ index: number, from: 'popup' | 'background' }>) => {
      state.currentIndex = action.payload.index;
      if (action.payload.from === 'popup') {
        // Nếu từ popup, có thể thực hiện thêm các hành động khác nếu cần
        chrome.runtime.sendMessage({ type: 'SET_CURRENT_INDEX', payload: { index: action.payload.index } });
      }
    },
    clearOrders: (state, action: PayloadAction<{ from: 'popup' | 'background' }>) => {
      state.orderData = [];
      state.currentIndex = 0; // Reset current index when orders are cleared
      if (action.payload.from === 'popup') {
        // Nếu từ popup, có thể thực hiện thêm các hành động khác nếu cần
        chrome.runtime.sendMessage({ type: 'CLEAR_ORDERS' });
      }
    }
  },
});
export const { setOrders, setCurrentIndex, clearOrders, sortNumber, setTokenPortal, sortWeight, setKhachHangs, setCheckChange, clearData, setSelectedBG, setSelectedKH, setKeyMessage, setAccountPortal, setPasswordPortal, setKhachNuocMams, setSelectedKhachNuocMam, setKhachLes, setSelectedKhachLe } =
  popupSlice.actions;
export default popupSlice.reducer;
