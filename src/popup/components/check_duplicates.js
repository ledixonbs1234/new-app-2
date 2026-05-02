const fs = require('fs');
const content = fs.readFileSync('src/popup/components/ReportTab.tsx', 'utf8');
const match = content.match(/const CUSTOMER_DATA: Customer\[\] = \[(.*?)\];/s);
if (match) {
    const dataStr = match[1];
    const codes = [...dataStr.matchAll(/code:\s*"(.*?)"/g)].map(m => m[1]);
    const counts = {};
    const dups = [];
    codes.forEach(c => {
        counts[c] = (counts[c] || 0) + 1;
        if (counts[c] === 2) dups.push(c);
    });
    console.log('Duplicates found:');
    dups.forEach(c => {
        console.log(`Code: ${c}`);
        const regex = new RegExp(`{ code: "${c}", name: "(.*?)" }`, 'g');
        let m;
        while ((m = regex.exec(dataStr)) !== null) {
            console.log(`  - Name: ${m[1]}`);
        }
    });
} else {
    console.log('CUSTOMER_DATA not found');
}
