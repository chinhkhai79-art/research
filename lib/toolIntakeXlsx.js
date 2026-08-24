import ExcelJS from 'exceljs';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

const STATUS_LABELS = {
  new: 'Chờ duyệt',
  granted: 'Đã nâng cấp PRO',
  sent: 'Đã xử lý',
  rejected: 'Từ chối'
};

function asVietnamExcelDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  // Excel cells do not retain a timezone. ExcelJS serializes the UTC fields,
  // so shift the instant to the Vietnam wall-clock value before writing it.
  return new Date(date.getTime() + VIETNAM_UTC_OFFSET_MS);
}

function safeSheetName(value) {
  return String(value || 'Đăng ký PRO').replace(/[\\/*?:[\]]/g, ' ').trim().slice(0, 31) || 'Đăng ký PRO';
}

export async function buildToolIntakeXlsx({ campaign = {}, entries = [], publicUrl = '' } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TubeKey.vn';
  workbook.company = 'TubeKey.vn';
  workbook.subject = 'Danh sách đăng ký nâng cấp PRO';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(safeSheetName(campaign.name), {
    views: [{ state: 'frozen', ySplit: 4, activeCell: 'A5' }],
    properties: { defaultRowHeight: 20 }
  });
  sheet.columns = [
    { key: 'index', width: 7 },
    { key: 'fullName', width: 25 },
    { key: 'phone', width: 17 },
    { key: 'email', width: 32 },
    { key: 'zalo', width: 48 },
    { key: 'status', width: 20 },
    { key: 'grantMessage', width: 46 },
    { key: 'linkedUid', width: 30 },
    { key: 'grantedAt', width: 21 },
    { key: 'createdAt', width: 21 }
  ];

  sheet.mergeCells('A1:J1');
  sheet.getCell('A1').value = campaign.name || campaign.title || 'Danh sách đăng ký nâng cấp PRO';
  sheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173B5E' } };
  sheet.getRow(1).height = 30;

  sheet.mergeCells('A2:J2');
  sheet.getCell('A2').value = publicUrl ? `Link đăng ký: ${publicUrl}` : 'Xuất từ trang quản trị TubeKey.vn';
  sheet.getCell('A2').font = { name: 'Arial', size: 10, color: { argb: 'FF64778A' } };
  sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 22;

  sheet.mergeCells('A3:J3');
  sheet.getCell('A3').value = `Tổng số đăng ký: ${entries.length} • Xuất lúc: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
  sheet.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64778A' } };

  const headers = ['STT', 'Họ và tên', 'Số điện thoại', 'Email', 'Link nhóm Zalo', 'Trạng thái PRO', 'Thông tin nâng cấp', 'UID tài khoản', 'Ngày nâng cấp', 'Ngày đăng ký'];
  sheet.getRow(4).values = headers;
  sheet.getRow(4).height = 27;
  sheet.getRow(4).eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF176FD0' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF0F4F99' } } };
  });

  entries.forEach((entry, index) => {
    const row = sheet.addRow([
      index + 1,
      entry.fullName || '',
      null,
      entry.email || '',
      entry.zalo || '',
      STATUS_LABELS[entry.status] || entry.status || 'Chờ duyệt',
      entry.grantMessage || null,
      entry.linkedUid || null,
      asVietnamExcelDate(entry.grantedAt),
      asVietnamExcelDate(entry.createdAt)
    ]);
    row.font = { name: 'Arial', size: 10, color: { argb: 'FF183248' } };
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = 34;
    row.eachCell(cell => {
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFDCE6EF' } } };
    });
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'center' };
    const exportedPhone = String(entry.phone || '').replace(/\D/g, '');
    if (exportedPhone) {
      row.getCell(3).value = Number(exportedPhone);
      row.getCell(3).numFmt = '0000000000';
    }
    row.getCell(4).numFmt = '@';
    if (entry.zalo) {
      row.getCell(5).value = { text: entry.zalo, hyperlink: entry.zalo, tooltip: 'Mở nhóm Zalo' };
      row.getCell(5).font = { name: 'Arial', size: 10, color: { argb: 'FF176FD0' }, underline: true };
    }
    row.getCell(9).numFmt = 'dd/mm/yyyy hh:mm';
    row.getCell(10).numFmt = 'dd/mm/yyyy hh:mm';
    if (index % 2 === 1) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7FAFC' } };
      });
    }
  });

  sheet.autoFilter = { from: 'A4', to: 'J4' };
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  sheet.headerFooter.oddFooter = '&LTubeKey.vn&CTrang &P / &N&R&D &T';

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
