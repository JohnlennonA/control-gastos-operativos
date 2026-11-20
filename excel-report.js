/**
 * Generador de Reporte Ejecutivo Excel (.xlsx)
 * Arquitectura: ExcelJS (estilos, formulas, hipervinculos, imagenes) + Chart.js (graficos HD offscreen)
 */

const REPORT_COLORS = {
    navy: "FF0F172A",
    slateDark: "FF1E293B",
    slateText: "FF334155",
    slateMuted: "FF64748B",
    blue: "FF2563EB",
    blueDark: "FF1D4ED8",
    blueSoft: "FFEFF6FF",
    blueBorder: "FFBFDBFE",
    emeraldDark: "FF064E3B",
    emerald: "FF166534",
    emeraldBright: "FF16A34A",
    emeraldSoft: "FFECFDF5",
    amber: "FFD97706",
    amberSoft: "FFFEF3C7",
    violet: "FF7C3AED",
    violetSoft: "FFF5F3FF",
    sky: "FF0284C7",
    skySoft: "FFE0F2FE",
    zebra: "FFF8FAFC",
    white: "FFFFFFFF",
    border: "FFE2E8F0",
    borderStrong: "FFCBD5E1"
};

const THIN_BORDER = {
    top: { style: "thin", color: { argb: REPORT_COLORS.border } },
    left: { style: "thin", color: { argb: REPORT_COLORS.border } },
    bottom: { style: "thin", color: { argb: REPORT_COLORS.border } },
    right: { style: "thin", color: { argb: REPORT_COLORS.border } }
};

const EXCEL_LOGOS = {
    uv: "img/UV%20SERVICES%20-%20Logo%20vectorial%20sin%20fondo.png",
    union: "img/UnionDataServicios.png",
    opex: "img/opex-app-icon.png"
};

function createLogoBadgeDataUrl(url, boxW = 240, boxH = 112) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = boxW;
                canvas.height = boxH;
                const ctx = canvas.getContext("2d");

                // Pastilla blanca redondeada para maximo contraste sobre el banner oscuro
                const r = 16;
                ctx.fillStyle = "#FFFFFF";
                ctx.beginPath();
                ctx.moveTo(r, 0);
                ctx.lineTo(boxW - r, 0);
                ctx.quadraticCurveTo(boxW, 0, boxW, r);
                ctx.lineTo(boxW, boxH - r);
                ctx.quadraticCurveTo(boxW, boxH, boxW - r, boxH);
                ctx.lineTo(r, boxH);
                ctx.quadraticCurveTo(0, boxH, 0, boxH - r);
                ctx.lineTo(0, r);
                ctx.quadraticCurveTo(0, 0, r, 0);
                ctx.closePath();
                ctx.fill();

                const pad = 14;
                const scale = Math.min((boxW - pad * 2) / img.width, (boxH - pad * 2) / img.height);
                const dw = img.width * scale;
                const dh = img.height * scale;
                ctx.drawImage(img, (boxW - dw) / 2, (boxH - dh) / 2, dw, dh);

                resolve(canvas.toDataURL("image/png"));
            } catch (_err) {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function extractVehicleLabel(row) {
    if (row.vehiculo_nombre || row.vehiculo_placa) {
        return [row.vehiculo_nombre, row.vehiculo_placa].filter(Boolean).join(" - ");
    }

    const category = String(row.categoria_nombre || "").trim();
    if (/^vehiculos\s*-\s*/i.test(category)) {
        const parts = category.split(/\s*-\s*/).filter(Boolean);
        if (parts.length >= 2) {
            return parts[1];
        }
    }

    return "";
}

function extractVehicleParts(row) {
    if (row.vehiculo_nombre || row.vehiculo_placa) {
        return {
            name: row.vehiculo_nombre || "",
            plate: row.vehiculo_placa || ""
        };
    }

    const label = extractVehicleLabel(row);
    if (!label) return { name: "", plate: "" };

    const tokens = label.split(/\s+/);
    if (tokens.length >= 2) {
        const possiblePlate = tokens[tokens.length - 1];
        if (/^[A-Z0-9]{5,8}$/i.test(possiblePlate)) {
            return {
                name: tokens.slice(0, -1).join(" "),
                plate: possiblePlate
            };
        }
    }

    return { name: label, plate: "" };
}

function buildGroupedData(rows, keyGetter) {
    const groups = rows.reduce((acc, row) => {
        const key = keyGetter(row) || "Sin detalle";
        if (!acc[key]) {
            acc[key] = { name: key, usd: 0, ves: 0, count: 0 };
        }
        acc[key].usd += Number(row.monto_usd || 0);
        acc[key].ves += Number(row.monto_ves || 0);
        acc[key].count += 1;
        return acc;
    }, {});

    return Object.values(groups)
        .sort((a, b) => b.usd - a.usd)
        .map((item) => ({
            name: item.name,
            usd: Number(item.usd.toFixed(2)),
            ves: Number(item.ves.toFixed(2)),
            count: item.count
        }));
}

function buildDailySeries(rows) {
    const map = rows.reduce((acc, row) => {
        const date = row.fecha || "Sin fecha";
        acc[date] = (acc[date] || 0) + Number(row.monto_usd || 0);
        return acc;
    }, {});

    return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, usd]) => ({
            date,
            label: date.includes("-") ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : date,
            usd: Number(usd.toFixed(2))
        }));
}

function truncateLabel(text, maxLen = 28) {
    const str = String(text || "");
    return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

function createChartCardImage(config, width = 1080, height = 600) {
    if (typeof window.Chart === "undefined") return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const cardBackgroundPlugin = {
        id: "cardBackground",
        beforeDraw(chart) {
            const { ctx: c, width: w, height: h } = chart;
            c.save();
            c.fillStyle = "#FFFFFF";
            c.fillRect(0, 0, w, h);
            c.strokeStyle = "#CBD5E1";
            c.lineWidth = 2;
            c.strokeRect(1, 1, w - 2, h - 2);
            c.restore();
        }
    };

    const barValueLabelsPlugin = {
        id: "barValueLabels",
        afterDatasetsDraw(chart) {
            if (chart.config.type !== "bar") return;
            const { ctx: c } = chart;
            const isHorizontal = chart.options?.indexAxis === "y";

            c.save();
            c.font = "700 20px 'Segoe UI', Arial, sans-serif";
            c.fillStyle = "#1E293B";

            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                meta.data.forEach((bar, index) => {
                    const value = Number(dataset.data[index] || 0);
                    if (value <= 0) return;
                    const text = `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                    if (isHorizontal) {
                        c.textAlign = "left";
                        c.textBaseline = "middle";
                        c.fillText(text, bar.x + 10, bar.y);
                    } else {
                        c.textAlign = "center";
                        c.textBaseline = "bottom";
                        c.fillText(text, bar.x, bar.y - 6);
                    }
                });
            });
            c.restore();
        }
    };

    const chart = new window.Chart(ctx, {
        ...config,
        options: {
            ...config.options,
            responsive: false,
            animation: false,
            devicePixelRatio: 1
        },
        plugins: [cardBackgroundPlugin, barValueLabelsPlugin, ...(config.plugins || [])]
    });

    const dataUrl = canvas.toDataURL("image/png");
    chart.destroy();
    return dataUrl;
}

function buildCompanyChart(companies, totalUsd, width = 1200, height = 460) {
    const labels = companies.map((c) => {
        const pct = totalUsd > 0 ? ((c.usd / totalUsd) * 100).toFixed(1) : "0.0";
        return `${c.name} ($${c.usd.toLocaleString("en-US", { minimumFractionDigits: 2 })} · ${pct}%)`;
    });

    const colors = companies.map((c) => {
        if (c.name === "UV Servicios") return "#2563EB";
        if (c.name === "Union Data") return "#7C3AED";
        return "#64748B";
    });

    return createChartCardImage({
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: companies.map((c) => c.usd),
                backgroundColor: colors,
                borderColor: "#FFFFFF",
                borderWidth: 4,
                hoverOffset: 0
            }]
        },
        options: {
            cutout: "58%",
            layout: { padding: { top: 20, right: 32, bottom: 20, left: 32 } },
            plugins: {
                title: {
                    display: true,
                    text: "Distribución de Gasto por Empresa (USD)",
                    color: "#0F172A",
                    font: { size: 24, weight: "bold", family: "'Segoe UI', Arial, sans-serif" },
                    padding: { bottom: 14 }
                },
                legend: {
                    position: "right",
                    labels: {
                        color: "#334155",
                        boxWidth: 18,
                        padding: 16,
                        font: { size: 19, weight: "600", family: "'Segoe UI', Arial, sans-serif" }
                    }
                }
            }
        }
    }, width, height);
}

function buildHorizontalBarChart(title, items, barColor = "#2563EB", width = 1200, height = 500) {
    const topItems = items.slice(0, 7);
    if (!topItems.length) return null;

    const maxVal = Math.max(...topItems.map((item) => item.usd), 1);

    return createChartCardImage({
        type: "bar",
        data: {
            labels: topItems.map((item) => truncateLabel(item.name, 26)),
            datasets: [{
                data: topItems.map((item) => item.usd),
                backgroundColor: barColor,
                borderRadius: 8,
                maxBarThickness: 28
            }]
        },
        options: {
            indexAxis: "y",
            layout: { padding: { top: 18, right: 150, bottom: 16, left: 20 } },
            scales: {
                x: {
                    beginAtZero: true,
                    suggestedMax: maxVal * 1.18,
                    grid: { color: "#E2E8F0" },
                    ticks: {
                        color: "#64748B",
                        font: { size: 17 },
                        callback: (value) => `$${Number(value).toLocaleString("en-US")}`
                    }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: "#1E293B",
                        font: { size: 18, weight: "600" }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: title,
                    color: "#0F172A",
                    font: { size: 24, weight: "bold", family: "'Segoe UI', Arial, sans-serif" },
                    padding: { bottom: 12 }
                },
                legend: { display: false }
            }
        }
    }, width, height);
}

function buildDailyTrendChart(dailySeries, width = 1200, height = 440) {
    if (dailySeries.length < 2) return null;

    return createChartCardImage({
        type: "line",
        data: {
            labels: dailySeries.map((d) => d.label),
            datasets: [{
                label: "Gasto Diario (USD)",
                data: dailySeries.map((d) => d.usd),
                borderColor: "#16A34A",
                backgroundColor: "rgba(22, 163, 74, 0.14)",
                borderWidth: 4,
                pointBackgroundColor: "#16A34A",
                pointRadius: 5,
                fill: true,
                tension: 0.28
            }]
        },
        options: {
            layout: { padding: { top: 18, right: 30, bottom: 16, left: 20 } },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: "#334155", font: { size: 17, weight: "600" } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: "#E2E8F0" },
                    ticks: {
                        color: "#64748B",
                        font: { size: 17 },
                        callback: (value) => `$${Number(value).toLocaleString("en-US")}`
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: "Evolución Diaria de Gastos (USD)",
                    color: "#0F172A",
                    font: { size: 24, weight: "bold", family: "'Segoe UI', Arial, sans-serif" },
                    padding: { bottom: 12 }
                },
                legend: { display: false }
            }
        }
    }, width, height);
}

function styleRange(sheet, startRow, startCol, endRow, endCol, styleFn) {
    for (let r = startRow; r <= endRow; r += 1) {
        for (let c = startCol; c <= endCol; c += 1) {
            styleFn(sheet.getCell(r, c), r, c);
        }
    }
}

function writeKpiCard(sheet, startCol, endCol, label, value, numFmt, accentColor, softColor) {
    sheet.mergeCells(4, startCol, 4, endCol);
    sheet.mergeCells(5, startCol, 5, endCol);

    const headerCell = sheet.getCell(4, startCol);
    headerCell.value = label;

    const valueCell = sheet.getCell(5, startCol);
    valueCell.value = value;
    if (numFmt) valueCell.numFmt = numFmt;

    styleRange(sheet, 4, startCol, 4, endCol, (cell) => {
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: REPORT_COLORS.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: accentColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
            top: { style: "thin", color: { argb: accentColor } },
            left: { style: "thin", color: { argb: accentColor } },
            right: { style: "thin", color: { argb: accentColor } }
        };
    });

    styleRange(sheet, 5, startCol, 5, endCol, (cell) => {
        cell.font = { name: "Calibri", size: 14, bold: true, color: { argb: REPORT_COLORS.navy } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: softColor } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
            bottom: { style: "medium", color: { argb: accentColor } },
            left: { style: "thin", color: { argb: REPORT_COLORS.borderStrong } },
            right: { style: "thin", color: { argb: REPORT_COLORS.borderStrong } }
        };
    });
}

function writeSummaryTable(sheet, startRow, title, firstColLabel, items, totalUsd, emptyLabel = "Sin registros") {
    let rowIdx = startRow;

    // Titulo de seccion
    sheet.mergeCells(rowIdx, 1, rowIdx, 5);
    const titleCell = sheet.getCell(rowIdx, 1);
    titleCell.value = title;
    sheet.getRow(rowIdx).height = 24;
    styleRange(sheet, rowIdx, 1, rowIdx, 5, (cell) => {
        cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: REPORT_COLORS.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.slateDark } };
        cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    });
    rowIdx += 1;

    // Encabezados de tabla
    const headers = [firstColLabel, "USD", "VES", "Registros", "% USD"];
    sheet.getRow(rowIdx).height = 22;
    headers.forEach((header, idx) => {
        const cell = sheet.getCell(rowIdx, idx + 1);
        cell.value = header;
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: REPORT_COLORS.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.blue } };
        cell.alignment = { horizontal: idx === 0 ? "left" : idx === 3 ? "center" : "right", vertical: "middle" };
        cell.border = {
            top: { style: "thin", color: { argb: REPORT_COLORS.blueDark } },
            bottom: { style: "thin", color: { argb: REPORT_COLORS.blueDark } },
            left: { style: "thin", color: { argb: REPORT_COLORS.blueDark } },
            right: { style: "thin", color: { argb: REPORT_COLORS.blueDark } }
        };
    });
    rowIdx += 1;

    const dataStartRow = rowIdx;
    const rowsToRender = items.length ? items : [{ name: emptyLabel, usd: 0, ves: 0, count: 0 }];

    rowsToRender.forEach((item, index) => {
        const isZebra = index % 2 === 1;
        const fillArgb = isZebra ? REPORT_COLORS.zebra : REPORT_COLORS.white;
        const pctValue = totalUsd > 0 ? Number((item.usd / totalUsd).toFixed(4)) : 0;

        sheet.getRow(rowIdx).height = 20;

        const nameCell = sheet.getCell(rowIdx, 1);
        const usdCell = sheet.getCell(rowIdx, 2);
        const vesCell = sheet.getCell(rowIdx, 3);
        const countCell = sheet.getCell(rowIdx, 4);
        const pctCell = sheet.getCell(rowIdx, 5);

        nameCell.value = item.name;
        usdCell.value = item.usd;
        vesCell.value = item.ves;
        countCell.value = item.count;
        pctCell.value = pctValue;

        usdCell.numFmt = "$#,##0.00";
        vesCell.numFmt = '"Bs. "#,##0.00';
        countCell.numFmt = "#,##0";
        pctCell.numFmt = "0.0%";

        [nameCell, usdCell, vesCell, countCell, pctCell].forEach((cell, cIdx) => {
            cell.font = {
                name: "Calibri",
                size: 10,
                bold: cIdx === 0 && items.length > 0,
                color: { argb: items.length ? REPORT_COLORS.slateDark : REPORT_COLORS.slateMuted }
            };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
            cell.alignment = {
                horizontal: cIdx === 0 ? "left" : cIdx === 3 ? "center" : "right",
                vertical: "middle"
            };
            cell.border = THIN_BORDER;
        });

        rowIdx += 1;
    });

    const dataEndRow = rowIdx - 1;

    // Fila de TOTALES con formulas reales de Excel
    if (items.length) {
        const sumUsd = Number(items.reduce((acc, i) => acc + i.usd, 0).toFixed(2));
        const sumVes = Number(items.reduce((acc, i) => acc + i.ves, 0).toFixed(2));
        const sumCount = items.reduce((acc, i) => acc + i.count, 0);
        const sumPct = totalUsd > 0 ? Number((sumUsd / totalUsd).toFixed(4)) : 0;

        sheet.getRow(rowIdx).height = 22;

        const totalLabel = sheet.getCell(rowIdx, 1);
        const totalUsdCell = sheet.getCell(rowIdx, 2);
        const totalVesCell = sheet.getCell(rowIdx, 3);
        const totalCountCell = sheet.getCell(rowIdx, 4);
        const totalPctCell = sheet.getCell(rowIdx, 5);

        totalLabel.value = "TOTAL";
        totalUsdCell.value = { formula: `SUM(B${dataStartRow}:B${dataEndRow})`, result: sumUsd };
        totalVesCell.value = { formula: `SUM(C${dataStartRow}:C${dataEndRow})`, result: sumVes };
        totalCountCell.value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})`, result: sumCount };
        totalPctCell.value = { formula: `SUM(E${dataStartRow}:E${dataEndRow})`, result: sumPct };

        totalUsdCell.numFmt = "$#,##0.00";
        totalVesCell.numFmt = '"Bs. "#,##0.00';
        totalCountCell.numFmt = "#,##0";
        totalPctCell.numFmt = "0.0%";

        [totalLabel, totalUsdCell, totalVesCell, totalCountCell, totalPctCell].forEach((cell, cIdx) => {
            cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: REPORT_COLORS.navy } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.blueSoft } };
            cell.alignment = {
                horizontal: cIdx === 0 ? "left" : cIdx === 3 ? "center" : "right",
                vertical: "middle"
            };
            cell.border = {
                top: { style: "medium", color: { argb: REPORT_COLORS.blue } },
                bottom: { style: "medium", color: { argb: REPORT_COLORS.blue } },
                left: { style: "thin", color: { argb: REPORT_COLORS.blueBorder } },
                right: { style: "thin", color: { argb: REPORT_COLORS.blueBorder } }
            };
        });

        rowIdx += 1;
    }

    return rowIdx + 1;
}

async function generateExecutiveExcelReport({
    rows,
    fromDate,
    toDate,
    companyFilter,
    getRateTypeLabel,
    getMoneyUnit,
    formatDate
}) {
    if (typeof window.ExcelJS === "undefined") {
        throw new Error("No se cargó la librería ExcelJS. Recarga la plataforma e intenta nuevamente.");
    }

    const workbook = new window.ExcelJS.Workbook();
    workbook.creator = "Control de Gastos Operativos";
    workbook.created = new Date();

    const totals = rows.reduce((acc, row) => {
        acc.usd += Number(row.monto_usd || 0);
        acc.ves += Number(row.monto_ves || 0);
        acc.receipts += row.comprobante_url ? 1 : 0;
        acc.count += 1;
        acc.liters += Number(row.litros_gasolina || 0);
        return acc;
    }, { usd: 0, ves: 0, receipts: 0, count: 0, liters: 0 });

    const companies = buildGroupedData(rows, (row) => row.empresa || "Sin empresa");
    const categories = buildGroupedData(rows, (row) => row.categoria_nombre || "Sin categoría");
    const responsibles = buildGroupedData(rows, (row) => row.responsable || "Sin responsable");
    const vehicleRows = rows.filter((row) => Boolean(extractVehicleLabel(row)));
    const vehicles = buildGroupedData(vehicleRows, (row) => extractVehicleLabel(row));
    const dailySeries = buildDailySeries(rows);

    const periodText = `${fromDate ? formatDate(fromDate) : "Inicio"} al ${toDate ? formatDate(toDate) : "Hoy"}`;
    const companyText = companyFilter || "Todas las empresas";
    const generatedAt = new Date().toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });

    // =========================================================
    // HOJA 1: DASHBOARD EJECUTIVO
    // =========================================================
    const dashboard = workbook.addWorksheet("Dashboard", {
        properties: { tabColor: { argb: REPORT_COLORS.blue } },
        views: [{ showGridLines: false }]
    });

    const maxLabelLength = Math.max(
        38,
        ...categories.map((c) => String(c.name || "").length),
        ...vehicles.map((v) => String(v.name || "").length)
    );
    const colAWidth = Math.min(54, maxLabelLength + 3);

    dashboard.columns = [
        { width: colAWidth }, // A - Concepto (autoajustado)
        { width: 17 },        // B - USD
        { width: 21 },        // C - VES
        { width: 12 },        // D - Registros
        { width: 12 },        // E - % USD
        { width: 3 },         // F - Separador
        { width: 12 },        // G
        { width: 12 },        // H
        { width: 12 },        // I
        { width: 12 },        // J
        { width: 12 },        // K
        { width: 12 },        // L
        { width: 12 },        // M
        { width: 12 }         // N
    ];

    // Banner principal
    dashboard.mergeCells("A1:N1");
    dashboard.getRow(1).height = 44;
    const bannerCell = dashboard.getCell("A1");
    bannerCell.value = "REPORTE EJECUTIVO DE GASTOS OPERATIVOS";
    bannerCell.font = { name: "Calibri", size: 17, bold: true, color: { argb: REPORT_COLORS.white } };
    bannerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.navy } };
    bannerCell.alignment = { horizontal: "center", vertical: "middle" };

    dashboard.mergeCells("A2:N2");
    dashboard.getRow(2).height = 24;
    const subBannerCell = dashboard.getCell("A2");
    subBannerCell.value = `Periodo: ${periodText}   |   Empresa: ${companyText}   |   Generado: ${generatedAt}`;
    subBannerCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: REPORT_COLORS.blueDark } };
    subBannerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.blueSoft } };
    subBannerCell.alignment = { horizontal: "center", vertical: "middle" };
    subBannerCell.border = { bottom: { style: "thin", color: { argb: REPORT_COLORS.blueBorder } } };

    // Logos corporativos dinamicos en el encabezado segun el filtro de empresa
    const leftLogoUrl = companyFilter === "Union Data" ? EXCEL_LOGOS.union : EXCEL_LOGOS.uv;
    const rightLogoUrl = companyFilter ? EXCEL_LOGOS.opex : EXCEL_LOGOS.union;
    const [leftLogoBase64, rightLogoBase64] = await Promise.all([
        createLogoBadgeDataUrl(leftLogoUrl, 240, 108),
        createLogoBadgeDataUrl(rightLogoUrl, 240, 108)
    ]);

    if (leftLogoBase64) {
        const leftId = workbook.addImage({ base64: leftLogoBase64, extension: "png" });
        dashboard.addImage(leftId, {
            tl: { col: 0.06, row: 0.1 },
            ext: { width: 108, height: 48 }
        });
    }

    if (rightLogoBase64) {
        const rightId = workbook.addImage({ base64: rightLogoBase64, extension: "png" });
        dashboard.addImage(rightId, {
            tl: { col: 12.72, row: 0.1 },
            ext: { width: 108, height: 48 }
        });
    }

    dashboard.getRow(3).height = 10;

    // Tarjetas KPI (Fila 4 y 5, de A a N)
    dashboard.getRow(4).height = 22;
    dashboard.getRow(5).height = 30;
    const receiptPct = totals.count > 0 ? ((totals.receipts / totals.count) * 100).toFixed(1) : "0.0";

    writeKpiCard(dashboard, 1, 2, "TOTAL DIVISA (USD)", Number(totals.usd.toFixed(2)), "$#,##0.00", REPORT_COLORS.blue, REPORT_COLORS.blueSoft);
    writeKpiCard(dashboard, 3, 4, "TOTAL BOLÍVARES (VES)", Number(totals.ves.toFixed(2)), '"Bs. "#,##0.00', REPORT_COLORS.emeraldBright, REPORT_COLORS.emeraldSoft);
    writeKpiCard(dashboard, 5, 7, "REGISTROS", totals.count, "#,##0", REPORT_COLORS.amber, REPORT_COLORS.amberSoft);
    writeKpiCard(dashboard, 8, 10, "COMPROBANTES", `${totals.receipts} (${receiptPct}%)`, null, REPORT_COLORS.violet, REPORT_COLORS.violetSoft);
    writeKpiCard(dashboard, 11, 14, "LITROS GASOLINA", Number(totals.liters.toFixed(2)), '#,##0.00" L"', REPORT_COLORS.sky, REPORT_COLORS.skySoft);

    dashboard.getRow(6).height = 12;

    // Tablas ejecutivas en el lado izquierdo (A:E)
    let nextRow = 7;
    nextRow = writeSummaryTable(dashboard, nextRow, "DISTRIBUCIÓN POR EMPRESA", "Empresa", companies, totals.usd, "Sin empresa");
    nextRow = writeSummaryTable(dashboard, nextRow, "DISTRIBUCIÓN POR CATEGORÍA", "Categoría", categories, totals.usd, "Sin categorías");
    nextRow = writeSummaryTable(dashboard, nextRow, "DISTRIBUCIÓN POR RESPONSABLE", "Responsable", responsibles, totals.usd, "Sin responsables");
    nextRow = writeSummaryTable(dashboard, nextRow, "DISTRIBUCIÓN POR VEHÍCULO / FLOTA", "Vehículo / Placa", vehicles, totals.usd, "Sin gastos asociados a vehículos");

    const tableBottomRow = nextRow - 2; // Ultima fila real de la ultima tabla

    // Definicion de graficos a distribuir nivelados con las tablas (de fila 7 a tableBottomRow, cols G:N)
    const chartSpecs = [
        { weight: 0.9, render: (w, h) => buildCompanyChart(companies, totals.usd, w, h) },
        { weight: 1.15, render: (w, h) => buildHorizontalBarChart("Top Categorías de Gasto (USD)", categories, "#2563EB", w, h) },
        vehicles.length
            ? { weight: 1.0, render: (w, h) => buildHorizontalBarChart("Gasto por Vehículo / Flota (USD)", vehicles, "#7C3AED", w, h) }
            : null,
        dailySeries.length >= 2
            ? { weight: 0.95, render: (w, h) => buildDailyTrendChart(dailySeries, w, h) }
            : null
    ].filter(Boolean);

    const chartStartRow = 7;
    const gapRows = 1;
    const minTotalChartRows = chartSpecs.length * 10 + Math.max(0, chartSpecs.length - 1) * gapRows;
    const targetBottomRow = Math.max(tableBottomRow, chartStartRow + minTotalChartRows - 1);

    // Asegurar altura uniforme en filas donde no haya tabla (si las tablas son mas cortas que los graficos)
    for (let r = chartStartRow; r <= targetBottomRow; r += 1) {
        if (!dashboard.getRow(r).height) {
            dashboard.getRow(r).height = 20;
        }
    }

    const totalAvailableRows = targetBottomRow - chartStartRow + 1;
    const usableRows = totalAvailableRows - Math.max(0, chartSpecs.length - 1) * gapRows;
    const totalWeight = chartSpecs.reduce((acc, s) => acc + s.weight, 0);

    // Ancho aproximado de columnas G..N (8 cols * width 12 * ~7.5px) = ~720px -> render 2x (1440px)
    const chartBoxWidthPx = 720;
    const canvasBaseWidth = 1440;

    let currentRow = chartStartRow;
    chartSpecs.forEach((spec, index) => {
        const isLast = index === chartSpecs.length - 1;
        const allocatedRows = isLast
            ? Math.max(8, targetBottomRow - currentRow + 1)
            : Math.max(8, Math.round((spec.weight / totalWeight) * usableRows));

        const endRow = isLast ? targetBottomRow : Math.min(targetBottomRow, currentRow + allocatedRows - 1);

        // Calcular altura real en px de las filas asignadas para mantener proporcion exacta sin deformar
        let boxHeightPt = 0;
        for (let r = currentRow; r <= endRow; r += 1) {
            boxHeightPt += dashboard.getRow(r).height || 20;
        }
        const boxHeightPx = boxHeightPt * (96 / 72);
        const canvasHeight = Math.round(canvasBaseWidth * (boxHeightPx / chartBoxWidthPx));

        const img = spec.render(canvasBaseWidth, Math.max(360, canvasHeight));
        if (img) {
            const imageId = workbook.addImage({ base64: img, extension: "png" });
            dashboard.addImage(imageId, {
                tl: { col: 6, row: currentRow - 1 },
                br: { col: 14, row: endRow }
            });
        }

        currentRow = endRow + 1 + gapRows;
    });

    // Nota al pie a todo lo ancho (A:N) debajo de tablas y graficos nivelados
    const footerRow = targetBottomRow + 2;
    dashboard.mergeCells(footerRow, 1, footerRow, 14);
    dashboard.getRow(footerRow).height = 22;
    const noteCell = dashboard.getCell(footerRow, 1);
    noteCell.value = "Nota: La hoja 'Detalle' contiene cada gasto individual con filtros activos, totales automáticos (=SUBTOTAL) y enlaces directos a los comprobantes.";
    noteCell.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: REPORT_COLORS.slateMuted } };
    noteCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.zebra } };
    noteCell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    noteCell.border = { top: { style: "thin", color: { argb: REPORT_COLORS.border } } };

    // =========================================================
    // HOJA 2: DETALLE DE GASTOS
    // =========================================================
    const detail = workbook.addWorksheet("Detalle", {
        properties: { tabColor: { argb: REPORT_COLORS.emeraldBright } },
        views: [{ state: "frozen", ySplit: 4, showGridLines: true }]
    });

    const detailColumns = [
        { header: "Fecha", width: 13 },
        { header: "Empresa", width: 17 },
        { header: "Categoría", width: 34 },
        { header: "N° Factura", width: 17 },
        { header: "Moneda", width: 11 },
        { header: "Forma de pago", width: 17 },
        { header: "Tipo tasa", width: 14 },
        { header: "Tasa usada", width: 13 },
        { header: "Divisa", width: 10 },
        { header: "Monto Divisa", width: 16 },
        { header: "Monto VES", width: 19 },
        { header: "Vehículo", width: 18 },
        { header: "Placa", width: 12 },
        { header: "Kilometraje", width: 14 },
        { header: "Litros Gasolina", width: 15 },
        { header: "Detalle actividad", width: 22 },
        { header: "Responsable", width: 15 },
        { header: "Registrado por", width: 26 },
        { header: "Descripción", width: 36 },
        { header: "Comprobante", width: 16 }
    ];

    detail.columns = detailColumns.map((col) => ({ width: col.width }));

    // Banner hoja Detalle
    detail.mergeCells(1, 1, 1, detailColumns.length);
    detail.getRow(1).height = 32;
    const detailTitle = detail.getCell(1, 1);
    detailTitle.value = "DETALLE DE GASTOS OPERATIVOS";
    detailTitle.font = { name: "Calibri", size: 15, bold: true, color: { argb: REPORT_COLORS.white } };
    detailTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.emeraldDark } };
    detailTitle.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

    detail.mergeCells(2, 1, 2, detailColumns.length);
    detail.getRow(2).height = 22;
    const detailSubtitle = detail.getCell(2, 1);
    detailSubtitle.value = `Periodo: ${periodText}   |   Empresa: ${companyText}   |   ${rows.length} registros   |   Los totales al final se recalculan al filtrar`;
    detailSubtitle.font = { name: "Calibri", size: 10, bold: true, color: { argb: REPORT_COLORS.emerald } };
    detailSubtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.emeraldSoft } };
    detailSubtitle.alignment = { horizontal: "left", vertical: "middle", indent: 1 };

    detail.getRow(3).height = 8;

    // Encabezados de tabla (Fila 4)
    detail.getRow(4).height = 24;
    detailColumns.forEach((col, idx) => {
        const cell = detail.getCell(4, idx + 1);
        cell.value = col.header;
        cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: REPORT_COLORS.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.emerald } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = THIN_BORDER;
    });

    // Filas de datos (desde fila 5)
    const detailStartRow = 5;
    rows.forEach((row, index) => {
        const r = detailStartRow + index;
        const isZebra = index % 2 === 1;
        const fillArgb = isZebra ? REPORT_COLORS.zebra : REPORT_COLORS.white;
        const vehicleParts = extractVehicleParts(row);

        detail.getRow(r).height = 20;

        const values = [
            formatDate(row.fecha),
            row.empresa || "Sin empresa",
            row.categoria_nombre || "",
            row.numero_factura || "",
            row.moneda || "",
            row.forma_pago || "",
            getRateTypeLabel(row.tipo_tasa),
            Number(row.tasa_bcv || 0),
            getMoneyUnit(row.tipo_tasa),
            Number(row.monto_usd || 0),
            Number(row.monto_ves || 0),
            vehicleParts.name,
            vehicleParts.plate,
            row.kilometraje ? Number(row.kilometraje) : "",
            row.litros_gasolina ? Number(row.litros_gasolina) : "",
            row.detalle_actividad || "",
            row.responsable || "",
            row.user_email || "",
            row.descripcion || "",
            row.comprobante_url ? { text: "Ver soporte", hyperlink: row.comprobante_url } : "Sin soporte"
        ];

        values.forEach((val, cIdx) => {
            const cell = detail.getCell(r, cIdx + 1);
            cell.value = val;
            cell.font = { name: "Calibri", size: 10, color: { argb: REPORT_COLORS.slateDark } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
            cell.border = THIN_BORDER;

            if (cIdx === 0 || cIdx === 4 || cIdx === 8 || cIdx === 12 || cIdx === 19) {
                cell.alignment = { horizontal: "center", vertical: "middle" };
            } else if ([7, 9, 10, 13, 14].includes(cIdx)) {
                cell.alignment = { horizontal: "right", vertical: "middle" };
            } else {
                cell.alignment = { horizontal: "left", vertical: "middle" };
            }

            // Badge suave por empresa
            if (cIdx === 1) {
                cell.alignment = { horizontal: "center", vertical: "middle" };
                if (row.empresa === "UV Servicios") {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.blueSoft } };
                    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: REPORT_COLORS.blueDark } };
                } else if (row.empresa === "Union Data") {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.violetSoft } };
                    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: REPORT_COLORS.violet } };
                } else {
                    cell.font = { name: "Calibri", size: 10, italic: true, color: { argb: REPORT_COLORS.slateMuted } };
                }
            }

            // Formatos numericos
            if (cIdx === 7) cell.numFmt = "#,##0.0000";
            if (cIdx === 9) cell.numFmt = "$#,##0.00";
            if (cIdx === 10) cell.numFmt = '"Bs. "#,##0.00';
            if (cIdx === 13 && val !== "") cell.numFmt = "#,##0";
            if (cIdx === 14 && val !== "") cell.numFmt = "#,##0.00";

            // Estilo hipervinculo comprobante
            if (cIdx === 19) {
                if (row.comprobante_url) {
                    cell.font = { name: "Calibri", size: 10, bold: true, underline: true, color: { argb: REPORT_COLORS.blue } };
                } else {
                    cell.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: REPORT_COLORS.slateMuted } };
                }
            }
        });
    });

    const detailEndRow = detailStartRow + rows.length - 1;
    const totalRowIdx = detailEndRow + 1;

    // Autofiltro sobre los datos
    detail.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: detailEndRow, column: detailColumns.length }
    };

    // Fila de TOTALES dinamicos con SUBTOTAL
    detail.getRow(totalRowIdx).height = 24;
    detail.getCell(totalRowIdx, 1).value = "TOTAL FILTRADO";
    detail.getCell(totalRowIdx, 10).value = { formula: `SUBTOTAL(9,J${detailStartRow}:J${detailEndRow})`, result: Number(totals.usd.toFixed(2)) };
    detail.getCell(totalRowIdx, 11).value = { formula: `SUBTOTAL(9,K${detailStartRow}:K${detailEndRow})`, result: Number(totals.ves.toFixed(2)) };
    detail.getCell(totalRowIdx, 15).value = { formula: `SUBTOTAL(9,O${detailStartRow}:O${detailEndRow})`, result: Number(totals.liters.toFixed(2)) };

    detail.getCell(totalRowIdx, 10).numFmt = "$#,##0.00";
    detail.getCell(totalRowIdx, 11).numFmt = '"Bs. "#,##0.00';
    detail.getCell(totalRowIdx, 15).numFmt = '#,##0.00" L"';

    styleRange(detail, totalRowIdx, 1, totalRowIdx, detailColumns.length, (cell, _r, col) => {
        cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: REPORT_COLORS.emeraldDark } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: REPORT_COLORS.emeraldSoft } };
        cell.alignment = { horizontal: [10, 11, 15].includes(col) ? "right" : "left", vertical: "middle" };
        cell.border = {
            top: { style: "medium", color: { argb: REPORT_COLORS.emerald } },
            bottom: { style: "medium", color: { argb: REPORT_COLORS.emerald } },
            left: { style: "thin", color: { argb: REPORT_COLORS.borderStrong } },
            right: { style: "thin", color: { argb: REPORT_COLORS.borderStrong } }
        };
    });

    // Descarga del archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const companySlug = companyFilter ? `-${companyFilter.toLowerCase().replace(/\s+/g, "-")}` : "";
    const filename = `reporte-gastos${companySlug}-${fromDate || "inicio"}-a-${toDate || "hoy"}.xlsx`;

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

