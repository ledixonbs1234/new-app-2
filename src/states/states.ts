export type DataSnapshotProps = {
    Index: number,
    KhoiLuong: string,
    MaBuuGui: string,
    MaKH: string,
    MaTin: string,
    TenKH: string,
    TenNguoiGui: string,
    TimeNhanTin: string,
    TimeTrangThai: string,
    TrangThai: string
}

export type BuuGuiProps = {
    index : number,
    KhoiLuong : string
    MaBuuGui :string
    TrangThai:string
    TimeTrangThai: string,
    Id:string|null,
    IsBlackList :boolean,
    Money: null, // Hoặc giá trị mặc định phù hợp khác
    ListDo: null, // Hoặc giá trị mặc định phù hợp khác
    TrangThaiRequest: null
}
export type KhachHangProps = {
    Index: number,
    BuuGuis: BuuGuiProps[],
    MaKH: string,
    MaTin: string,
    TenKH: string,
    TenNguoiGui: string,
    TimeNhanTin: string,
    countState: {
        countDangGom: number;
        countPhanHuong: number;
        countNhanHang: number;
        countChapNhan: number;
      };
}
export type KhachNuocMamProps = {
    Number: string,
    Name: string,
    Address: string,
    Phone: string,
    Money:string,
    FullText:string
}
export type KhachLeProps = {
    MaHieu:string,
    NameSend: string,
    AddressSend:string,
    PhoneSend: string,
    NameReceive: string,
    AddressReceive: string,
    PhoneReceive: string,
    huongXaReceive: string,
    HuyenReceive: string,
    TinhThanhPhoReceive: string,
    MaBuuChinh: string,
    KhoiLuongThucTe: string,
    KhoiLuongQuyDoi: string,
    DaiRongCao: {
        "Item1": "",
        "Item2": "",
        "Item3": ""
    },
    NoiDung:string,
    COD: string,
    DichVu: null,
    NgayChapNhan:string
    
}

export type DetailsProp = {
    details: KhachHangProps[]
}
export type KhachHangListProps = {
    name: string[],
    // handleClick : (event: React.MouseEvent<HTMLButtonElement>,id:number)=> {}
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void
}