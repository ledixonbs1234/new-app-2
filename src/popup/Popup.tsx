

import { Button, Card, Input,  Space } from "antd";
import { useEffect, useState } from "react";

export default function Popup() {

  const [keyMessageInput, setKeyMessageInput] = useState<string>("");
  const [accountPortal, setAccountPortal] = useState<string>("");
  const [passwordPortal, setPasswordPortal] = useState<string>("");
  const [buuCuc, setBuuCuc] = useState<string>("593200");

  useEffect(() => {
    console.log("Popup is running...");
    //get keymessage accountPortal and passwordPortal from storage
    chrome.storage.local.get(["keyMessage", "accountPortal", "passwordPortal","buuCuc"], (result) => {
      setKeyMessageInput(result.keyMessage);
      setAccountPortal(result.accountPortal);
      setPasswordPortal(result.passwordPortal);
      setBuuCuc(result.buuCuc);
    });
  }, []);

  function handleSaveKey(): void {
    if (keyMessageInput === "") {
      alert("Key không được để trống");
      return;
    }
    chrome.storage.local.set({ keyMessage: keyMessageInput }, () => {
      console.log("Saved key message");
    });
    chrome.runtime.reload();
  }

  function handleSaveAccount(accountPortal: string, passwordPortal: string,buuCuc:string): void {
    if (!accountPortal || !passwordPortal  || !buuCuc ) {
      alert("Tài khoản hoặc mật khẩu và bưu cục không được để trống");
      return;
    }
    chrome.storage.local.set({ accountPortal: accountPortal, passwordPortal: passwordPortal,buuCuc:buuCuc }, () => {
      console.log("Saved account and password");
    });
    chrome.runtime.reload();
  }

  return (
    //center page
    <div style={{ width: "auto", margin: "auto", marginTop: "20px" }}>
      <Card style={{ width: "500px" }}>

        <Card style={{}}>
          <Space direction="vertical">
            <Space.Compact style={{ width: "300px" }} direction="horizontal">
              <Input
                placeholder="Key"
                value={keyMessageInput}
                onChange={(e) => {
                  setKeyMessageInput(e.target.value);
                }} />
              <Button type="primary" onClick={handleSaveKey}>
                Submit
              </Button>
            </Space.Compact>
            <Space direction="horizontal">
            </Space>
          </Space>


        </Card>
        <Card style={{ marginTop: "20px" }}>
          {/* Tạo username input và password input and save */}
          <Space direction="vertical">
            <Space direction="horizontal">
              <Input
                placeholder="Tài khoản"
                value={accountPortal}
                onChange={(e) => {
                  setAccountPortal(e.target.value);
                }} />
              <Input.Password
                placeholder="Mật khẩu"
                value={passwordPortal}
                onChange={(e) => {
                  setPasswordPortal(e.target.value);
                }} />
              <Button onClick={() => handleSaveAccount(accountPortal, passwordPortal,buuCuc)}>Lưu Tài Khoản</Button>
            </Space>
            <Space>
              <Input
                placeholder="Bưu cục"
                style={{ color: "blue", fontWeight: "bold" }}
                value={buuCuc}
                onChange={(e) => {
                  setBuuCuc(e.target.value);
                }} />

            </Space>
          </Space>
        </Card>

      </Card>


    </div>

  );
}




