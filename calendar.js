import React, { useState, useMemo, useRef, useEffect } from "react";
import { FiPlus as Plus, FiChevronLeft as ChevronLeft, FiX as X, FiBookOpen as BookOpen, FiRotateCcw as RotateCcw, FiTrash2 as Trash2, FiCalendar as CalendarIcon } from "react-icons/fi";

// This chunk is loaded on demand (only when the 献立 tab is opened) via
// a dynamic import in app.js, to keep it out of the initial page-load
// bundle — the meal-plan feature is substantial and most visits do not
// touch it right away.
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
const MAIN_CATEGORIES = ["ご飯もの", "肉料理", "魚介料理", "麺類"];
const SIDE_CATEGORIES = ["野菜料理"];
const SOUP_CATEGORIES = ["スープ・鍋"];
function entryRole(entry) {
    if (MAIN_CATEGORIES.includes(entry.dishCategory))
        return { label: "主菜", color: "#C0604A", bg: "#FBEAE5" };
    if (SIDE_CATEGORIES.includes(entry.dishCategory))
        return { label: "副菜", color: "#3F7A4E", bg: "#DFF0E1" };
    if (SOUP_CATEGORIES.includes(entry.dishCategory))
        return { label: "スープ", color: "#3E6E8E", bg: "#E3EEF4" };
    return null;
}
// Meal-plan entries store a snapshot of {recipeId,title,imageUrl,...} taken
// when the dish was added to a day — so if the recipe's photo or title is
// edited afterward, the calendar would otherwise keep showing the old
// snapshot forever. This resolves an entry against the live recipe (by id)
// whenever it's still available, falling back to the stored snapshot only
// if the recipe itself was deleted.
function liveEntry(entry, recipesById) {
    const r = recipesById[entry.recipeId];
    if (!r)
        return entry;
    return {
        ...entry,
        title: r.title || entry.title,
        imageUrl: r.imageUrl || r.imageUrl2 || entry.imageUrl,
        dishCategory: r.dishCategory || entry.dishCategory,
    };
}
// Dish card used in the edit view: photo, role badge, remove (X), and a
// swap icon — one card per assigned recipe. Kept compact (small photo,
// icon-only swap control, no "変更する" label) so four of these fit in a
// row on a phone screen without feeling cramped — a person wanted all four
// meal slots (主菜/副菜/スープ/もう1品) visible side by side rather than
// wrapped onto a second row.
function DishCard({ entry, roleLabel, onSelectRecipe, onRemoveEntry, onSwapEntry }) {
    const role = entryRole(entry) || (roleLabel === "主菜" ? { label: "主菜", color: "#C0604A", bg: "#FBEAE5" } : roleLabel === "副菜" ? { label: "副菜", color: "#3F7A4E", bg: "#DFF0E1" } : roleLabel === "スープ" ? { label: "スープ", color: "#3E6E8E", bg: "#E3EEF4" } : null);
    return React.createElement("div", { style: { borderRadius: 12, overflow: "hidden", background: "#fff", border: `1px solid ${COLORS.line}` } },
        React.createElement("div", { style: { position: "relative", width: "100%", height: 68, background: COLORS.chipBg } },
            React.createElement("div", { onClick: () => onSelectRecipe && onSelectRecipe(entry.recipeId), style: {
                    width: "100%", height: "100%", cursor: onSelectRecipe ? "pointer" : "default",
                } },
                entry.imageUrl ? React.createElement("img", { src: entry.imageUrl, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } })
                    : React.createElement("div", { style: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } }, React.createElement(BookOpen, { size: 16, color: COLORS.inkSoft }))),
            role && React.createElement("span", { style: {
                    position: "absolute", top: 3, left: 3, fontSize: 9, fontWeight: 800, color: role.color, background: role.bg,
                    borderRadius: 5, padding: "1px 5px", pointerEvents: "none",
                } }, role.label),
            // A sibling button, not nested inside the photo's clickable div —
            // nesting interactive elements is invalid HTML and made taps here
            // behave unreliably (the photo's own click could also fire).
            React.createElement("button", { onClick: () => onRemoveEntry(entry.recipeId), "aria-label": "\u524A\u9664", style: {
                    position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", border: "none",
                    background: "rgba(32,35,31,0.55)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0,
                } }, React.createElement(X, { size: 10 }))),
        React.createElement("div", { style: { padding: "4px 5px 5px", display: "flex", alignItems: "center", gap: 2 } },
            React.createElement("p", { style: { fontSize: 10.5, fontWeight: 700, color: COLORS.ink, margin: 0, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, entry.title),
            role && onSwapEntry && React.createElement("button", { onClick: () => onSwapEntry(entry.recipeId), "aria-label": "\u5909\u66F4\u3059\u308B", style: {
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "none", background: "none",
                    color: COLORS.accent, cursor: "pointer", padding: 2,
                } }, React.createElement(RotateCcw, { size: 11 }))));
}
// An unfilled 主菜/副菜/スープ slot — always shown (rather than the grid
// just collapsing when a dish is removed), with its own "+" to fill it
// back in. Sized to match DishCard's compact footprint.
function EmptySlotCard({ roleLabel, onAdd }) {
    const role = roleLabel === "主菜" ? { label: "主菜", color: "#C0604A", bg: "#FBEAE5" }
        : roleLabel === "副菜" ? { label: "副菜", color: "#3F7A4E", bg: "#DFF0E1" }
        : roleLabel === "スープ" ? { label: "スープ", color: "#3E6E8E", bg: "#E3EEF4" }
            : { label: roleLabel, color: COLORS.inkSoft, bg: COLORS.chipBg };
    return React.createElement("button", { onClick: onAdd, style: {
            borderRadius: 12, border: `1.5px dashed ${COLORS.line}`, background: "none", padding: 0, cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, height: 98,
        } },
        React.createElement("span", { style: { fontSize: 9, fontWeight: 800, color: role.color, background: role.bg, borderRadius: 5, padding: "1px 5px" } }, role.label),
        React.createElement(Plus, { size: 14, color: COLORS.inkSoft }),
        React.createElement("span", { style: { fontSize: 9.5, color: COLORS.inkSoft, fontWeight: 700 } }, "\u8FFD\u52A0\u3059\u308B"));
}
// Two simple modes, matching how most people actually plan: first pick
// *which days* need a menu (a calendar you tap dates on), then review and
// tweak the result on a separate edit screen — rather than mixing browsing,
// picking, and editing into one view.
// "日付変更": a 14-day window starting at the day being moved, where each
// row's photo card can be dragged up/down — the card's *contents* move
// between fixed date slots, like reordering cards on a table rather than
// the dates themselves shifting.
const DATE_SWAP_ROW_HEIGHT = 136;
function DateSwapSheet({ startDateStr, mealPlan, recipesById, weekdayNames, onClose, onConfirm }) {
    const dateSlots = useMemo(() => {
        const [y, m, d] = startDateStr.split("-").map(Number);
        const start = new Date(y, m - 1, d);
        const list = [];
        for (let i = 0; i < 14; i++) {
            const dt = new Date(start);
            dt.setDate(dt.getDate() + i);
            const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
            list.push({ dateStr, date: dt });
        }
        return list;
    }, [startDateStr]);
    const [order, setOrder] = useState(() => dateSlots.map((s) => Array.isArray(mealPlan[s.dateStr]) ? mealPlan[s.dateStr] : []));
    const [dragIndex, setDragIndex] = useState(null);
    const [dragY, setDragY] = useState(0);
    const dragRef = useRef({ startY: 0, originIndex: null });
    const onHandleTouchStart = (index, e) => {
        dragRef.current = { startY: e.touches[0].clientY, originIndex: index };
        setDragIndex(index);
        setDragY(0);
    };
    const onHandleTouchMove = (e) => {
        if (dragIndex === null)
            return;
        const delta = e.touches[0].clientY - dragRef.current.startY;
        setDragY(delta);
        const rowsMoved = Math.round(delta / DATE_SWAP_ROW_HEIGHT);
        const targetIndex = Math.max(0, Math.min(order.length - 1, dragRef.current.originIndex + rowsMoved));
        if (targetIndex !== dragIndex) {
            setOrder((prev) => {
                const next = [...prev];
                const [moved] = next.splice(dragIndex, 1);
                next.splice(targetIndex, 0, moved);
                return next;
            });
            dragRef.current.startY = e.touches[0].clientY;
            dragRef.current.originIndex = targetIndex;
            setDragY(0);
            setDragIndex(targetIndex);
        }
    };
    const onHandleTouchEnd = () => {
        setDragIndex(null);
        setDragY(0);
    };
    return React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 96, background: COLORS.paper, display: "flex", flexDirection: "column" } },
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto" } },
        React.createElement("div", { style: { maxWidth: 480, margin: "0 auto", padding: "18px 18px 18px" } },
            React.createElement("div", { style: { textAlign: "center", marginBottom: 18 } },
                React.createElement("div", { style: { fontSize: 26, marginBottom: 6 } }, "\u2195\uD83E\uDC85"),
                React.createElement("h2", { style: { fontSize: 18, fontWeight: 800, margin: "0 0 4px", color: COLORS.ink } }, "\u30B9\u30EF\u30A4\u30D7\u3057\u3066\u5165\u308C\u66FF\u3048\u308B"),
                React.createElement("p", { style: { fontSize: 12.5, color: COLORS.inkSoft, margin: 0 } }, "\u53F3\u306E\u2261\u3092\u6307\u3067\u79FB\u52D5\u3057\u3066\u65E5\u4ED8\u3092\u5909\u66F4")),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } },
                dateSlots.map((slot, i) => {
                    const entries = order[i].map((e) => liveEntry(e, recipesById));
                    const isDragging = i === dragIndex;
                    return React.createElement("div", { key: slot.dateStr, style: {
                            display: "flex", gap: 8, alignItems: "stretch",
                            transform: isDragging ? `translateY(${dragY}px) scale(1.02)` : "none",
                            transition: isDragging ? "none" : "transform 0.15s",
                            position: "relative", zIndex: isDragging ? 5 : 1,
                        } },
                        React.createElement("div", { style: {
                                flexShrink: 0, width: 46, borderRadius: 10, background: "#3A3F36", color: "#fff",
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6px 0",
                            } },
                            React.createElement("span", { style: { fontSize: 9.5, opacity: 0.75 } }, `${String(slot.date.getMonth() + 1).padStart(2, "0")}\u6708`),
                            React.createElement("span", { style: { fontSize: 19, fontWeight: 800, lineHeight: 1.1 } }, slot.date.getDate()),
                            React.createElement("span", { style: { fontSize: 9.5, opacity: 0.75 } }, `(${weekdayNames[slot.date.getDay()]})`)),
                        React.createElement("div", { style: {
                                flex: 1, minWidth: 0, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12,
                                padding: "10px 10px 10px 12px", display: "flex", alignItems: "center", gap: 8,
                                boxShadow: isDragging ? "0 6px 18px rgba(32,35,31,0.18)" : "none",
                            } },
                            entries.length === 0 ? React.createElement("span", { style: { flex: 1, fontSize: 13, color: COLORS.inkSoft, textAlign: "center" } }, "\u732E\u7ACB\u306F\u3042\u308A\u307E\u305B\u3093")
                                : React.createElement("div", { style: { flex: 1, display: "flex", gap: 6, overflow: "hidden" } },
                                    entries.map((e) => React.createElement("div", { key: e.recipeId, style: { width: 56, flexShrink: 0, textAlign: "center" } },
                                        React.createElement("div", { style: { width: 56, height: 56, borderRadius: 8, overflow: "hidden", background: COLORS.chipBg, marginBottom: 3 } },
                                            e.imageUrl && React.createElement("img", { src: e.imageUrl, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } })),
                                        React.createElement("span", { style: { fontSize: 10.5, color: COLORS.ink, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.25 } }, e.title)))),
                            React.createElement("div", {
                                onTouchStart: (e) => onHandleTouchStart(i, e), onTouchMove: onHandleTouchMove, onTouchEnd: onHandleTouchEnd,
                                style: { flexShrink: 0, color: COLORS.inkSoft, padding: 8, cursor: "grab", touchAction: "none", fontSize: 16, letterSpacing: -2 },
                            }, "\u2261")));
                })),
            React.createElement("div", { style: { height: 8 } }))),
            React.createElement("div", { style: {
                    flexShrink: 0, maxWidth: 480, width: "100%", margin: "0 auto",
                    padding: "14px 18px calc(16px + env(safe-area-inset-bottom,0px))", display: "flex", gap: 10,
                    background: COLORS.paper, borderTop: `1px solid ${COLORS.line}`,
                } },
                React.createElement("button", { onClick: onClose, style: {
                        flex: 1, border: `1px solid ${COLORS.line}`, background: "#fff", color: COLORS.inkSoft, borderRadius: 999,
                        padding: "13px 0", fontWeight: 700, fontSize: 14, cursor: "pointer",
                    } }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
                React.createElement("button", { onClick: () => onConfirm(dateSlots.map((slot, i) => ({ dateStr: slot.dateStr, entries: order[i] }))), style: {
                        flex: 2, border: "none", background: COLORS.accent, color: "#fff", borderRadius: 999,
                        padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: "pointer",
                    } }, "\u6C7A\u5B9A")));
}
// Simple search-and-pick list, scoped to one role's category pool (main or
// side dishes) — used to manually fill an empty slot rather than guessing.
function SlotPickerSheet({ recipes, pool, onClose, onPick }) {
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState(null);
    const inPool = useMemo(() => (pool ? recipes.filter((r) => pool.includes(r.dishCategory)) : recipes), [recipes, pool]);
    const availableCategories = useMemo(() => {
        const seen = new Set();
        const list = [];
        inPool.forEach((r) => {
            const cat = r.dishCategory || "その他";
            if (!seen.has(cat)) {
                seen.add(cat);
                list.push(cat);
            }
        });
        return list;
    }, [inPool]);
    const results = useMemo(() => {
        let list = categoryFilter ? inPool.filter((r) => (r.dishCategory || "その他") === categoryFilter) : inPool;
        if (query.trim()) {
            const q = query.trim().toLowerCase();
            list = list.filter((r) => (r.title || "").toLowerCase().includes(q));
        }
        return list.slice(0, 40);
    }, [inPool, categoryFilter, query]);
    return React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 96 } },
        React.createElement("div", { onClick: onClose, style: { position: "absolute", inset: 0, background: "rgba(32,35,31,0.32)" } }),
        React.createElement("div", { style: {
                position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 480, margin: "0 auto",
                background: COLORS.paper, borderRadius: "22px 22px 0 0", padding: "16px 18px calc(20px + env(safe-area-inset-bottom,0px))",
                maxHeight: "75vh", overflowY: "auto", boxShadow: "0 -8px 30px rgba(32,35,31,0.18)"
            } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } },
                React.createElement("span", { style: { fontSize: 14, fontWeight: 800, color: COLORS.ink } }, "\u30EC\u30B7\u30D4\u3092\u9078\u3076"),
                React.createElement("button", { onClick: onClose, "aria-label": "\u9589\u3058\u308B", style: { border: "none", background: "none", color: COLORS.inkSoft, display: "flex", padding: 4 } },
                    React.createElement(X, { size: 18 }))),
            React.createElement("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u30EC\u30B7\u30D4\u3092\u691C\u7D22", autoFocus: true, style: {
                    width: "100%", boxSizing: "border-box", border: `1px solid ${COLORS.line}`, borderRadius: 12,
                    padding: "10px 14px", fontSize: 15, marginBottom: 10, color: COLORS.ink, background: "#fff"
                } }),
            availableCategories.length > 1 && React.createElement("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginBottom: 10, WebkitOverflowScrolling: "touch" } },
                React.createElement("button", { onClick: () => setCategoryFilter(null), style: {
                        flexShrink: 0, fontSize: 12, padding: "6px 13px", borderRadius: 999, border: "none",
                        background: !categoryFilter ? COLORS.accent : COLORS.chipBg, color: !categoryFilter ? "#fff" : COLORS.inkSoft,
                        fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer",
                    } }, "\u3059\u3079\u3066"),
                availableCategories.map((cat) => React.createElement("button", { key: cat, onClick: () => setCategoryFilter(categoryFilter === cat ? null : cat), style: {
                        flexShrink: 0, fontSize: 12, padding: "6px 13px", borderRadius: 999, border: "none",
                        background: categoryFilter === cat ? COLORS.accent : COLORS.chipBg, color: categoryFilter === cat ? "#fff" : COLORS.inkSoft,
                        fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer",
                    } }, cat))),
            results.length === 0 && React.createElement("p", { style: { fontSize: 13, color: COLORS.inkSoft, padding: "12px 2px" } }, "\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F"),
            results.map((r) => React.createElement("button", { key: r.id, onClick: () => onPick(r), style: {
                    display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none",
                    background: "none", padding: "10px 2px", borderBottom: `1px solid ${COLORS.line}`, cursor: "pointer",
                } },
                React.createElement("div", { style: {
                        width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: "hidden", background: COLORS.chipBg,
                        display: "flex", alignItems: "center", justifyContent: "center"
                    } }, (r.imageUrl || r.imageUrl2) ? React.createElement("img", { src: r.imageUrl || r.imageUrl2, alt: "", style: { width: "100%", height: "100%", objectFit: "cover" } }) : React.createElement(BookOpen, { size: 16, color: COLORS.inkSoft })),
                React.createElement("span", { style: { fontSize: 14, fontWeight: 650, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.title || "(無題)")))));
}
export function CalendarView({ recipes, mealPlan, onAddEntry, onRemoveEntry, onSetDayEntries, onSelectRecipe, onBack, initialMode, onModeChange }) {
    const [mode, setModeRaw] = useState(initialMode || "plan"); // "plan" | "edit"
    // Report mode changes upward so the parent can remember which tab
    // ("献立をたてる" vs "献立編集") was active — this component gets
    // unmounted while viewing a recipe's detail page and remounted on
    // return, which would otherwise silently reset back to "plan".
    const setMode = (next) => {
        setModeRaw(next);
        onModeChange && onModeChange(next);
    };
    const [selected, setSelected] = useState(new Set());
    const recipesById = useMemo(() => Object.fromEntries(recipes.map((r) => [r.id, r])), [recipes]);
    const todayObj = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
    const [monthCursor, setMonthCursor] = useState(() => new Date(todayObj.getFullYear(), todayObj.getMonth(), 1));
    const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];
    const isCurrentMonth = monthCursor.getFullYear() === todayObj.getFullYear() && monthCursor.getMonth() === todayObj.getMonth();
    const todayDateStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, "0")}-${String(todayObj.getDate()).padStart(2, "0")}`;
    const editDayRefs = useRef({}); // dateStr -> DOM node, so the edit list can jump to today
    const [dateSwapFor, setDateSwapFor] = useState(null); // dateStr | null
    const [addSlotFor, setAddSlotFor] = useState(null); // { dateStr, pool } | null
    const scrolledRef = useRef(false); // only auto-scroll once per time the edit tab is opened
    const gridDays = useMemo(() => {
        const monthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
        const gridStart = new Date(monthStart);
        gridStart.setDate(gridStart.getDate() - gridStart.getDay());
        const monthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
        const gridEnd = new Date(monthEnd);
        gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));
        const all = [];
        const cursor = new Date(gridStart);
        while (cursor <= gridEnd) {
            const d = new Date(cursor);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            all.push({ date: d, dateStr, inMonth: d.getMonth() === monthCursor.getMonth(), isToday: d.getTime() === todayObj.getTime() });
            cursor.setDate(cursor.getDate() + 1);
        }
        const rows = [];
        for (let i = 0; i < all.length; i += 7)
            rows.push(all.slice(i, i + 7));
        return rows;
    }, [monthCursor, todayObj]);
    // Days *in this month* that already have a menu — what the edit screen lists.
    const editDays = useMemo(() => {
        const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
        const list = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const d = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day);
            const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const entries = Array.isArray(mealPlan[dateStr]) ? mealPlan[dateStr] : [];
            if (entries.length > 0)
                list.push({ date: d, dateStr, entries });
        }
        return list;
    }, [monthCursor, mealPlan]);
    // When switching into 献立編集, jump to today's section (or the
    // closest upcoming day with a menu) so it's not lost in a long list —
    // only once per visit to the tab, so it doesn't fight manual scrolling.
    useEffect(() => {
        if (mode !== "edit") {
            scrolledRef.current = false;
            return;
        }
        if (scrolledRef.current || editDays.length === 0)
            return;
        const target = editDays.find((d) => d.dateStr >= todayDateStr) || editDays[editDays.length - 1];
        const node = editDayRefs.current[target.dateStr];
        if (node) {
            node.scrollIntoView({ block: "start", behavior: "smooth" });
            scrolledRef.current = true;
        }
    }, [mode, editDays, todayDateStr]);
    function toggleDay(dateStr) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(dateStr))
                next.delete(dateStr);
            else
                next.add(dateStr);
            return next;
        });
    }
    function pickForDay(dateStr, avoidIds) {
        const already = new Set((Array.isArray(mealPlan[dateStr]) ? mealPlan[dateStr] : []).map((e) => e.recipeId));
        const pick = (pool) => {
            const fresh = recipes.filter((r) => pool.includes(r.dishCategory) && !already.has(r.id) && !avoidIds.has(r.id));
            const candidates = fresh.length > 0 ? fresh : recipes.filter((r) => pool.includes(r.dishCategory) && !already.has(r.id));
            if (candidates.length === 0)
                return null;
            return candidates[Math.floor(Math.random() * candidates.length)];
        };
        const main = pick(MAIN_CATEGORIES);
        if (main) {
            onAddEntry(dateStr, main);
            already.add(main.id);
        }
        const side = pick(SIDE_CATEGORIES);
        if (side) {
            onAddEntry(dateStr, side);
            already.add(side.id);
        }
        const soup = pick(SOUP_CATEGORIES);
        if (soup)
            onAddEntry(dateStr, soup);
        return { main, side, soup };
    }
    function handleGenerate() {
        if (selected.size === 0)
            return;
        const dateStrs = [...selected].sort();
        const history = []; // { date: Date, recipeId } — avoid repeats within ~3 weeks
        gridDays.flat().forEach(({ dateStr, date }) => {
            const entries = Array.isArray(mealPlan[dateStr]) ? mealPlan[dateStr] : [];
            entries.forEach((e) => history.push({ date, recipeId: e.recipeId }));
        });
        dateStrs.forEach((dateStr) => {
            const [y, m, d] = dateStr.split("-").map(Number);
            const date = new Date(y, m - 1, d);
            const avoidIds = new Set(history.filter((h) => Math.abs((date - h.date) / 86400000) <= 21).map((h) => h.recipeId));
            const { main, side, soup } = pickForDay(dateStr, avoidIds);
            if (main)
                history.push({ date, recipeId: main.id });
            if (side)
                history.push({ date, recipeId: side.id });
            if (soup)
                history.push({ date, recipeId: soup.id });
        });
        setSelected(new Set());
        setMode("edit");
    }
    function swapEntry(dateStr, oldRecipeId) {
        const entries = Array.isArray(mealPlan[dateStr]) ? mealPlan[dateStr] : [];
        const old = entries.find((e) => e.recipeId === oldRecipeId);
        if (!old)
            return;
        const pool = MAIN_CATEGORIES.includes(old.dishCategory) ? MAIN_CATEGORIES
            : SIDE_CATEGORIES.includes(old.dishCategory) ? SIDE_CATEGORIES
            : SOUP_CATEGORIES.includes(old.dishCategory) ? SOUP_CATEGORIES
                : null;
        if (!pool)
            return;
        const already = new Set(entries.map((e) => e.recipeId));
        const candidates = recipes.filter((r) => pool.includes(r.dishCategory) && !already.has(r.id));
        if (candidates.length === 0)
            return;
        const next = candidates[Math.floor(Math.random() * candidates.length)];
        onRemoveEntry(dateStr, oldRecipeId);
        onAddEntry(dateStr, next);
    }
    function deleteDay(dateStr) {
        const entries = Array.isArray(mealPlan[dateStr]) ? mealPlan[dateStr] : [];
        entries.forEach((e) => onRemoveEntry(dateStr, e.recipeId));
    }
    function handleDateSwapConfirm(assignments) {
        assignments.forEach(({ dateStr, entries }) => onSetDayEntries(dateStr, entries));
        setDateSwapFor(null);
    }
    const monthNav = React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
        React.createElement("button", { onClick: () => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1)), "aria-label": "\u524D\u306E\u6708", style: {
                border: "none", background: "#fff", borderRadius: "50%", width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(46,42,36,0.06)", cursor: "pointer"
            } }, React.createElement(ChevronLeft, { size: 16, color: COLORS.ink })),
        React.createElement("button", { onClick: () => setMonthCursor(new Date(todayObj.getFullYear(), todayObj.getMonth(), 1)), style: {
                border: "none", background: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
            } },
            React.createElement("span", { style: { fontSize: 16, fontWeight: 800, color: COLORS.ink } }, `${monthCursor.getFullYear()}\u5E74${monthCursor.getMonth() + 1}\u6708`),
            !isCurrentMonth && React.createElement("span", { style: { fontSize: 10.5, fontWeight: 700, color: COLORS.accent } }, "\u4ECA\u6708\u306B\u623B\u308B")),
        React.createElement("button", { onClick: () => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1)), "aria-label": "\u6B21\u306E\u6708", style: {
                border: "none", background: "#fff", borderRadius: "50%", width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(46,42,36,0.06)", cursor: "pointer"
            } }, React.createElement(ChevronLeft, { size: 16, color: COLORS.ink, style: { transform: "rotate(180deg)" } })));
    const tabs = React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 16, background: COLORS.chipBg, borderRadius: 999, padding: 3 } },
        React.createElement("button", { onClick: () => setMode("plan"), style: {
                flex: 1, border: "none", borderRadius: 999, padding: "9px 0", fontWeight: 700, fontSize: 13,
                background: mode === "plan" ? "#fff" : "none", color: mode === "plan" ? COLORS.ink : COLORS.inkSoft, cursor: "pointer",
                boxShadow: mode === "plan" ? "0 1px 3px rgba(46,42,36,0.1)" : "none",
            } }, "\u732E\u7ACB\u3092\u305F\u3066\u308B"),
        React.createElement("button", { onClick: () => setMode("edit"), style: {
                flex: 1, border: "none", borderRadius: 999, padding: "9px 0", fontWeight: 700, fontSize: 13,
                background: mode === "edit" ? "#fff" : "none", color: mode === "edit" ? COLORS.ink : COLORS.inkSoft, cursor: "pointer",
                boxShadow: mode === "edit" ? "0 1px 3px rgba(46,42,36,0.1)" : "none",
            } }, "\u732E\u7ACB\u7DE8\u96C6"));
    return React.createElement("div", { style: { paddingBottom: 24 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            React.createElement("button", { onClick: onBack, "aria-label": "\u623B\u308B", style: {
                    border: "none", background: "#fff", borderRadius: "50%", width: 38, height: 38,
                    display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(46,42,36,0.06)"
                } }, React.createElement(ChevronLeft, { size: 18, color: COLORS.ink })),
            React.createElement("h2", { style: { fontSize: 18, fontWeight: 800, margin: 0, color: COLORS.ink } }, "\u732E\u7ACB\u30AB\u30EC\u30F3\u30C0\u30FC")),
        tabs,
        monthNav,
        mode === "plan" && React.createElement(React.Fragment, null,
            React.createElement("p", { style: { fontSize: 12, color: COLORS.inkSoft, margin: "-6px 0 12px" } }, "\u4F5C\u308A\u305F\u3044\u65E5\u3092\u30BF\u30C3\u30D7\u3057\u3066\u9078\u3093\u3067\u304F\u3060\u3055\u3044\uFF08\u65E2\u306B\u732E\u7ACB\u304C\u3042\u308B\u65E5\u306F\u9078\u3079\u307E\u305B\u3093\uFF09"),
            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 } },
                weekdayNames.map((w, i) => React.createElement("div", { key: w, style: {
                        textAlign: "center", fontSize: 10.5, fontWeight: 700,
                        color: i === 0 ? COLORS.plum : i === 6 ? COLORS.accent : COLORS.inkSoft,
                    } }, w))),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 } },
                gridDays.map((row, wi) => React.createElement("div", { key: wi, style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 } },
                    row.map(({ date, dateStr, inMonth, isToday }) => {
                        const isSelected = selected.has(dateStr);
                        const hasEntries = Array.isArray(mealPlan[dateStr]) && mealPlan[dateStr].length > 0;
                        const disabled = !inMonth || hasEntries;
                        return React.createElement("button", { key: dateStr, disabled: disabled, onClick: () => toggleDay(dateStr), style: {
                                aspectRatio: "1", minHeight: 42, border: `1.5px solid ${isSelected ? COLORS.accent : isToday ? COLORS.sage : "transparent"}`,
                                borderRadius: "50%", background: isSelected ? COLORS.accent : "none", color: isSelected ? "#fff" : hasEntries ? COLORS.inkSoft : COLORS.ink,
                                fontSize: 13, fontWeight: isToday ? 800 : 600, cursor: disabled ? "default" : "pointer",
                                opacity: !inMonth ? 0.25 : hasEntries ? 0.4 : 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, position: "relative",
                            } },
                            date.getDate(),
                            hasEntries && React.createElement("span", { style: { position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: "50%", background: COLORS.sage } }));
                    })))),
            React.createElement("button", { disabled: selected.size === 0, onClick: handleGenerate, style: {
                    width: "100%", border: "none", background: selected.size === 0 ? COLORS.line : COLORS.accent, color: "#fff", borderRadius: 999,
                    padding: "13px 0", fontWeight: 800, fontSize: 14, cursor: selected.size === 0 ? "default" : "pointer",
                } }, selected.size === 0 ? "\u65E5\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044" : `${selected.size}\u65E5\u5206\u306E\u732E\u7ACB\u3092\u4F5C\u6210`)),
        mode === "edit" && React.createElement(React.Fragment, null,
            editDays.length === 0 && React.createElement("p", { style: { fontSize: 13.5, color: COLORS.inkSoft, textAlign: "center", padding: "30px 10px" } }, "\u3053\u306E\u6708\u306B\u306F\u307E\u3060\u732E\u7ACB\u304C\u3042\u308A\u307E\u305B\u3093\u3002\u300C\u732E\u7ACB\u3092\u305F\u3066\u308B\u300D\u304B\u3089\u4F5C\u6210\u3067\u304D\u307E\u3059"),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 22 } },
                editDays.map(({ date, dateStr, entries }) => {
                    const wLabel = weekdayNames[date.getDay()];
                    const isToday = dateStr === todayDateStr;
                    return React.createElement("div", { key: dateStr, ref: (node) => { editDayRefs.current[dateStr] = node; } },
                        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } },
                            React.createElement("span", { style: { fontSize: 15, fontWeight: 800, color: isToday ? COLORS.accent : COLORS.ink } }, `${isToday ? "\u4ECA\u65E5 " : ""}${date.getMonth() + 1}/${date.getDate()}(${wLabel})`),
                            React.createElement("button", { onClick: () => deleteDay(dateStr), style: {
                                    display: "flex", alignItems: "center", gap: 3, border: "none", background: "none",
                                    color: COLORS.plum, fontWeight: 700, fontSize: 11.5, cursor: "pointer", padding: "2px 4px",
                                } }, React.createElement(Trash2, { size: 12 }), "\u524A\u9664")),
                        React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 } },
                            (() => {
                                const mainEntry = entries.find((e) => MAIN_CATEGORIES.includes(e.dishCategory));
                                const sideEntry = entries.find((e) => SIDE_CATEGORIES.includes(e.dishCategory));
                                const soupEntry = entries.find((e) => SOUP_CATEGORIES.includes(e.dishCategory));
                                const freeEntry = entries.find((e) => e !== mainEntry && e !== sideEntry && e !== soupEntry);
                                return [
                                    mainEntry
                                        ? React.createElement(DishCard, { key: "main", entry: liveEntry(mainEntry, recipesById), roleLabel: "\u4E3B\u83DC", onSelectRecipe: onSelectRecipe, onRemoveEntry: (recipeId) => onRemoveEntry(dateStr, recipeId), onSwapEntry: (recipeId) => swapEntry(dateStr, recipeId) })
                                        : React.createElement(EmptySlotCard, { key: "main", roleLabel: "\u4E3B\u83DC", onAdd: () => setAddSlotFor({ dateStr, pool: MAIN_CATEGORIES }) }),
                                    sideEntry
                                        ? React.createElement(DishCard, { key: "side", entry: liveEntry(sideEntry, recipesById), roleLabel: "\u526F\u83DC", onSelectRecipe: onSelectRecipe, onRemoveEntry: (recipeId) => onRemoveEntry(dateStr, recipeId), onSwapEntry: (recipeId) => swapEntry(dateStr, recipeId) })
                                        : React.createElement(EmptySlotCard, { key: "side", roleLabel: "\u526F\u83DC", onAdd: () => setAddSlotFor({ dateStr, pool: SIDE_CATEGORIES }) }),
                                    soupEntry
                                        ? React.createElement(DishCard, { key: "soup", entry: liveEntry(soupEntry, recipesById), roleLabel: "\u30B9\u30FC\u30D7", onSelectRecipe: onSelectRecipe, onRemoveEntry: (recipeId) => onRemoveEntry(dateStr, recipeId), onSwapEntry: (recipeId) => swapEntry(dateStr, recipeId) })
                                        : React.createElement(EmptySlotCard, { key: "soup", roleLabel: "\u30B9\u30FC\u30D7", onAdd: () => setAddSlotFor({ dateStr, pool: SOUP_CATEGORIES }) }),
                                    freeEntry
                                        ? React.createElement(DishCard, { key: "free", entry: liveEntry(freeEntry, recipesById), onSelectRecipe: onSelectRecipe, onRemoveEntry: (recipeId) => onRemoveEntry(dateStr, recipeId) })
                                        : React.createElement(EmptySlotCard, { key: "free", roleLabel: "\u3082\u30461\u54C1", onAdd: () => setAddSlotFor({ dateStr, pool: null }) }),
                                ];
                            })()));
                }))),
        mode === "edit" && editDays.length > 0 && React.createElement("button", {
            onClick: () => setDateSwapFor((editDays.find((d) => d.dateStr >= todayDateStr) || editDays[0]).dateStr),
            style: {
                position: "fixed", right: "max(18px, calc(50% - 222px))", bottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
                zIndex: 40, display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 999,
                background: COLORS.ink, color: "#fff", padding: "12px 18px", fontWeight: 700, fontSize: 13,
                boxShadow: "0 4px 14px rgba(32,35,31,0.28)", cursor: "pointer",
            },
        }, React.createElement(CalendarIcon, { size: 15 }), "\u65E5\u4ED8\u5909\u66F4"),
        addSlotFor && React.createElement(SlotPickerSheet, {
            recipes: recipes,
            pool: addSlotFor.pool,
            onClose: () => setAddSlotFor(null),
            onPick: (recipe) => { onAddEntry(addSlotFor.dateStr, recipe); setAddSlotFor(null); },
        }),
        dateSwapFor && React.createElement(DateSwapSheet, {
            startDateStr: dateSwapFor,
            mealPlan: mealPlan,
            recipesById: recipesById,
            weekdayNames: weekdayNames,
            onClose: () => setDateSwapFor(null),
            onConfirm: handleDateSwapConfirm,
        }));
}
