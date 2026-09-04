import React, { useState, useEffect, useRef } from 'react';
import { Button, Table, DatePicker, Space, Card, message, Typography, Progress, Select } from 'antd';
import dayjs from 'dayjs';
import { PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface Customer {
    code: string;
    name: string;
}

const CUSTOMER_DATA: Customer[] = [
    { code: "C000918328", name: "Shop Áo Cưới Ngọc Hà ( Nguyễn Thị Cậy- Nguyễn Thị Yến )" },
    { code: "C001048747", name: "Cao Văn Biết" },
    { code: "C001048954", name: "Nguyễn Võ Huy Hoàng - HN.HOANGNVH" },
    { code: "C001049464", name: "Npp Trọng Tín - HN.NPP.TT2" },
    { code: "C001064740", name: "Npp Trường Hải - HN.NPP.TH" },
    { code: "C001064753", name: "Cửa Hàng Xe Đạp Thành - HN.XDT" },
    { code: "C001451845", name: "Hạt Kiểm Lâm Khu Vực Hoài Nhơn" },
    { code: "C001761391", name: "Lương Thị Phê" },
    { code: "C002457460", name: "Hàng Đổi Trả SHOP NGUYỄN ĐÌNH HUÂN" },
    { code: "C002476883", name: "Su Su Phan" },
    { code: "C002760865", name: "Lương Thị Huệ" },
    { code: "C003311024", name: "Nguyễn Thu Trang" },
    { code: "C003596193", name: "Công Ty BHNT Daiichi Bồng Sơn" },
    { code: "C004880778", name: "BonSai Trường Thi" },
    { code: "C004937605", name: "Lê Hồng Thắm - Méo BonSai" },
    { code: "C004937747", name: "Tòng BonSai" },
    { code: "C005152833", name: "Tính Shop" },
    { code: "C005166347", name: "VÕ NGỌC PHỤNG " },
    { code: "C005378032", name: "Hồng Uyên" },
    { code: "C005480706", name: "Toàn Nguyễn" },
    { code: "C006081400", name: "Shop Thành Vũ" },
    { code: "C006230404", name: "Nguyễn Trọng Tiên" },
    { code: "C006554229", name: "Vũ Thị Hòa" },
    { code: "C006833047", name: "Ngân Hàng Tmcp Bưu Điện Liên Việt Cn Hoài Nhơn" },
    { code: "C007323558", name: "Nguyễn Loan" },
    { code: "C008291896", name: "Lương Thị Phê" },
    { code: "C015304312", name: "Vườn Lan Việt Anh ( Như Trinh)" },
    { code: "C015451942", name: "CHANH TIN FOOD" },
    { code: "C015523746", name: "Duan Bridal" },
    { code: "C015693161", name: "Công Ty Cp Sx Tm & Xd Hoài Nhơn" },
    { code: "C016671763", name: "CÔNG TY TNHH TỔNG HỢP NHÂN ANH" },
    { code: "C017104968", name: "Xưởng Tiểu Cảnh" },
    { code: "C017222616", name: "Cao Su Minh Phúc" },
    { code: "C017446579", name: "Shop Diệp Hoàng Mã Một Phần" },
    { code: "C017499735", name: "Xe Điện Duy Đức" },
    { code: "C017709920", name: "Nước Mắm Truyền Thống" },
    { code: "C017853745", name: "Thâm Thị Cẩm Hồng" },
    { code: "C018287613", name: "Phòng Kinh Tế Hạ Tầng Và Đô Thị Phường Hoài Nhơn Nam" },
    { code: "C018323911", name: "NGUYỄN ĐĂNG DUY" },
    { code: "C018356591", name: "BC 623210- PHÚ THỨ-Shop Trần My" },
    { code: "C018806959", name: "NGUYỄN QUANG TOÀN - 210 TRẦN PHÚ" },
    { code: "C018905228", name: "Thế Giới Hoa Lan" },
    { code: "C019221471", name: "Nước Mắm Hồ Duy 86" },
    { code: "C019302232", name: "NƯỚC MẮM HỒ DUY" },
    { code: "C019370087", name: "Lê Mạnh Hùng" },
    { code: "C019632494", name: "Khoáng Sản Việt Sơn" },
    { code: "C019754484", name: "Dung Bình Định" },
    { code: "C019990987", name: "Lê Thị Thu Hồng" },
    { code: "T000216228", name: "Ngân Hàng TMCP Nam Á" },
    { code: "T000504184", name: "CN Cty CP CNTP CHÂU Á TẠI TP. ĐÀ NẴNG" },
    { code: "T000705606", name: "Công Ty CP Thời Trang Yody" },
    { code: "T001169025", name: "HCC Tiếp Nhận Cấp Đổi GPLX _ PC08" },
    { code: "T001176848", name: "HCC Hồ Sơ Bảo Hiểm Xã Hội (Chiều Nhận Từ BHXH)" },
    { code: "T001284547", name: "ĐUK Công ty bảo hiểm bảo việt nhân thọ bắc bình định" },
    { code: "T001286980", name: "Chi Cục Thuế Huyện Hoài Nhơn - HN.CQ.CCT" },
    { code: "T001287013", name: "công ty trách nhiệm hữu hạn Sachi Nguyễn" },
    { code: "T001287115", name: "Nhà Phân Phối Trung Tín - HN.NPP.TT" },
    { code: "T001287146", name: "Công Ty TNHH - Xây Dựng Nguyên Tín - HN.CTY.NT" },
    { code: "T001287163", name: "Cty TNHH XD TH Đức Thịnh" },
    { code: "T001287194", name: "Bao Hiem AAA Binh Dinh - HN.CTY.AAA" },
    { code: "T001287319", name: "Cty TNHH Minh Chánh TB - HN.CTY.MC" },
    { code: "T001287472", name: "Chi Cục Thi Hành Án Dân Sự Huyện Hoài Nhơn - HN.CQ.THADS" },
    { code: "T001323435", name: "VP Hanwhalife Hoài Nhơn" },
    { code: "T001323696", name: "Ngân Hàng ACB- CN Hoài Nhơn" },
    { code: "T001323886", name: "Cty Bảo Việt Bình Định (phi Nhân Thọ)" },
    { code: "T001324745", name: "Cty Bảo Hiểm AIA" },
    { code: "T001341195", name: "CÔNG TY TNHH MAY VINATEX BỒNG SƠN + nguyễn duy hùng" },
    { code: "T001683990", name: "NGÂN HÀNG TMCP PHÁT TRIỂN BỒNG SƠN" },
    { code: "T002136156", name: "Chi Nhánh Văn Phòng Đất Đai Thị Xã Hoài Nhơn Bình Định" },
    { code: "T002325375", name: "HCC Chuyển Phát CCCD - TX Hoài Nhơn (QĐ1268)" },
    { code: "T002441751", name: "Shopee - VNPost Nhanh" },
    { code: "T002442068", name: "Shopee - VNPost Tiết Kiệm" },
    { code: "T002774723", name: "CÔNG TY CỔ PHẦN BOT BẮC BÌNH ĐỊNH VIỆT NAM" },
    { code: "T004924010", name: "HCC GPLX Trung Tâm Đào Tạo GTVT (Hoài Nhơn)" },
    { code: "T005719553", name: "Hàng Thu Hồi - CÔNG TY TNHH SẢN XUẤT TẬP ĐOÀN ĐẠI VIỆT" },
    { code: "T006882706", name: "H&M Return Point Services" },
    { code: "T015430369", name: "HCC_Thanh Toán Xử Phạt Vi Phạm Giao Thông" },
    { code: "T017475442", name: "BC 710549- EMS HOÀNG SA-CÔNG TY TNHH TRUYỀN THÔNG TNS VIỆT NAM" },
    { code: "T017877083", name: "ĐẢNG ỦY PHƯỜNG BỒNG SƠN" },
    { code: "T017922595", name: "HCC_ Trả Kết Quả TTPVHCC Phường Hoài Nhơn Nam" },
    { code: "T017950631", name: "UBND Phường Hoài Nhơn Nam" },
    { code: "T017997761", name: "Công An Phường Hoài Nhơn Bắc" },
    { code: "T018046396", name: "Công An Phường Hoài Nhơn Nam" },
    { code: "T018099725", name: "Công An Phường Bồng Sơn" },
    { code: "T018113847", name: "UBND Phường Hoài Nhơn" },
    { code: "T018126196", name: "Đảng Ủy Phường Hoài Nhơn Nam" },
    { code: "T018165243", name: "Công An Phường Hoài Nhơn" },
    { code: "T018232209", name: "Công An Phường Hoài Nhơn Tây" },
    { code: "T018271406", name: "BAN QUẢN LÝ DỊCH VỤ ĐÔ THỊ VÀ PHÁT TRIỂN QUỸ ĐẤT PHƯỜNG HOÀI NHƠN NAM" },
    { code: "T018346943", name: "Công An Phường Hoài Nhơn Đông" },
    { code: "T018514505", name: "CÔNG AN PHƯỜNG TAM QUAN" },
    { code: "T018738851", name: "VĂN PHÒNG ĐẢNG ỦY PHƯỜNG TAM QUAN" },
    { code: "T019091184", name: "Văn Phòng Đảng Ủy Phường Hoài Nhơn Tây" },
    { code: "T019319343", name: "MOBIFONE BỒNG SƠN " },
    { code: "T019582489", name: "BCH QUÂN SỰ PHƯỜNG HOÀI NHƠN NAM" },
    { code: "T019811836", name: "BCH Quân Sự Phường Hoài Nhơn Đông" },
    { code: "T019857753", name: "PHÂN TRẠI TẠM GIAM HOÀI NHƠN" },
    { code: "T019982623", name: "ỦY BAN KIỂM TRA ĐẢNG ỦY P. HOÀI NHƠN NAM" },
];

export default function ReportTab() {
    // Dates defaults: Last month
    const lastMonth = dayjs().subtract(1, 'month');
    const startOfLastMonth = lastMonth.startOf('month');
    const endOfLastMonth = lastMonth.endOf('month');

    const [startDate, setStartDate] = useState(startOfLastMonth);
    const [endDate, setEndDate] = useState(endOfLastMonth);
    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const isRunningRef = useRef(false);
    const [progress, setProgress] = useState(0);
    const [currentCode, setCurrentCode] = useState("");

    const [token, setToken] = useState("");
    const [buuCuc, setBuuCuc] = useState("593200");
    const [reportSite, setReportSite] = useState<string>("portalkhl");

    useEffect(() => {
        chrome.storage.local.get(['token', 'buuCuc', 'reportStartDate'], (result) => {
            setToken(result.token || "");
            setBuuCuc(result.buuCuc || "593200");
            if (result.reportStartDate) {
                const savedStart = dayjs(result.reportStartDate);
                setStartDate(savedStart);
                const today = dayjs();
                let calculatedEndDate = savedStart.endOf('month');
                if (savedStart.isSame(today, 'month')) {
                    calculatedEndDate = today;
                }
                setEndDate(calculatedEndDate);
            }
        });
    }, []);

    // --- Authentication Helpers ---
    const API_BASE_URL = "https://api-pre-portalkhl.vnpost.vn";

    const safeFetch = async (url: string, options?: RequestInit): Promise<any> => {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                const textResponse = await response.text();
                console.error(`Fetch error for ${url}:`, response.status, textResponse.substring(0, 100));
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Invalid response format - expected JSON");
            }
            return await response.json();
        } catch (error) {
            console.error(`Error in safeFetch for ${url}:`, error);
            throw error;
        }
    };

    const loginDirect = async (account: string, password: string): Promise<string | null> => {
        try {
            const data = await safeFetch(`${API_BASE_URL}/khl-api/api/auth/signinKhl`, {
                method: "POST",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "content-type": "application/json; charset=UTF-8",
                    "capikey": "19001235",
                },
                body: JSON.stringify({
                    username: account,
                    password: password,
                    ip: "",
                    random: Math.random(),
                }),
            });
            return data?.body?.tokenFe || null;
        } catch (error) {
            console.error("Error in loginDirect:", error);
            return null;
        }
    };

    const checkToken = async (tokenToTest: string): Promise<boolean> => {
        if (!tokenToTest) return false;
        try {
            // Using a test ID to verify token (same as background.ts)
            const response = await fetch(`${API_BASE_URL}/khl-api/khl/portalItem/getItemHdr`, {
                method: "POST",
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "authorization": `Bearer ${tokenToTest}`,
                    "content-type": "application/json; charset=UTF-8",
                    "capikey": "19001235",
                },
                body: "1061399653", // Test ID
            });

            if (response.status === 401 || response.status === 403) return false;
            return response.ok;
        } catch (error) {
            console.error("Error checking token:", error);
            return false;
        }
    };

    const ensureValidToken = async () => {
        let currentToken = token;
        const isValid = await checkToken(currentToken);

        if (!isValid) {
            console.log("Token invalid or expired, attempting re-login...");
            const credentials = await new Promise<any>((resolve) => {
                chrome.storage.local.get(['username', 'password', 'accountPortal', 'passwordPortal'], (res) => resolve(res));
            });

            const user = credentials.accountPortal || credentials.username;
            const pass = credentials.passwordPortal || credentials.password;

            if (user && pass) {
                const newToken = await loginDirect(user, pass);
                if (newToken) {
                    chrome.storage.local.set({ token: newToken });
                    setToken(newToken);
                    return newToken;
                }
            }
            return null;
        }
        return currentToken;
    };

    const downloadReport = async (customer: Customer, activeToken: string) => {
        const tuNgay = startDate.format('DD/MM/YYYY');
        const denNgay = endDate.format('DD/MM/YYYY');
        const monthYear = startDate.format('MM-YYYY');
        const fileName = `${customer.code} ${customer.name} ${monthYear}.xlsx`;

        try {
            const response = await fetch("https://api-pre-portalkhl.vnpost.vn/khl-api/khl/jasper/dtlexportextn", {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "vi,en-US;q=0.9,en;q=0.8",
                    "authorization": `Bearer ${activeToken}`,
                    "cache-control": "no-cache",
                    "capikey": "19001235",
                    "content-type": "application/json; charset=UTF-8",
                    "pragma": "no-cache",
                    "priority": "u=1, i",
                    "sec-ch-ua": "\"Microsoft Edge\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site"
                },
                "referrer": "https://portalkhl.vnpost.vn/",
                "body": JSON.stringify({
                    "params": {
                        "orgCode": buuCuc,
                        "code": customer.code,
                        "tuNgay": tuNgay,
                        "denNgay": denNgay,
                        "pageNum": 0,
                        "pageSize": 10,
                        "sourceSystem": "KHL",
                        "checkedAll": true
                    },
                    "params_lst": { "lstId": [] }
                }),
                "method": "POST"
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // If we get 401 here, the token might have just expired
                    return "RETRY_LOGIN";
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            return true;
        } catch (error) {
            console.error(`Lỗi khi tải file cho ${customer.code}:`, error);
            return false;
        }
    };

    const handleStop = () => {
        setIsRunning(false);
        isRunningRef.current = false;
    };

    const getCasReportToken = async (): Promise<string | null> => {
        try {
            const tabs = await chrome.tabs.query({ url: "*://casreport.vnpost.vn/*" });
            if (tabs.length === 0) {
                message.error("Vui lòng mở trang web casreport.vnpost.vn và đăng nhập!");
                return null;
            }

            const tabId = tabs[0].id;
            if (!tabId) {
                message.error("Không tìm thấy tab casreport.vnpost.vn hợp lệ!");
                return null;
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                    return sessionStorage.getItem("accessToken");
                }
            });

            const casToken = results?.[0]?.result;
            if (!casToken) {
                message.error("Không lấy được accessToken từ session storage của trang casreport.vnpost.vn. Vui lòng đăng nhập lại!");
                return null;
            }

            return casToken;
        } catch (error) {
            console.error("Lỗi lấy token từ casreport.vnpost.vn:", error);
            message.error("Không thể kết nối để lấy thông tin từ tab casreport.vnpost.vn!");
            return null;
        }
    };

    const runCasReport = async (customer: Customer, casToken: string): Promise<boolean> => {
        const tuNgayCas = startDate.format('YYYYMMDD');
        const denNgayCas = endDate.format('YYYYMMDD');

        const requestBody = {
            "reportGroupCode": "bcds",
            "reportCode": "BCGDPSKH",
            "tuNgay": tuNgayCas,
            "denNgay": denNgayCas,
            "orgLogin": "593200",
            "maTCT": "00",
            "maBDT": "60",
            "maBDH": "5962",
            "maBCVHX": "593200",
            "nguon": "",
            "businessCode": "",
            "dvt": "1",
            "reportFormat": "ALL",
            "codeCrm": customer.code,
            "codeCms": customer.code,
            "maHopDong": null,
            "inCludeChildCMS": false,
            "currentUser": {
                "accessToken": casToken,
                "tokenType": "Bearer ",
                "username": "593200_tbc",
                "employeeInfo": {
                    "code": "00006822",
                    "fullname": "NGUYỄN THỊ KIM HOANH",
                    "dateOfBirth": "1982-10-12T00:00:00.000+0700",
                    "idCard": "123456789",
                    "email": "hoanhntk.bdbdh@gmail.com",
                    "orgCode": "593522",
                    "phoneNumber": "0914567259",
                    "status": 1,
                    "idCardType": 1,
                    "positionId": null,
                    "positionName": "Tổ trưởng",
                    "titleId": "NVKD",
                    "titleName": "Nhân Viên Kinh Doanh",
                    "gender": 1,
                    "address": "Bưu điện Bình Định",
                    "objMcasOrganizationDto": null
                },
                "organizationInfo": {
                    "orgCode": "593200",
                    "name": "Bồng Sơn 1",
                    "description": "Bồng Sơn 1",
                    "status": 1,
                    "parentCode": "5962",
                    "orgLevel": 4,
                    "orgType": "POST",
                    "address": "Khối Phụ Đức",
                    "phoneNumber": "2563861718",
                    "administrativeCode": null,
                    "postalCode": "55406",
                    "postType": "GD2",
                    "startDate": null,
                    "communeCode": "55406",
                    "notReal": 0
                },
                "rptdbUserDTO": {
                    "username": "593200_tbc",
                    "userId": 1,
                    "description": null,
                    "employeeCode": "00006822",
                    "lastChangePassDt": "2026-08-15",
                    "dateCreate": null,
                    "status": 1,
                    "orgCode": "593200",
                    "orgLevel": 3,
                    "orgCodeTct": "00",
                    "orgCodeBdt": "60",
                    "orgCodeBdh": "5962",
                    "orgCodeBcvhx": "593200",
                    "orgCodeNameTct": "00_Tổng Công Ty",
                    "orgCodeNameBdt": "60_BĐT Gia Lai",
                    "orgCodeNameBdh": "5962_Bưu điện Phường Bồng Sơn",
                    "orgCodeNameBcvhx": "593200_Bồng Sơn 1"
                }
            }
        };

        const headers = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "vi,en-US;q=0.9,en;q=0.8",
            "authorization": casToken,
            "capikey": "19001234",
            "content-type": "application/json; charset=UTF-8",
            "priority": "u=1, i",
            "sec-ch-ua": "\"Not=A?Brand\";v=\"99\", \"Microsoft Edge\";v=\"151\", \"Chromium\";v=\"151\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site"
        };

        try {
            // 1. Fetch checkExistReport
            const checkUrl = "https://api-casreport.vnpost.vn/vnpost-rpt-db/api/report/checkExistReport";
            const responseCheck = await fetch(checkUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(requestBody),
                mode: "cors",
                credentials: "include"
            });

            if (!responseCheck.ok) {
                throw new Error(`Kiểm tra báo cáo thất bại (HTTP ${responseCheck.status})`);
            }

            const dataCheck = await responseCheck.json();
            
            // Nếu đúng (đây là response [] nếu đúng)
            if (Array.isArray(dataCheck) && dataCheck.length === 0) {
                // 2. Fetch tiếp theo: save
                const saveUrl = "https://api-casreport.vnpost.vn/vnpost-rpt-db/api/report/save";
                const responseSave = await fetch(saveUrl, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify(requestBody),
                    mode: "cors",
                    credentials: "include"
                });

                if (!responseSave.ok) {
                    throw new Error(`Lưu báo cáo thất bại (HTTP ${responseSave.status})`);
                }

                const dataSave = await responseSave.json();
                if (dataSave && dataSave.success === true) {
                    return true;
                } else {
                    throw new Error(dataSave?.message || "Lưu báo cáo thất bại.");
                }
            } else {
                throw new Error("Kiểm tra báo cáo thất bại hoặc báo cáo đã tồn tại!");
            }
        } catch (error: any) {
            console.error("Lỗi khi chạy báo cáo Cas Report:", error);
            message.error(error.message || "Đã xảy ra lỗi khi gọi Cas Report!");
            return false;
        }
    };

    const handleRun = async (mode: 'single' | 'from_selected' | 'all') => {
        setIsRunning(true);
        isRunningRef.current = true;

        if (reportSite === 'casreport') {
            if (mode !== 'single') {
                message.warning("Trang web mới chỉ tích hợp với chạy đơn!");
                setIsRunning(false);
                isRunningRef.current = false;
                return;
            }
            if (selectedRowKeys.length === 0) {
                message.warning("Vui lòng chọn một khách hàng!");
                setIsRunning(false);
                isRunningRef.current = false;
                return;
            }

            const casToken = await getCasReportToken();
            if (!casToken) {
                setIsRunning(false);
                isRunningRef.current = false;
                return;
            }

            const selectedIdx = CUSTOMER_DATA.findIndex(c => c.code === selectedRowKeys[0]);
            const customer = CUSTOMER_DATA[selectedIdx];
            setCurrentCode(customer.code);
            setProgress(0);

            try {
                const success = await runCasReport(customer, casToken);
                if (success) {
                    setProgress(100);
                    message.success(`Hoàn thành! Đã chạy báo cáo đơn cho khách hàng ${customer.code}.`);
                } else {
                    message.error(`Chạy báo cáo cho khách hàng ${customer.code} thất bại.`);
                }
            } catch (error: any) {
                message.error(`Lỗi: ${error.message || error}`);
            } finally {
                setIsRunning(false);
                isRunningRef.current = false;
                setCurrentCode("");
            }
            return;
        }

        // --- Portal KHL (Original Logic) ---
        const activeToken = await ensureValidToken();
        if (!activeToken) {
            message.error("Không thể xác thực hoặc đăng nhập lại. Vui lòng kiểm tra tài khoản!");
            setIsRunning(false);
            isRunningRef.current = false;
            return;
        }

        let startIndex = 0;
        let endIndex = CUSTOMER_DATA.length - 1;

        if (mode === 'single') {
            if (selectedRowKeys.length === 0) {
                message.warning("Vui lòng chọn một khách hàng!");
                setIsRunning(false);
                isRunningRef.current = false;
                return;
            }
            const selectedIdx = CUSTOMER_DATA.findIndex(c => c.code === selectedRowKeys[0]);
            startIndex = selectedIdx;
            endIndex = selectedIdx;
        } else if (mode === 'from_selected') {
            if (selectedRowKeys.length > 0) {
                startIndex = CUSTOMER_DATA.findIndex(c => c.code === selectedRowKeys[0]);
            }
        }

        setProgress(0);
        let successCount = 0;
        const totalToRun = endIndex - startIndex + 1;

        for (let i = startIndex; i <= endIndex; i++) {
            if (!isRunningRef.current) break;

            const customer = CUSTOMER_DATA[i];
            setCurrentCode(customer.code);

            let success = await downloadReport(customer, activeToken);

            // Optional: One retry if token expires mid-loop
            if (success === "RETRY_LOGIN") {
                const refreshedToken = await ensureValidToken();
                if (refreshedToken) {
                    success = await downloadReport(customer, refreshedToken);
                } else {
                    success = false;
                }
            }

            if (success === true) successCount++;

            setProgress(Math.round(((i - startIndex + 1) / totalToRun) * 100));

            // Delay to avoid overwhelming
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        setIsRunning(false);
        isRunningRef.current = false;
        setCurrentCode("");
        message.success(`Hoàn thành! Đã tải ${successCount}/${totalToRun} file.`);
    };

    const columns = [
        {
            title: 'Mã KH',
            dataIndex: 'code',
            key: 'code',
            width: 100,
        },
        {
            title: 'Tên Khách Hàng',
            dataIndex: 'name',
            key: 'name',
        }
    ];

    return (
        <div style={{ padding: '0px' }}>
            <Card size="small" title="Cấu hình báo cáo">
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Space wrap>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Text strong>Trang web:</Text>
                            <Select
                                value={reportSite}
                                onChange={(val) => setReportSite(val)}
                                style={{ width: 140 }}
                                options={[
                                    { value: 'portalkhl', label: 'Portal KHL' },
                                    { value: 'casreport', label: 'Cas Report' }
                                ]}
                                disabled={isRunning}
                            />
                        </div>
                    </Space>

                    <Space wrap style={{ marginTop: '4px' }}>
                        <Text strong>Từ ngày:</Text>
                        <DatePicker
                            format="DD/MM/YYYY"
                            value={startDate}
                            onChange={(date) => {
                                if (date) {
                                    setStartDate(date);
                                    chrome.storage.local.set({ reportStartDate: date.format('YYYY-MM-DD') });
                                    const today = dayjs();
                                    let calculatedEndDate = date.endOf('month');
                                    if (date.isSame(today, 'month')) {
                                        calculatedEndDate = today;
                                    }
                                    setEndDate(calculatedEndDate);
                                }
                            }}
                            disabled={isRunning}
                            style={{ width: '125px' }}
                        />
                        <Text strong>Đến ngày:</Text>
                        <DatePicker
                            format="DD/MM/YYYY"
                            value={endDate}
                            onChange={(date) => date && setEndDate(date)}
                            disabled={isRunning}
                            style={{ width: '125px' }}
                        />
                    </Space>

                    <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #f0f0f0' }}>
                        <Table
                            dataSource={CUSTOMER_DATA}
                            columns={columns}
                            rowKey="code"
                            pagination={false}
                            size="small"
                            rowSelection={{
                                type: 'radio',
                                selectedRowKeys,
                                onChange: (keys) => setSelectedRowKeys(keys),
                            }}
                        />
                    </div>

                    {isRunning && (
                        <div style={{ marginTop: 10 }}>
                            <Text type="secondary">Đang xử lý: {currentCode}</Text>
                            <Progress percent={progress} status="active" />
                        </div>
                    )}

                    <Space wrap style={{ marginTop: 10, justifyContent: 'center', width: '100%' }}>
                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            onClick={() => handleRun('single')}
                            disabled={isRunning}
                        >
                            Chạy đơn
                        </Button>
                        <Button
                            type="default"
                            icon={<PlayCircleOutlined />}
                            onClick={() => handleRun('from_selected')}
                            disabled={isRunning || reportSite === 'casreport'}
                        >
                            Chạy từ chọn đến hết
                        </Button>
                        <Button
                            type="dashed"
                            icon={<PlayCircleOutlined />}
                            onClick={() => handleRun('all')}
                            disabled={isRunning || reportSite === 'casreport'}
                        >
                            Chạy tất cả
                        </Button>
                        {isRunning && (
                            <Button
                                danger
                                icon={<PauseCircleOutlined />}
                                onClick={handleStop}
                            >
                                Dừng
                            </Button>
                        )}
                    </Space>
                </Space>
            </Card>
        </div>
    );
}
