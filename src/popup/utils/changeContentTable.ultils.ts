interface ContentTableData {
    key: number;
    name: string;
    detail: string;
  }

const changeContentTable = (khachLe: any,setDataSource:(data :ContentTableData[])=>void) => {
   const  dataok:ContentTableData[] = []

    dataok.push({
      key: 0,
      name: "Mã Hiệu",
      detail: khachLe.MaHieu
    })
    dataok.push({
      key: 1,
      name: "Tên Người Gửi",
      detail: khachLe.NameSend
    })

    dataok.push({
      key: 2,
      name: "Địa chỉ gửi",
      detail: khachLe.AddressSend
    }),
      dataok.push({
        key: 3,
        name: "Số điện thoại gửi",
        detail: khachLe.PhoneSend
      })
    dataok.push({
      key: 4,
      name: "Tên người nhận",
      detail: khachLe.NameReceive
    })
    dataok.push({
      key: 5,
      name: "Địa chỉ nhận",
      detail: khachLe.AddressReceive
    })

    //add detail with huongxa + huyen + tinh if null add ""
    var xa = khachLe.huongXaReceive == null ? "" : khachLe.huongXaReceive
    var huyen = khachLe.HuyenReceive == null ? "" : khachLe.HuyenReceive
    var tinh = khachLe.TinhThanhPhoReceive == null ? "" : khachLe.TinhThanhPhoReceive

    dataok.push({
      key: 12,
      name: "Xã Huyện Tỉnh",
      detail: xa + "," + huyen + "," + tinh
    })

    dataok.push({
      key: 6,
      name: "Số điện thoại nhận",
      detail: khachLe.PhoneReceive
    })
    dataok.push({
      key: 7,
      name: "KL Thực tế",
      detail: khachLe.KhoiLuongThucTe
    })
    dataok.push({
      key: 11,
      name: "Dài Rộng Cao",
      detail: khachLe.DaiRongCao.Item1 + " " + khachLe.DaiRongCao.Item2 + " " + khachLe.DaiRongCao.Item3
    })
    dataok.push({
      key: 8,
      name: "Nội dung",
      detail: khachLe.NoiDung
    })
    dataok.push({
      key: 9,
      name: "COD",
      detail: khachLe.COD
    })
    dataok.push({
      key: 10,
      name: "Dịch vụ",
      detail: khachLe.DichVu ?? ""
    })
    dataok.push({
      key: 15,
      name: "Ghi chú",
      detail: "Ngày chấp nhận thực tế " + (khachLe.NgayChapNhan ?? "")
    })

    setDataSource(dataok)

  }
  const handlePhanTich = (setDataSource: (data: ContentTableData[]) => void) => {
    fetch('/data/data.json')
      .then(response => response.json())
      .then(data => {
        console.log('Data loaded:');
        //Save vao khach nuoc mam
        var khachLes = data;
        changeContentTable(khachLes[0], setDataSource);
      })
      .catch(error => console.error('Error loading data:', error));
  };
  export {changeContentTable,handlePhanTich}