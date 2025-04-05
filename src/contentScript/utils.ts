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

      requestAnimationFrame(checkElement);
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
