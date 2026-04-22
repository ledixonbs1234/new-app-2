export const delay = (ms: number | undefined) =>
  new Promise((res) => setTimeout(res, ms));

export function waitForElm(selector: string, timeout: number = 5): Promise<HTMLInputElement | null> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element: HTMLInputElement | null = document.querySelector(selector);
      if (element) {
        return resolve(element);
      }

      if (Date.now() - startTime >= timeout * 1000) {
        return reject(new Error(`Timeout exceeded (${timeout} seconds)`));
      }

      // THAY ĐỔI Ở ĐÂY: Dùng setTimeout thay vì requestAnimationFrame
      setTimeout(checkElement, 100); 
    };

    checkElement();
  });
}

export function waitForNotElm(selector: any, timeout: number = 5) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkElement = () => {
      if (!document.querySelector(selector)) {
        resolve("ok");
      } else if (Date.now() - startTime >= timeout * 1000) {
        reject(new Error(`Timeout exceeded (${timeout} seconds)`));
      } else {
        setTimeout(checkElement, 100);
      }
    };
    checkElement();
  });
}

/**
 * Chờ element có selector chỉ định có giá trị (value) khác rỗng
 * 
 * @param selector - CSS selector của element cần chờ
 * @param timeout - Thời gian tối đa để chờ (giây), mặc định 5 giây
 * @returns Promise resolve ra HTMLInputElement nếu tìm thấy, reject nếu timeout
 * 
 * @example
 * // Chờ input có id "phone" có giá trị trong 10 giây
 * const input = await waitForValueElm("#phone", 10);
 * 
 * @remarks
 * - Polling mỗi 100ms để kiểm tra element
 * - Chỉ resolve khi element tồn tại VÀ có value.trim() !== ""
 * - Reject nếu vượt quá timeout mà không tìm thấy
 */
export function waitForValueElm(selector: string, timeout: number = 5): Promise<HTMLInputElement | null> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element: HTMLInputElement | null = document.querySelector(selector);
      if (element && element.value.trim() !== "") {
        return resolve(element);
      }

      if (Date.now() - startTime >= timeout * 1000) {
        return reject(new Error(`Timeout exceeded waiting for value (${timeout} seconds)`));
      }

      setTimeout(checkElement, 100);
    };

    checkElement();
  });
}
