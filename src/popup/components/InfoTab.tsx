import React, { useEffect, useState } from "react";
import { Button, Input, Space, Card, message, List, Radio, Popconfirm, Modal } from "antd";
import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { db, ref, set, onValue, remove, push } from "../utils/firebaseConfig";

interface InfoTabProps {
  onSaveAccount: (acc: string, pass: string, token: string, bc: string, key: string) => void;
}

interface AiKeyItem {
  id: string;
  name: string;
  key: string;
}

export default function InfoTab({ onSaveAccount }: InfoTabProps) {
  // --- State cho Account Info ---
  const [keyMessageInput, setKeyMessageInput] = useState<string>("");
  const [accountPortal, setAccountPortal] = useState<string>("");
  const [passwordPortal, setPasswordPortal] = useState<string>("");
  const [tokenPortal, setTokenPortal] = useState<string>("");
  const [buuCuc, setBuuCuc] = useState<string>("");

  // --- State cho AI Keys ---
  const [aiKeys, setAiKeys] = useState<AiKeyItem[]>([]);
  const [selectedAiKeyId, setSelectedAiKeyId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<AiKeyItem | null>(null);
  const [inputName, setInputName] = useState("");
  const [inputKey, setInputKey] = useState("");

  // Load local storage data
  useEffect(() => {
    chrome.storage.local.get(
      ["keyMessage", "accountPortal", "passwordPortal", "token", "buuCuc", "selectedAiKeyId"],
      (result) => {
        setKeyMessageInput(result.keyMessage || "");
        setAccountPortal(result.accountPortal || "");
        setPasswordPortal(result.passwordPortal || "");
        setTokenPortal(result.token || "");
        setBuuCuc(result.buuCuc || "593200");
        setSelectedAiKeyId(result.selectedAiKeyId || "");
      }
    );
  }, []);

  // Load AI Keys từ Firebase (Global)
  useEffect(() => {
    const keysRef = ref(db, "AI_KEYS");
    const unsubscribe = onValue(keysRef, (snapshot) => {
      const data = snapshot.val();
      const loadedKeys: AiKeyItem[] = [];
      if (data) {
        Object.entries(data).forEach(([id, value]: [string, any]) => {
          loadedKeys.push({ id, name: value.name, key: value.key });
        });
      }
      setAiKeys(loadedKeys);
    });
    return () => unsubscribe();
  }, []);

  // Xử lý lưu thông tin Account
  const handleSaveInfo = () => {
    if (!keyMessageInput) {
      message.error("Key Message không được để trống");
      return;
    }
    // Lưu keyMessage riêng vì logic cũ có vẻ dùng nó để init Firebase
    chrome.storage.local.set({ keyMessage: keyMessageInput });
    
    // Gọi hàm save account truyền từ props
    onSaveAccount(accountPortal, passwordPortal, tokenPortal, buuCuc, keyMessageInput);
    message.success("Đã lưu thông tin tài khoản!");
  };

  // --- Xử lý AI Keys ---

  const handleAddOrEditKey = () => {
    if (!inputName || !inputKey) {
      message.error("Vui lòng nhập tên và key");
      return;
    }

    if (editingKey) {
      // Edit
      set(ref(db, `AI_KEYS/${editingKey.id}`), {
        name: inputName,
        key: inputKey
      }).then(() => message.success("Đã cập nhật Key"));
    } else {
      // Add New
      const newKeyRef = push(ref(db, "AI_KEYS"));
      set(newKeyRef, {
        name: inputName,
        key: inputKey
      }).then(() => message.success("Đã thêm Key mới"));
    }
    closeModal();
  };

  const handleDeleteKey = (id: string) => {
    remove(ref(db, `AI_KEYS/${id}`)).then(() => {
      message.success("Đã xóa Key");
      if (selectedAiKeyId === id) {
        handleSelectKey(""); // Reset nếu xóa key đang chọn
      }
    });
  };

  const handleSelectKey = (id: string) => {
    setSelectedAiKeyId(id);
    const selectedKeyObj = aiKeys.find(k => k.id === id);
    const keyValue = selectedKeyObj ? selectedKeyObj.key : ""; // Nếu id rỗng (Default) thì key rỗng

    // Lưu ID để UI biết đang chọn cái nào
    // Lưu Key Value để background script dùng
    chrome.storage.local.set({ 
      selectedAiKeyId: id,
      selectedAiKey: keyValue 
    }, () => {
        if(id) message.success(`Đã chọn Key: ${selectedKeyObj?.name}`);
        else message.info("Đã chuyển về Key Mặc định");
    });
  };

  const openModal = (item?: AiKeyItem) => {
    if (item) {
      setEditingKey(item);
      setInputName(item.name);
      setInputKey(item.key);
    } else {
      setEditingKey(null);
      setInputName("");
      setInputKey("");
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingKey(null);
    setInputName("");
    setInputKey("");
  };

  return (
    <div style={{ padding: 10 }}>
      {/* --- Phần 1: Thông tin Tài khoản & Hệ thống --- */}
      <Card title="Thông tin Hệ thống & Portal" size="small" style={{ marginBottom: 15 }}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input 
              placeholder="Key Message (Máy chủ)" 
              value={keyMessageInput} 
              onChange={(e) => setKeyMessageInput(e.target.value)} 
              prefix={<span style={{color:'#999', fontSize:12}}>Key:</span>}
            />
          </Space.Compact>

          <Space direction="vertical" size="small" style={{ width: "100%" }}>
            <Input 
              placeholder="Tài khoản Portal" 
              value={accountPortal} 
              onChange={(e) => setAccountPortal(e.target.value)} 
            />
            <Input.Password 
              placeholder="Mật khẩu Portal" 
              value={passwordPortal} 
              onChange={(e) => setPasswordPortal(e.target.value)} 
            />
            <Input 
              placeholder="Token (Authorization)" 
              value={tokenPortal} 
              onChange={(e) => setTokenPortal(e.target.value)} 
            />
            <Input 
              placeholder="Mã Bưu Cục" 
              value={buuCuc} 
              onChange={(e) => setBuuCuc(e.target.value)} 
              style={{ fontWeight: "bold", color: "blue" }}
            />
          </Space>
          
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveInfo} block>
            Lưu Thông Tin
          </Button>
        </Space>
      </Card>

      {/* --- Phần 2: Quản lý AI Keys --- */}
      <Card 
        title="Quản lý Gemini AI Keys" 
        size="small" 
        extra={<Button type="link" size="small" icon={<PlusOutlined />} onClick={() => openModal()}>Thêm</Button>}
      >
        <div style={{ maxHeight: 250, overflowY: 'auto' }}>
          <List
            size="small"
            dataSource={[{ id: "", name: "Mặc định (System Key)", key: "" }, ...aiKeys]}
            renderItem={(item) => (
              <List.Item
                actions={item.id ? [
                  <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openModal(item)} />,
                  <Popconfirm title="Xóa key này?" onConfirm={() => handleDeleteKey(item.id)}>
                    <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                  </Popconfirm>
                ] : []}
              >
                <List.Item.Meta
                  avatar={
                    <Radio 
                      checked={selectedAiKeyId === item.id} 
                      onChange={() => handleSelectKey(item.id)}
                    />
                  }
                  title={<span style={selectedAiKeyId === item.id ? {color: '#1890ff', fontWeight: 'bold'} : {}}>{item.name}</span>}
                  description={item.id ? `...${item.key.slice(-6)}` : "Key tích hợp sẵn"}
                />
              </List.Item>
            )}
          />
        </div>
      </Card>

      {/* Modal Thêm/Sửa Key */}
      <Modal
        title={editingKey ? "Chỉnh sửa Key" : "Thêm Key mới"}
        open={isModalOpen}
        onOk={handleAddOrEditKey}
        onCancel={closeModal}
        width={400}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input 
            placeholder="Tên gợi nhớ (VD: Key Cá Nhân 1)" 
            value={inputName} 
            onChange={(e) => setInputName(e.target.value)} 
          />
          <Input.Password 
            placeholder="Gemini API Key" 
            value={inputKey} 
            onChange={(e) => setInputKey(e.target.value)} 
          />
        </Space>
      </Modal>
    </div>
  );
}