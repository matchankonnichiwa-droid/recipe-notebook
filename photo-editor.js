import React, { useState, useEffect, useRef } from "react";
import { FiCheck as Check, FiCrop as Crop, FiRotateCcw as RotateCcw, FiSkipForward as SkipForward } from "react-icons/fi";

// This chunk is loaded on demand — only when someone is actively cropping
// or repositioning a photo (screenshot import, or editing a recipe's
// photo) — rather than sitting in the main bundle for every page load.
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
// photo-crop tool) rather than panning/zooming inside a fixed window.
export function PhotoPositionEditor({ file, source, onCancel, onConfirm }) {
    const [imgUrl, setImgUrl] = useState(null);
    const [natural, setNatural] = useState(null); // { w, h }
    const [dispSize, setDispSize] = useState(null); // { w, h } — rendered image size
    const [rect, setRect] = useState(null); // crop rect in displayed-image pixels
    const [exportError, setExportError] = useState("");
    const dragState = useRef(null);
    const vw = typeof window !== "undefined" ? window.innerWidth : 360;
    const vh = typeof window !== "undefined" ? window.innerHeight : 700;
    const DISPLAY_W = Math.min(340, vw - 40);
    const DISPLAY_H_MAX = Math.max(200, vh - 280); // leave room for header text + footer buttons
    useEffect(() => {
        // Accept either a freshly-picked File, or an existing image URL/data
        // URL (so an already-attached photo can be reopened for re-cropping).
        const url = file ? URL.createObjectURL(file) : source;
        setImgUrl(url);
        const img = new Image();
        img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            setNatural({ w, h });
            const scale = Math.min(DISPLAY_W / w, DISPLAY_H_MAX / h);
            const dW = Math.round(w * scale), dH = Math.round(h * scale);
            setDispSize({ w: dW, h: dH });
            const rw = dW * 0.86, rh = dH * 0.86;
            setRect({ x: (dW - rw) / 2, y: (dH - rh) / 2, w: rw, h: rh });
        };
        img.src = url;
        return () => { if (file) URL.revokeObjectURL(url); };
    }, [file, source]);
    if (!natural || !dispSize || !rect)
        return null;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const getPos = (e) => {
        const p = e.touches ? e.touches[0] : e;
        return { x: p.clientX, y: p.clientY };
    };
    const startDrag = (mode) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragState.current = { mode, start: getPos(e), origin: { ...rect } };
    };
    const onMove = (e) => {
        if (!dragState.current) return;
        e.preventDefault();
        const p = getPos(e);
        const dx = p.x - dragState.current.start.x;
        const dy = p.y - dragState.current.start.y;
        const o = dragState.current.origin;
        let next = { ...o };
        if (dragState.current.mode === "move") {
            next.x = clamp(o.x + dx, 0, dispSize.w - o.w);
            next.y = clamp(o.y + dy, 0, dispSize.h - o.h);
        } else {
            // corner resize: mode is "nw" | "ne" | "sw" | "se"
            let { x, y, w, h } = o;
            if (dragState.current.mode.includes("e")) w = clamp(o.w + dx, 30, dispSize.w - o.x);
            if (dragState.current.mode.includes("s")) h = clamp(o.h + dy, 30, dispSize.h - o.y);
            if (dragState.current.mode.includes("w")) { const nx = clamp(o.x + dx, 0, o.x + o.w - 30); w = o.w + (o.x - nx); x = nx; }
            if (dragState.current.mode.includes("n")) { const ny = clamp(o.y + dy, 0, o.y + o.h - 30); h = o.h + (o.y - ny); y = ny; }
            next = { x, y, w, h };
        }
        setRect(next);
    };
    const endDrag = () => { dragState.current = null; };
    const handleConfirm = () => {
        const scale = natural.w / dispSize.w;
        const cropX = rect.x * scale, cropY = rect.y * scale, cropW = rect.w * scale, cropH = rect.h * scale;
        const outW = 1000, outH = Math.round(outW * (cropH / cropW));
        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
                onConfirm(canvas.toDataURL("image/jpeg", 0.85));
            }
            catch (err) {
                setExportError("この写真は外部サイトのものなので、位置を調整できませんでした。");
            }
        };
        img.onerror = () => setExportError("画像を読み込めませんでした。");
        img.src = imgUrl;
    };
    const handleStyle = { position: "absolute", width: 26, height: 26, borderRadius: "50%", background: "#fff", border: `2px solid ${COLORS.accent}`, touchAction: "none" };
    return React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 95, background: "rgba(20,22,18,0.9)", display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { color: "#fff", fontSize: 13.5, fontWeight: 700, textAlign: "center", padding: "20px 20px 0" } }, "枠をドラッグして使う範囲を選べます"),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px" } },
            React.createElement("div", { onMouseMove: onMove, onMouseUp: endDrag, onMouseLeave: endDrag, onTouchMove: onMove, onTouchEnd: endDrag, style: {
                    position: "relative", width: dispSize.w, height: dispSize.h, touchAction: "none", flexShrink: 0
                } },
                React.createElement("img", { src: imgUrl, draggable: false, alt: "", style: { width: dispSize.w, height: dispSize.h, display: "block", userSelect: "none" } }),
                React.createElement("div", { style: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
                        clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${rect.y}px, ${rect.x + rect.w}px ${rect.y}px, ${rect.x + rect.w}px ${rect.y + rect.h}px, ${rect.x}px ${rect.y + rect.h}px, ${rect.x}px ${rect.y}px, 0 ${rect.y}px)`,
                        pointerEvents: "none" } }),
                React.createElement("div", {
                    onMouseDown: startDrag("move"), onTouchStart: startDrag("move"),
                    style: { position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: `2px solid #fff`, boxShadow: "0 0 0 1px rgba(0,0,0,0.3)", cursor: "move", touchAction: "none" }
                },
                    [1 / 3, 2 / 3].map((f, i) => (
                        React.createElement("div", { key: `v${i}`, style: { position: "absolute", left: `${f * 100}%`, top: 0, width: 1, height: "100%", background: "rgba(255,255,255,0.55)", pointerEvents: "none" } }))),
                    [1 / 3, 2 / 3].map((f, i) => (
                        React.createElement("div", { key: `h${i}`, style: { position: "absolute", top: `${f * 100}%`, left: 0, height: 1, width: "100%", background: "rgba(255,255,255,0.55)", pointerEvents: "none" } }))),
                    React.createElement("div", { onMouseDown: startDrag("nw"), onTouchStart: startDrag("nw"), style: { ...handleStyle, left: -13, top: -13, cursor: "nwse-resize" } }),
                    React.createElement("div", { onMouseDown: startDrag("ne"), onTouchStart: startDrag("ne"), style: { ...handleStyle, right: -13, top: -13, left: "auto", cursor: "nesw-resize" } }),
                    React.createElement("div", { onMouseDown: startDrag("sw"), onTouchStart: startDrag("sw"), style: { ...handleStyle, left: -13, bottom: -13, top: "auto", cursor: "nesw-resize" } }),
                    React.createElement("div", { onMouseDown: startDrag("se"), onTouchStart: startDrag("se"), style: { ...handleStyle, right: -13, bottom: -13, left: "auto", top: "auto", cursor: "nwse-resize" } })))),
        exportError && React.createElement("div", { style: { color: "#F3C9C6", fontSize: 12.5, textAlign: "center", padding: "0 20px 8px" } }, exportError),
        React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "center", padding: "12px 20px calc(20px + env(safe-area-inset-bottom,0px))", flexShrink: 0 } },
            React.createElement("button", { onClick: onCancel, style: {
                    border: "none", borderRadius: 999, padding: "13px 28px", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
                    background: "rgba(255,255,255,0.14)", color: "#fff"
                } }, "キャンセル"),
            React.createElement("button", { onClick: handleConfirm, style: {
                    border: "none", borderRadius: 999, padding: "13px 32px", fontSize: 14.5, fontWeight: 700, cursor: "pointer",
                    background: COLORS.accent, color: "#fff"
                } }, "この範囲で使う")));
}
export function CropOverlay({ src, index, total, onConfirm, onUseFull, onSkip }) {
    const containerRef = useRef(null);
    const imgRef = useRef(null);
    const [rect, setRect] = useState(null);
    const dragStart = useRef(null);
    const getPos = (e) => {
        const bounds = containerRef.current.getBoundingClientRect();
        const point = e.touches ? e.touches[0] : e;
        return { x: point.clientX - bounds.left, y: point.clientY - bounds.top };
    };
    const handleStart = (e) => {
        const p = getPos(e);
        dragStart.current = p;
        setRect({ x: p.x, y: p.y, w: 0, h: 0 });
    };
    const handleMove = (e) => {
        if (!dragStart.current)
            return;
        e.preventDefault();
        const p = getPos(e);
        const s = dragStart.current;
        setRect({
            x: Math.min(s.x, p.x),
            y: Math.min(s.y, p.y),
            w: Math.abs(p.x - s.x),
            h: Math.abs(p.y - s.y),
        });
    };
    const handleEnd = () => {
        dragStart.current = null;
    };
    const handleConfirm = () => {
        const img = imgRef.current;
        if (!rect || rect.w < 15 || rect.h < 15 || !img) {
            onUseFull();
            return;
        }
        const scaleX = img.naturalWidth / img.clientWidth;
        const scaleY = img.naturalHeight / img.clientHeight;
        onConfirm({
            x: Math.round(rect.x * scaleX),
            y: Math.round(rect.y * scaleY),
            w: Math.round(rect.w * scaleX),
            h: Math.round(rect.h * scaleY),
        });
    };
    return (React.createElement("div", { style: {
            position: "fixed",
            inset: 0,
            background: COLORS.paper,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            padding: 16,
            overflowY: "auto",
        } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } },
            React.createElement(Crop, { size: 16, color: COLORS.accent }),
            React.createElement("p", { style: { fontSize: 13, fontWeight: 700, margin: 0 } },
                "\u753B\u50CF ",
                index + 1,
                "/",
                total)),
        React.createElement("p", { style: { fontSize: 12.5, color: COLORS.inkSoft, lineHeight: 1.6, margin: "0 0 12px" } }, "\u6587\u5B57\u304C\u66F8\u3044\u3066\u3042\u308B\u90E8\u5206\u3060\u3051\u3092\u6307\u3067\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u56F2\u3093\u3067\u304F\u3060\u3055\u3044\u3002\u5199\u771F\u3084\u5E83\u544A\u3001\u4E0B\u90E8\u306E\u30E1\u30CB\u30E5\u30FC\u306F\u5916\u3059\u3068\u8AAD\u307F\u53D6\u308A\u7CBE\u5EA6\u304C\u4E0A\u304C\u308A\u307E\u3059\u3002\u56F2\u307E\u306A\u3051\u308C\u3070\u753B\u50CF\u5168\u4F53\u3092\u8AAD\u307F\u53D6\u308A\u307E\u3059\u3002"),
        React.createElement("div", { ref: containerRef, onMouseDown: handleStart, onMouseMove: handleMove, onMouseUp: handleEnd, onTouchStart: handleStart, onTouchMove: handleMove, onTouchEnd: handleEnd, style: {
                position: "relative",
                touchAction: "none",
                borderRadius: 12,
                overflow: "hidden",
                border: `1px solid ${COLORS.line}`,
                marginBottom: 16,
                background: "#000",
            } },
            React.createElement("img", { ref: imgRef, src: src, draggable: false, style: { width: "100%", display: "block", userSelect: "none" } }),
            rect && (React.createElement("div", { style: {
                    position: "absolute",
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    border: `2px solid ${COLORS.accent}`,
                    background: "rgba(184,134,43,0.18)",
                    pointerEvents: "none",
                } }))),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: "auto", paddingTop: 8 } },
            React.createElement("button", { onClick: handleConfirm, style: {
                    background: COLORS.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "13px 0",
                    fontWeight: 700,
                    fontSize: 15,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                } },
                React.createElement(Check, { size: 17 }),
                " ",
                rect ? "この範囲で読み取る" : "この画像を読み取る"),
            React.createElement("div", { style: { display: "flex", gap: 8 } },
                React.createElement("button", { onClick: onUseFull, style: {
                        flex: 1,
                        background: "none",
                        border: `1px solid ${COLORS.line}`,
                        color: COLORS.inkSoft,
                        borderRadius: 12,
                        padding: "10px 0",
                        fontWeight: 700,
                        fontSize: 13,
                    } },
                    React.createElement(RotateCcw, { size: 13, style: { marginRight: 4, verticalAlign: -2 } }),
                    "\u753B\u50CF\u5168\u4F53\u3092\u4F7F\u3046"),
                React.createElement("button", { onClick: onSkip, style: {
                        flex: 1,
                        background: "none",
                        border: `1px solid ${COLORS.line}`,
                        color: COLORS.inkSoft,
                        borderRadius: 12,
                        padding: "10px 0",
                        fontWeight: 700,
                        fontSize: 13,
                    } },
                    React.createElement(SkipForward, { size: 13, style: { marginRight: 4, verticalAlign: -2 } }),
                    "\u3053\u306E\u753B\u50CF\u3092\u4F7F\u308F\u306A\u3044")))));
}
// Fetches a page's readable text via the Jina Reader proxy (r.jina.ai),
// which does the actual HTTP fetch server-side and returns permissive CORS
// headers — needed since most recipe sites don't allow direct cross-origin
// fetch from another domain's JavaScript.
