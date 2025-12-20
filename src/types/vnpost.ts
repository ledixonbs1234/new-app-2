export interface OrderHdr {
    orgCode: string;
    orderHdrId: string;
    originalId: string;
    itemCode: string;
    saleOrderCode: string;
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    senderProvinceCode: string;
    senderDistrictCode: string;
    senderCommuneCode: string | null;
    serviceCode: string;
    receiverCode: string | null;
    senderCode: string;
    receiverOwner: string;
    isInternational: boolean;
    receiverContractNumber: string | null;
    receiverName: string;
    receiverPhone: string;
    receiverAddress: string;
    receiverProvinceCode: string;
    receiverDistrictCode: string;
    receiverCommuneCode: string;
    receiverNational: string;
    receiverCity: string | null;
    receiverState: string | null;
    createdDate: string;
    codAmount: number;
    status: string;
    statusName: string;
    statusGroup: string;
    owner: string | null;
    ownerName: string | null;
    createdName: string | null;
    batchCode: string | null;
    isPrinted: string;
    isAllowPrint: boolean;
    totalFee: number;
    createdBy: string;
    source: string;
    originalSource: string;
    sendType: string;
    issuesStatus: number[] | null;
    inputMethod: string;
    inputMethodName: string;
    bulkOrderCode: string | null;
    contractC: boolean;
}

export interface OrderDetail {
    orderHdrId: string;
    itemCode: string;
    status: number;
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    receiverName: string;
    receiverPhone: string;
    receiverAddress: string;
    weight: number;
    totalFee: number;
    codAmount: number;
    contentNote: string;
    statusName: string;
    // Add other fields as needed from the JSON response
}

export interface OrderHistoryItem {
    orgCode: string;
    lon: number;
    lat: number;
    traceDate: string;
    date: string;
    timeDetail: string;
    statusText: string;
    statusDetail: string;
    postmanName: string;
    postmanTel: string;
    address: string;
    posTel: string;
    posAddress: string;
    status: string;
}

export interface OrderHistoryResponse {
    tblInfo: {
        senderLong: number;
        recLong: number;
        recLat: number;
        senderLat: number;
    };
    orderStatusHistoryDtoList: OrderHistoryItem[];
}

export interface ExtraInfo {
    maVanDon: string;
    content: string;
    updatedAt: number;
}

export interface ImportedImage {
    imageId: string;
    thumbnailUrl: string;
    maHieu: string;
    processed: boolean;
    timestamp: number;
    uploadedAt: number;
    url: string;
}

export interface StoredImage extends ImportedImage {
    blob?: Blob;
    objectUrl?: string;
}

export interface ExtendedOrder extends OrderHdr {
    detail?: OrderDetail;
    history?: OrderHistoryResponse;
    extraInfo?: string;
    cmsData?: any; // Tickets
    lastUpdated?: number;
    loading?: boolean;
}

export interface BulkCMSItem {
    order: ExtendedOrder;
    ticketType: 'support' | 'complaint';
    content: string;
    destOrgCode: string;
    orgInfo: { orgCode: string; name: string } | null;
    status: 'pending' | 'processing' | 'success' | 'error';
    error?: string;
    action?: 'create' | 'forward';
    ticketId?: string;
}
