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

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeCmsModal();
        }
    });

    const modalContent = document.createElement('div');
    Object.assign(modalContent.style, {
        backgroundColor: '#fff',
        borderRadius: '8px',
        width: '1100px',
        maxWidth: '95%',
        maxHeight: '90vh',
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
                const statusStr = ticket.statusName ? ` - Trạng thái: ${ticket.statusName}` : '';
                ticketTitle.textContent = `Mã KN: ${ticket.ticketCode}${statusStr}`;
                Object.assign(ticketTitle.style, {
                    fontWeight: 'bold',
                    marginBottom: '8px',
                    color: '#333'
                });
                ticketCard.appendChild(ticketTitle);

                if (ticket.actions && ticket.actions.length > 0) {
                    const tableContainer = document.createElement('div');
                    Object.assign(tableContainer.style, {
                        overflowX: 'auto',
                        marginTop: '12px',
                        border: '1px solid #e8e8e8',
                        borderRadius: '4px'
                    });

                    const table = document.createElement('table');
                    Object.assign(table.style, {
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '13px',
                        backgroundColor: '#fff'
                    });

                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    ['STT', 'THỜI GIAN', 'ĐV XỬ LÝ', 'NỘI DUNG XL', 'ĐVXL TIẾP THEO'].forEach((text, i) => {
                        const th = document.createElement('th');
                        th.textContent = text;
                        Object.assign(th.style, {
                            padding: '10px 8px',
                            backgroundColor: '#fafafa',
                            borderBottom: '1px solid #e8e8e8',
                            borderRight: i < 4 ? '1px solid #e8e8e8' : 'none',
                            textAlign: 'left',
                            fontWeight: '600',
                            color: '#333'
                        });
                        headerRow.appendChild(th);
                    });
                    
                    headerRow.childNodes[0].style.width = '40px';
                    headerRow.childNodes[1].style.width = '120px';
                    headerRow.childNodes[2].style.width = '140px';
                    headerRow.childNodes[4].style.width = '140px';

                    thead.appendChild(headerRow);
                    table.appendChild(thead);

                    const tbody = document.createElement('tbody');
                    ticket.actions.forEach((action: any, index: number) => {
                        const tr = document.createElement('tr');
                        
                        const tdStt = document.createElement('td');
                        tdStt.textContent = action.stt || (index + 1).toString();
                        
                        const tdTime = document.createElement('td');
                        tdTime.textContent = action.date || '';
                        
                        const tdUnit = document.createElement('td');
                        tdUnit.textContent = action.unit || '';
                        
                        const tdContent = document.createElement('td');
                        const cleanContent = (action.content || '').replace(/\s+/g, ' ').trim();
                        tdContent.textContent = cleanContent || 'Không có nội dung';
                        
                        const tdNextUnit = document.createElement('td');
                        tdNextUnit.textContent = action.relatedUnit || '';

                        [tdStt, tdTime, tdUnit, tdContent, tdNextUnit].forEach((td, i) => {
                            Object.assign(td.style, {
                                padding: '10px 8px',
                                borderBottom: '1px solid #e8e8e8',
                                borderRight: i < 4 ? '1px solid #e8e8e8' : 'none',
                                verticalAlign: 'top',
                                color: '#555',
                                lineHeight: '1.5'
                            });
                            tr.appendChild(td);
                        });

                        tbody.appendChild(tr);
                    });

                    table.appendChild(tbody);
                    tableContainer.appendChild(table);
                    ticketCard.appendChild(tableContainer);
                } else {
                    const emptyContent = document.createElement('div');
                    emptyContent.textContent = ticket.content || 'Không có nội dung';
                    Object.assign(emptyContent.style, {
                        color: '#666',
                        fontSize: '14px'
                    });
                    ticketCard.appendChild(emptyContent);
                }

                // Forward Form logic
                const lastAction = ticket.actions?.[ticket.actions.length - 1];
                const isTicketClosed = lastAction?.content?.includes('Đóng yêu cầu') || false;

                if (!isTicketClosed) {
                    const forwardContainer = document.createElement('div');
                    Object.assign(forwardContainer.style, {
                        marginTop: '16px',
                        padding: '12px',
                        backgroundColor: '#f0f5ff',
                        border: '1px solid #adc6ff',
                        borderRadius: '6px'
                    });

                    const forwardTitle = document.createElement('div');
                    forwardTitle.textContent = 'Chuyển tiếp (Forward)';
                    Object.assign(forwardTitle.style, {
                        fontWeight: 'bold',
                        color: '#1d39c4',
                        marginBottom: '8px',
                        fontSize: '14px'
                    });
                    forwardContainer.appendChild(forwardTitle);

                    const formFlex = document.createElement('div');
                    Object.assign(formFlex.style, {
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    });

                    // Org Code input
                    const orgInputContainer = document.createElement('div');
                    const orgInput = document.createElement('input');
                    orgInput.type = 'text';
                    orgInput.placeholder = 'Nhập mã bưu cục (6 số)';
                    orgInput.maxLength = 6;
                    
                    const unitMatch = lastAction?.unit?.match(/(\d{6})/);
                    if (unitMatch) {
                        orgInput.value = unitMatch[1];
                    }
                    
                    Object.assign(orgInput.style, {
                        padding: '6px 10px',
                        border: '1px solid #d9d9d9',
                        borderRadius: '4px',
                        fontSize: '14px',
                        width: '200px'
                    });

                    const orgInfoText = document.createElement('span');
                    Object.assign(orgInfoText.style, {
                        marginLeft: '10px',
                        fontSize: '13px',
                        color: '#52c41a',
                        fontWeight: 'bold'
                    });

                    let currentOrgInfo: any = null;

                    const fetchOrgInfo = async (code: string) => {
                        if (code.length !== 6) {
                            currentOrgInfo = null;
                            orgInfoText.textContent = '';
                            submitBtn.disabled = true;
                            submitBtn.style.opacity = '0.5';
                            return;
                        }
                        try {
                            const res = await fetch(`https://cms.vnpost.vn/api/admin/organization/autocompleteall/change/${code}`, {
                                credentials: 'include'
                            });
                            const data = await res.json();
                            if (data && data.length > 0) {
                                currentOrgInfo = data[0];
                                orgInfoText.textContent = `✓ ${data[0].orgCode} - ${data[0].name}`;
                                submitBtn.disabled = false;
                                submitBtn.style.opacity = '1';
                            } else {
                                currentOrgInfo = null;
                                orgInfoText.textContent = '❌ Không tìm thấy bưu cục';
                                submitBtn.disabled = true;
                                submitBtn.style.opacity = '0.5';
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    };

                    orgInput.addEventListener('input', (e) => {
                        fetchOrgInfo((e.target as HTMLInputElement).value);
                    });

                    orgInputContainer.appendChild(orgInput);
                    orgInputContainer.appendChild(orgInfoText);
                    formFlex.appendChild(orgInputContainer);

                    // Templates select
                    const templateSelect = document.createElement('select');
                    Object.assign(templateSelect.style, {
                        padding: '6px 10px',
                        border: '1px solid #d9d9d9',
                        borderRadius: '4px',
                        fontSize: '14px',
                        width: '100%',
                        backgroundColor: '#fff'
                    });
                    const defaultOption = document.createElement('option');
                    defaultOption.value = '';
                    defaultOption.textContent = '📋 Chọn mẫu nội dung...';
                    templateSelect.appendChild(defaultOption);

                    chrome.runtime.sendMessage({ event: 'CONTENTMY', type: 'GET_CMS_TEMPLATES' }, (res) => {
                        if (res?.status === 'success' && res.templates) {
                            res.templates.forEach((t: string) => {
                                const opt = document.createElement('option');
                                opt.value = t;
                                opt.textContent = t.length > 50 ? t.substring(0, 50) + '...' : t;
                                templateSelect.appendChild(opt);
                            });
                        }
                    });

                    formFlex.appendChild(templateSelect);

                    // Comment textarea
                    const commentInput = document.createElement('textarea');
                    commentInput.placeholder = 'Nhập nội dung chuyển tiếp...';
                    commentInput.rows = 2;
                    Object.assign(commentInput.style, {
                        padding: '6px 10px',
                        border: '1px solid #d9d9d9',
                        borderRadius: '4px',
                        fontSize: '14px',
                        width: '100%',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                    });
                    
                    templateSelect.addEventListener('change', () => {
                        if (templateSelect.value) {
                            commentInput.value = templateSelect.value;
                        }
                    });
                    formFlex.appendChild(commentInput);

                    // Submit button
                    const submitBtn = document.createElement('button');
                    submitBtn.textContent = '📤 Chuyển tiếp';
                    submitBtn.disabled = true;
                    Object.assign(submitBtn.style, {
                        padding: '6px 16px',
                        backgroundColor: '#1890ff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        alignSelf: 'flex-start',
                        opacity: '0.5'
                    });

                    submitBtn.addEventListener('click', () => {
                        if (!currentOrgInfo || !commentInput.value.trim()) {
                            alert('Vui lòng nhập đủ mã bưu cục và nội dung!');
                            return;
                        }
                        if (confirm(`Bạn có muốn chuyển tiếp đến ${currentOrgInfo.orgCode} - ${currentOrgInfo.name}?`)) {
                            submitBtn.textContent = 'Đang gửi...';
                            submitBtn.disabled = true;
                            
                            const dataOrgObj = [{
                                tempId: 72,
                                orgCode: currentOrgInfo.orgCode,
                                orgName: `${currentOrgInfo.orgCode} - ${currentOrgInfo.name}`,
                                filename: '',
                                comment: commentInput.value,
                                file: '',
                                type: 2,
                                number: 1
                            }];

                            chrome.runtime.sendMessage({
                                event: 'CONTENTMY',
                                type: 'FORWARD_CMS_TICKET',
                                payload: {
                                    ticketId: ticket.ticketId,
                                    dataOrgObj: dataOrgObj
                                }
                            }, (res) => {
                                submitBtn.textContent = '📤 Chuyển tiếp';
                                submitBtn.disabled = false;
                                if (res?.status === 'success') {
                                    alert('✅ Đã chuyển tiếp thành công');
                                    commentInput.value = '';
                                } else {
                                    alert(`❌ Lỗi khi chuyển tiếp: ${res?.error || 'Unknown'}`);
                                }
                            });
                        }
                    });

                    formFlex.appendChild(submitBtn);
                    forwardContainer.appendChild(formFlex);
                    ticketCard.appendChild(forwardContainer);

                    // Trigger initial fetch
                    if (orgInput.value) {
                        fetchOrgInfo(orgInput.value);
                    }
                }

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

