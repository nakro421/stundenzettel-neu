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

  // 🔥 NEU: Schutz vor Datenverlust
  useEffect(() => {
    const hasContent = rows.some((r) =>
      Object.values(r).some((value) => value.trim() !== "")
    );

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

  // ... REST BLEIBT UNVERÄNDERT