import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { buildToolIntakeXlsx } from '../lib/toolIntakeXlsx.js';

const output = path.resolve(process.argv[2] || 'tool-intake-sample.xlsx');
const now = new Date('2026-08-24T03:42:46.000Z');
const buffer = await buildToolIntakeXlsx({
  campaign: { name: 'Tài khoản nhận PRO', title: 'Đăng ký nâng cấp TubeKey PRO', slug: 'tai-khoan-nhan-pro' },
  publicUrl: 'https://www.tubekey.vn/tai-khoan-nhan-pro',
  entries: [
    {
      fullName: 'Khai Le',
      phone: '0349996320',
      email: 'chinhkhai79@gmail.com',
      zalo: 'https://zalo.me/g/stmbujxgboawdcem8wjk',
      status: 'granted',
      grantMessage: 'Đã nâng cấp GÓI 3 THÁNG; hết hạn 24/11/2026 10:42:46',
      linkedUid: 'sample-user-uid',
      grantedAt: now.toISOString(),
      createdAt: now.toISOString()
    },
    {
      fullName: 'Nguyễn Văn A',
      phone: '0901234567',
      email: 'nguyenvana@example.com',
      zalo: 'https://zalo.me/g/abcdefgh12345678',
      status: 'new',
      grantMessage: '',
      linkedUid: '',
      grantedAt: null,
      createdAt: now.toISOString()
    }
  ]
});

const verificationWorkbook = new ExcelJS.Workbook();
await verificationWorkbook.xlsx.load(buffer);
const verificationSheet = verificationWorkbook.worksheets[0];
assert.equal(verificationSheet.getCell('I5').value?.toISOString(), '2026-08-24T10:42:46.000Z');
assert.equal(verificationSheet.getCell('J5').value?.toISOString(), '2026-08-24T10:42:46.000Z');
assert.equal(verificationSheet.getCell('J6').value?.toISOString(), '2026-08-24T10:42:46.000Z');

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, buffer);
console.log(JSON.stringify({ output, bytes: buffer.length }));
