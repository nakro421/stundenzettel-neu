"use client";

import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { auth, db } from "../lib/firebase";
import { collection, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";

const FUNKTIONEN = [
  "Sakra",
  "Sipo",
  "Baustellensakra",
  "Bahnerder",
  "Bediener",
  "SAS",
  "BÜP",
  "HIP",
  "Flapo",
  "ZMP",
  "HFE",
];

const ZEITEN = [
  ["7-18 Uhr", "07:00", "18:00"],
  ["7-16 Uhr", "07:00", "16:00"],
  ["7-16 Uhr + 30min Pause", "07:00", "16:00"],
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

function autoPause(min: number, vorlage: string) {
  if (vorlage === "7-16 Uhr + 30min Pause") return 30;

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

  const [ausfuehrungVon, setAusfuehrungVon] = useState("");
  const [ausfuehrungBis, setAusfuehrungBis] = useState("");

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
    const hasContent =
      rows.some((r) => Object.values(r).some((value) => value.trim() !== "")) ||
      ausfuehrungVon.trim() !== "" ||
      ausfuehrungBis.trim() !== "";

    if (!loggedIn || !hasContent) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [loggedIn, rows, ausfuehrungVon, ausfuehrungBis]);

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
        const pause = autoPause(brutto, r.vorlage);
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

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stundenzettel");
    XLSX.writeFile(wb, "stundenzettel.xlsx");
  }

  if (!loggedIn) {
    return (
      <main>
        <input
          type="password"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if ((e.target as HTMLInputElement).value === "36833") {
                localStorage.setItem("loggedIn", "true");
                setLoggedIn(true);
              }
            }
          }}
        />
      </main>
    );
  }

  return (
    <main>
      <table>
        <tbody>
          {rows.map((r, i) => {
            const brutto = bruttoMin(r.von, r.bis);
            const pause = autoPause(brutto, r.vorlage);
            const netto = Math.max(0, brutto - pause);

            return (
              <tr key={i}>
                <td>
                  <select value={r.bez} onChange={(e) => update(i, "bez", e.target.value)}>
                    <option></option>

                    {FUNKTIONEN.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <div>
                    <select value={r.vorlage} onChange={(e) => setVorlage(i, e.target.value)}>
                      <option value="">eigene</option>

                      {ZEITEN.map((z) => (
                        <option key={z[0]} value={z[0]}>
                          {z[0]}
                        </option>
                      ))}
                    </select>

                    <input
                      type="time"
                      value={r.von}
                      onChange={(e) => update(i, "von", e.target.value)}
                    />
                  </div>
                </td>

                <td>
                  <input
                    type="time"
                    value={r.bis}
                    onChange={(e) => update(i, "bis", e.target.value)}
                  />
                </td>

                <td>
                  <input value={pause ? `${pause} min` : ""} readOnly />
                </td>

                <td>
                  <input value={formatHours(netto)} readOnly />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
