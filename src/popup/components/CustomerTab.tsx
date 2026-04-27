import { Button, Card, Checkbox, Input, InputNumber, List, message, Space, Switch, Modal } from "antd";
import { useEffect, useState } from "react";
import { db, ref, onValue, set, remove } from "../utils/firebaseConfig";

interface Customer {
  MaKH: string;
  TenKH: string;
  IsChooseHopDong: boolean;
  STTHopDong: number;
  Address: string;
}

export default function CustomerTab() {
  const [maKH, setMaKH] = useState("");
  const [tenKH, setTenKH] = useState("");
  const [isChooseHopDong, setIsChooseHopDong] = useState(false);
  const [sttHopDong, setSttHopDong] = useState(0);
  const [address, setAddress] = useState("");
  const [showAddress, setShowAddress] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Editing state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    const hopDongsRef = ref(db, "PORTAL/HopDongs");
    const unsubscribe = onValue(hopDongsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list: Customer[] = [];
        for (const key in data) {
          list.push({
            MaKH: data[key].MaKH || key,
            TenKH: data[key].TenKH || "",
            IsChooseHopDong: !!data[key].IsChooseHopDong,
            STTHopDong: data[key].STTHopDong || 0,
            Address: data[key].Address || "",
          });
        }
        setCustomers(list);
      } else {
        setCustomers([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSave = () => {
    if (!maKH.trim()) {
      message.error("Vui lòng nhập mã khách hàng!");
      return;
    }
    
    const customerData: Customer = {
      MaKH: maKH.trim(),
      TenKH: tenKH.trim(),
      IsChooseHopDong: isChooseHopDong,
      STTHopDong: sttHopDong,
      Address: address.trim(),
    };

    set(ref(db, `PORTAL/HopDongs/${customerData.MaKH}`), customerData)
      .then(() => {
        message.success("Đã lưu khách hàng!");
        setMaKH("");
        setTenKH("");
        setIsChooseHopDong(false);
        setSttHopDong(0);
        setAddress("");
      })
      .catch((error) => {
        message.error("Lỗi khi lưu: " + error.message);
      });
  };

  const handleUpdate = () => {
    if (!editingCustomer || !editingCustomer.MaKH.trim()) return;

    set(ref(db, `PORTAL/HopDongs/${editingCustomer.MaKH}`), editingCustomer)
      .then(() => {
        message.success("Đã cập nhật khách hàng!");
        setEditingCustomer(null);
      })
      .catch((error) => {
        message.error("Lỗi khi cập nhật: " + error.message);
      });
  };

  const handleDelete = (maKH: string) => {
    remove(ref(db, `PORTAL/HopDongs/${maKH}`))
      .then(() => {
        message.success("Đã xoá khách hàng!");
      })
      .catch((error) => {
        message.error("Lỗi khi xoá: " + error.message);
      });
  };

  const handleInitPortal = (customer: Customer) => {
    chrome.runtime.sendMessage(
      { type: "POPUP_KHOITAO_PORTAL", payload: { maKH: customer.MaKH } },
      (response) => {
        if (response && response.status === "success") {
          message.success("Khởi tạo thành công!");
        } else {
          message.error("Lỗi khởi tạo: " + (response?.error || "Unknown error"));
        }
      }
    );
  };

  return (
    <Card title="Quản lý khách hàng">
      <Space direction="vertical" style={{ width: "100%" }}>
        <div>
          <label style={{ fontWeight: "bold" }}>Mã Khách Hàng:</label>
          <Input
            value={maKH}
            onChange={(e) => setMaKH(e.target.value)}
            placeholder="Mã KH (VD: C001048645)"
            style={{ marginTop: 5 }}
          />
        </div>

        <div>
          <label style={{ fontWeight: "bold" }}>Tên Khách Hàng:</label>
          <Input
            value={tenKH}
            onChange={(e) => setTenKH(e.target.value)}
            placeholder="Tên KH"
            style={{ marginTop: 5 }}
          />
        </div>

        <div>
          <Checkbox
            checked={isChooseHopDong}
            onChange={(e) => setIsChooseHopDong(e.target.checked)}
          >
            Có hợp đồng
          </Checkbox>
        </div>

        {isChooseHopDong && (
          <div>
            <label style={{ fontWeight: "bold" }}>STT Hợp Đồng:</label>
            <InputNumber
              style={{ width: "100%", marginTop: 5 }}
              value={sttHopDong}
              onChange={(val) => setSttHopDong(val || 0)}
              min={0}
            />
          </div>
        )}

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontWeight: "bold" }}>Địa chỉ:</label>
            <Switch
              checked={showAddress}
              onChange={(checked) => setShowAddress(checked)}
              checkedChildren="Hiện"
              unCheckedChildren="Ẩn"
            />
          </div>
          {showAddress && (
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Nhập địa chỉ"
              style={{ marginTop: 5 }}
            />
          )}
        </div>

        <Button type="primary" onClick={handleSave} block style={{ marginTop: 10 }}>
          Thêm Khách Hàng
        </Button>

        <h3 style={{ marginTop: 20 }}>Danh sách Khách hàng</h3>
        <List
          bordered
          dataSource={customers}
          renderItem={(item) => (
            <List.Item
              actions={[
                <a key="edit" onClick={() => setEditingCustomer(item)}>Sửa</a>,
                <a key="delete" onClick={() => handleDelete(item.MaKH)} style={{ color: "red" }}>Xoá</a>
              ]}
            >
              <List.Item.Meta
                title={<a onClick={() => handleInitPortal(item)}>{item.TenKH} - {item.MaKH}</a>}
                description={
                  <div>
                    {item.IsChooseHopDong ? `Hợp đồng STT: ${item.STTHopDong}` : "Không hợp đồng"}
                    {item.Address && <div>Địa chỉ: {item.Address}</div>}
                  </div>
                }
              />
            </List.Item>
          )}
          style={{ maxHeight: "300px", overflow: "auto" }}
        />
      </Space>

      <Modal
        title="Chỉnh sửa Khách Hàng"
        open={!!editingCustomer}
        onOk={handleUpdate}
        onCancel={() => setEditingCustomer(null)}
        okText="Lưu"
        cancelText="Huỷ"
      >
        {editingCustomer && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <div>
              <label>Mã Khách Hàng (không thể đổi):</label>
              <Input value={editingCustomer.MaKH} disabled />
            </div>
            <div>
              <label>Tên Khách Hàng:</label>
              <Input
                value={editingCustomer.TenKH}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, TenKH: e.target.value })}
              />
            </div>
            <div>
              <Checkbox
                checked={editingCustomer.IsChooseHopDong}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, IsChooseHopDong: e.target.checked })}
              >
                Có hợp đồng
              </Checkbox>
            </div>
            {editingCustomer.IsChooseHopDong && (
              <div>
                <label>STT Hợp Đồng:</label>
                <InputNumber
                  style={{ width: "100%" }}
                  value={editingCustomer.STTHopDong}
                  onChange={(val) => setEditingCustomer({ ...editingCustomer, STTHopDong: val || 0 })}
                  min={0}
                />
              </div>
            )}
            <div>
              <label>Địa chỉ:</label>
              <Input
                value={editingCustomer.Address}
                onChange={(e) => setEditingCustomer({ ...editingCustomer, Address: e.target.value })}
              />
            </div>
          </Space>
        )}
      </Modal>
    </Card>
  );
}
