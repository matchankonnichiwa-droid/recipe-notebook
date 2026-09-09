import React, { useState, useEffect } from "react";
import { FiPlus as Plus, FiX as X, FiCamera as Camera, FiFileText as FileText, FiCheck as Check, FiChevronLeft as ChevronLeft, FiEdit2 as Edit2 } from "react-icons/fi";

// This chunk is loaded on demand (only when the プリント tab is opened) —
// see LazyPrintsView in app.js. Purpose: photograph paper documents (school
// handouts, PTA notices) so the physical paper can be thrown away, and
// share them with the rest of the family (this app has no per-person
// login — everyone who opens it sees the same shared data).
const COLORS = {
    paper: "#F7F6F2",
    paperCard: "#FFFFFF",
    ink: "#20231F",
    inkSoft: "#7E827C",
    mustard: "#B18A57",
    sage: "#6F806F",
    sageSoft: "#E8EDE7",
    plum: "#B86A68",
    line: "#E7E5DF",
    accent: "#6F806F",
    accentSoft: "#E8EDE7",
    chipBg: "#EEEDE8",
};
const MAX_PHOTOS = 10;

// Compresses a photographed document to a size that keeps small print
// legible — much higher quality than the ~450px thumbnails used for recipe
// dish photos elsewhere in this app, since here the photo *is* the record
// (there's no separate text extraction step to fall back on).
function fileToDocumentPhoto(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const maxDim = 1400;
            const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function StatusChip({ status }) {
    const isDone = status === "done";
    return React.createElement("span", { style: {
            fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 10px",
            color: isDone ? COLORS.sage : COLORS.plum,
            background: isDone ? COLORS.sageSoft : "#FBEAE5",
        } }, isDone ? "対応済み" : "未対応");
}

function PrintListCard({ print, onOpen, onDelete }) {
    return React.createElement("div", { style: {
            position: "relative", background: "#fff", borderRadius: 14,
            border: `1px solid ${COLORS.line}`, padding: 10, display: "flex", gap: 10,
            alignItems: "center", marginBottom: 10, cursor: "pointer",
        }, onClick: () => onOpen(print.id) },
        React.createElement("div", { style: {
                width: 56, height: 56, borderRadius: 10, flexShrink: 0, background: COLORS.chipBg,
                display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
            } },
            print.thumbnailUrl
                ? React.createElement("img", { src: print.thumbnailUrl, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } })
                : React.createElement(FileText, { size: 20, color: COLORS.inkSoft })),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("p", { style: { fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, print.title || "無題のプリント"),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" } },
                print.date && React.createElement("span", { style: { fontSize: 12, color: COLORS.inkSoft } }, print.date),
                React.createElement(StatusChip, { status: print.status }),
                (print.personTags || []).map((p) => React.createElement("span", { key: p, style: {
                        fontSize: 11, fontWeight: 700, color: COLORS.mustard, background: "#F5EDE1", borderRadius: 999, padding: "2px 8px",
                    } }, p)))),
        React.createElement("button", { onClick: (e) => { e.stopPropagation(); onDelete(print.id); }, "aria-label": "削除", style: {
                position: "absolute", top: -6, right: -6, width: 26, height: 26, borderRadius: 999,
                border: "2px solid #fff", background: COLORS.plum, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            } }, React.createElement(X, { size: 14 })));
}

function PrintListView({ printIndex, printsLoaded, printPeople, onOpenAdd, onOpenDetail, onDelete }) {
    const [personFilter, setPersonFilter] = useState(null);
    const [statusFilter, setStatusFilter] = useState("all"); // all | pending | done
    const filtered = printIndex.filter((p) => {
        if (personFilter && !(p.personTags || []).includes(personFilter))
            return false;
        if (statusFilter !== "all" && (p.status || "pending") !== statusFilter)
            return false;
        return true;
    });
    const handleDelete = (id) => {
        if (confirm("このプリントを削除しますか？")) {
            onDelete(id);
        }
    };
    return React.createElement("div", { style: { padding: "16px 16px 100px" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
            React.createElement("h1", { style: { fontSize: 22, fontWeight: 800, margin: 0, color: COLORS.ink } }, "プリント"),
            React.createElement("button", { onClick: onOpenAdd, style: {
                    display: "flex", alignItems: "center", gap: 4, background: COLORS.accent, color: "#fff",
                    border: "none", borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                } }, React.createElement(Plus, { size: 15 }), "追加")),
        React.createElement("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 8, WebkitOverflowScrolling: "touch" } },
            ["all", "pending", "done"].map((s) => React.createElement("button", { key: s, onClick: () => setStatusFilter(s), style: {
                    flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 999,
                    border: `1px solid ${statusFilter === s ? COLORS.sage : COLORS.line}`,
                    background: statusFilter === s ? COLORS.sageSoft : "transparent",
                    color: statusFilter === s ? COLORS.sage : COLORS.inkSoft, whiteSpace: "nowrap",
                } }, s === "all" ? "すべて" : s === "pending" ? "未対応" : "対応済み"))),
        printPeople.length > 0 && React.createElement("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 16, WebkitOverflowScrolling: "touch" } },
            React.createElement("button", { onClick: () => setPersonFilter(null), style: {
                    flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 999,
                    border: `1px solid ${!personFilter ? COLORS.accent : COLORS.line}`,
                    background: !personFilter ? COLORS.accentSoft : "transparent",
                    color: !personFilter ? COLORS.accent : COLORS.inkSoft, whiteSpace: "nowrap",
                } }, "全員"),
            printPeople.map((p) => React.createElement("button", { key: p, onClick: () => setPersonFilter(personFilter === p ? null : p), style: {
                    flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "6px 13px", borderRadius: 999,
                    border: `1px solid ${personFilter === p ? COLORS.accent : COLORS.line}`,
                    background: personFilter === p ? COLORS.accentSoft : "transparent",
                    color: personFilter === p ? COLORS.accent : COLORS.inkSoft, whiteSpace: "nowrap",
                } }, p))),
        !printsLoaded ? React.createElement("p", { style: { textAlign: "center", color: COLORS.inkSoft, fontSize: 13, padding: "40px 0" } }, "読み込み中…")
            : filtered.length === 0 ? React.createElement("p", { style: { textAlign: "center", color: COLORS.inkSoft, fontSize: 13.5, padding: "40px 20px", lineHeight: 1.7 } }, "まだプリントがありません。右上の「追加」から、学校のプリントなどを撮って登録できます。")
                : filtered.map((p) => React.createElement(PrintListCard, { key: p.id, print: p, onOpen: onOpenDetail, onDelete: handleDelete })));
}

function PhotoThumb({ url, onRemove, onView }) {
    return React.createElement("div", { style: { position: "relative", width: 84, height: 84, flexShrink: 0 } },
        React.createElement("img", { src: url, alt: "", onClick: onView, style: {
                width: "100%", height: "100%", objectFit: "cover", borderRadius: 10,
                border: `1px solid ${COLORS.line}`, display: "block", cursor: onView ? "pointer" : "default",
            } }),
        onRemove && React.createElement("button", { onClick: onRemove, "aria-label": "削除", style: {
                position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999,
                border: "2px solid #fff", background: COLORS.plum, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
            } }, React.createElement(X, { size: 12 })));
}

function PrintForm({ initial, printPeople, onSave, onCancel, onAddPerson, saveError }) {
    const [title, setTitle] = useState(initial?.title || "");
    const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
    const [status, setStatus] = useState(initial?.status || "pending");
    const [personTags, setPersonTags] = useState(initial?.personTags || []);
    const [photos, setPhotos] = useState(initial?.photos || []);
    const [newPersonDraft, setNewPersonDraft] = useState("");
    const [addingPerson, setAddingPerson] = useState(false);
    const [saving, setSaving] = useState(false);
    const togglePerson = (name) => {
        setPersonTags((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
    };
    const handleFiles = async (fileList) => {
        const files = Array.from(fileList || []).slice(0, MAX_PHOTOS - photos.length);
        if (files.length === 0)
            return;
        const compressed = await Promise.all(files.map((f) => fileToDocumentPhoto(f).catch(() => null)));
        setPhotos((prev) => [...prev, ...compressed.filter(Boolean)]);
    };
    const handleSave = async () => {
        setSaving(true);
        await onSave({ ...(initial || {}), title: title.trim() || "無題のプリント", date, status, personTags, photos });
        setSaving(false);
    };
    return React.createElement("div", { style: { padding: "16px 16px 100px" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            React.createElement("button", { onClick: onCancel, style: { border: "none", background: "none", padding: 6, display: "flex" } }, React.createElement(ChevronLeft, { size: 20, color: COLORS.inkSoft })),
            React.createElement("h1", { style: { fontSize: 17, fontWeight: 800, margin: 0, color: COLORS.ink, flex: 1 } }, initial?.id ? "プリントを編集" : "プリントを追加")),
        saveError && React.createElement("p", { style: { color: COLORS.plum, fontSize: 12.5, marginBottom: 10 } }, saveError),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, "タイトル"),
        React.createElement("input", { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "例: 4月 学校だより", style: {
                width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 15, marginBottom: 16, boxSizing: "border-box",
            } }),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, "日付"),
        React.createElement("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), style: {
                width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 15, marginBottom: 16, boxSizing: "border-box",
            } }),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, "対応状況"),
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16 } },
            ["pending", "done"].map((s) => React.createElement("button", { key: s, onClick: () => setStatus(s), style: {
                    flex: 1, padding: "10px 0", borderRadius: 10, fontWeight: 700, fontSize: 13.5, cursor: "pointer",
                    border: `1.5px solid ${status === s ? COLORS.sage : COLORS.line}`,
                    background: status === s ? COLORS.sageSoft : "#fff",
                    color: status === s ? COLORS.sage : COLORS.inkSoft,
                } }, s === "pending" ? "未対応" : "対応済み"))),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, "誰宛て(任意・複数選択可)"),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 } },
            printPeople.map((p) => React.createElement("button", { key: p, onClick: () => togglePerson(p), style: {
                    padding: "7px 13px", borderRadius: 999, fontWeight: 700, fontSize: 13, cursor: "pointer",
                    border: `1.5px solid ${personTags.includes(p) ? COLORS.accent : COLORS.line}`,
                    background: personTags.includes(p) ? COLORS.accentSoft : "#fff",
                    color: personTags.includes(p) ? COLORS.accent : COLORS.inkSoft,
                } }, p)),
            addingPerson
                ? React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
                    React.createElement("input", { autoFocus: true, value: newPersonDraft, onChange: (e) => setNewPersonDraft(e.target.value), placeholder: "名前", style: {
                            padding: "7px 10px", borderRadius: 999, border: `1.5px solid ${COLORS.line}`, fontSize: 13, width: 100,
                        } }),
                    React.createElement("button", { onClick: () => {
                            if (newPersonDraft.trim()) {
                                onAddPerson(newPersonDraft.trim());
                                setPersonTags((prev) => [...prev, newPersonDraft.trim()]);
                            }
                            setNewPersonDraft("");
                            setAddingPerson(false);
                        }, style: { border: "none", background: COLORS.accent, color: "#fff", borderRadius: 999, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center" } }, React.createElement(Check, { size: 14 })))
                : React.createElement("button", { onClick: () => setAddingPerson(true), style: {
                        display: "flex", alignItems: "center", gap: 4, padding: "7px 13px", borderRadius: 999, fontWeight: 700, fontSize: 13,
                        border: `1.5px dashed ${COLORS.line}`, background: "none", color: COLORS.inkSoft, cursor: "pointer",
                    } }, React.createElement(Plus, { size: 13 }), "追加")),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, `写真(最大${MAX_PHOTOS}枚・文字が読める画質で保存)`),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 } },
            photos.map((url, i) => React.createElement(PhotoThumb, { key: i, url: url, onRemove: () => setPhotos((prev) => prev.filter((_, idx) => idx !== i)) })),
            photos.length < MAX_PHOTOS && React.createElement("label", { style: {
                    width: 84, height: 84, borderRadius: 10, border: `1.5px dashed ${COLORS.accent}`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4,
                } },
                React.createElement(Camera, { size: 20, color: COLORS.accent }),
                React.createElement("span", { style: { fontSize: 10, color: COLORS.accent, fontWeight: 700 } }, `${photos.length}/${MAX_PHOTOS}`),
                React.createElement("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" }, onChange: (e) => {
                        handleFiles(e.target.files);
                        e.target.value = "";
                    } }))),
        React.createElement("button", { onClick: handleSave, disabled: saving, style: {
                width: "100%", background: COLORS.accent, color: "#fff", border: "none", borderRadius: 12,
                padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
            } }, saving ? "保存中…" : "保存する"));
}

function PrintDetailView({ print, onBack, onEdit, onDelete }) {
    const [viewerIndex, setViewerIndex] = useState(null);
    if (!print) {
        return React.createElement("div", { style: { padding: "60px 20px", textAlign: "center", color: COLORS.inkSoft, fontSize: 13.5 } }, "読み込み中…");
    }
    return React.createElement("div", { style: { padding: "16px 16px 100px" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 16 } },
            React.createElement("button", { onClick: onBack, style: { border: "none", background: "none", padding: 6, display: "flex" } }, React.createElement(ChevronLeft, { size: 20, color: COLORS.inkSoft })),
            React.createElement("div", { style: { flex: 1 } }),
            React.createElement("button", { onClick: onEdit, "aria-label": "編集", style: { border: "none", background: "none", padding: 6, display: "flex" } }, React.createElement(Edit2, { size: 18, color: COLORS.inkSoft })),
            React.createElement("button", { onClick: onDelete, "aria-label": "削除", style: { border: "none", background: "none", padding: 6, display: "flex" } }, React.createElement(X, { size: 20, color: COLORS.plum }))),
        React.createElement("h1", { style: { fontSize: 20, fontWeight: 800, margin: "0 0 8px", color: COLORS.ink } }, print.title),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 } },
            print.date && React.createElement("span", { style: { fontSize: 13, color: COLORS.inkSoft } }, print.date),
            React.createElement(StatusChip, { status: print.status }),
            (print.personTags || []).map((p) => React.createElement("span", { key: p, style: {
                    fontSize: 12, fontWeight: 700, color: COLORS.mustard, background: "#F5EDE1", borderRadius: 999, padding: "3px 10px",
                } }, p))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
            (print.photos || []).map((url, i) => React.createElement("img", { key: i, src: url, alt: "", onClick: () => setViewerIndex(i), style: {
                    width: "100%", borderRadius: 12, border: `1px solid ${COLORS.line}`, cursor: "pointer", display: "block",
                } }))),
        viewerIndex != null && React.createElement("div", { onClick: () => setViewerIndex(null), style: {
                position: "fixed", inset: 0, background: "rgba(20,22,18,0.92)", zIndex: 100,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            } },
            React.createElement("img", { src: print.photos[viewerIndex], alt: "", style: { maxWidth: "100%", maxHeight: "100%", borderRadius: 8 } })));
}

// Top-level export used by LazyPrintsView in app.js.
export function PrintsView({ printIndex, printsLoaded, printPeople, saveError, onSave, onDelete, onToggleStatus, onAddPerson, uref }) {
    const [view, setView] = useState("list"); // list | add | edit | detail
    const [selectedId, setSelectedId] = useState(null);
    const [fullPrint, setFullPrint] = useState(null);
    useEffect(() => {
        if (!selectedId || (view !== "detail" && view !== "edit")) {
            return;
        }
        const ref = uref(`prints/${selectedId}`);
        const cb = (snap) => setFullPrint(snap.val());
        ref.on("value", cb);
        return () => ref.off("value", cb);
    }, [selectedId, view]);
    const handleDelete = (id) => {
        onDelete(id);
        if (id === selectedId)
            setView("list");
    };
    if (view === "add") {
        return React.createElement(PrintForm, {
            printPeople: printPeople, onAddPerson: onAddPerson, saveError: saveError,
            onCancel: () => setView("list"),
            onSave: async (data) => { await onSave(data); setView("list"); },
        });
    }
    if (view === "edit") {
        return React.createElement(PrintForm, {
            initial: fullPrint, printPeople: printPeople, onAddPerson: onAddPerson, saveError: saveError,
            onCancel: () => setView("detail"),
            onSave: async (data) => { await onSave(data); setView("detail"); },
        });
    }
    if (view === "detail") {
        return React.createElement(PrintDetailView, {
            print: fullPrint,
            onBack: () => setView("list"),
            onEdit: () => setView("edit"),
            onDelete: () => { if (confirm("このプリントを削除しますか？")) handleDelete(selectedId); },
        });
    }
    return React.createElement(PrintListView, {
        printIndex: printIndex, printsLoaded: printsLoaded, printPeople: printPeople,
        onOpenAdd: () => setView("add"),
        onOpenDetail: (id) => { setSelectedId(id); setFullPrint(null); setView("detail"); },
        onDelete: handleDelete,
    });
}
