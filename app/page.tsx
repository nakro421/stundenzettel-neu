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

export default function Page() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);

  const [drawing, setDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("red");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);

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
      const liste = snapshot.docs.map((d) => d.data() as Mitarbeiter);

      setMitarbeiter(liste);
    }

    loadMitarbeiter();

    if (localStorage.getItem("loggedIn") === "true") {
      setLoggedIn(true);
    }
  }, []);

  async function saveMitarbeiter(list: Mitarbeiter[]) {
    setMitarbeiter(list);

    for (const m of list) {
      await setDoc(doc(db, "Mitarbeiter", makeMitarbeiterId(m)), {
        name: m.name,
        personalnummer: m.personalnummer,
      });
    }
  }

  async function deleteMitarbeiter(name: string) {
    const m = mitarbeiter.find((x) => x.name === name);
    if (!m) return;

    await deleteDoc(doc(db, "Mitarbeiter", makeMitarbeiterId(m)));

    setMitarbeiter(mitarbeiter.filter((x) => x.name !== name));
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
    copy[i] = {
      ...copy[i],
      name,
      personalnummer: m?.personalnummer || "",
    };

    setRows(copy);
  }

  function setVorlage(i: number, value: string) {
    const found = ZEITEN.find((z) => z[0] === value);

    const copy = [...rows];

    copy[i] = found
      ? {
          ...copy[i],
          vorlage: value,
          von: found[1],
          bis: found[2],
        }
      : {
          ...copy[i],
          vorlage: "",
        };

    setRows(copy);
  }

  function exportExcel() {
    const data = rows
      .filter((r) => r.name || r.datum)
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

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stundenzettel");

    XLSX.writeFile(wb, "stundenzettel.xlsx");
  }

  if (!loggedIn) {
    return (
      <main
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div style={{ border: "1px solid #000", padding: 20 }}>
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
        body {
          margin: 0;
          background: #f4f7fb;
          font-family: Arial, Helvetica, sans-serif;
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

        .hinweis-box {
          position: absolute;
          right: -115px;
          bottom: 70px;
          width: 100px;
          min-height: 120px;
          border: 2px solid #2f80ed;
          background: #fff;
          color: red;
          font-size: 16px;
          font-weight: 900;
          line-height: 22px;
          padding: 10px 8px;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        table {
          width: 1285px;
          border-collapse: collapse;
          margin-top: 12px;
          border: 2px solid #2f80ed;
        }

        th,
        td {
          border: 1px solid #2f80ed;
          font-size: 10px;
          height: 26px;
        }

        .copy-button {
          width: 100%;
          height: 100%;
          border: none;
          background: #eef5ff;
          cursor: pointer;
          font-weight: 900;
        }

        @media print {
          .hinweis-box {
            right: -95px;
            bottom: 65px;
          }
        }
      `}</style>

      <section className="sheet" ref={sheetRef}>
        <canvas ref={canvasRef} />

        <table>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <button className="copy-button" onClick={() => copyRow(i)}>
                    ↧
                  </button>
                </td>

                <td>
                  <input
                    type="date"
                    value={r.datum}
                    onChange={(e) => update(i, "datum", e.target.value)}
                  />
                </td>

                <td>
                  <select
                    value={r.name}
                    onChange={(e) => selectMitarbeiter(i, e.target.value)}
                  >
                    <option value=""></option>

                    {mitarbeiter.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <input value={r.personalnummer} readOnly />
                </td>

                <td>
                  <select
                    value={r.bez}
                    onChange={(e) => update(i, "bez", e.target.value)}
                  >
                    <option></option>

                    {FUNKTIONEN.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </td>

                <td>
                  <select
                    value={r.vorlage}
                    onChange={(e) => setVorlage(i, e.target.value)}
                  >
                    <option value="">eigene</option>

                    {ZEITEN.map((z) => (
                      <option key={z[0]} value={z[0]}>
                        {z[0]}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    type="time"
                    value={r.von}
                    onChange={(e) => update(i, "von", e.target.value)}
                  />
                </td>

                <td>
                  <input
                    type="time"
                    value={r.bis}
                    onChange={(e) => update(i, "bis", e.target.value)}
                  />
                </td>

                <td>{formatHours(bruttoMin(r.von, r.bis))}</td>

                <td>
                  <input
                    value={r.bemerkung}
                    onChange={(e) => update(i, "bemerkung", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="hinweis-box">
          Arbeitszeiten kleiner 8h werden mit 8h vergütet.
        </div>
      </section>
    </main>
  );
}
