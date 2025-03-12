
importScripts('firebase-app-compat.js', 'firebase-database-compat.js');
import { BuuGuiProps, DataSnapshotProps, KhachHangProps } from '../states/states';
import { NguoiGuiDetailProp, NguoiGuiProp } from './PopupInfo';
import { base64ToBlob, chromeStorageGet, convertBlobsToBlob, customSort, formatDateRight, pdfBlobTo64, saveBlob, toDateString } from './util';
import { delay, createOrActiveTab, waitForTabToLoad } from './util';
type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const firebaseConfig: FirebaseConfig = {
  apiKey: "AIzaSyAs9RtsXMRPeD5vpORJcWLDb1lEJZ3nUWI",
  authDomain: "xonapp.firebaseapp.com",
  databaseURL: "https://xonapp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xonapp",
  storageBucket: "xonapp.appspot.com",
  messagingSenderId: "892472148061",
  appId: "1:892472148061:web:f22a5c4ffd25858726cdb4",
};

let ref: firebase.database.Reference | null = null;
let refPing: firebase.database.Reference | null = null;
let db: any = null;
let keyMessage: string = "maychu";
let TimeStampTemp: string = "";
let token: string = "";
let accountPortal: string = ""
let passwordPortal: string = ""
let buuCuc = ""
console.log('Background script is running');

type Snapshot = {
  TimeStamp?: string;
  [key: string]: any;
};
function setUpAlarm(): void {
  chrome.alarms.create('keep-alive', { periodInMinutes: 0.083 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keep-alive') {
      if (!ref) initFirebase();
    }
  });
}

async function initFirebase(): Promise<void> {
  token = await chromeStorageGet('token')
  accountPortal = await chromeStorageGet('accountPortal')
  passwordPortal = await chromeStorageGet('passwordPortal')
  keyMessage = await chromeStorageGet('keyMessage')
  buuCuc = await chromeStorageGet('buuCuc')
  if (firebase.apps.length === 0) {
    console.log('Initialize Firebase');
    firebase.initializeApp(firebaseConfig);
  }
  db = firebase.database();
  ref = db.ref(`PORTAL/CHILD/${keyMessage}/message/topc`);
  refPing = db.ref(`PORTAL/STATUS/topc`);
  ref.on('value', handleDataChange);
  refPing.on('value', handlePingChange);

}
let TimeStampPing = ""
async function handlePingChange(snapshot: firebase.database.DataSnapshot): Promise<void> {
  const data: Snapshot | null = snapshot.val();
  if (!data || TimeStampPing.length === 0 || TimeStampPing === data.TimeStamp) {
    TimeStampPing = data!.TimeStamp!;
    return;
  } else {
    TimeStampPing = data.TimeStamp!;
  }
  console.log('Data received:', data);
  if (data.Lenh == 'ping') {
    updateToPhone('pong', keyMessage, data.DoiTuong);
    return;
  }
}

async function handleDataChange(snapshot: firebase.database.DataSnapshot): Promise<void> {
  const data: Snapshot | null = snapshot.val();
  if (!data || TimeStampTemp.length === 0 || TimeStampTemp === data.TimeStamp) {
    TimeStampTemp = data!.TimeStamp!;
    return;
  } else {
    TimeStampTemp = data.TimeStamp!;
  }

  const isOk: boolean = await checkToken();
  if (!isOk) {
    const tokenTemp = await loginDirect(accountPortal, passwordPortal);
    if (!tokenTemp) {
      console.log("Token null");
      return;
    }
    saveToken(tokenTemp);
    token = tokenTemp;
  }
  switch (data.Lenh) {

    case "printMaHieus":

      await printMaHieus(JSON.parse(data.DoiTuong))
      break;
    case "laylan":
      var maHieus = await handleGetMaHieus(data);
      //sendMahieu to pc
      const codes: string[] = maHieus!.map(element => element.Code);
      const codesIDs: string[] = maHieus!.map(element => element.IDCODE);

      const result = {
        isSorted: false,
        codes: codes,
        isAutoBD: false,
        isPrinted: true,
        codeIDs: codesIDs // Thêm nếu có ID tương ứng
      };
      console.log('Result:', result);
      updateToPC("checkdingoais", JSON.stringify(result));
      break;
    case "preparePrintMaHieus":
      await preParePrintMaHieus(JSON.parse(data.DoiTuong))
      break;
    case "hoanTatTin":
      await hoanTatTin(JSON.parse(data.DoiTuong))
      break;
    case "dieuTin":
      await dieuTin(JSON.parse(data.DoiTuong))
      break;
    // case "SEND_TEST":
    //   setTestText(data.DoiTuong)
    //   chrome.storage.local.set({ "token": data.DoiTuong + 1 });
    //   break;
    // case "autologin":
    //   var jsonDoiTuong = JSON.parse(data.DoiTuong)
    //   handleSaveAccount(jsonDoiTuong.account, jsonDoiTuong.password)
    //   await autoLogin(jsonDoiTuong)
    //   break;
    case "sendtoportal":
      handleSendToPortal(data.DoiTuong)
      break;
    case "edithanghoa":
      handleEditHangHoa(data);
      break;
    case "getpns":
      let dayLast;
      try {
        dayLast = JSON.parse(data.DoiTuong).day;
      } catch (error) {
        console.error("Error parsing JSON:", error);
        dayLast = "-2"; // hoặc xử lý lỗi khác
      }
      await handleGetPNS(dayLast ?? "-2");
      break;
    case "khoitao":
      await handleKhoiTao(data);
      break;

    case "edittoportal":
      try {
        const bgs = await getBuuGuisFromFirebase();

        const temp1 = JSON.parse(data.DoiTuong);
        const s = findBuuGuiIndex(bgs, temp1.maBG);
        if (s === -1) {
          console.warn("BuuGui not found");
          return;
        }

        const tabId = await getActiveTabId();
        await sendMessageToTab(tabId, bgs, bgs[s], temp1.maKH, keyMessage);
      } catch (error) {
        console.error("Error in edittoportal case:", error);
      }
      break;
    case "stoptoportal":
      // handleStop();
      break;
    case "loginpns":
      //thuc hien tim kiem tab voi ten packnsend.vnpost.vn
      var listTab = await chrome.tabs.query({});
      if (listTab.length === 0) return;
      for (let i = 0; i < listTab.length; i++) {
        if (listTab[i].url?.indexOf("packnsend.vnpost.vn") !== -1) {
          //thuc hien viec gui capchar to content
          chrome.tabs.sendMessage(
            listTab[i].id!,
            {
              message: "SENDCAPCHAR",
              content: data.DoiTuong,
            },
            (res) => {
              if (!chrome.runtime.lastError) {
                console.log("Đã nhận tin nhắn từ content PNS", res);
              } else {
                console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
              }
            }
          );
          break;
        }
      }

      // neu co thi gui capchar content vao it
      //neu khong co thi thong bao
      break;
    case "getPortal":
      await handleGetPortal(data.DoiTuong);
      break;
    // case "test":
    //   var isSended = await chrome.runtime.sendMessage({ "event": "getToken" });
    //   break;
    // case "getToken":
    //   await getToken(data)
    //   break;
    case "printPage":
      await handlePrintPage(data.DoiTuong);
      break;
    case "printPageSort":
      await handlePrintPageSort(data);
      break;

    // case "printPageByIDs":
    //   await handlePrintPageByIDs();
    //   break;
    // case "printBD1New":
    //   printPageById(data.DoiTuong, tokenRef.current, data);
    //   break;
    case "getMaHieus":
      var maHieus = await handleGetMaHieus(data);
      await updateToPhone("getMaHieus", JSON.stringify(maHieus));
      break;

    // case "printMaHieusToFile":
    //   await handlePrintMaHieusToFile(data);
    //   break;
    // case "getMaHieusFromEditPage":
    //   await handleGetMaHieusFromEditPage(data);
    //   break;
    // case "printbd1":
    //   const tab = await getActiveTab();
    //   if (tab && tab.id) {
    //     await sendMessageToContentScript(tab.id, "GETIDKH", keyMessage);
    //   }
    //   break;
    default:
      break;
  }
}
initFirebase();
setUpAlarm()

chrome.runtime.onMessage.addListener(
  function (request, sender, sendResponse) {
    // Kiểm tra xem tin nhắn có đúng event và message bạn mong đợi không
    if (request.event === "CONTENT")
      if (request.message === "SEND_CAPCHAR") {

        // Xử lý dữ liệu captcha ở đây
        // Ví dụ:
        updateToPhone("showcapchar", request.content, request.keyMessage);

        return true; // Hoặc có thể bỏ qua nếu không dùng sendResponse
      } else if (request.message === "SEND_MH") {
        updateToPhone(
          "checkstatemh",
          request.content + "|" + request.content1,
          request.keyMessage
        );
      }
  }
);
const preParePrintMaHieus = async (maHieus: string[]) => {
  await prepareBlobs(maHieus);
}
const handleSendToPortal = async (doiTuong: any) => {
  //change to compat

  var bgsFirebase = await db.ref("PORTAL/BuuGuis/").get();

  var bgs: BuuGuiProps[] = JSON.parse(bgsFirebase.val());

  var temp1 = JSON.parse(doiTuong);
  var s = bgs?.findIndex((m) => m.MaBuuGui === temp1.maBG);
  if (s === -1) {
    return;
  }
  console.log("selected ", s);
  var tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    currentWindow: true,
  });

  const tabId = tabs.length === 0 ? 0 : tabs[0].id!;
  //thcue hien kiem tra check trong nay
  // if (selectedKH?.MaKH === "C007445066") {
  //   isCheckedKL = true;
  // } else isCheckedKL = false;

  //kiem tra option
  console.log(temp1.options);

  await chrome.tabs.sendMessage(
    tabId,
    {
      message: "ADD",
      list: bgs,options:temp1.options,
      current: bgs[s],
      makh: temp1.maKH,
      keyMessage: keyMessage,
    },
    (response) => {
      if (!chrome.runtime.lastError) {
        console.log("Response from content ", response);
      } else {
        console.log("Error from content ", response);
      }
    }
  );
}


async function dieuTin(maHieus: any) {
  // printMaHieus(JSON.parse(data.DoiTuong) as string[], token);
  var activeTab = await createOrActiveTab("https://packnsend.vnpost.vn/tin/quan-ly-tin.html", "quan-ly-tin")
  var text = "";
  for (let i = 0; i < maHieus.length; i++) {
    const element = maHieus[i];
    text += element + " "
  }
  if (activeTab != undefined)
    //wait 2s
    await delay(2000);

  await chrome.scripting.executeScript({
    target: { tabId: activeTab!.id! }, func: (text) => {
      var textTr = document.querySelector("#txtTrackingCode") as HTMLInputElement;
      textTr.value = text

    }, args: [text]
  })
}

async function hoanTatTin(maHieus: any) {
  // printMaHieus(JSON.parse(data.DoiTuong) as string[], token);
  var activeTab = await createOrActiveTab("https://packnsend.vnpost.vn/hoan-tat-tin.html", "hoan-tat-tin")
  var text = "";
  for (let i = 0; i < maHieus.length; i++) {
    const element = maHieus[i];
    text += element + ","
  }
  if (activeTab != undefined)
    //send command
    await delay(2000)
  await chrome.scripting.executeScript({
    target: { tabId: activeTab!.id! }, func: (text) => {
      var textTr = document.querySelector("#txtLadingCode") as HTMLInputElement;
      textTr.value = text

    }, args: [text]
  })

}
const prepareBlobs = async (maHieus: string[]) => {
  //đảo ngược maHieus
  maHieus = maHieus.reverse()
  //2	1	Bưu kiện - Parcel	1	593200	562310	29/12/2024	TB	2,0	CB593856255VN
  var blobsTemp: BlobStruct[] = await loadTodaysBlobs();
  for (let index = 0; index < maHieus.length; index++) {
    try {
      const element = maHieus[index];
      updateToPhone("message", `Đang lưu ${index + 1}|${maHieus.length} MH ${element} `);
      chrome.action.setBadgeText({ text: (index + 1).toString() });
      var blob: Blob | null = null;
      if (blobsTemp.find(m => m.maHieu === element) != null) {
        blob = blobsTemp.find(m => m.maHieu === element)?.blob!
      } else
        blob = await getBlobMaHieu(element)

      if (blob != null) {
        //save blob to indexedDB
        await saveBlob({ maHieu: element, blob: blob, dateCreated: Date.now() })
      }
      else {
        updateToPhone("message", `Lỗi MH khi in ${element}`);
        break;
      }
    } catch {
      break
    }
  }
}

const handlePrintPageSort = async (data: any) => {
  var res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token)

  var maHieus = (res as NguoiGuiDetailProp[])
    .map((m) => m.itemDetails.map((n) => n.ttNumber))
    .flat();
  //sap xep ma hieu
  maHieus.sort(customSort)
  await printMaHieus(maHieus)
}

const checkToken = async (): Promise<boolean> => {
  const res = await getMaHieusFromPortalId(["1034814510"], token);
  return res ? true : false;
};


function saveToken(token: string): void {
  chrome.storage.local.set({ token });
  console.log('Token saved:', token);
}
async function saveStorage(value: string): Promise<void> {
  await chrome.storage.local.set({ "blobs": value });
}

const handleGetMaHieus = async (data: any) => {
  const res = await getMaHieusFromPortalId(JSON.parse(data.DoiTuong), token);
  if (!res) return
  const maHieus = res
    .map((m) => m.itemDetails.map((n) => ({
      ID: m.id,
      Code: n.ttNumber,
      IDCODE: n.id,
      Weight: n.weight,
      Address: n.receiverAddress,
      Name: n.receiverName,
      Date: n.createdDate,
    })))
    .flat();
  return maHieus
};


const handleGetPortal = async (time: string = "") => {
  updateToPhone("message", " Đang lấy data từ Portal");
  handleGetDataFromPortal(time);
};
const handleGetDataFromPortal = async (time: string) => {
  try {
    let toDayText = formatDateRight(new Date());
    if (time != "") {
      toDayText = time;
      console.log(time)
    }
    const data: any = await getItemHdr(toDayText);
    if (data.status === 401) {
      return;
    }

    const newItems = data.map((m: NguoiGuiProp) => ({
      Id: m.id,
      Name: m.name,
      MaKH: m.code,
      TrangThai: m.status,
      SoLuong: m.amount,
      NguoiNhap: m.username,
    }));
    // / Xóa dữ liệu tại "PORTAL/MAINPAGE / "
    await db.ref("PORTAL/MAINPAGE/").remove();

    // Ghi dữ liệu mới vào "PORTAL/MAINPAGE/"
    await db.ref("PORTAL/MAINPAGE/").set(newItems);

  } catch (error) {
    console.error("Error fetching data from portal:", error);
  }
};

const handleEditHangHoa = (data: any) => {
  createOrActiveTab(
    "https://portalkhl.vnpost.vn/itemhdr/?id=" + data.DoiTuong,
    "portalkhl.vnpost.vn",
    true
  );
};



const printMaHieus = async (maHieus: string[]) => {
  var blobs: Blob[] | null = await getBlobs(maHieus);
  console.log('1')
  if (blobs == null)
    return;
  var tab = await createOrActiveTab(
    "https://example.com/",
    "https://example.com/",
    false, false, true
  );
  var blob = await convertBlobsToBlob(blobs)
  var base64String = await pdfBlobTo64(blob);
  await saveStorage(base64String);

  //waiting 1 s
  await delay(1000);
  await chrome.tabs.sendMessage(tab!.id!, { message: "PRINTBLOB" });
}



const updateToPhone = async (
  lenh: String,
  doiTuong: String,
  key: string = keyMessage
) => {

  await db.ref(`PORTAL/CHILD/${key}/message/tophone`).set({
    Lenh: lenh,
    DoiTuong: doiTuong,
    TimeStamp: Date.now().toLocaleString(),
  }).catch((error: any) => {
    console.error('Error saving data:', error);
  });
}
const updateToPC = async (
  lenh: String,
  doiTuong: String,
  key: string = keyMessage
) => {

  await db.ref(`${keyMessage}/message/topc`).set({
    Lenh: lenh,
    DoiTuong: doiTuong,
    TimeStamp: Date.now().toLocaleString(),
  }).catch((error: any) => {
    console.error('Error saving data:', error);
  });
}

//create struct for blobs have blob and maHieu
interface BlobStruct {
  maHieu: string;
  blob: Blob;
  dateCreated: number; // Số miligiây kể từ Epoch (dùng new Date().getTime())
}
const getBlobs = async (maHieus: string[]) => {
  //đảo ngược maHieus
  // maHieus = maHieus.reverse()
  //2	1	Bưu kiện - Parcel	1	593200	562310	29/12/2024	TB	2,0	CB593856255VN
  var blobs: Blob[] = [];
  var blobsTemp: BlobStruct[] = await loadTodaysBlobs();
  for (let index = 0; index < maHieus.length; index++) {
    try {
      const element = maHieus[index];
      updateToPhone("message", `Đang cb in ${index + 1}|${maHieus.length} MH ${element} `);
      chrome.action.setBadgeText({ text: (index + 1).toString() });

      var blob: Blob | null = null;
      if (blobsTemp.find(m => m.maHieu === element) != null) {
        blob = blobsTemp.find(m => m.maHieu === element)?.blob!
      } else
        blob = await getBlobMaHieu(element)

      if (blob != null) {
        //save blob to indexedDB
        await saveBlob({ maHieu: element, blob: blob, dateCreated: Date.now() })
        blobs.push(blob!);
      }
      else {
        updateToPhone("message", `Lỗi MH khi in ${element}`);
        return null;
      }
    } catch {
      break
    }
  }
  return blobs;
}
const getBlobMaHieu = async (maHieu: string): Promise<Blob | null> => {
  const res = await fetchPrintByMH(maHieu, token)
  const base64String = res[0]; // your base64 string
  return base64ToBlob(base64String, "application/pdf");
}


async function loadTodaysBlobs(): Promise<BlobStruct[]> {
  return new Promise<BlobStruct[]>((resolve, reject) => {
    const openRequest: IDBOpenDBRequest = indexedDB.open("MyDatabase", 1);

    // Nếu database chưa tồn tại hoặc cần nâng cấp phiên bản
    openRequest.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("blobs")) {
        const objectStore = db.createObjectStore("blobs", { keyPath: "maHieu" });
        objectStore.createIndex("dateCreatedIndex", "dateCreated", { unique: false });
      }
    };

    openRequest.onsuccess = (event: Event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = db.transaction("blobs", "readonly");
      const objectStore = transaction.objectStore("blobs");
      const dateIndex = objectStore.index("dateCreatedIndex");

      // Xác định khoảng thời gian cho ngày hôm nay
      const now = new Date();
      const startOfToday: number = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfTomorrow: number = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();

      // Tạo IDBKeyRange từ đầu ngày hôm nay đến cuối ngày (startOfTomorrow - 1ms)
      const range = IDBKeyRange.bound(startOfToday, startOfTomorrow - 1);

      const blobsTemp: BlobStruct[] = [];
      const cursorRequest: IDBRequest = dateIndex.openCursor(range);

      cursorRequest.onsuccess = (event: Event) => {
        const cursor: IDBCursorWithValue | null = (event.target as IDBRequest).result;
        if (cursor) {
          blobsTemp.push(cursor.value);
          cursor.continue();
        } else {
          resolve(blobsTemp);
        }
      };

      cursorRequest.onerror = (event: Event) => {
        reject((event.target as IDBRequest).error);
      };
    };

    openRequest.onerror = (event: Event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}
const khoitaoPNS = async () => {
  //thuc hien kiem tra pns co khong
  //neu khong co thi tao tab moi
  var tab: any = await createOrActiveTab(
    "https://packnsend.vnpost.vn/",
    "packnsend.vnpost.vn"
  );
  await delay(3000);
  //neu co thi thuc hien lay du lieu
  chrome.tabs.sendMessage(
    tab.id!,
    {
      message: "KHOITAOPNS",
      keyMessage: keyMessage,
    },
    (res) => {
      if (!chrome.runtime.lastError) {
        console.log("Đã nhận tin nhắn từ content PNS", res);
      } else {
        console.log("Lỗi khi nhận tin nhắn từ content PNS", res);
      }
    }
  );
};
const handleGetPNS = async (dayLast: any) => {
  updateToPhone("message", "Đã nhận lệnh lấy dữ liệu từ PNS");
  let khachHangsTemp = await handleGetDataFromPNS(dayLast);
  if (khachHangsTemp.length > 0) {
    console.log(khachHangsTemp)
    khachHangsTemp.forEach((m) => {
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
    await db.ref("PNS/KhachHangs").set(khachHangsTemp);
    await db.ref("PNS/TimeUpdate").set(new Date().toLocaleTimeString());
  } else {
    updateToPhone("message", "Chưa đăng nhập PNS");
    await khoitaoPNS();
  }
};
const tichHopCookieToString = (cookies: chrome.cookies.Cookie[]): string => {
  var text = "";
  cookies.forEach((m) => {
    text += m.name + "=" + m.value + "; ";
  });
  return text;
};

const getAllCookies = (url: string) => {
  return new Promise<string>((resolve, _reject) => {
    chrome.cookies.getAll({ domain: url }, (cookies) => {
      const texts: string = tichHopCookieToString(cookies);
      resolve(texts);
    });
  });
};
const getCookieFromWeb = async (url: string) => {
  const cookiesText = await getAllCookies(url);
  return cookiesText;
};

const khoiTaoPortal = async (data: any, infoAccount: any) => {
  try {
    var tab = await createOrActiveTab(
      "https://portalkhl.vnpost.vn/accept-api",
      "portalkhl.vnpost.vn",
      true
    );
    // var tab = await createOrActiveTab(
    //   "https://genk.vn",
    //   "https://genk.vn",
    //   true
    // );

    // Chờ cho tab tải xong
    const loadedTab: any = await waitForTabToLoad(tab!.id!);

    if (tab === undefined || loadedTab === undefined) {
      return;
    }

    let isLoginOK = false;


    //check loadedTab url
    if (loadedTab.url.indexOf('login') != -1) {
      isLoginOK = false;
      console.log("Tab đang ở trang login và đang đăng nhập vào Portal");
      var tabs: any = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs.length > 0) {
        console.log("xong lay tab ", tabs[0].id)
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (mAccount, mPassword) => {
            // Gửi tin nhắn đến mainscript.js
            window.postMessage({
              type: "CONTENT",
              message: "ADDLOGIN",
              account: mAccount,
              password: mPassword,
            })
          },
          args: [accountPortal, passwordPortal]
        }, res => {
          console.log("xong lay scripting")
          return true
        })
      }
      await delay(2000)
      console.log("dangkyxong sau khi cho 2s và chuẩn bị chờ tab load", loadedTab);
      // const login2: any = await waitForTabToLoad(tab!.id);
      // console.log("tabid ",login2!)
      // if(login2.url.indexOf('login')!= -1){
      //   isLoginOK = false;
      // }else{
      isLoginOK = true;
      // }
    }
    else {
      isLoginOK = true
    }
    console.log('cho 1 s')
    await delay(1000)
    if (isLoginOK) {
      console.log('login thanh cong va chay tiep')
      // var isSended = await chrome.runtime.sendMessage("getToken");


      var res = await chrome.tabs.sendMessage(loadedTab.id!, {
        message: "KHOITAOPORTAL",
        ...data,
        keyMessage: keyMessage,
      });


      if (!chrome.runtime.lastError) {
        console.log("Đã nhận tin nhắn từ content KhoiTaoPortal", res);
        updateToPhone("checkhopdong", res.data);
      } else {
        console.log("Lỗi khi nhận tin nhắn từ content KhoiTaoPortal", res);
      }
    } else {
      console.log("Đăng nhập vào Portal thất bại");
    }

    // await createTab("https://google.com.vn");
  } catch (error) {
    console.log("Error ", error);
  }
};
const handleKhoiTao = async (data: any) => {
  updateToPhone("message", "Đã nhận lệnh khởi tạo");

  const temp = JSON.parse(data.DoiTuong);
  const snapshot = await db.ref("PORTAL/HopDongs/" + temp.maKH).get();
  const hopDong = snapshot.val();
  await khoiTaoPortal(hopDong, temp);
};
const handleGetDataFromPNS = async (dayLast: any): Promise<KhachHangProps[]> => {
  // var cookie = await getCookieFromWeb("packnsend.vnpost.vn");
  const data = await getDataFromPNS(dayLast);
  if (data == null)
    return []
  const snapshots = changePNSObjectToSnapshots(data.Data);
  const khachHangs = changeSnapshotToKHs(snapshots);
  khachHangs.sort((a, b) => b.BuuGuis.length - a.BuuGuis.length);
  return khachHangs
};
const changePNSObjectToSnapshots = (list: any): DataSnapshotProps[] => {
  return list.map((element: any, index: number) => ({
    Index: index,
    KhoiLuong: element.Weigh,
    MaBuuGui: element.QuantityString,
    MaKH: element.CustomerCode,
    MaTin: element.Code,
    TenKH: element.CustomerFullName,
    TenNguoiGui: element.ContactName,
    TimeNhanTin: element.LastUpdateTime,
    TimeTrangThai: element.LastUpdateTime,
    TrangThai: element.StatusName,
  }));
};
const changeSnapshotToKHs = (snapshots: DataSnapshotProps[]): KhachHangProps[] => {
  const khachHangs: KhachHangProps[] = [];
  snapshots.forEach((element) => {
    const buuGui: BuuGuiProps = {
      index: 1,
      KhoiLuong: element.KhoiLuong,
      MaBuuGui: element.MaBuuGui,
      TimeTrangThai: element.TimeTrangThai,
      TrangThai: element.TrangThai,
    };

    const b = khachHangs.findIndex((m) => m.MaKH === element.MaKH);
    if (b === -1) {
      khachHangs.push({
        Index: 0,
        MaKH: element.MaKH,
        MaTin: element.MaTin,
        TenKH: element.TenKH,
        TenNguoiGui: element.TenNguoiGui,
        TimeNhanTin: element.TimeNhanTin,
        countState: {
          countChapNhan: 0,
          countDangGom: 0,
          countNhanHang: 0,
          countPhanHuong: 0,
        },
        BuuGuis: [buuGui],
      });
    } else {
      buuGui.index = khachHangs[b].BuuGuis.length + 1;
      khachHangs[b].BuuGuis.push(buuGui);
    }
  });
  return khachHangs;
};
const getBuuGuisFromFirebase = async () => {
  //change to compat

  const bgsFirebase = await ref.child("PORTAL/BuuGuis/").get();
  return JSON.parse(bgsFirebase.val());
};

const findBuuGuiIndex = (bgs: any, maBG: any) => {
  return bgs.findIndex((m: any) => m.MaBuuGui === maBG);
};

const getActiveTabId = async () => {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
    currentWindow: true,
  });
  return tabs.length === 0 ? 0 : tabs[0].id!;
};
const sendMessageToTab = async (tabId: any, bgs: any, currentBuuGui: any, maKH: any, keyMessage: any) => {
  await chrome.tabs.sendMessage(
    tabId,
    {
      message: "ADD",
      list: bgs,
      current: currentBuuGui,
      makh: maKH,
      keyMessage: keyMessage,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message to tab:", chrome.runtime.lastError);
      } else {
        console.log("Response from content script:", response);
      }
    }
  );
};

const handlePrintPage = async (data: any) => {
  var listJsonItem = await getMaHieusFromPortalId(JSON.parse(data), token);

  var res = await fetch("https://api-portalkhl.vnpost.vn/khl2024/khl/jasper/JasperVD", {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      authorization: `Bearer  ${token}`,
      capikey: "19001235",
      "content-type": "application/json; charset=UTF-8",
      dnt: "1",
      origin: "https://portalkhl.vnpost.vn",
      referer: "https://portalkhl.vnpost.vn/",
      "sec-ch-ua":
        '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    },
    referrer: "https://portalkhl.vnpost.vn/",
    referrerPolicy: "strict-origin-when-cross-origin",
    body: JSON.stringify({
      idcheck: listJsonItem,
      listReport: ["BD1New"],
      lienNumbers: ["1"],
      hiddenPrice: false,
    }),
    method: "POST",
    mode: "cors",
    credentials: "include",
  })
  var data = await res.json()
  var tab = await createOrActiveTab(
    "https://example.com/",
    "https://example.com/",
    false, false, true
  );
  const base64String = data[0]; // your base64 string
  await saveStorage(base64String);

  //waiting 1 s
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await chrome.tabs.sendMessage(tab!.id!, { message: "PRINTBLOB" });

};



const API_BASE_URL = "https://api-portalkhl.vnpost.vn";
const PNS_BASE_URL = "https://packnsend.vnpost.vn";
const fetchPrintByMH = async (maHieu: string, token: string): Promise<any> => {
  const res = await fetch(`${API_BASE_URL}/khl2024/khl/jasper/printByTTNumber`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; charset=UTF-8",
      authorization: `Bearer ${token}`,
      capikey: "19001235"
    },
    body: JSON.stringify({ ttNumber: maHieu, listReport: ["BD1New"], lienNumbers: ["1"], hiddenPrice: false })
  });
  return res.json();
};

const getMaHieusFromPortalId = async (ids: any, token: string): Promise<NguoiGuiDetailProp[] | null> => {
  console.log('IDS ', ids)

  const res = await Promise.all(
    ids.map((id: string) =>
      fetch(`${API_BASE_URL}/khl/portalItem/getItemHdr`, {
        headers: {
          accept: "application/json, text/plain, */*",
          "accept-language": "en-US,en;q=0.9,vi;q=0.8",
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=UTF-8",
          "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-site",
        },
        referrer: "https://portalkhl.vnpost.vn/",
        referrerPolicy: "strict-origin-when-cross-origin",
        body: `${id}`, // Assuming body is just the id
        method: "POST",
        mode: "cors",
        credentials: "include",
      }).then((res) => res.json())
    )
  );
  if (res[0].status === 401 || res[0].status === 400) return null;
  return res as NguoiGuiDetailProp[];
};
const getItemHdr = async (toDayText: string): Promise<NguoiGuiProp[]> => {
  const res = await fetch(`${API_BASE_URL}/khl/getItemHdr`, {
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      authorization: `Bearer ${token}`,
      capikey: "19001235",
      "content-type": "application/json; charset=UTF-8",
      "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    },
    referrer: "https://portalkhl.vnpost.vn/",
    referrerPolicy: "strict-origin-when-cross-origin",
    body: `{"orgCode":"${buuCuc}","tuNgay":"${toDayText}","denNgay":"${toDayText}","sourceSystem":"KHL","origin":""}`,
    method: "POST",
    mode: "cors",
    credentials: "include",
  });
  return res.json();
};

const getDataFromPNS = async (dayLast: string): Promise<any> => {
  const res = await fetch(`${PNS_BASE_URL}/Order/Home/ExportExcellOrderManage`, {
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9,vi;q=0.8",
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "sec-ch-ua": '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "x-requested-with": "XMLHttpRequest",
      cookie: "_ga=GA1.1.1252308094.1682309904; tctbdvn-_zldp=yr040hnCEdI2kxlbdwBeQuILj7FFHTSRALXKDo17bUf5oxEi8nvo1%2FHkNiXB4tD3VVj9liGvi%2BU%3D; _ga_PX3P5JLJ7K=GS1.1.1692945085.4.0.1692945085.0.0.0; _ga_TDJH6SEKEF=GS1.1.1703234131.4.1.1703234170.0.0.0; __SRVNAME=pns7; ASP.NET_SessionId=1tl4k4fo4bu5vhqwn53coee3; .ASPXAUTH=9E1633939FA3B00F904E422CCCB86B402F1B1A92F702B251189551D02FEB874EC894F1B04112D0BC9C69BFF93094451F2651D82616FEB484B469B41DDF924CC365801E490B1E3C2D21E993FBAB7EDCCB4716418487A4F9F4D87BC8C3F2A1F8175F2B8048EFC2B4FFABF23E7F62887AB9; panelIdCookie=userid=593280_xonld",
      Referer: "https://packnsend.vnpost.vn/tin/quan-ly-tin.html?startDate=11%2F02%2F2024&endDate=11%2F02%2F2024",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
    body: `Id=0&FromDate=${toDateString(dayLast)}+&ToDate=+${toDateString(0)}&Code=&CustomerCode=&Status=&ContactPhone=&TrackingCode=&Page=0&Channel=&senderDistrictId=0&senderWardId=0&flagConfig=&orderNumber=&serviceCodeMPITS=`,
    method: "POST",
  });
  let data: any = null;
  try {

    data = await res.json()
  } catch {
    data = null

  }
  return data;
};
const loginDirect = async (account: string, password: string): Promise<string | null> => {
  const res = await fetch(`${API_BASE_URL}/api/auth/signinKhl`, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "content-type": "application/json; charset=UTF-8",
      capikey: "19001235"
    },
    body: JSON.stringify({ username: account, password: password, ip: "", random: Math.random() })
  });
  const data = await res.json();
  return data.tokenFe || null;
};

function sendPong() {
  db.ref(`PORTAL/STATUS/${keyMessage}`).set({ timestamp: Date.now(), online: true });
}
