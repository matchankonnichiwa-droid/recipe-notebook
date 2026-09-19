import React, { useState, useEffect, useRef } from "react";
import { FiPlus as Plus, FiX as X, FiCamera as Camera, FiFileText as FileText, FiCheck as Check, FiChevronLeft as ChevronLeft, FiEdit2 as Edit2, FiSearch as Search, FiRotateCw as RotateCw } from "react-icons/fi";
import { PhotoPositionEditor } from "./photo-editor.js";

// This chunk is loaded on demand (only when the プリント tab is opened) —
// see LazyPrintsView in app.js. Purpose: photograph paper documents (school
// handouts, PTA notices) so the physical paper can be thrown away, and
// share them with the rest of the family (this app has no per-person
// login — everyone who opens it sees the same shared data).
const COLORS = {
    paper: "#FAF8F3",
    paperCard: "#FFFFFF",
    soft: "#F4F0E8",
    ink: "#383631",
    inkSoft: "#777269",
    inkLight: "#A29D94",
    mustard: "#C9856B",
    sage: "#7F947C",
    sageDark: "#637460",
    sageSoft: "#E7EEE5",
    plum: "#C66C66",
    dangerSoft: "#F8E8E6",
    cream: "#F3EBDD",
    terracotta: "#C9856B",
    terracottaLight: "#F5E7E0",
    line: "#EAE5DC",
    accent: "#7F947C",
    accentSoft: "#E7EEE5",
    chipBg: "#F4F0E8",
};
const MAX_PHOTOS = 10;
const RADIUS = { card: 22, cardSmall: 17, button: 16, input: 15, chip: 999, image: 20 };
const SHADOW = { soft: "0 2px 12px rgba(65,55,45,0.05)", lifted: "0 5px 24px rgba(65,55,45,0.08)" };

// Compresses a photographed document to a size that keeps small print
// legible — much higher quality than the ~450px thumbnails used for recipe
// dish photos elsewhere in this app, since here the photo *is* the record
// (there's no separate text extraction step to fall back on). Also returns
// a much smaller `thumb` version for display while editing: rendering the
// full 1400px original at a tiny 84x84 size for every photo in the form
// forced the browser to decode several large images at once on every
// re-render, which is what made the whole screen (including the back
// button) stop responding after adding a few photos.
// Derives a small preview thumb from an already-cropped print-quality
// photo (see handleCropConfirm below), rather than re-cropping — this is
// the same lightweight-thumb idea fileToDocumentPhoto used, just applied
// to a data URL that's already been through the crop step.
function recompressForThumb(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.6));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}
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
            const full = canvas.toDataURL("image/jpeg", 0.85);
            const thumbScale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
            const thumbCanvas = document.createElement("canvas");
            thumbCanvas.width = Math.max(1, Math.round(img.naturalWidth * thumbScale));
            thumbCanvas.height = Math.max(1, Math.round(img.naturalHeight * thumbScale));
            thumbCanvas.getContext("2d").drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
            const thumb = thumbCanvas.toDataURL("image/jpeg", 0.6);
            resolve({ full, thumb });
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

function PrintListCard({ print, onOpen, onDelete }) {
    const [swipeX, setSwipeX] = useState(0); // 0 = closed, negative = revealed
    const dragStart = useRef(null);
    const REVEAL_WIDTH = 72;
    const handleTouchStart = (e) => {
        dragStart.current = { x: e.touches[0].clientX, startSwipe: swipeX };
    };
    const handleTouchMove = (e) => {
        if (!dragStart.current)
            return;
        const delta = e.touches[0].clientX - dragStart.current.x;
        const next = Math.min(0, Math.max(-REVEAL_WIDTH, dragStart.current.startSwipe + delta));
        setSwipeX(next);
    };
    const handleTouchEnd = () => {
        dragStart.current = null;
        // Snap to fully open or fully closed rather than leaving it
        // part-way — a light flick should be enough to reveal it.
        setSwipeX((x) => (x < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0));
    };
    return React.createElement("div", { style: { position: "relative", marginBottom: 10, borderRadius: RADIUS.cardSmall, overflow: "hidden" } },
        // delete button, revealed from behind the card as it slides left
        React.createElement("button", { onClick: () => onDelete(print.id), "aria-label": "削除", style: {
                position: "absolute", top: 0, right: 0, bottom: 0, width: REVEAL_WIDTH,
                border: "none", background: COLORS.plum, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            } }, React.createElement(X, { size: 18 })),
        React.createElement("div", {
                onClick: () => (swipeX === 0 ? onOpen(print.id) : setSwipeX(0)),
                onTouchStart: handleTouchStart, onTouchMove: handleTouchMove, onTouchEnd: handleTouchEnd,
                style: {
                    position: "relative", background: "#fff",
                    border: `1px solid ${COLORS.line}`, padding: 10, display: "flex", gap: 10,
                    alignItems: "center", cursor: "pointer",
                    transform: `translateX(${swipeX}px)`,
                    transition: dragStart.current ? "none" : "transform 0.2s",
                },
            },
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
                    (print.personTags || []).map((p) => React.createElement("span", { key: p, style: {
                            fontSize: 11, fontWeight: 700, color: COLORS.mustard, background: "#F5EDE1", borderRadius: 999, padding: "2px 8px",
                        } }, p))))));
}

function PrintListView({ printIndex, printsLoaded, printPeople, onOpenAdd, onOpenDetail, onDelete }) {
    const [personFilter, setPersonFilter] = useState(null);
    const [query, setQuery] = useState("");
    const q = query.trim().toLowerCase();
    const filtered = printIndex.filter((p) => {
        if (personFilter && !(p.personTags || []).includes(personFilter))
            return false;
        if (q && !(p.title || "").toLowerCase().includes(q))
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
            React.createElement("h1", { style: { fontFamily: "'Noto Sans JP', sans-serif", fontSize: 27, fontWeight: 700, letterSpacing: "-0.04em", margin: 0, color: COLORS.ink } }, "プリント"),
            React.createElement("button", { onClick: onOpenAdd, style: {
                    display: "flex", alignItems: "center", gap: 4, background: COLORS.accent, color: "#fff",
                    border: "none", borderRadius: 999, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer",
                } }, React.createElement(Plus, { size: 15 }), "追加")),
        React.createElement("div", { style: { position: "relative", marginBottom: 12 } },
            React.createElement(Search, { size: 15, color: COLORS.inkSoft, style: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" } }),
            React.createElement("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "タイトルで検索", style: {
                    width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: `1px solid ${COLORS.line}`,
                    fontSize: 14, boxSizing: "border-box", background: "#fff",
                } })),
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
            : filtered.length === 0 ? React.createElement("p", { style: { textAlign: "center", color: COLORS.inkSoft, fontSize: 13.5, padding: "40px 20px", lineHeight: 1.7 } }, q || personFilter ? "見つかりませんでした。" : "まだプリントがありません。右上の「追加」から、学校のプリントなどを撮って登録できます。")
                : filtered.map((p) => React.createElement(PrintListCard, { key: p.id, print: p, onOpen: onOpenDetail, onDelete: handleDelete })));
}

// Rotates a data URL 90° clockwise by redrawing it onto a canvas with the
// dimensions swapped — used by the manual rotate button below, since
// reliably auto-detecting text orientation isn't something this can do
// without a real OCR/vision service.
function rotateDataUrl90(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalHeight;
            canvas.height = img.naturalWidth;
            const ctx = canvas.getContext("2d");
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}
function PhotoThumb({ url, index, onRemove, onView, onRotate, dragProps, dragging }) {
    return React.createElement("div", { style: { position: "relative", width: 84, height: 84, flexShrink: 0, opacity: dragging ? 0.5 : 1, touchAction: "none" }, ...dragProps },
        React.createElement("img", { src: url, alt: "", onClick: onView, draggable: false, style: {
                width: "100%", height: "100%", objectFit: "cover", borderRadius: 10,
                border: `1px solid ${COLORS.line}`, display: "block", cursor: onView ? "pointer" : "default",
            } }),
        // Number badge — shows display order at a glance, and doubles as
        // the drag handle area (dragProps is on the whole thumb, not just
        // this badge, but seeing "①②③…" is what makes it obvious the
        // photos can be reordered at all).
        React.createElement("div", { style: {
                position: "absolute", top: 4, left: 4, minWidth: 18, height: 18, borderRadius: 9, padding: "0 4px",
                background: "rgba(56,54,49,0.62)", color: "#fff", fontSize: 10.5, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
            } }, index + 1),
        onRemove && React.createElement("button", { onClick: onRemove, "aria-label": "削除", style: {
                position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 999,
                border: "2px solid #fff", background: COLORS.plum, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
            } }, React.createElement(X, { size: 12 })),
        onRotate && React.createElement("button", { onClick: onRotate, "aria-label": "回転", title: "90\u00B0\u56DE\u8EE2", style: {
                position: "absolute", bottom: -6, right: -6, width: 22, height: 22, borderRadius: 999,
                border: "2px solid #fff", background: COLORS.sage, color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
            } }, React.createElement(RotateCw, { size: 12 })));
}

function PrintForm({ initial, printPeople, onSave, onCancel, onAddPerson, saveError }) {
    const [title, setTitle] = useState(initial?.title || "");
    const [date, setDate] = useState(initial?.date || new Date().toISOString().slice(0, 10));
    const [personTags, setPersonTags] = useState(initial?.personTags || []);
    // Each entry is { full, thumb } — thumb is what's actually rendered in
    // this form (see fileToDocumentPhoto), full is only used at save time.
    // Existing photos (plain strings, from before this fix) are wrapped
    // with thumb === full; they'll still render a bit heavier until
    // re-saved, but that's a one-time cost rather than a permanent one.
    const [photos, setPhotos] = useState((initial?.photos || []).map((url) => ({ full: url, thumb: url })));
    const [newPersonDraft, setNewPersonDraft] = useState("");
    const [addingPerson, setAddingPerson] = useState(false);
    const [saving, setSaving] = useState(false);
    // Drag-to-reorder for the photo grid below. dragIndex is which photo
    // is currently being dragged (for the faded-out styling); didDragRef
    // tracks whether the touch actually moved enough to count as a drag
    // rather than a tap, so a plain tap doesn't get swallowed as a
    // (no-op) drag.
    const [dragIndex, setDragIndex] = useState(null);
    const gridRef = useRef(null);
    const dragStartInfo = useRef(null); // { x, y, index }
    const didDragRef = useRef(false);
    const handleThumbTouchStart = (e, index) => {
        const t = e.touches[0];
        dragStartInfo.current = { x: t.clientX, y: t.clientY, index };
        didDragRef.current = false;
    };
    const handleGridTouchMove = (e) => {
        if (!dragStartInfo.current)
            return;
        const t = e.touches[0];
        const dx = t.clientX - dragStartInfo.current.x;
        const dy = t.clientY - dragStartInfo.current.y;
        if (!didDragRef.current && Math.hypot(dx, dy) < 10) {
            // Not enough movement yet to count as a drag — let a plain tap
            // still work normally.
            return;
        }
        didDragRef.current = true;
        e.preventDefault();
        setDragIndex(dragStartInfo.current.index);
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const slot = el?.closest("[data-photo-index]");
        if (!slot)
            return;
        const targetIndex = Number(slot.dataset.photoIndex);
        const fromIndex = dragStartInfo.current.index;
        if (targetIndex === fromIndex)
            return;
        setPhotos((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
        dragStartInfo.current = { ...dragStartInfo.current, index: targetIndex };
    };
    const handleGridTouchEnd = () => {
        dragStartInfo.current = null;
        setDragIndex(null);
        // Leave didDragRef true for this tick so the tap handler on the
        // thumb (which fires right after touchend) can tell a drag just
        // happened and skip acting like a tap; reset it just after.
        setTimeout(() => { didDragRef.current = false; }, 0);
    };
    const togglePerson = (name) => {
        setPersonTags((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
    };
    // Selected files go through the same crop/position editor recipe
    // photos use (imported from photo-editor.js) before being added —
    // one at a time, queued, so picking several photos at once still
    // shows the crop step for each in turn rather than skipping it.
    const [cropQueue, setCropQueue] = useState([]);
    const handleFiles = (fileList) => {
        const files = Array.from(fileList || []).slice(0, MAX_PHOTOS - photos.length - cropQueue.length);
        if (files.length > 0)
            setCropQueue((prev) => [...prev, ...files]);
    };
    const handleCropConfirm = async (croppedDataUrl) => {
        // The crop editor already returns a compressed, cropped image at
        // print-quality resolution (see outputWidth below) — just derive
        // a smaller thumb from that same cropped result for the form/list
        // rendering, rather than re-cropping.
        try {
            const thumb = await recompressForThumb(croppedDataUrl);
            setPhotos((prev) => [...prev, { full: croppedDataUrl, thumb }]);
        }
        catch {
            setPhotos((prev) => [...prev, { full: croppedDataUrl, thumb: croppedDataUrl }]);
        }
        setCropQueue((prev) => prev.slice(1));
    };
    const handleCropSkip = () => {
        setCropQueue((prev) => prev.slice(1));
    };
    const [saveTimedOut, setSaveTimedOut] = useState(false);
    const handleSave = async () => {
        setSaving(true);
        setSaveTimedOut(false);
        // With many high-quality photos the upload can genuinely take a
        // while on a slow connection — but previously there was no upper
        // bound at all, so a stalled or failed request just left the
        // button reading "保存中…" forever with no way to tell whether it
        // was still working or actually stuck. A timeout, plus a real
        // try/catch, means it always resolves one way or the other.
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 45000));
        try {
            await Promise.race([
                onSave({ ...(initial || {}), title: title.trim() || "無題のプリント", date, personTags, photos: photos.map((p) => p.full) }),
                timeout,
            ]);
        }
        catch (e) {
            setSaveTimedOut(true);
        }
        finally {
            setSaving(false);
        }
    };
    return React.createElement("div", { style: { padding: "16px 16px 100px" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            React.createElement("button", { onClick: onCancel, style: { border: "none", background: "none", padding: 6, display: "flex" } }, React.createElement(ChevronLeft, { size: 20, color: COLORS.inkSoft })),
            React.createElement("h1", { style: { fontSize: 17, fontWeight: 800, margin: 0, color: COLORS.ink, flex: 1 } }, initial?.id ? "プリントを編集" : "プリントを追加")),
        saveError && React.createElement("p", { style: { color: COLORS.plum, fontSize: 12.5, marginBottom: 10 } }, saveError),
        saveTimedOut && React.createElement("p", { style: { color: COLORS.plum, fontSize: 12.5, marginBottom: 10, lineHeight: 1.6 } }, "\u4FDD\u5B58\u306B\u6642\u9593\u304C\u304B\u304B\u308A\u3059\u304E\u3066\u4E2D\u65AD\u3057\u307E\u3057\u305F\u3002\u901A\u4FE1\u74B0\u5883\u306E\u826F\u3044\u5834\u6240\u3067\u3082\u3046\u4E00\u5EA6\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002\u5199\u771F\u306E\u679A\u6570\u3092\u6E1B\u3089\u3059\u3068\u6210\u529F\u3057\u3084\u3059\u304F\u306A\u308A\u307E\u3059\u3002"),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, "タイトル"),
        React.createElement("input", { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "例: 4月 学校だより", style: {
                width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 15, marginBottom: 16, boxSizing: "border-box",
            } }),
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, "日付"),
        React.createElement("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), style: {
                width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${COLORS.line}`, fontSize: 15, marginBottom: 16, boxSizing: "border-box",
            } }),
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
        React.createElement("label", { style: { display: "block", fontSize: 12, fontWeight: 700, color: COLORS.inkSoft, margin: "0 0 6px" } }, `写真(最大${MAX_PHOTOS}枚・文字が読める画質で保存・長押しでドラッグして並び替え)`),
        React.createElement("div", {
                ref: gridRef,
                onTouchMove: handleGridTouchMove,
                onTouchEnd: handleGridTouchEnd,
                onTouchCancel: handleGridTouchEnd,
                style: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 },
            },
            photos.map((p, i) => React.createElement(PhotoThumb, {
                key: i, url: p.thumb, index: i, dragging: dragIndex === i,
                dragProps: { "data-photo-index": i, onTouchStart: (e) => handleThumbTouchStart(e, i) },
                onView: null,
                onRemove: () => setPhotos((prev) => prev.filter((_, idx) => idx !== i)),
                onRotate: async () => {
                    const [full, thumb] = await Promise.all([rotateDataUrl90(p.full), rotateDataUrl90(p.thumb)]);
                    setPhotos((prev) => prev.map((ph, idx) => idx === i ? { full, thumb } : ph));
                },
            })),
            photos.length < MAX_PHOTOS && React.createElement(React.Fragment, null,
                React.createElement("label", { style: {
                        width: 84, height: 84, borderRadius: 10, border: `1.5px dashed ${COLORS.accent}`,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4,
                    } },
                    React.createElement(Camera, { size: 20, color: COLORS.accent }),
                    React.createElement("span", { style: { fontSize: 10, color: COLORS.accent, fontWeight: 700 } }, `${photos.length}/${MAX_PHOTOS}`),
                    // capture="environment" goes straight to the camera —
                    // skipping the "カメラ / ライブラリ" chooser sheet that
                    // a plain file input shows means one less tap needed
                    // for each additional photo taken in a row (the camera
                    // itself still only returns one shot at a time — that
                    // part is a platform limitation, not something a web
                    // page can change — but this at least removes the
                    // extra step around it).
                    React.createElement("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" }, onChange: (e) => {
                            handleFiles(e.target.files);
                            e.target.value = "";
                        } })),
                React.createElement("label", { style: {
                        width: 84, height: 84, borderRadius: 10, border: `1.5px dashed ${COLORS.line}`,
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", gap: 4,
                    } },
                    React.createElement(FileText, { size: 20, color: COLORS.inkSoft }),
                    React.createElement("span", { style: { fontSize: 9.5, color: COLORS.inkSoft, fontWeight: 700 } }, "\u30E9\u30A4\u30D6\u30E9\u30EA"),
                    React.createElement("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" }, onChange: (e) => {
                            handleFiles(e.target.files);
                            e.target.value = "";
                        } })))),
        cropQueue.length > 0 && React.createElement("p", { style: { fontSize: 12, color: COLORS.inkSoft, marginBottom: 16 } }, `\u3042\u3068${cropQueue.length}\u679A\u3001\u56F2\u3080\u7BC4\u56F2\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044`),
        cropQueue.length === 0 && React.createElement("div", { style: { marginBottom: 16 } }),
        React.createElement("button", { onClick: handleSave, disabled: saving, style: {
                width: "100%", background: COLORS.accent, color: "#fff", border: "none", borderRadius: 12,
                padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1,
            } }, saving ? "保存中…" : "保存する"),
        cropQueue.length > 0 && React.createElement(PhotoPositionEditor, {
            file: cropQueue[0],
            outputWidth: 1400,
            onCancel: handleCropSkip,
            onConfirm: handleCropConfirm,
        }));
}

// Pinch-to-zoom, implemented with the addEventListener(..., { passive:
// false }) pattern rather than React's onTouch* props — React's own touch
// props attach as passive listeners, so calling preventDefault() inside
// them silently does nothing, which is what broke earlier pinch attempts
// here. Exposes toggleZoom via ref so the fallback "拡大" button (kept
// alongside this, in case pinch still doesn't hold up in a home-screen-
// installed PWA) drives the exact same zoom/pan state pinching does,
// rather than being a second, disconnected zoom mechanism.
const PinchZoomImage = React.forwardRef(function PinchZoomImage({ src, active, onZoomChange }, ref) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const wrapRef = useRef(null);
    const pinchState = useRef(null); // { dist, x, y } from the previous pinch move
    const dragState = useRef(null); // single-finger pan, only once zoomed
    React.useImperativeHandle(ref, () => ({
        toggleZoom: () => {
            setZoom((z) => {
                const next = z > 1 ? 1 : 2.5;
                if (next === 1)
                    setPan({ x: 0, y: 0 });
                return next;
            });
        },
        reset: () => { setZoom(1); setPan({ x: 0, y: 0 }); },
    }));
    useEffect(() => { onZoomChange?.(zoom); }, [zoom]);
    useEffect(() => {
        const el = wrapRef.current;
        if (!el || !active)
            return;
        const getMidpoint = (e, rect) => {
            const [t1, t2] = e.touches;
            return {
                dist: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
                x: (t1.clientX + t2.clientX) / 2 - rect.left,
                y: (t1.clientY + t2.clientY) / 2 - rect.top,
            };
        };
        const onTouchStart = (e) => {
            if (e.touches.length === 2) {
                pinchState.current = getMidpoint(e, el.getBoundingClientRect());
            }
            else if (e.touches.length === 1 && zoom > 1) {
                const t = e.touches[0];
                dragState.current = { startX: t.clientX, startY: t.clientY, startPanX: pan.x, startPanY: pan.y };
            }
        };
        const onTouchMove = (e) => {
            if (e.touches.length === 2 && pinchState.current) {
                e.preventDefault();
                const current = getMidpoint(e, el.getBoundingClientRect());
                const scaleDelta = current.dist / pinchState.current.dist;
                setZoom((z) => {
                    const nextZoom = Math.min(4, Math.max(1, z * scaleDelta));
                    setPan((p) => ({
                        x: current.x - (current.x - p.x) * (nextZoom / z),
                        y: current.y - (current.y - p.y) * (nextZoom / z),
                    }));
                    return nextZoom;
                });
                pinchState.current = current;
            }
            else if (e.touches.length === 1 && dragState.current) {
                e.preventDefault();
                const t = e.touches[0];
                setPan({
                    x: dragState.current.startPanX + (t.clientX - dragState.current.startX),
                    y: dragState.current.startPanY + (t.clientY - dragState.current.startY),
                });
            }
        };
        const onTouchEnd = (e) => {
            if (e.touches.length < 2)
                pinchState.current = null;
            if (e.touches.length < 1)
                dragState.current = null;
        };
        el.addEventListener("touchstart", onTouchStart, { passive: false });
        el.addEventListener("touchmove", onTouchMove, { passive: false });
        el.addEventListener("touchend", onTouchEnd, { passive: false });
        el.addEventListener("touchcancel", onTouchEnd, { passive: false });
        return () => {
            el.removeEventListener("touchstart", onTouchStart);
            el.removeEventListener("touchmove", onTouchMove);
            el.removeEventListener("touchend", onTouchEnd);
            el.removeEventListener("touchcancel", onTouchEnd);
        };
    }, [active, zoom, pan]);
    return React.createElement("div", {
            ref: wrapRef,
            style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", touchAction: zoom > 1 ? "none" : "pan-x" },
        },
        React.createElement("img", { src: src, alt: "", draggable: false, style: {
                maxWidth: "100%", maxHeight: "100%", borderRadius: 8,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transition: (pinchState.current || dragState.current) ? "none" : "transform 0.2s",
            } }));
});
function PhotoViewer({ photos, startIndex, onClose }) {
    const scrollRef = useRef(null);
    const [currentIndex, setCurrentIndex] = useState(startIndex);
    // Zoom is a plain button toggle, not a touch gesture — every custom
    // touch-gesture attempt at this (pinch, then double-tap+drag) broke in
    // ways that only showed up once the app was added to the iOS home
    // screen, which isn't something that could be tested directly from
    // here. A button just calls setState on click, and panning around
    // once zoomed is the browser's own native scrolling (the same
    // mechanism the swipe-between-photos strip below already uses
    // without issues) — nothing here is intercepting or fighting over
    // touch events, so there's much less room for this platform-specific
    // kind of breakage.
    // Zoom now happens two ways: pinch (handled inside PinchZoomImage,
    // per-photo) and this "拡大" button, kept as a fallback in case pinch
    // still doesn't hold up once the app is installed to the home screen
    // — both drive the exact same zoom/pan state via imageRefs below,
    // rather than being two separate, disconnected zoom mechanisms.
    const [isZoomed, setIsZoomed] = useState(false);
    const imageRefs = useRef([]);
    useEffect(() => {
        // Jump straight to the tapped photo — scrollIntoView with an
        // instant (not smooth) behavior avoids a distracting animated
        // scroll past every photo in between on open.
        const el = scrollRef.current;
        if (el) {
            el.scrollLeft = startIndex * el.clientWidth;
        }
        setCurrentIndex(startIndex);
    }, [startIndex]);
    // The page counter below used to just print the index the viewer was
    // opened at and never update — swiping to a different photo moved the
    // scroll position but nothing was watching it, so the number stayed
    // frozen. Recompute which photo is centered whenever the strip scrolls.
    const handleScroll = () => {
        const el = scrollRef.current;
        if (el && el.clientWidth > 0) {
            const next = Math.round(el.scrollLeft / el.clientWidth);
            if (next !== currentIndex) {
                imageRefs.current[currentIndex]?.reset(); // don't carry a zoomed-in state over to the next photo
                setCurrentIndex(next);
                setIsZoomed(false);
            }
        }
    };
    return React.createElement("div", { style: {
            position: "fixed", inset: 0, background: "rgba(20,22,18,0.94)", zIndex: 100,
        } },
        React.createElement("button", { onClick: onClose, "aria-label": "閉じる", style: {
                position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", right: 12, zIndex: 2,
                width: 36, height: 36, borderRadius: 999, border: "none",
                background: "rgba(255,255,255,0.16)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            } }, React.createElement(X, { size: 18 })),
        React.createElement("button", { onClick: () => { imageRefs.current[currentIndex]?.toggleZoom(); setIsZoomed((z) => !z); }, "aria-label": isZoomed ? "縮小" : "拡大", style: {
                position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", right: 60, zIndex: 2,
                height: 36, padding: "0 14px", borderRadius: 999, border: "none",
                background: isZoomed ? "#fff" : "rgba(255,255,255,0.16)", color: isZoomed ? COLORS.ink : "#fff",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                fontSize: 12.5, fontWeight: 700,
            } }, isZoomed ? "縮小" : "拡大"),
        // A plain horizontally-scrolling, scroll-snapped strip — swiping
        // (or scrolling two-finger on a trackpad) moves to the next/
        // previous photo natively, no custom gesture code needed.
        React.createElement("div", { ref: scrollRef, onScroll: handleScroll, style: {
                display: "flex",
                width: "100%",
                height: "100%",
                overflowX: isZoomed ? "hidden" : "auto",
                scrollSnapType: isZoomed ? "none" : "x mandatory",
                WebkitOverflowScrolling: "touch",
            } },
            photos.map((url, i) => React.createElement("div", { key: i, style: {
                    flex: "0 0 100%",
                    scrollSnapAlign: "start",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16,
                    boxSizing: "border-box",
                } },
                React.createElement(PinchZoomImage, {
                    key: i, src: url, active: i === currentIndex,
                    ref: (r) => { imageRefs.current[i] = r; },
                    onZoomChange: (z) => { if (i === currentIndex) setIsZoomed(z > 1); },
                })))),
        photos.length > 1 && React.createElement("div", { style: {
                position: "absolute", bottom: "calc(16px + env(safe-area-inset-bottom, 0px))", left: 0, right: 0,
                textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 12.5, fontWeight: 700,
            } }, `${currentIndex + 1} / ${photos.length}`));
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
            print.createdBy && React.createElement("span", { style: { fontSize: 13, color: COLORS.inkSoft } }, `登録: ${print.createdBy}`),
            (print.personTags || []).map((p) => React.createElement("span", { key: p, style: {
                    fontSize: 12, fontWeight: 700, color: COLORS.mustard, background: "#F5EDE1", borderRadius: 999, padding: "3px 10px",
                } }, p))),
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
            (print.photos || []).map((url, i) => React.createElement("img", { key: i, src: url, alt: "", onClick: () => setViewerIndex(i), style: {
                    width: "100%", borderRadius: 12, border: `1px solid ${COLORS.line}`, cursor: "pointer", display: "block",
                } }))),
        viewerIndex != null && React.createElement(PhotoViewer, { photos: print.photos, startIndex: viewerIndex, onClose: () => setViewerIndex(null) }));
}

// Top-level export used by LazyPrintsView in app.js.
export function PrintsView({ printIndex, printsLoaded, printPeople, saveError, onSave, onDelete, onAddPerson, uref }) {
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
