function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  withLock(function () { normalizeHeaderRow(sheet); });
  var data = sheet.getDataRange().getValues();
  var headerRowIndex = findHeaderRowIndex(data);
  var headers = data[headerRowIndex];
  var rows = data
    .filter(function (row, i) { return i !== headerRowIndex; })
    .filter(function (row) {
      return row.some(function (cell) { return cell !== ''; });
    })
    .map(function (row) {
      var obj = {};
      headers.forEach(function (header, i) {
        if (!header) return;
        var value = row[i];
        obj[header] = value instanceof Date ? value.toISOString() : value;
      });
      return obj;
    });
  return jsonOutput(rows);
}

function doPost(e) {
  return withLock(function () {
    var payload = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    normalizeHeaderRow(sheet);
    var data = sheet.getDataRange().getValues();
    var headerRowIndex = findHeaderRowIndex(data);
    var headers = data[headerRowIndex];
    var idCol = headers.indexOf('id');
    if (idCol === -1) {
      return jsonOutput({ ok: false, error: 'no id column' });
    }
    var estadoCol = headers.indexOf('estado_crm');
    if (estadoCol === -1) {
      estadoCol = headers.length;
      sheet.getRange(headerRowIndex + 1, estadoCol + 1).setValue('estado_crm');
    }

    var updates = payload.updates || (payload.id ? [{ id: payload.id, estado_crm: payload.estado_crm }] : []);
    if (!updates.length) {
      return jsonOutput({ ok: false, error: 'no updates' });
    }

    var idToRow = {};
    for (var r = 0; r < data.length; r++) {
      if (r === headerRowIndex) continue;
      idToRow[String(data[r][idCol])] = r;
    }

    var updated = 0;
    updates.forEach(function (u) {
      var id = String(u.id || '');
      if (!id || u.estado_crm === undefined) return;
      var r = idToRow[id];
      if (r === undefined) return;
      sheet.getRange(r + 1, estadoCol + 1).setValue(u.estado_crm);
      updated += 1;
    });

    return jsonOutput({ ok: true, updated: updated, requested: updates.length });
  });
}

function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// The Meta Ads Manager CRM integration that fills this sheet inserts new
// leads above row 1, pushing the header row down over time. This keeps
// the header pinned at row 1 by moving it back whenever it drifts.
function normalizeHeaderRow(sheet) {
  var data = sheet.getDataRange().getValues();
  var headerRowIndex = findHeaderRowIndex(data);
  if (headerRowIndex === 0) return;
  var headerValues = data[headerRowIndex];
  sheet.deleteRow(headerRowIndex + 1);
  sheet.insertRowBefore(1);
  sheet.getRange(1, 1, 1, headerValues.length).setValues([headerValues]);
}

function findHeaderRowIndex(data) {
  for (var r = 0; r < data.length; r++) {
    if (data[r].indexOf('id') !== -1) return r;
  }
  return 0;
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}