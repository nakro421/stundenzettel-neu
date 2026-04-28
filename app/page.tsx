"use client";

import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { auth, db } from "../lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";

const FUNKTIONEN = ["Sakra", "Sipo", "Baustellensakra", "Bahnerder", "Bediener", "SAS", "BÜP", "HIP", "Flapo", "ZMP"];

const ZEITEN = [
  ["7-18 Uhr", "07:00", "18:00"],
  ["7-16 Uhr", "07:00", "16:00"],
  ["20-5 Uhr", "20:00", "05:00"],
  ["22-5 Uhr", "22:00", "05:00"],
  ["18-0:30 Uhr", "18:00", "00:30"],
  ["21-5:30 Uhr", "21:00", "05:30"],
];

const ROWS = 18;

type Mitarbeiter = { name: string; personalnummer: string };

type Row = {
  datum: string;
  name: string;
  personalnummer: string;
  bez: string;
  vorlage: string;
  von: string;
  bis: string;
  bemerkung: string;
};

function toMin(t: string) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function bruttoMin(von: string, bis: string) {
  if (!von || !bis) return 0;
  let d = toMin(bis) - toMin(von);
  if (d < 0) d += 1440;
  return d;
}

function autoPause(min: number) {
  if (min >= 600) return 60;
  if (min >= 540) return 45;
  if (min >= 300) return 30;
  return 0;
}

function formatHours(min: number) {
  if (!min) return "";
  return (min / 60).toFixed(2).replace(".", ",");
}

function formatDateDE(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${day}.${month}.${year}`;
}

function makeMitarbeiterId(m: Mitarbeiter) {
  return `${m.name}-${m.personalnummer}`
    .replaceAll("/", "-")
    .replaceAll(" ", "_")
    .replaceAll(".", "")
    .replaceAll(",", "");
}

function parseMitarbeiterText(text: string): Mitarbeiter[] {
  const list: Mitarbeiter[] = [];

  text.split("\n").forEach((line) => {
    const clean = line.trim();
    if (!clean || !clean.includes("/")) return;

    const parts = clean.split("/");
    const personalnummer = parts.pop()?.trim() || "";
    const name = parts.join("/").trim();

    if (!name || !personalnummer) return;
    list.push({ name, personalnummer });
  });

  const unique = new Map<string, Mitarbeiter>();
  list.forEach((m) => {
    unique.set(`${m.name.toLowerCase()}-${m.personalnummer}`, m);
  });

  return Array.from(unique.values());
}

export default function Page() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [showMitarbeiterListe, setShowMitarbeiterListe] = useState(false);
  const [showTextImport, setShowTextImport] = useState(false);
  const [importText, setImportText] = useState("");

  const [drawing, setDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("red");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  const isDrawingRef = useRef(false);

  const [rows, setRows] = useState<Row[]>(
    Array.from({ length: ROWS }, () => ({
      datum: "",
      name: "",
      personalnummer: "",
      bez: "",
      vorlage: "",
      von: "",
      bis: "",
      bemerkung: "",
    }))
  );

  useEffect(() => {
    async function loadMitarbeiter() {
      const snapshot = await getDocs(collection(db, "Mitarbeiter"));
      const liste = snapshot.docs
        .map((d) => d.data() as Mitarbeiter)
        .filter((m) => m.name && m.personalnummer);

      setMitarbeiter(liste);
      localStorage.setItem("mitarbeiter", JSON.stringify(liste));
    }

    loadMitarbeiter();

    if (localStorage.getItem("loggedIn") === "true") {
      setLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    const hasContent = rows.some((r) => Object.values(r).some((value) => value.trim() !== ""));

    if (!loggedIn || !hasContent) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [loggedIn, rows]);

  useEffect(() => {
    function resizeCanvas() {
      const canvas = canvasRef.current;
      const sheet = sheetRef.current;
      if (!canvas || !sheet) return;

      const rect = sheet.getBoundingClientRect();
      canvas.width = Math.round(rect.width);
      canvas.height = Math.round(rect.height);
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [loggedIn]);

  async function saveMitarbeiter(list: Mitarbeiter[]) {
    setMitarbeiter(list);
    localStorage.setItem("mitarbeiter", JSON.stringify(list));

    for (const m of list) {
      await setDoc(doc(db, "Mitarbeiter", makeMitarbeiterId(m)), {
        name: m.name,
        personalnummer: m.personalnummer,
      });
    }
  }

  function addMitarbeiter() {
    const name = prompt("Name des Mitarbeiters?");
    const personalnummer = prompt("Personalnummer?");
    if (!name || !personalnummer) return;
    saveMitarbeiter([...mitarbeiter, { name, personalnummer }]);
  }

  async function deleteMitarbeiter(name: string) {
    const m = mitarbeiter.find((x) => x.name === name);
    if (!m) return;

    await deleteDoc(doc(db, "Mitarbeiter", makeMitarbeiterId(m)));

    const neueListe = mitarbeiter.filter((x) => x.name !== name);
    setMitarbeiter(neueListe);
    localStorage.setItem("mitarbeiter", JSON.stringify(neueListe));
  }

  function update(i: number, field: keyof Row, value: string) {
    const copy = [...rows];
    copy[i] = { ...copy[i], [field]: value };
    setRows(copy);
  }

  function copyRow(i: number) {
    if (i >= rows.length - 1) return;
    const copy = [...rows];
    copy[i + 1] = { ...rows[i] };
    setRows(copy);
  }

  function selectMitarbeiter(i: number, name: string) {
    const m = mitarbeiter.find((x) => x.name === name);
    const copy = [...rows];
    copy[i] = { ...copy[i], name, personalnummer: m?.personalnummer || "" };
    setRows(copy);
  }

  function setVorlage(i: number, value: string) {
    const found = ZEITEN.find((z) => z[0] === value);
    const copy = [...rows];

    copy[i] = found
      ? { ...copy[i], vorlage: value, von: found[1], bis: found[2] }
      : { ...copy[i], vorlage: "" };

    setRows(copy);
  }

  function importMitarbeiterAusText() {
    const parsed = parseMitarbeiterText(importText);

    if (parsed.length === 0) {
      alert("Keine Mitarbeiter erkannt. Format: Name / Personalnummer");
      return;
    }

    saveMitarbeiter(parsed);
    setImportText("");
    setShowTextImport(false);
    alert(`${parsed.length} Mitarbeiter importiert und online gespeichert`);
  }

  function exportExcel() {
    const data = rows
      .filter((r) => r.datum || r.name || r.personalnummer || r.bez || r.von || r.bis || r.bemerkung)
      .map((r) => {
        const brutto = bruttoMin(r.von, r.bis);
        const pause = autoPause(brutto);
        const netto = Math.max(0, brutto - pause);

        return {
          Datum: formatDateDE(r.datum),
          Name: r.name,
          Personalnummer: r.personalnummer,
          Funktion: r.bez,
          Von: r.von,
          Bis: r.bis,
          Pause: pause ? `${pause} min` : "",
          Std: formatHours(netto),
          Bemerkung: r.bemerkung,
        };
      });

    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 14 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
      { wch: 35 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stundenzettel");
    XLSX.writeFile(wb, "stundenzettel.xlsx");
  }

  function getCanvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    isDrawingRef.current = true;
    const pos = getCanvasPos(e);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || !isDrawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDraw() {
    isDrawingRef.current = false;
  }

  function clearDrawing() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  if (!loggedIn) {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{ border: "1px solid #000", padding: 20, background: "#fff" }}>
          <h2>Login</h2>
          <input
            type="password"
            placeholder="Passwort"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if ((e.target as HTMLInputElement).value === "36833") {
                  localStorage.setItem("loggedIn", "true");
                  setLoggedIn(true);
                } else {
                  alert("Falsches Passwort");
                }
              }
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          background: #f4f7fb;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
          overflow-x: auto;
        }

        .toolbar {
          max-width: 1290px;
          margin: 8px auto 14px auto;
          padding: 12px;
          background: #ffffff;
          border: 1px solid #d9e2ef;
          border-radius: 14px;
          box-shadow: 0 4px 18px rgba(0,0,0,0.08);
          display: flex;
          gap: 12px;
          justify-content: center;
          align-items: stretch;
          flex-wrap: wrap;
        }

        .tool-group {
          display: flex;
          gap: 10px;
          align-items: stretch;
          padding-right: 12px;
          border-right: 1px solid #d9e2ef;
        }

        .tool-group:last-child {
          border-right: none;
          padding-right: 0;
        }

        .tool-button,
        .tool-label,
        .tool-select {
          width: 120px;
          min-height: 76px;
          border: 1px solid #d6dee9;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          border-radius: 10px;
          box-shadow: 0 2px 7px rgba(0,0,0,0.08);
          cursor: pointer;
          font-weight: 800;
          font-size: 12px;
          color: #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 6px;
          padding: 8px;
          transition: 0.15s ease;
          line-height: 15px;
        }

        .tool-button:hover,
        .tool-label:hover,
        .tool-select:hover {
          transform: translateY(-1px);
          box-shadow: 0 5px 14px rgba(0,0,0,0.12);
          border-color: #8bbcff;
        }

        .tool-button.primary {
          border-color: #b8d7ff;
        }

        .tool-button.danger {
          border-color: #ffd2d2;
        }

        .tool-button.draw-active {
          background: linear-gradient(180deg, #eaf3ff 0%, #d8ebff 100%);
          border-color: #2f80ed;
        }

        .tool-icon {
          font-size: 26px;
          line-height: 26px;
        }

        .tool-select {
          appearance: none;
          -webkit-appearance: none;
          padding: 8px;
        }

        .tool-select-wrap {
          position: relative;
        }

        .tool-select-wrap::after {
          content: "⌄";
          position: absolute;
          right: 12px;
          top: 29px;
          font-size: 18px;
          pointer-events: none;
          font-weight: 900;
        }

        .text-import-box {
          width: 760px;
          margin: 0 auto 12px auto;
          border: 1px solid #000;
          padding: 12px;
          background: #fff;
        }

        .text-import-box h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
        }

        .text-import-box textarea {
          width: 100%;
          height: 220px;
          border: 1px solid #000;
          padding: 8px;
          font-size: 13px;
          font-family: Arial, Helvetica, sans-serif;
          resize: vertical;
        }

        .text-import-actions {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .text-import-box button {
          padding: 8px 14px;
          border: 1px solid #000;
          background: #fff;
          cursor: pointer;
          font-weight: 700;
          font-size: 14px;
        }

        .mitarbeiter-box {
          width: 520px;
          margin: 0 auto 10px auto;
          border: 1px solid #000;
          padding: 10px;
          background: #fff;
        }

        .mitarbeiter-box h3 {
          margin: 0 0 8px 0;
          font-size: 16px;
        }

        .mitarbeiter-row {
          display: grid;
          grid-template-columns: 1fr 120px 90px;
          gap: 8px;
          align-items: center;
          border-bottom: 1px solid #ccc;
          padding: 4px 0;
          font-size: 13px;
        }

        .mitarbeiter-row button {
          padding: 6px 10px;
          border: 1px solid #000;
          background: #fff;
          cursor: pointer;
          font-weight: 700;
        }

        .sheet {
          width: 100%;
          max-width: 1290px;
          margin: auto;
          background: #fff;
          padding: 18px;
          overflow-x: auto;
          position: relative;
          border-radius: 10px;
        }

        .draw-canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 20;
          pointer-events: none;
          touch-action: none;
        }

        .draw-canvas.active {
          pointer-events: auto;
          cursor: crosshair;
        }

        .top {
          display: grid;
          grid-template-columns: 275px 520px 285px;
          gap: 18px;
          align-items: start;
          width: 1116px;
          margin: 0 auto;
          position: relative;
          z-index: 1;
        }

        .field-row {
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 10px;
          color: #000;
        }

        .fill-line {
          width: 100%;
          border: none;
          border-bottom: 1px solid #2f80ed;
          outline: none;
          background: transparent;
          height: 18px;
          color: #000;
        }

        .date-line {
          width: 100%;
          border: none;
          border-bottom: 1px solid #2f80ed;
          outline: none;
          background: transparent;
          height: 18px;
          color: #000;
          font-size: 12px;
          font-weight: 700;
        }

        .pf-logo-row {
          display: grid;
          grid-template-columns: 160px 1fr;
          align-items: center;
          gap: 14px;
          margin-bottom: 2px;
        }

        .pf-logo {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .pf-logo img {
          width: 150px;
          height: auto;
          opacity: 1;
          display: block;
        }

        .pf-text {
          text-align: left;
          font-size: 10px;
          font-weight: 800;
          line-height: 13px;
        }

        .logo-wrap {
          display: grid;
          grid-template-columns: 70px 1fr;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }

        .logo-icon {
          width: 58px;
          height: 45px;
          background: #2f80ed;
          clip-path: polygon(0 100%, 0 35%, 100% 100%);
        }

        .logo-main {
          font-size: 36px;
          font-weight: 900;
          color: #000;
          line-height: 34px;
        }

        .logo-sub {
          font-size: 14px;
          font-weight: 900;
          color: #006fe6;
          opacity: 1;
          letter-spacing: 0.4px;
        }

        .logo-address {
          font-size: 9px;
          font-weight: 700;
          line-height: 12px;
          margin-top: 4px;
        }

        .center-row {
          display: grid;
          grid-template-columns: 120px 35px 1fr 35px 1fr;
          gap: 5px;
          margin-top: 6px;
          font-size: 11px;
          font-weight: 700;
          align-items: end;
        }

        .right {
          display: grid;
          grid-template-columns: 80px 1fr;
          gap: 10px;
        }

        .internal {
          font-size: 10px;
          font-weight: 700;
        }

        .internal-box {
          border: 1px solid #000;
          height: 40px;
          width: 78px;
          margin-top: 8px;
          padding: 4px;
          font-size: 10px;
          font-weight: 700;
        }

        .right-signs {
          width: 185px;
        }

        .sign-title {
          font-size: 15px;
          font-weight: 900;
          margin-bottom: 6px;
        }

        .sign-row {
          font-size: 9px;
          font-weight: 700;
          margin-bottom: 8px;
          line-height: 11px;
        }

        .signature-line {
          display: block;
          width: 100%;
          border: none;
          border-bottom: 1px solid #2f80ed;
          height: 16px;
          background: transparent;
          outline: none;
          color: #000;
        }

        table {
          width: 1285px;
          min-width: 1285px;
          border-collapse: collapse;
          table-layout: fixed;
          margin: 12px auto 0 auto;
          border: 2px solid #2f80ed;
          position: relative;
          z-index: 1;
        }

        th,
        td {
          border: 1px solid #2f80ed;
          font-size: 10px;
          color: #000;
        }

        th:last-child,
        td:last-child {
          border-right: 2px solid #2f80ed !important;
        }

        th {
          height: 28px;
          font-weight: 800;
          text-align: center;
        }

        td {
          height: 26px;
          padding: 0;
        }

        input,
        select {
          width: 100%;
          height: 100%;
          border: none;
          outline: none;
          font-size: 10px;
          background: transparent;
          color: #000;
          min-width: 0;
        }

        select {
          padding-left: 3px;
          padding-right: 22px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          background-position: right 4px center;
        }

        .copy-button {
          width: 100%;
          height: 100%;
          border: none;
          background: #eef5ff;
          cursor: pointer;
          font-size: 15px;
          font-weight: 900;
          color: #1f5fbf;
        }

        .copy-button:hover {
          background: #dcebff;
        }

        .timecell {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .timecell select {
          display: block;
          height: 13px;
          font-size: 8px;
          padding-left: 3px;
          padding-right: 18px;
        }

        .timecell input {
          height: 13px;
          font-size: 9px;
          padding: 0 3px;
        }

        @media print {
          .toolbar,
          .mitarbeiter-box,
          .text-import-box {
            display: none !important;
          }

          body {
            background: #fff;
            overflow: visible;
          }

          .sheet {
            margin: 0;
            padding: 0;
            width: 100%;
            max-width: none;
            overflow: visible;
            border-radius: 0;
          }

          .top {
            width: 100%;
            margin: 0;
          }

          table {
            width: 100%;
            min-width: 0;
          }

          .copy-button {
            display: none !important;
          }

          select {
            -webkit-appearance: none !important;
            appearance: none !important;
            background: transparent !important;
          }

          select::-ms-expand {
            display: none !important;
          }

          input[type="date"],
          input[type="time"] {
            -webkit-appearance: none !important;
            appearance: none !important;
          }

          input[type="date"]::-webkit-calendar-picker-indicator,
          input[type="time"]::-webkit-calendar-picker-indicator,
          input::-webkit-calendar-picker-indicator {
            display: none !important;
            opacity: 0 !important;
          }

          .timecell select {
            display: none !important;
          }

          * {
            outline: none !important;
            box-shadow: none !important;
          }
        }
      `}</style>

      <div className="toolbar">
        <div className="tool-group">
          <button className="tool-button primary" onClick={() => window.print()}>
            <span className="tool-icon">🖨️</span>
            <span>PDF speichern / Drucken</span>
          </button>

          <button className="tool-button primary" onClick={exportExcel}>
            <span className="tool-icon">📗</span>
            <span>Excel exportieren</span>
          </button>
        </div>

        <div className="tool-group">
          <button className="tool-button" onClick={addMitarbeiter}>
            <span className="tool-icon">👤➕</span>
            <span>Mitarbeiter hinzufügen</span>
          </button>

          <button className="tool-button" onClick={() => setShowMitarbeiterListe(!showMitarbeiterListe)}>
            <span className="tool-icon">📋</span>
            <span>Mitarbeiterliste anzeigen</span>
          </button>

          <button
            className="tool-button"
            onClick={() => {
              const blob = new Blob([JSON.stringify(mitarbeiter)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "mitarbeiter.json";
              a.click();
            }}
          >
            <span className="tool-icon">⬆️</span>
            <span>Mitarbeiter exportieren</span>
          </button>

          <label className="tool-label">
            <span className="tool-icon">⬇️</span>
            <span>Mitarbeiter importieren</span>
            <input
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = () => {
                  const data = JSON.parse(reader.result as string);
                  saveMitarbeiter(data);
                  alert("Mitarbeiterliste importiert und online gespeichert");
                };
                reader.readAsText(file);
              }}
            />
          </label>

          <button className="tool-button" onClick={() => setShowTextImport(!showTextImport)}>
            <span className="tool-icon">📄</span>
            <span>Mitarbeiter aus Text importieren</span>
          </button>
        </div>

        <div className="tool-group">
          <button className={`tool-button ${drawing ? "draw-active" : ""}`} onClick={() => setDrawing(!drawing)}>
            <span className="tool-icon">✏️</span>
            <span>Stift {drawing ? "AN" : "AUS"}</span>
          </button>

          <div className="tool-select-wrap">
            <select className="tool-select" value={drawColor} onChange={(e) => setDrawColor(e.target.value)}>
              <option value="red">Farbe Rot</option>
              <option value="blue">Farbe Blau</option>
              <option value="black">Farbe Schwarz</option>
              <option value="green">Farbe Grün</option>
              <option value="orange">Farbe Orange</option>
            </select>
          </div>

          <button className="tool-button" onClick={clearDrawing}>
            <span className="tool-icon">🧽</span>
            <span>Zeichnung löschen</span>
          </button>
        </div>

        <div className="tool-group">
          <button
            className="tool-button danger"
            onClick={() => {
              localStorage.removeItem("loggedIn");
              setLoggedIn(false);
            }}
          >
            <span className="tool-icon">🚪</span>
            <span>Abmelden</span>
          </button>
        </div>
      </div>

      {showTextImport && (
        <div className="text-import-box">
          <h3>Mitarbeiter aus Text importieren</h3>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={"Name / Personalnummer\nMax Mustermann / 12345\nAli Beispiel / 67890"}
          />
          <div className="text-import-actions">
            <button onClick={importMitarbeiterAusText}>Importieren</button>
            <button
              onClick={() => {
                setImportText("");
                setShowTextImport(false);
              }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {showMitarbeiterListe && (
        <div className="mitarbeiter-box">
          <h3>Mitarbeiterliste</h3>
          {mitarbeiter.length === 0 && <p>Keine Mitarbeiter angelegt.</p>}
          {mitarbeiter.map((m) => (
            <div className="mitarbeiter-row" key={`${m.name}-${m.personalnummer}`}>
              <span>{m.name}</span>
              <span>{m.personalnummer}</span>
              <button onClick={() => deleteMitarbeiter(m.name)}>Löschen</button>
            </div>
          ))}
        </div>
      )}

      <section className="sheet" ref={sheetRef}>
        <canvas
          ref={canvasRef}
          className={`draw-canvas ${drawing ? "active" : ""}`}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={stopDraw}
          onPointerLeave={stopDraw}
        />

        <div className="top">
          <div>
            <div className="field-row">
              ARGE
              <input className="fill-line" defaultValue="Stölting Rail & Service GmbH / P&F Sicherung GmbH" />
            </div>
            <div className="field-row">
              Auftraggeber
              <input className="fill-line" defaultValue="DB InfraGO AG" />
            </div>
            <div className="field-row">
              Auftraggebende Stelle
              <input className="fill-line" defaultValue="Region Mitte" />
            </div>
            <div className="field-row">
              Baustelle
              <input className="fill-line" defaultValue="Knoten F. Stadion 2. BS 2024-2026" />
            </div>
            <div className="field-row">
              Tag der Ausführung/Datum
              <input className="date-line" type="date" />
            </div>
          </div>

          <div>
            <div className="pf-logo-row">
              <div className="pf-logo">
                <img src="/image001.png" alt="P&F Sicherung GmbH Logo" />
              </div>
              <div className="pf-text">
                P&F Sicherung GmbH
                <br />
                Lagerstraße 49 | 64807 Dieburg
                <br />
                info@pf-sicherung.de
                <br />
                Tel.: 0 60 71 - 3 91 32 50
              </div>
            </div>

            <div className="logo-wrap">
              <div className="logo-icon"></div>
              <div>
                <div className="logo-main">Stölting</div>
                <div className="logo-sub">SERVICE GROUP</div>
              </div>
            </div>

            <div className="logo-address">
              Johannes-Rau-Allee 15-19 · 45889 Gelsenkirchen
              <br />
              Tel. 02 09 / 36 111 99 33 · Fax 02 09 / 51 30 78 98
            </div>

            <div className="center-row">
              <span>Ort/Datum</span>
              <span></span>
              <input className="fill-line" defaultValue="A.Öztav" />
              <span></span>
              <input className="fill-line" />
            </div>
          </div>

          <div className="right">
            <div className="internal">
              Interne
              <br />
              Bearbeitungs-Nr.
              <input className="internal-box" defaultValue="920025" />
            </div>

            <div className="right-signs">
              <div className="sign-title">Sachlich richtig</div>
              <div className="sign-row">
                Dienststelle/Datum
                <input className="signature-line" />
              </div>
              <div className="sign-row">
                Unterschrift/Verwendungsbezeichnung
                <input className="signature-line" />
              </div>
              <div className="sign-title">Nachgerechnet</div>
              <div className="sign-row">
                Unterschrift/Amts- oder Dienstbezeichnung
                <input className="signature-line" />
              </div>
            </div>
          </div>
        </div>

        <table>
          <colgroup>
            <col style={{ width: "40px" }} />
            <col style={{ width: "95px" }} />
            <col style={{ width: "170px" }} />
            <col style={{ width: "85px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "110px" }} />
            <col style={{ width: "85px" }} />
            <col style={{ width: "80px" }} />
            <col style={{ width: "70px" }} />
            <col style={{ width: "410px" }} />
          </colgroup>

          <thead>
            <tr>
              {["", "Datum", "Name", "PersNr", "Bez.", "von", "bis", "Pause", "Std", "Bemerkung"].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => {
              const brutto = bruttoMin(r.von, r.bis);
              const pause = autoPause(brutto);
              const netto = Math.max(0, brutto - pause);

              return (
                <tr key={i}>
                  <td>
                    <button className="copy-button" onClick={() => copyRow(i)} title="Zeile nach unten kopieren">
                      ↧
                    </button>
                  </td>

                  <td>
                    <input type="date" value={r.datum} onChange={(e) => update(i, "datum", e.target.value)} />
                  </td>

                  <td>
                    <select value={r.name} onChange={(e) => selectMitarbeiter(i, e.target.value)}>
                      <option value=""></option>
                      {mitarbeiter.map((m) => (
                        <option key={`${m.name}-${m.personalnummer}`} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <input value={r.personalnummer} readOnly />
                  </td>

                  <td>
                    <select value={r.bez} onChange={(e) => update(i, "bez", e.target.value)}>
                      <option></option>
                      {FUNKTIONEN.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </td>

                  <td>
                    <div className="timecell">
                      <select value={r.vorlage} onChange={(e) => setVorlage(i, e.target.value)}>
                        <option value="">eigene</option>
                        {ZEITEN.map((z) => (
                          <option key={z[0]} value={z[0]}>
                            {z[0]}
                          </option>
                        ))}
                      </select>
                      <input type="time" value={r.von} onChange={(e) => update(i, "von", e.target.value)} />
                    </div>
                  </td>

                  <td>
                    <input type="time" value={r.bis} onChange={(e) => update(i, "bis", e.target.value)} />
                  </td>

                  <td>
                    <input value={pause ? `${pause} min` : ""} readOnly />
                  </td>

                  <td>
                    <input value={formatHours(netto)} readOnly />
                  </td>

                  <td>
                    <input value={r.bemerkung} onChange={(e) => update(i, "bemerkung", e.target.value)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}