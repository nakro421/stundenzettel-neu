"use client";

import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";

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

export default function Page() {
const [loggedIn, setLoggedIn] = useState(false);
  const [mitarbeiter, setMitarbeiter] = useState<Mitarbeiter[]>([]);
  const [showMitarbeiterListe, setShowMitarbeiterListe] = useState(false);

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
    const saved = localStorage.getItem("mitarbeiter");
    if (saved) setMitarbeiter(JSON.parse(saved));
  }, []);

  function saveMitarbeiter(list: Mitarbeiter[]) {
    setMitarbeiter(list);
    localStorage.setItem("mitarbeiter", JSON.stringify(list));
  }

  function addMitarbeiter() {
    const name = prompt("Name des Mitarbeiters?");
    const personalnummer = prompt("Personalnummer?");
    if (!name || !personalnummer) return;
    saveMitarbeiter([...mitarbeiter, { name, personalnummer }]);
  }

  function deleteMitarbeiter(name: string) {
    saveMitarbeiter(mitarbeiter.filter((m) => m.name !== name));
  }

  function update(i: number, field: keyof Row, value: string) {
    const copy = [...rows];
    copy[i] = { ...copy[i], [field]: value };
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

  function exportExcel() {
    const data = rows.map((r) => {
      const brutto = bruttoMin(r.von, r.bis);
      const pause = autoPause(brutto);
      const netto = Math.max(0, brutto - pause);

      return {
        Datum: r.datum,
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

  if (!loggedIn) {
  return (
    <main style={{display:"flex",justifyContent:"center",alignItems:"center",height:"100vh"}}>
      <div style={{border:"1px solid #000", padding:20}}>
        <h2>Login</h2>
        <input
          type="password"
          placeholder="Passwort"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if ((e.target as HTMLInputElement).value === "36833") {
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
}return (
    <main>
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #fff;
          font-family: Arial, Helvetica, sans-serif;
          color: #000;
        }

        .actions {
          display: flex;
          gap: 10px;
          justify-content: center;
          padding: 10px;
          flex-wrap: wrap;
        }

        .actions button,
        .mitarbeiter-row button {
          padding: 8px 14px;
          border: 1px solid #000;
          background: #fff;
          cursor: pointer;
          font-weight: 700;
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
          padding: 4px 8px;
        }

        .sheet {
          width: 1120px;
          height: 790px;
          margin: auto;
          background: #fff;
          padding: 18px;
          overflow: hidden;
        }

        .top {
          display: grid;
          grid-template-columns: 275px 520px 285px;
          gap: 18px;
          align-items: start;
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

        .title {
          text-align: center;
          font-size: 22px;
          font-weight: 900;
          color: #2f80ed;
        }

        .nr-input {
          border: none;
          border-bottom: 2px solid #2f80ed;
          width: 80px;
          margin-left: 8px;
          outline: none;
          color: #000;
        }

        .logo-main {
          font-size: 36px;
          font-weight: 900;
          color: #000;
          line-height: 36px;
        }

        .logo-sub {
          font-size: 14px;
          font-weight: 800;
          color: #2f80ed;
          margin-bottom: 12px;
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
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          margin-top: 12px;
          border: 1px solid #2f80ed;
          box-shadow: inset -1px 0 0 #2f80ed;
        }

        th,
        td {
          border: 1px solid #2f80ed;
          font-size: 10px;
          color: #000;
        }

        th:last-child,
        td:last-child {
          border-right: 1px solid #2f80ed !important;
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

        .timecell {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .timecell select {
          height: 13px;
          font-size: 8px;
          padding-right: 18px;
        }

        .timecell input {
          height: 13px;
          font-size: 9px;
        }

        @media print {
          .actions,
          .mitarbeiter-box {
            display: none;
          }

          body {
            background: #fff;
          }

          .sheet {
            margin: 0;
            padding: 0;
            width: 100%;
            height: auto;
          }
        }
      `}</style>

      <div className="actions">
        <button onClick={() => window.print()}>PDF speichern / Drucken</button>
        <button onClick={exportExcel}>Excel exportieren</button>
        <button onClick={addMitarbeiter}>Mitarbeiter hinzufügen</button>
        <button onClick={() => setShowMitarbeiterListe(!showMitarbeiterListe)}>
          Mitarbeiterliste anzeigen
        </button>
        <button onClick={() => {
  const blob = new Blob([JSON.stringify(mitarbeiter)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mitarbeiter.json";
  a.click();
}}>
  Mitarbeiter exportieren
</button>

<input
  type="file"
  accept=".json"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = JSON.parse(reader.result as string);
      setMitarbeiter(data);
      localStorage.setItem("mitarbeiter", JSON.stringify(data));
    };
    reader.readAsText(file);
  }}
/>
      </div>

      {showMitarbeiterListe && (
        <div className="mitarbeiter-box">
          <h3>Mitarbeiterliste</h3>
          {mitarbeiter.length === 0 && <p>Keine Mitarbeiter angelegt.</p>}
          {mitarbeiter.map((m) => (
            <div className="mitarbeiter-row" key={m.name}>
              <span>{m.name}</span>
              <span>{m.personalnummer}</span>
              <button onClick={() => deleteMitarbeiter(m.name)}>Löschen</button>
            </div>
          ))}
        </div>
      )}

      <section className="sheet">
        <div className="top">
          <div>
            {["ARGE", "Auftraggeber", "Auftraggebende Stelle", "Baustelle", "Tag der Ausführung/Datum"].map((x) => (
              <div className="field-row" key={x}>
                {x}
                <input className="fill-line" />
              </div>
            ))}
          </div>

          <div>
            <div className="title">
              Stundenlohnzettel Nr.
              <input className="nr-input" />
            </div>

            <div className="logo-main">Stölting</div>
            <div className="logo-sub">SERVICE GROUP</div>

            <div className="center-row">
              <span>Bestellschein</span>
              <span>Nr.</span>
              <input className="fill-line" />
              <span>vom</span>
              <input className="fill-line" />
            </div>

            <div className="center-row">
              <span>Vertrag</span>
              <span>Nr.</span>
              <input className="fill-line" />
              <span>vom</span>
              <input className="fill-line" />
            </div>

            <div className="center-row">
              <span>Ort/Datum</span>
              <span></span>
              <input className="fill-line" />
              <span></span>
              <input className="fill-line" />
            </div>
          </div>

          <div className="right">
            <div className="internal">
              Interne
              <br />
              Bearbeitungs-Nr.
              <input className="internal-box" />
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
              {["Datum", "Name", "PersNr", "Bez.", "von", "bis", "Pause", "Std", "Bemerkung"].map((x) => (
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
                    <input type="date" value={r.datum} onChange={(e) => update(i, "datum", e.target.value)} />
                  </td>

                  <td>
                    <select value={r.name} onChange={(e) => selectMitarbeiter(i, e.target.value)}>
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