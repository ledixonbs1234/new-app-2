
import React from "react";


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
  customerCode:string,
  customerName:string,
  contractServiceCode:string,
  itemDetails: ItemDetailProp[];
};
type ItemDetailProp = {
  id: string;
  ttNumber: string;
  weight: string;
  receiverName:string;
  createdDate:string;
  codAmount:string;
  dispatchNumber:string;
  receiverAddress:string;
  receiverProvinceCode:string,
  receiverProvinceCodeExt:string
};
