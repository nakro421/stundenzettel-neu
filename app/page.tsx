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
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

export default function Page() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
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
    async function load() {
      const snap = await getDocs(collection(db, "Mitarbeiter"));
      setMitarbeiter(snap.docs.map(d => d.data() as Mitarbeiter));
    }
    load();
    if (localStorage.getItem("loggedIn") === "true") setLoggedIn(true);
  }, []);

  function update(i: number, field: keyof Row, value: string) {
    const copy = [...rows];
    copy[i][field] = value;
    setRows(copy);
  }

  function copyRow(i: number) {
    if (i >= rows.length - 1) return;
    const copy = [...rows];
    copy[i + 1] = { ...rows[i] };
    setRows(copy);
  }

  function selectMitarbeiter(i: number, name: string) {
    const m = mitarbeiter.find(x => x.name === name);
    const copy = [...rows];
    copy[i].name = name;
    copy[i].personalnummer = m?.personalnummer || "";
    setRows(copy);
  }

  function exportExcel() {
    const data = rows
      .filter(r => r.name || r.von || r.bis)
      .map(r => {
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
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stundenzettel");
    XLSX.writeFile(wb, "stundenzettel.xlsx");
  }

  if (!loggedIn) {
    return (
      <main>
        <input
          type="password"
          placeholder="Passwort"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.target as HTMLInputElement).value === "36833") {
              localStorage.setItem("loggedIn", "true");
              setLoggedIn(true);
            }
          }}
        />
      </main>
    );
  }

  return (
    <main>
      <style>{`
        .print-date { display: none; }
        .screen-date { display: block; }

        @media print {
          .screen-date { display: none !important; }
          .print-date { display: block !important; font-size: 10px; padding-left: 4px; }
        }
      `}</style>

      <button onClick={() => window.print()}>PDF</button>
      <button onClick={exportExcel}>Excel</button>

      <table>
        <thead>
          <tr>
            {["", "Datum", "Name", "PersNr", "Bez.", "von", "bis", "Pause", "Std", "Bemerkung"].map(x => (
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
                  <button onClick={() => copyRow(i)}>↧</button>
                </td>

                <td>
                  <span className="print-date">
                    {r.datum ? formatDateDE(r.datum) : ""}
                  </span>

                  <input
                    className="screen-date"
                    type="date"
                    value={r.datum}
                    onChange={(e) => update(i, "datum", e.target.value)}
                  />
                </td>

                <td>
                  <select value={r.name} onChange={(e) => selectMitarbeiter(i, e.target.value)}>
                    <option />
                    {mitarbeiter.map(m => (
                      <option key={m.name}>{m.name}</option>
                    ))}
                  </select>
                </td>

                <td><input value={r.personalnummer} readOnly /></td>

                <td>
                  <select value={r.bez} onChange={(e) => update(i, "bez", e.target.value)}>
                    <option />
                    {FUNKTIONEN.map(f => <option key={f}>{f}</option>)}
                  </select>
                </td>

                <td><input type="time" value={r.von} onChange={(e) => update(i, "von", e.target.value)} /></td>
                <td><input type="time" value={r.bis} onChange={(e) => update(i, "bis", e.target.value)} /></td>

                <td><input value={pause ? `${pause} min` : ""} readOnly /></td>
                <td><input value={formatHours(netto)} readOnly /></td>
                <td><input value={r.bemerkung} onChange={(e) => update(i, "bemerkung", e.target.value)} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
