// Content Script cho trang BCCP - Trace
// Sử dụng Vanilla JS để tránh lỗi module/React trong content script

let modalOverlay: HTMLDivElement | null = null;

function showToast(msg: string, type: 'success' | 'error' = 'success') {
    const toast = document.createElement('div');
    toast.textContent = msg;
    Object.assign(toast.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: type === 'success' ? '#f6ffed' : '#fff2f0',
        color: type === 'success' ? '#389e0d' : '#cf1322',
        border: `1px solid ${type === 'success' ? '#b7eb8f' : '#ffa39e'}`,
        padding: '10px 20px',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: '10000',
        fontSize: '14px',
        fontFamily: 'sans-serif',
        transition: 'opacity 0.3s'
    });
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function closeCmsModal() {
    if (modalOverlay) {
        modalOverlay.remove();
        modalOverlay = null;
    }
}

function renderCmsModal(trackingNumber: string, orgCode: string, serviceCode: string, customerCode: string) {
    closeCmsModal();

    modalOverlay = document.createElement('div');
    Object.assign(modalOverlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999',
        fontFamily: 'sans-serif'
    });

    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
        backgroundColor: '#fff',
        borderRadius: '8px',
        width: '800px',
        maxWidth: '90%',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        overflow: 'hidden'
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
        padding: '16px 24px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
    });
    
    const title = document.createElement('span');
    title.textContent = `📦 CMS - ${trackingNumber}`;
    Object.assign(title.style, {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#1890ff'
    });

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    Object.assign(closeBtn.style, {
        background: 'none',
        border: 'none',
        fontSize: '18px',
        cursor: 'pointer',
        color: '#999'
    });
    closeBtn.onclick = closeCmsModal;

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = document.createElement('div');
    Object.assign(body.style, {
        padding: '24px',
        overflowY: 'auto',
        flex: '1'
    });

    const loadingText = document.createElement('div');
    loadingText.textContent = 'Đang tải dữ liệu CMS...';
    Object.assign(loadingText.style, {
        textAlign: 'center',
        padding: '40px 0',
        color: '#666'
    });
    body.appendChild(loadingText);

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    // Fetch data
    chrome.runtime.sendMessage({
        event: "CONTENTMY",
        type: "FETCH_CMS_DATA",
        payload: { maVanDon: trackingNumber }
    }, (response) => {
        body.innerHTML = ''; // clear loading

        if (response && response.status === 'success' && response.data && response.data.tickets && response.data.tickets.length > 0) {
            // Render tickets
            response.data.tickets.forEach((ticket: any) => {
                const ticketCard = document.createElement('div');
                Object.assign(ticketCard.style, {
                    border: '1px solid #f0f0f0',
                    borderRadius: '6px',
                    padding: '16px',
                    marginBottom: '16px'
                });

                const ticketTitle = document.createElement('div');
                ticketTitle.textContent = `Mã KN: ${ticket.ticketCode} - Trạng thái: ${ticket.statusName}`;
                Object.assign(ticketTitle.style, {
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    color: '#333'
                });

                const ticketContent = document.createElement('div');
                ticketContent.textContent = ticket.content || 'Không có nội dung';
                Object.assign(ticketContent.style, {
                    color: '#666',
                    fontSize: '14px'
                });

                ticketCard.appendChild(ticketTitle);
                ticketCard.appendChild(ticketContent);
                body.appendChild(ticketCard);
            });
        } else {
            // Render empty state with button
            const emptyState = document.createElement('div');
            Object.assign(emptyState.style, {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 0'
            });

            const emptyText = document.createElement('div');
            emptyText.textContent = 'Không có dữ liệu CMS cho mã vận đơn này';
            Object.assign(emptyText.style, {
                color: '#999',
                fontStyle: 'italic',
                marginBottom: '16px'
            });

            const createBtn = document.createElement('button');
            createBtn.textContent = 'Tạo khiếu nại mới';
            Object.assign(createBtn.style, {
                backgroundColor: '#1890ff',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 'bold'
            });

            createBtn.onclick = () => {
                chrome.runtime.sendMessage({
                    event: "CONTENTMY",
                    type: "DIRECT_CREATE_COMPLAINT",
                    payload: {
                        itemCode: trackingNumber,
                        orgCode: customerCode,
                        serviceCode: serviceCode,
                        type: "complaint"
                    }
                });
                showToast('Đang mở CMS và tạo khiếu nại...');
                closeCmsModal();
            };

            emptyState.appendChild(emptyText);
            emptyState.appendChild(createBtn);
            body.appendChild(emptyState);
        }
    });
}

function injectCMSButton() {
    // 1. Wait for the main tracking table
    const table = document.getElementById('ctl00_MainContent_ctl00_grvItemTrace');
    if (!table) return;

    // Avoid injecting multiple times
    if (document.getElementById('bccp-create-cms-btn')) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Filter out header/empty rows
    const dataRows = rows.filter(row => row.querySelector('td'));
    if (dataRows.length === 0) return;

    // Find target row
    let targetRowIndex = dataRows.length - 1;
    let targetRow = dataRows[targetRowIndex];
    let statusCell = targetRow.querySelectorAll('td')[3]; // Column 4 (index 3): Trạng thái

    // If the last row is "Phát hành phiếu nhờ thu", use the second to last row
    if (statusCell && statusCell.textContent?.includes('Phát hành phiếu nhờ thu')) {
        if (dataRows.length > 1) {
            targetRowIndex = dataRows.length - 2;
            targetRow = dataRows[targetRowIndex];
        }
    }

    let orgCodeCell = targetRow.querySelectorAll('td')[4]; // Column 5 (index 4): Tại bưu cục

    // Nếu orgCodeCell trống, tiếp tục tìm lên các dòng trên
    while (targetRowIndex > 0 && (!orgCodeCell || !orgCodeCell.textContent?.trim())) {
        targetRowIndex--;
        targetRow = dataRows[targetRowIndex];
        orgCodeCell = targetRow.querySelectorAll('td')[4];
    }

    if (!orgCodeCell) return;

    // Extract barcode & serviceCode
    const barcodeLabel = document.getElementById('ctl00_MainContent_ctl00_lblBarcode');
    let barcode = '';
    let serviceCode = '';
    if (barcodeLabel) {
        const text = barcodeLabel.textContent || '';
        const matchBarcode = text.match(/^([A-Z0-9]+VN)/);
        if (matchBarcode) barcode = matchBarcode[1];
        
        const matchService = text.match(/\(([^-\s]+)/);
        if (matchService) serviceCode = matchService[1];
    }

    // Extract orgCode
    let orgCode = '';
    const orgMatch = orgCodeCell.textContent?.match(/(\d{6})/);
    if (orgMatch) orgCode = orgMatch[1];

    // Extract customerCode
    const cusLabel = document.getElementById('ctl00_MainContent_ctl00_lblCustomerCode');
    let customerCode = '';
    if (cusLabel) {
        const text = cusLabel.textContent || '';
        // Often text is formatted like "C015304312 - Công ty abc..."
        const cusMatch = text.match(/^([A-Z0-9]+)/);
        if (cusMatch) customerCode = cusMatch[1];
    }

    // Create Button
    const btnContainer = document.createElement('div');
    btnContainer.id = 'bccp-create-cms-btn';
    btnContainer.style.marginTop = '4px';

    const btn = document.createElement('button');
    btn.innerText = 'Tạo CMS';
    btn.style.padding = '4px 8px';
    btn.style.backgroundColor = '#1890ff';
    btn.style.color = '#ffffff';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
    btn.style.fontSize = '12px';
    btn.style.boxShadow = '0 2px 0 rgba(0,0,0,0.045)';
    btn.style.transition = 'all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1)';
    
    btn.onmouseover = () => {
        btn.style.backgroundColor = '#40a9ff';
    };
    btn.onmouseout = () => {
        btn.style.backgroundColor = '#1890ff';
    };

    btn.onclick = (e) => {
        e.preventDefault();
        renderCmsModal(barcode, orgCode, serviceCode, customerCode);
    };

    btnContainer.appendChild(btn);
    orgCodeCell.appendChild(btnContainer);
}

function injectChinhCodButton() {
    const vasDetailTr = document.getElementById('ctl00_MainContent_ctl00_tr_VAS_Detail');
    if (!vasDetailTr) return;

    // Tránh inject nhiều lần
    if (document.getElementById('bccp-chinh-cod-btn')) return;

    const td = vasDetailTr.querySelector('td');
    if (!td) return;

    // Extract barcode
    const barcodeLabel = document.getElementById('ctl00_MainContent_ctl00_lblBarcode');
    let barcode = '';
    if (barcodeLabel) {
        const text = barcodeLabel.textContent || '';
        const matchBarcode = text.match(/^([A-Z0-9]+VN)/);
        if (matchBarcode) barcode = matchBarcode[1];
    }

    if (!barcode) return;

    const btnContainer = document.createElement('div');
    btnContainer.id = 'bccp-chinh-cod-btn';
    btnContainer.style.marginTop = '4px';

    const btn = document.createElement('button');
    btn.innerText = 'Chỉnh COD';
    btn.style.padding = '4px 8px';
    btn.style.backgroundColor = '#faad14'; // Warning color for COD action
    btn.style.color = '#ffffff';
    btn.style.border = 'none';
    btn.style.borderRadius = '4px';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = 'bold';
    btn.style.fontSize = '12px';
    btn.style.boxShadow = '0 2px 0 rgba(0,0,0,0.045)';
    
    // Đặt nút kế bên text
    btn.style.marginLeft = '10px';

    btn.onmouseover = () => {
        btn.style.backgroundColor = '#ffc53d';
    };
    btn.onmouseout = () => {
        btn.style.backgroundColor = '#faad14';
    };

    btn.onclick = (e) => {
        e.preventDefault();
        chrome.runtime.sendMessage({
            event: "CONTENTMY",
            type: "CHINH_COD",
            payload: { barcode }
        });
        showToast('Đang mở trang Chỉnh COD trên PortalKHL...', 'success');
    };

    btnContainer.appendChild(btn);
    // Append nút vào bên phải text
    td.appendChild(btnContainer);
}

// Observe DOM for dynamic loads
const observer = new MutationObserver(() => {
    injectCMSButton();
    injectChinhCodButton();
});

// Start observing
observer.observe(document.body, { childList: true, subtree: true });

// Initial check
setTimeout(() => {
    injectCMSButton();
    injectChinhCodButton();
}, 1000);

