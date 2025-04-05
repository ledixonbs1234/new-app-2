importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.0/xlsx.full.min.js');

self.onmessage = async function (e) {
  const { arrayBuffer } = e.data;
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Modify cells [4,5] to "hello"
  worksheet["E4"] = { v: "hello" };
  worksheet["E5"] = { v: "hello" };

  const newWorkbook = XLSX.write(workbook, { bookType: "xlsm", type: "array" });
  const blob = new Blob([newWorkbook], { type: "application/vnd.ms-excel.sheet.macroEnabled.12" });
  const url = URL.createObjectURL(blob);

  self.postMessage({ url });
};