import "../asserts/tailwind.css";
import "./popup.css";

import React from "react";

type HopDongProps = {
  Address: string;
  IsChooseHopDong: boolean;
  MaKH: string;
  STTHopDong: number;
};

// type PopupProps = {
// handleClick :React.MouseEventHandler<HTMLButtonElement>
// }


export interface DataType {
  key: React.Key;
  name: string;
  detail: string;
}

export type NguoiGuiProp = {
  key: React.Key;
  id: string;
  name: string;
  username: string;
  status: string;
  code:string;
  amount: string;
};
export type NguoiGuiDetailProp = {
  id: string;
  itemDetails: ItemDetailProp[];
};
type ItemDetailProp = {
  id: string;
  ttNumber: string;
  weight: string;
  receiverAddress:string;
  receiverName:string;
  createdDate:string;
};
