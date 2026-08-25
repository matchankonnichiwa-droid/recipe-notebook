import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { FiPlus as Plus, FiSearch as Search, FiInstagram as Instagram, FiLink2 as Link2, FiTrash2 as Trash2, FiChevronLeft as ChevronLeft, FiChevronDown as ChevronDown, FiLoader as Loader2, FiClipboard as ClipboardPaste, FiX as X, FiCheck as Check, FiAlertCircle as AlertCircle, FiBookOpen as BookOpen, FiCamera as Camera, FiMinus as Minus, FiRotateCcw as RotateCcw, FiEdit2 as Edit2, FiSettings as Settings, FiBookmark as Bookmark, FiGrid as GridIcon, FiList as ListIcon, FiCalendar as CalendarIcon, FiArrowUp as ArrowUp, } from "react-icons/fi";
// tesseract.js is a large OCR library (WASM engine + language data) that's
// only needed for the "screenshot" recipe-import path. Importing it
// statically here would force every app launch to download and parse it
// before anything else can run, even for people who never use OCR — so it's
// loaded on demand instead, right where createWorker() is actually called.
// Shared family sync: recipes and the shopping list are stored in Firebase
// Realtime Database so multiple people (e.g. spouses) using this same app
// see each other's changes live. There's no per-person login — everyone
// pointed at this Firebase project shares one recipe notebook.
// Loaded via the official compat CDN <script> tags in index.html (see
// window.firebase below) rather than an ES module import, since esm.sh has
// known reliability issues resolving Firebase's modular subpath exports.
const firebaseConfig = {
    apiKey: "AIzaSyAUlb_bzwg4IX8UByKtPeIxBzZ4X7uKLnE",
    authDomain: "recipe-eb46b.firebaseapp.com",
    databaseURL: "https://recipe-eb46b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "recipe-eb46b",
    storageBucket: "recipe-eb46b.firebasestorage.app",
    messagingSenderId: "916460161486",
    appId: "1:916460161486:web:49498b636dc191b770839f",
};
window.firebase.initializeApp(firebaseConfig);
const rtdb = window.firebase.database();
// Shared family sync: everyone using this app points at the same Firebase
// project and sees the same recipes/shopping list — there's no per-person
// login, so uref() is just a thin passthrough to rtdb.ref().
function uref(path) {
    return rtdb.ref(path);
}
// localStorage is kept as a fallback cache only (used for instant first
// paint before the Firebase listener responds, and so the app still shows
// something if the network is briefly unavailable).
const storage = {
    async get(key) {
        const raw = localStorage.getItem(key);
        return raw === null ? null : { key, value: raw };
    },
    async set(key, value) {
        localStorage.setItem(key, value);
        return { key, value };
    },
};
function toHalfWidthDigits(str) {
    return str
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/／/g, "/")
        .replace(/[～〜]/g, "~");
}
function roundNice(n) {
    if (!isFinite(n))
        return n;
    const r2 = Math.round(n * 100) / 100;
    if (Math.abs(r2 - Math.round(r2)) < 0.01)
        return Math.round(r2);
    return Math.round(n * 10) / 10;
}
// Scales the first number (or a/b fraction, or a~b range) found in a free-text
// amount string, leaving everything else (units, "ぐらい", etc.) untouched.
// Amounts with no parseable number (e.g. "少々", "適量") are returned as-is.
function scaleAmountText(amount, ratio) {
    if (!amount || !ratio || ratio === 1)
        return amount;
    const norm = toHalfWidthDigits(amount);
    const re = /(\d+(?:\.\d+)?)(\s*([\/~])\s*(\d+(?:\.\d+)?))?/;
    const m = norm.match(re);
    if (!m)
        return amount;
    const a = parseFloat(m[1]);
    const sep = m[3];
    const b = m[4] !== undefined ? parseFloat(m[4]) : null;
    let replacement;
    if (sep === "/" && b) {
        replacement = `${roundNice((a / b) * ratio)}`;
    }
    else if (sep === "~" && b !== null) {
        replacement = `${roundNice(a * ratio)}~${roundNice(b * ratio)}`;
    }
    else {
        replacement = `${roundNice(a * ratio)}`;
    }
    return norm.slice(0, m.index) + replacement + norm.slice(m.index + m[0].length);
}
function parseBaseServings(text) {
    if (!text || text.length > 20)
        return null;
    const norm = toHalfWidthDigits(text);
    const m = norm.match(/(\d+(?:\.\d+)?)/);
    if (!m)
        return null;
    return {
        value: parseFloat(m[1]),
        prefix: norm.slice(0, m.index),
        suffix: norm.slice((m.index || 0) + m[0].length),
    };
}
// Splits a trailing "(グループ名)" tag off an ingredient name, e.g.
// "しょうゆ(下味)" -> { base: "しょうゆ", group: "下味" }. Used to render
// ingredients grouped under their original recipe sub-sections.
// Only recognizes known section labels (below) as a group — otherwise a
// legitimate ingredient note like "ネギ(できれば九条ネギ)" would be
// mistaken for a group header.
function splitNameGroup(name) {
    const m = (name || "").match(/^(.*)\(([^()]+)\)$/);
    if (!m)
        return { base: name || "", group: null };
    const label = m[2].trim();
    // Accept either a real descriptive group name (下味, 合わせ調味料, ...) or a
    // bare reference marker some sites use instead (A, B, ①, 1, etc.) — the
    // latter has no "name" to speak of, but the person still wants those
    // ingredients visually clustered together rather than shown flat.
    const isBareMarker = /^[A-Za-zＡ-Ｚａ-ｚ]{1,2}$|^[①-⑳]$|^\d{1,2}$/.test(label);
    if (matchesKnownGroup(label) || isBareMarker) {
        return { base: m[1].trim(), group: label };
    }
    return { base: name || "", group: null };
}
const FONT_LINKS = [
    "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap",
];
function useGoogleFonts() {
    useEffect(() => {
        const links = FONT_LINKS.map((href) => {
            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = href;
            document.head.appendChild(l);
            return l;
        });
        return () => links.forEach((l) => l.remove());
    }, []);
}
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
function detectSource(url) {
    if (!url)
        return "other";
    if (/instagram\.com/i.test(url))
        return "instagram";
    if (/x\.com|twitter\.com/i.test(url))
        return "x";
    if (/youtube\.com|youtu\.be/i.test(url))
        return "youtube";
    return "other";
}
const SOURCE_LABELS = {
    instagram: "Instagram",
    x: "X",
    youtube: "YouTube",
    other: "その他",
};
function SourceBadge({ type }) {
    const map = {
        instagram: { label: "Instagram", color: COLORS.plum },
        x: { label: "X", color: COLORS.ink },
        youtube: { label: "YouTube", color: "#C4302B" },
        other: { label: "その他", color: COLORS.sage },
    };
    const { label, color } = map[type] || map.other;
    return (React.createElement("span", { style: {
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            background: color,
            borderRadius: 999,
            padding: "2px 9px",
            letterSpacing: 0.3,
            fontFamily: "'Noto Sans JP', sans-serif",
        } }, label));
}
// Punch-hole notebook spine, purely decorative signature element
function Spine() {
    return (React.createElement("div", { "aria-hidden": "true", style: {
            width: 22,
            flexShrink: 0,
            backgroundColor: COLORS.sage,
            backgroundImage: `radial-gradient(circle, ${COLORS.paper} 5px, transparent 5.5px)`,
            backgroundSize: "100% 30px",
            backgroundRepeat: "repeat-y",
            backgroundPosition: "center 14px",
            borderRadius: "10px 0 0 10px",
        } }));
}
const DISH_CATEGORIES = ["肉料理", "魚介料理", "野菜料理", "ご飯もの", "麺類", "スープ・鍋", "デザート", "パン", "その他"];
const CATEGORY_ICONS = {
    肉料理: "🥩",
    パン: "🍞",
    魚介料理: "🐟",
    野菜料理: "🥬",
    ご飯もの: "🍚",
    麺類: "🍜",
    "スープ・鍋": "🍲",
    デザート: "🍰",
    その他: "📖",
};
const MEAT_ICONS = { 鶏肉: "🐔", 豚肉: "🐖", 牛肉: "🐄", その他: "🍖" };
const MEAT_TYPES = ["鶏肉", "豚肉", "牛肉", "ひき肉", "その他"];
const NOODLE_TYPES = ["うどん", "そば", "ラーメン", "パスタ", "その他"];
const VEG_TYPES = ["サラダ", "炒め物", "和え物・おひたし", "煮物", "漬け物", "その他"];
function inferDishCategory(title, ingredients) {
    const t = title || "";
    const base = { meatType: null, noodleType: null, vegType: null };
    if (/麺|パスタ|うどん|そば|ラーメン|焼きそば/.test(t)) {
        let noodleType = "その他";
        if (/うどん/.test(t))
            noodleType = "うどん";
        else if (/ラーメン/.test(t))
            noodleType = "ラーメン";
        else if (/そば/.test(t))
            noodleType = "そば";
        else if (/パスタ|スパゲ/.test(t))
            noodleType = "パスタ";
        return { ...base, dishCategory: "麺類", noodleType };
    }
    if (/パン|食パン|ベーグル|フォカッチャ|バゲット|ロール(?!キャベツ)/.test(t))
        return { ...base, dishCategory: "パン" };
    if (/ご飯|ごはん|丼|オムライス|チャーハン|カレー|寿司|リゾット|おにぎり/.test(t))
        return { ...base, dishCategory: "ご飯もの" };
    if (/スープ|汁|鍋|シチュー/.test(t))
        return { ...base, dishCategory: "スープ・鍋" };
    if (/ケーキ|クッキー|スイーツ|デザート|プリン|アイス|タルト|マフィン/.test(t))
        return { ...base, dishCategory: "デザート" };
    const names = (ingredients || []).map((i) => i.name || "").join(" ");
    const vegKeywords = /玉ねぎ|たまねぎ|人参|にんじん|じゃがいも|キャベツ|トマト|きゅうり|ねぎ|ピーマン|なす|大根|もやし|しめじ|きのこ|にんにく|生姜|しょうが|ほうれん草|レタス|白菜|小松菜|水菜|ブロッコリー|カリフラワー|アスパラ|オクラ|ズッキーニ|かぼちゃ|ごぼう|れんこん|さつまいも|里芋|さといも|セロリ|大葉|みょうが|かぶ|山芋|やまいも|パプリカ|とうもろこし|枝豆|そら豆|きぬさや|さやいんげん|ゴーヤ/;
    if (/鶏肉|鶏|鳥/.test(names))
        return { ...base, dishCategory: "肉料理", meatType: "鶏肉" };
    if (/豚肉|豚/.test(names))
        return { ...base, dishCategory: "肉料理", meatType: "豚肉" };
    if (/牛肉|牛/.test(names))
        return { ...base, dishCategory: "肉料理", meatType: "牛肉" };
    if (/ひき肉|挽き肉|合いびき/.test(names))
        return { ...base, dishCategory: "肉料理", meatType: "ひき肉" };
    if (/ウインナー|ソーセージ|ベーコン|ハム|肉/.test(names))
        return { ...base, dishCategory: "肉料理", meatType: "その他" };
    if (/魚|えび|海老|いか|イカ|たこ|タコ|貝|鮭|さけ|まぐろ|ツナ|しらす/.test(names))
        return { ...base, dishCategory: "魚介料理" };
    if (vegKeywords.test(names)) {
        let vegType = "その他";
        if (/サラダ/.test(t))
            vegType = "サラダ";
        else if (/炒め/.test(t))
            vegType = "炒め物";
        else if (/和え|おひたし/.test(t))
            vegType = "和え物・おひたし";
        else if (/煮/.test(t))
            vegType = "煮物";
        else if (/漬け/.test(t))
            vegType = "漬け物";
        return { ...base, dishCategory: "野菜料理", vegType };
    }
    return { ...base, dishCategory: "その他" };
}
const APPLIANCES = ["エアフライヤー", "ホットクック", "オーブン", "炊飯器", "圧力鍋", "電子レンジ"];
const APPLIANCE_ICONS = {
    エアフライヤー: "🍟",
    ホットクック: "🍳",
    オーブン: "🔥",
    炊飯器: "🍚",
    圧力鍋: "🫕",
    電子レンジ: "📡",
};
// Detects which cooking appliance a recipe uses from its title/steps/memo,
// so recipes can be filtered into an appliance tab (e.g. air fryer vs. Hot
// Cook) separately from the dish-genre grouping.
function inferAppliance(text) {
    if (!text)
        return null;
    if (/エアフライヤー|ノンフライヤー/.test(text))
        return "エアフライヤー";
    if (/ホットクック/.test(text))
        return "ホットクック";
    if (/圧力鍋/.test(text))
        return "圧力鍋";
    if (/炊飯器/.test(text))
        return "炊飯器";
    if (/オーブン/.test(text))
        return "オーブン";
    if (/電子レンジ|(?<!オ)レンジで|(?<!オ)レンジ加熱|\d+[wW](?:で|の)/.test(text))
        return "電子レンジ";
    return null;
}
// Prefers Claude's own classification (it understands the whole recipe, not
// just keyword matches) but falls back to the local heuristic if Claude
// wasn't used or returned something outside our known categories.
function resolveClassification(structured, classifyText, ingredients, applianceText, usedClaude) {
    const heuristic = inferDishCategory(classifyText, ingredients);
    const dishCategory = usedClaude && DISH_CATEGORIES.includes(structured?.dishCategory) ? structured.dishCategory : heuristic.dishCategory;
    let meatType = null;
    if (dishCategory === "肉料理") {
        meatType = usedClaude && MEAT_TYPES.includes(structured?.meatType) ? structured.meatType : (heuristic.dishCategory === "肉料理" ? heuristic.meatType : "その他");
    }
    let noodleType = null;
    if (dishCategory === "麺類") {
        noodleType = usedClaude && NOODLE_TYPES.includes(structured?.noodleType) ? structured.noodleType : (heuristic.dishCategory === "麺類" ? heuristic.noodleType : "その他");
    }
    let vegType = null;
    if (dishCategory === "野菜料理") {
        vegType = usedClaude && VEG_TYPES.includes(structured?.vegType) ? structured.vegType : (heuristic.dishCategory === "野菜料理" ? heuristic.vegType : "その他");
    }
    const appliance = usedClaude
        ? (APPLIANCES.includes(structured?.appliance) ? structured.appliance : null)
        : inferAppliance(applianceText);
    return { dishCategory, meatType, noodleType, vegType, appliance };
}
const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const BULLET_CHARS = ["●", "・", "-", "*", "■", "◆", "〇", "○", "◎", "▽", "▼", "▲", "▶", "□", "☆"];
const GROUP_LETTER_RE = /^[A-ZＡ-Ｚ]$/;
function stripLeadingBullet(line) {
    let s = line;
    for (const b of BULLET_CHARS) {
        if (s.startsWith(b)) {
            s = s.slice(b.length).trim();
            break;
        }
    }
    return s;
}
function extractGroupLetter(line) {
    const first = line[0];
    if (first && GROUP_LETTER_RE.test(first) && line.length > 1) {
        return { group: first, rest: line.slice(1) };
    }
    return { group: null, rest: line };
}
function splitNameAmount(line) {
    const m = line.match(/^(.+?)[・…:：.]{2,}\s*(.+)$/);
    if (m)
        return { name: m[1].trim(), amount: m[2].trim() };
    return { name: line.trim(), amount: "" };
}
const SUFFIX_UNIT_RE = "(?:g|kg|ml|l|cc|個|本|枚|切れ|片|株|玉|房|尾|匹|杯|袋|束|缶|丁|かけ|つまみ)";
const PREFIX_UNIT_RE = "(?:大さじ|小さじ|カップ)";
const AMOUNT_KEYWORD_RE = "(?:ひとつまみ|各少々|各適量|少々|適量)";
const AMOUNT_RE = `(?:\\d+(?:[.\\/]\\d+)?\\s*${SUFFIX_UNIT_RE}|${PREFIX_UNIT_RE}\\s*\\d+(?:[.\\/]\\d+)?|${AMOUNT_KEYWORD_RE})`;
// Matches recipe-site style ingredient lines where the name and amount sit on
// the same line with no bullet/dot separator, e.g. "鶏もも肉　300g" or
// "しょうゆ　大さじ1" or "塩　ひとつまみ" — common when OCR'ing a screenshot
// from a recipe site.
function extractTableIngredient(rawLine) {
    const line = toHalfWidthDigits(rawLine).trim();
    if (!line)
        return null;
    const m = line.match(new RegExp(`^(.+?)(${AMOUNT_RE})$`));
    if (m && m[1].trim())
        return { name: m[1].trim(), amount: m[2].trim() };
    return null;
}
// Common recipe sub-section labels. Using a whitelist (rather than "any short
// kana/kanji line") avoids OCR garbage being misread as a group header.
const KNOWN_GROUP_HEADERS = [
    "下味", "衣", "付け合せ", "付け合わせ", "タレ", "ソース", "具", "トッピング",
    "生地", "仕上げ", "つけだれ", "漬けだれ", "下ごしらえ", "ドレッシング", "あん", "具材",
    "合わせ調味料", "調味料", "合わせだれ", "煮汁", "つけ汁", "スープ", "衣液", "バッター液",
];
// Recipe sites often name a sub-section with a specific prefix attached to a
// generic category word, e.g. "ねぎ塩だれ" (ねぎ塩 + だれ), "ごまだれ",
// "甘辛あん" — these aren't literally in KNOWN_GROUP_HEADERS above but should
// still be recognized as group headers. Match by suffix instead, capped at a
// short length so an ordinary sentence that happens to end in one of these
// words isn't mistaken for a heading.
const KNOWN_GROUP_SUFFIXES = ["だれ", "ダレ", "ソース", "あん", "アン", "スープ", "ペースト", "ドレッシング"];
const MAX_GROUP_HEADER_LENGTH = 20;
function matchesKnownGroup(label) {
    if (KNOWN_GROUP_HEADERS.includes(label))
        return true;
    if (label.length > MAX_GROUP_HEADER_LENGTH)
        return false;
    return KNOWN_GROUP_SUFFIXES.some((suf) => label.length > suf.length && label.endsWith(suf));
}
// Recipe sites often prefix a group heading with a reference letter, e.g.
// "（A）合わせ調味料" or "(A) 下味" — strip that before matching against the
// whitelist above, so the letter itself isn't treated as part of the name.
const GROUP_LETTER_PREFIX_RE = /^[（(]\s*[A-ZＡ-Ｚ0-9０-９]\s*[）)]\s*/;
// SNS captions often wrap a whole heading in a decorative bracket pair, e.g.
// "【ガーリックハニーマスタードソース】" or "「タレ」" — strip the outer
// pair (only when it wraps the *entire* line) before matching.
const GROUP_WRAPPER_RE = /^[【\[「『]\s*(.+?)\s*[】\]」』]$/;
function stripGroupDecoration(line) {
    let s = line.trim().replace(GROUP_LETTER_PREFIX_RE, "").trim();
    const wrapped = s.match(GROUP_WRAPPER_RE);
    if (wrapped)
        s = wrapped[1].trim();
    return s;
}
function isGroupHeaderLine(line) {
    return matchesKnownGroup(stripGroupDecoration(line));
}
function groupHeaderName(line) {
    return stripGroupDecoration(line);
}
// OCR (and some copy-pastes) can insert stray spaces in the middle of
// Japanese words/units — e.g. "小さ じ 1" instead of "小さじ1", or
// "付け 合せ" instead of "付け合せ". Since standard Japanese text doesn't
// use spaces between words, it's safe to strip all intra-line whitespace
// before parsing; this fixes both broken unit words and broken headers.
function collapseIntraLineSpaces(text) {
    return text
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t　]+/g, ""))
        .join("\n");
}
// Screenshot chrome, ads, and manga-promo text that sometimes gets OCR'd
// along with the recipe itself. Filtered out before parsing.
function isNoiseLine(line) {
    if (/kurashiru\.com/i.test(line))
        return true;
    if (/^\d{1,2}:\d{2}/.test(line))
        return true; // phone status bar clock
    if (/^[|｜\-ー_=～〜\s]+$/.test(line))
        return true; // stray symbol-only lines
    if (/マガポケ|講談社|全話無料|安全に楽し|買い物|クーポン|フリマ|YAHOO/i.test(line))
        return true;
    if (/^[『「].*[』」]?/.test(line) && line.length < 30)
        return true; // manga title quote
    // Common recipe-app bottom nav / floating UI labels that appear on every screenshot
    if (/^(さがす|きろく|New|もっと見る)$/i.test(line.trim()))
        return true;
    if (/レシピを並べて見る/.test(line))
        return true;
    // Common Instagram/SNS caption boilerplate — calls to action, not recipe content
    if (/プロフィール(の(リンク|欄))?|保存はこちら|保存して|フォロー(お願い|よろしく)|コメント欄|いいねお願い|シェアお願い/.test(line))
        return true;
    if (/^#\S+(\s*#\S+)*$/.test(line.trim()))
        return true; // hashtag-only line
    // Reader-proxy / login-wall boilerplate that shows up when a site (e.g.
    // Instagram) blocks unauthenticated scraping — these are page furniture,
    // not recipe content. Matched after collapseIntraLineSpaces has already
    // stripped internal spaces, so e.g. "URL Source:" becomes "URLSource:".
    if (/^(URLSource:|MarkdownContent:|Title:|LogIn|SignUp|Nevermind)$/i.test(line.trim()))
        return true;
    return false;
}
// Recipe-site step numbers are small circled-digit icons (①②③) that OCR
// frequently misreads — often as "の", sometimes as "(3)". This matches all
// the marker styles we've seen in practice.
function isStepMarkerLine(line) {
    if (/人分|人前/.test(line))
        return false; // e.g. "2、3人分" is a serving count, not a step marker
    if (CIRCLED_DIGITS.includes(line[0]))
        return true;
    const normalized = toHalfWidthDigits(line);
    if (/^\d+[.)]/.test(normalized))
        return true;
    if (/^\(\d+\)/.test(normalized))
        return true;
    if (line[0] === "の" && line.length > 1)
        return true; // common OCR misread of ①②③
    return false;
}
function stripStepMarker(line) {
    if (CIRCLED_DIGITS.includes(line[0]))
        return line.slice(1);
    const normalized = toHalfWidthDigits(line);
    let m = normalized.match(/^\d+[.)]/);
    if (m)
        return normalized.slice(m[0].length);
    m = normalized.match(/^\(\d+\)/);
    if (m)
        return normalized.slice(m[0].length);
    if (line[0] === "の")
        return line.slice(1);
    return line;
}
// Strips markdown image/link syntax and bare URLs. Page text fetched via a
// reader proxy comes back as markdown, and embedded images render as
// "![alt](url)" inline in the flow of text — without stripping this, a
// recipe step like "①全てを混ぜる" ends up polluted with the raw image
// markdown and URL that followed it in the source markdown.
function stripMarkdownNoise(text) {
    return text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // markdown images
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // markdown links -> keep visible text
        .replace(/https?:\/\/\S+/g, " ") // bare URLs
        .replace(/\[\s*\]/g, " ") // leftover empty brackets
        .replace(/[ \t]{2,}/g, " ");
}
// Pulls out a hero image URL from the page's markdown. Prefers the image
// positioned right before the "材料" heading — on SNS posts, an earlier
// image is often the poster's profile/brand logo rather than the dish
// photo, while the actual food photo typically sits just above the recipe
// text. Falls back to the first image found if there's no 材料 heading.
// Skips icon/logo-looking filenames where recognizable.
// For photo posts, Jina's reader typically emits the hero image as a
// markdown image link (![alt](url)). For video posts (e.g. Instagram
// Reels), there's no such link — but Instagram (and most video hosts)
// still expose a poster/cover frame (usually the video's first frame or
// very close to it) via og:video:image / og:image style metadata, or a
// plain thumbnail URL mentioned in the fetched text. We look for that as
// a fallback so video posts still get a representative photo attached.
function extractHeroImageUrl(rawText) {
    const isUsable = (url) => !/logo|favicon|icon|avatar|sprite/i.test(url);
    const materialIdx = rawText.search(/材料/);
    // Some sites (e.g. オレンジページ) place a "レシピを作った人" author-bio
    // block — with the author's face photo — between the dish photo and
    // the 材料 heading. Scanning "last image before 材料" then grabs the
    // bio photo instead of the actual dish photo. Cut the search window off
    // at whichever comes first: the ingredients heading, or an author-bio
    // marker, so a bio photo appearing in between never gets picked.
    const bioIdx = rawText.search(/レシピを作った人|この記事(?:を書いた人|の著者)|料理研究家|profile\s*:/i);
    let cutoff = materialIdx;
    if (bioIdx !== -1 && (cutoff === -1 || bioIdx < cutoff))
        cutoff = bioIdx;
    const matches = [...rawText.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)];
    if (cutoff !== -1) {
        const before = matches.filter((m) => m.index < cutoff && isUsable(m[1]));
        if (before.length)
            return before[before.length - 1][1];
    }
    const anyUsable = matches.find((m) => isUsable(m[1]));
    if (anyUsable)
        return anyUsable[1];
    // Fallback: no markdown image link found (common for video posts) —
    // look for a thumbnail/poster/cover URL mentioned as plain text.
    const posterMatch = rawText.match(/(?:thumbnail|poster|cover)[^\n]{0,60}?(https?:\/\/[^\s")]+\.(?:jpg|jpeg|png|webp)[^\s")]*)/i);
    if (posterMatch && isUsable(posterMatch[1]))
        return posterMatch[1];
    // Instagram/Facebook's CDN serves photos from scontent*.cdninstagram.com
    // or *.fbcdn.net, often without a file extension — the generic
    // extension-based checks above miss these. Collect every match rather
    // than just the first: the earliest one on an Instagram page is usually
    // the account's own small profile-picture icon (shown next to the
    // username), not the post's actual photo, so prefer the last candidate
    // and skip anything that looks like a small square avatar by its size
    // hint in the URL (e.g. s150x150, 150x150).
    const igCdnMatches = [...rawText.matchAll(/https?:\/\/[^\s")]*(?:cdninstagram\.com|fbcdn\.net)[^\s")]*/gi)]
        .map((m) => m[0])
        .filter((url) => isUsable(url) && !/(?:^|[^0-9])(?:1[0-6]?[0-9]|[1-9][0-9])x(?:1[0-6]?[0-9]|[1-9][0-9])(?:[^0-9]|$)/.test(url));
    if (igCdnMatches.length > 0)
        return igCdnMatches[igCdnMatches.length - 1];
    // Last resort: any bare image URL in the text at all.
    const bareImage = rawText.match(/https?:\/\/[^\s")]+\.(?:jpg|jpeg|png|webp)[^\s")]*/i);
    if (bareImage && isUsable(bareImage[0]))
        return bareImage[0];
    return null;

}
// Extracts the recipe title from the fetched page text. The Jina reader
// proxy prefixes its markdown output with a "Title: ..." metadata line,
// which is the most reliable source — falls back to the first markdown
// heading if that's missing. Trims common site-name suffixes like
// " | クックパッド" or " - サイト名".
function extractPageTitle(rawText) {
    let candidate = null;
    const titleLine = rawText.match(/^Title:\s*(.+)$/m);
    if (titleLine) {
        candidate = titleLine[1];
    }
    else {
        const heading = rawText.match(/^#\s+(.+)$/m);
        if (heading)
            candidate = heading[1];
    }
    if (!candidate)
        return "";
    candidate = candidate.split(/\s*[|｜]\s*/)[0];
    candidate = candidate.split(/\s+-\s+(?=[^-]*$)/)[0];
    return candidate.trim();
}
// Rule-based parser for common Japanese recipe caption formats
// (●/・ bullet ingredients, A/B/C group letters, ①②③ numbered steps, ★/※ tip lines)
// as well as recipe-site "table" style ingredient lists (name + amount, no bullet).
// Classifies each line independently rather than assuming a fixed
// "ingredients section, then steps section" order, since OCR'ing several
// screenshots at once can interleave sections in any order.
// Runs entirely client-side — no network call, so it always works.
function parseCaptionHeuristic(rawText) {
    const cleanedText = collapseIntraLineSpaces(stripMarkdownNoise(rawText));
    const lines = cleanedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    // Prefer a serving-count mention found shortly after the "材料" heading —
    // a parenthetical match anywhere in the text is unreliable, since posts
    // often also state per-serving nutrition info like "(1人分 150kcal)"
    // elsewhere, which isn't the recipe's actual total serving count.
    let servings = "";
    const materialIdx = cleanedText.search(/材料/);
    if (materialIdx !== -1) {
        const nearby = toHalfWidthDigits(cleanedText.slice(materialIdx, materialIdx + 150));
        const nearMatch = nearby.match(/約?\d+(?:[~\-]\d+)?人[分前](?!あたり)/);
        if (nearMatch)
            servings = nearMatch[0].replace(/^約/, "");
    }
    if (!servings) {
        const servingsMatch = cleanedText.match(/[（(]([^（）()]*?(?:人分|人前)(?!あたり)[^（）()]*?)[）)]/);
        if (servingsMatch && servingsMatch[1].length <= 20)
            servings = servingsMatch[1];
    }
    // Lines that repeat 3+ times identically across the whole batch are very
    // likely fixed app chrome (nav bars, floating buttons) that got OCR'd on
    // every screenshot, rather than actual recipe content.
    const lineCounts = {};
    lines.forEach((l) => {
        lineCounts[l] = (lineCounts[l] || 0) + 1;
    });
    const isRepeatedChrome = (line) => line.length <= 20 && lineCounts[line] >= 3;
    const ingredients = [];
    const steps = [];
    let currentGroup = null;
    let currentStep = "";
    let inSteps = false;
    const flushStep = () => {
        if (currentStep.trim())
            steps.push(currentStep.trim());
        currentStep = "";
    };
    const SNS_FOOTER_MARKER = /Log\s*in\s*to\s*like\s*or\s*comment|More\s*posts\s*from|VerifiedEnglish|InstagramfromMeta|©\s*20\d\d\s*Instagram|栄養成分|投稿は許可をいただいて/i;
    for (const raw of lines) {
        if (SNS_FOOTER_MARKER.test(raw))
            break; // everything past this is comments/footer, not the post
        if (isNoiseLine(raw) || isRepeatedChrome(raw))
            continue;
        if (/まとめると/.test(raw)) {
            flushStep();
            inSteps = false;
            continue;
        }
        const strippedForHeading = stripLeadingBullet(raw);
        if (/^材料/.test(strippedForHeading)) {
            flushStep();
            inSteps = false;
            continue;
        }
        if (/^手順|^作り方/.test(strippedForHeading)) {
            flushStep();
            inSteps = true;
            continue;
        }
        let line = stripLeadingBullet(raw);
        const { group, rest } = extractGroupLetter(line);
        line = rest;
        if (/[・…:：.]{2,}/.test(line)) {
            const { name, amount } = splitNameAmount(line);
            if (name) {
                flushStep();
                inSteps = false;
                const g = group || currentGroup;
                ingredients.push({ name: g ? `${name}(${g})` : name, amount });
                continue;
            }
        }
        const tableMatch = extractTableIngredient(raw);
        if (tableMatch) {
            flushStep();
            inSteps = false;
            ingredients.push({
                name: currentGroup ? `${tableMatch.name}(${currentGroup})` : tableMatch.name,
                amount: tableMatch.amount,
            });
            continue;
        }
        if (isStepMarkerLine(raw)) {
            flushStep();
            currentStep = stripStepMarker(raw);
            inSteps = true;
            continue;
        }
        if (isGroupHeaderLine(raw)) {
            currentGroup = groupHeaderName(raw);
            continue;
        }
        if (inSteps) {
            currentStep += raw;
        }
    }
    flushStep();
    const seenIngredients = new Set();
    const dedupedIngredients = ingredients.filter((ing) => {
        const key = `${ing.name}|${ing.amount}`;
        if (seenIngredients.has(key))
            return false;
        seenIngredients.add(key);
        return true;
    });
    const dedupedSteps0 = steps.filter((s, i) => s !== steps[i - 1]);
    // Some source pages (Instagram reels especially) include the full
    // caption twice in the fetched markdown — e.g. an og:description meta
    // block followed by the same text again in the visible page body. That
    // produces steps [1,2,3,1,2,3] rather than adjacent duplicates, which
    // the filter above doesn't catch. Detect a whole-list repeat (the
    // second half exactly matching the first) and drop the repeat.
    let dedupedSteps = dedupedSteps0;
    if (dedupedSteps0.length >= 2 && dedupedSteps0.length % 2 === 0) {
        const half = dedupedSteps0.length / 2;
        const firstHalf = dedupedSteps0.slice(0, half);
        const secondHalf = dedupedSteps0.slice(half);
        if (firstHalf.every((s, i) => s === secondHalf[i])) {
            dedupedSteps = firstHalf;
        }
    }
    const memoLines = lines
        .filter((l) => l.startsWith("★") || l.startsWith("※"))
        .map((l) => l.replace(/^[★※]\s*/, ""));
    const inferred = inferDishCategory(cleanedText.slice(0, 2000), dedupedIngredients);
    return {
        title: "",
        servings,
        ingredients: dedupedIngredients,
        steps: dedupedSteps,
        tags: [],
        memo: memoLines.join("\n"),
        dishCategory: inferred.dishCategory,
        meatType: inferred.meatType,
        noodleType: inferred.noodleType,
        vegType: inferred.vegType,
    };
}
// Computes Otsu's threshold: the gray-level that best splits a bimodal
// histogram (here: dark text vs. light background) into two classes.
function otsuThreshold(hist, total) {
    let sum = 0;
    for (let t = 0; t < 256; t++)
        sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let threshold = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0)
            continue;
        const wF = total - wB;
        if (wF === 0)
            break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween >= maxVar) {
            maxVar = varBetween;
            threshold = t;
        }
    }
    return threshold;
}
// Grayscale + contrast stretch, then binarize (pure black/white) using an
// automatically computed threshold. Binarizing is what actually removes
// faint dashed separator lines common on recipe-site ingredient lists —
// they sit between "background" and "text" in brightness, so thresholding
// pushes them to background instead of letting OCR mistake them for strokes.
function preprocessCanvasForOcr(ctx, width, height) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    const n = width * height;
    const gray = new Float32Array(n);
    let min = 255;
    let max = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        gray[p] = g;
        if (g < min)
            min = g;
        if (g > max)
            max = g;
    }
    const range = Math.max(1, max - min);
    const stretched = new Uint8ClampedArray(n);
    const hist = new Array(256).fill(0);
    for (let p = 0; p < n; p++) {
        const v = Math.round(((gray[p] - min) / range) * 255);
        stretched[p] = v;
        hist[v]++;
    }
    const threshold = otsuThreshold(hist, n);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        const v = stretched[p] >= threshold ? 255 : 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);
}
// Loads a File into an offscreen canvas, optionally cropped to `rect`
// (in the image's natural pixel coordinates), upscales small crops for
// better OCR, and applies grayscale + contrast-stretch preprocessing —
// all well-known accuracy boosters for Tesseract on photographed text.
function loadAndPreprocessImage(file, rect) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const sx = rect ? rect.x : 0;
            const sy = rect ? rect.y : 0;
            const sw = rect ? rect.w : img.naturalWidth;
            const sh = rect ? rect.h : img.naturalHeight;
            const minDimension = 1400;
            const scale = sw < minDimension ? minDimension / sw : 1;
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            preprocessCanvasForOcr(ctx, canvas.width, canvas.height);
            resolve(canvas);
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
// Loads a File into a small, color, compressed JPEG data URI — used to
// save the person's screenshot as the recipe's photo (separate from the
// grayscale/binarized version used for OCR, which would look wrong as a
// dish photo).
function fileToColorDataUrl(file, maxDimension) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}
async function fetchPageText(url, jinaApiKey) {
    const readerUrl = `https://r.jina.ai/${url}`;
    const headers = {};
    if (jinaApiKey)
        headers["Authorization"] = `Bearer ${jinaApiKey}`;
    let res;
    try {
        res = await fetch(readerUrl, { headers });
    }
    catch {
        throw new Error("ページの取得に失敗しました。通信環境をご確認のうえ、うまくいかない場合は下のスクリーンショット読み取りをお試しください。");
    }
    if (res.status === 403 || res.status === 429) {
        throw new Error(jinaApiKey
            ? `ページの取得に失敗しました (status ${res.status})。サイト側がアクセスを制限している可能性があります。下のスクリーンショット読み取りをお試しください。`
            : `ページの取得に失敗しました (status ${res.status})。読み取り回数の制限にかかっている可能性があります。設定画面から無料のJina Reader APIキーを登録すると改善することがあります。今すぐなら、下のスクリーンショット読み取りが確実です。`);
    }
    if (!res.ok)
        throw new Error(`ページの取得に失敗しました (status ${res.status})`);
    const text = await res.text();
    if (!text || text.length < 30)
        throw new Error("ページの中身を取得できませんでした");
    return text;
}
// Asks Claude to structure raw page text into our recipe schema. Requires
// the person's own Anthropic API key (stored locally on this device) and
// calls the API directly from the browser — see the CORS header below.
async function extractWithClaude(pageText, apiKey) {
    const prompt = `以下はレシピサイトのページから抽出した本文です。この中からレシピ情報を読み取り、JSON形式のみで出力してください。前置きや説明、コードフェンスは一切つけず、"{" から始まり "}" で終わるJSONオブジェクト1つだけを出力してください。

出力形式:
{
  "recipes": [
    {
      "title": "料理名",
      "servings": "分量の目安(例: 2人分。わからなければ空文字)",
      "ingredients": [{"name": "材料名", "amount": "分量"}],
      "steps": ["手順を短い一文ずつ"],
      "memo": "コツや補足があれば短くまとめる。なければ空文字",
      "dishCategory": "次のいずれか1つ: 麺類 / パン / ご飯もの / スープ・鍋 / デザート / 肉料理 / 魚介料理 / 野菜料理 / その他",
      "meatType": "dishCategoryが肉料理の場合のみ、鶏肉 / 豚肉 / 牛肉 / ひき肉 / その他 のいずれか(挽き肉・合いびき肉など特定の動物名がない場合はひき肉)。それ以外はnull",
      "noodleType": "dishCategoryが麺類の場合のみ、うどん / そば / ラーメン / パスタ / その他 のいずれか。それ以外はnull",
      "vegType": "dishCategoryが野菜料理の場合のみ、サラダ / 炒め物 / 和え物・おひたし / 煮物 / 漬け物 / その他 のいずれか。それ以外はnull",
      "appliance": "本文の手順の中で実際に使われている調理器具が次のいずれかに該当する場合は、必ずそれを選んでください: エアフライヤー / ホットクック / オーブン / 炊飯器 / 圧力鍋 / 電子レンジ。「オーブンで250度で20分」「電子レンジ600Wで2分」のように具体的に書かれていれば、それだけで該当する家電を選んでよい根拠になります。フライパン・鍋・トースターなど上記に無い器具の場合や、器具がまったく本文に出てこない場合のみnullにしてください"
    }
  ]
}

recipesは通常1件の配列です。ページ内に、料理名・材料・手順がそれぞれ独立して書かれた、明らかに別の複数のレシピが含まれている場合だけ(例: 1つの記事で2品を別々に紹介している)、配列の要素を複数にしてください。1つの料理についての説明や、同じ料理のバリエーション紹介(タレの種類違いなど)は1件のままにしてください。

dishCategory・meatTypeは、材料名や手順の文字列に含まれる単語だけで機械的に判定せず、レシピ全体の内容(主菜の食材・調理法)を理解した上で最も適切なものを選んでください。例えば材料に少量だけ肉が入っていても主役が野菜なら「野菜料理」にしてください。

材料名には、代替案や切り方などの注記(例:「ネギ(できれば九条ネギ)」)はそのまま含めてよいですが、「下味」「衣」「タレ」「合わせ調味料」「調味料」のような明確なサブグループの見出しがある場合だけ、材料名の末尾に "(グループ名)" を付けてください(例: "しょうゆ(下味)")。「ねぎ塩だれ」「ごまだれ」「甘辛あん」のように、具体的な名前+「だれ/ソース/あん/スープ」などの種類語がついた見出しも同様に明確なサブグループとして扱い、その見出し文字列をそのまま "(グループ名)" として付けてください(例: "ねぎ(ねぎ塩だれ)")。見出しが「（A）合わせ調味料」のように参照用の記号(A・B・①など)付きで書かれている場合は、その記号は無視してグループ名本体だけを使ってください(例: "キッコーマン濃いだし本つゆ(合わせ調味料)")。単なる注記をグループ扱いしないでください。見出しが「(A)」のように記号だけで具体的なグループ名が書かれていない場合、または「A塩…小さじ1/3」「B砂糖、酢…各大さじ1」のように各行の先頭にA・Bなどの記号が直接くっついている場合は、その記号自体を "(グループ名)" として材料名の末尾に付けてください(例: "塩(A)"、"砂糖(B)")。これは、まとまりがあることをアプリ側で表示するために必要です。いずれの場合も、その記号(A・B・①など)が付いている品目を材料リストから省略しないでください。

材料の見つけ方: 本文中に「材料」という語を含む見出し(「材料」「材料(2人分)」など)があれば、そこが本来の材料欄です。その見出しの直後から、次の見出しや「作り方」「①」などの手順の始まりの直前までに列挙されている品目を、1品も欠かさずすべて書き出してください。分量(大さじ・小さじ・g・個数など)が書かれていればそのまま使い、書かれていなければ空欄のままにしてください(適量などと勝手に補わない)。
このブログ特有の注意点として、記事の冒頭の自己紹介文に「◆大さじ１杯の生クリーム」「◆ローリエ、バルサミコ酢…」のような食材の例が箇条書きで出てくることがありますが、これは直後に「〜は使いません」と続く冗談で、実際の材料ではありません。この部分だけは無視してください——ただし、これはあくまで「材料」見出しより前に出てくる自己紹介文の中の話であり、実際の「材料」見出し以降にある品目は(似た書き方に見えても)すべて本物の材料なので、絶対に省略しないでください。
手順は本文の番号付きステップの数と順番をそのまま反映してください。複数のステップを1つにまとめたり、逆に分割したりしないでください。
本文に実際に書かれていない材料・分量・手順を推測で埋めたり創作したりしないでください。情報が不明な項目は無理に埋めず、わかる範囲だけを正確に抽出してください。とくに、与えられた本文中に存在しない自己紹介文・経歴・エピソードなどを、一般的な知識や推測から作り出してmemoや材料に混ぜることは絶対にしないでください。本文が長すぎたり、材料欄が見つからなかったりして情報が不十分な場合は、無理に何かを埋めようとせず、ingredientsやstepsを空配列のままにしてください。空にする方が、存在しない情報を作り出すよりずっと良い結果です。
広告文やナビゲーション、コメント欄などレシピ本体と関係ない文章は無視してください。特に、SNS投稿のキャプションでは調理手順の後にPR文・ハッシュタグ・フォロー/DM/コメント誘導・他の投稿への案内・区切り線(*や♪の羅列など)が続くことが多いですが、これらは手順やメモに一切含めないでください。最後の実質的な調理手順で steps を終わらせ、それ以降の宣伝文は steps にも memo にも入れないでください。ブログ記事では、レシピ本体の後に「掲載誌のお知らせ」「他のブロガー紹介」のような別トピックの雑談が続くことがありますが、これも steps・ingredients・memo のいずれにも含めないでください。
とくに料理ブログでは、最後の手順(「できあがり」「完成」のような完成を示す一文)の直後に、改行や見出しなしでそのまま「関連レシピの紹介」「人気ランキング」「サイト名や『◯◯食堂』『◯◯ブログ』のような自己紹介」「他の記事へのリンク文言(『こちら』『TOP50はこちら』など)」「献立・お弁当まとめの案内」が続けて書かれていることがよくあります。手順を読んでいて、具体的な調理動作(切る・加熱する・混ぜるなど、時間や温度を伴う指示)の記述が途切れて、上記のような文章に変わったら、そこが本当の終わりです。それより後の文章は、たとえ同じ段落や文の途中から始まっていても、steps・memoのどちらにも一切含めないでください。仕上がりに関する短い一言(「乱切りでも美味しく作れます」など)は含めてよいですが、そのあとに続く宣伝・リンク文言は含めないでください。

ページ本文:
"""
${pageText.slice(0, 30000)}
"""`;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 3000,
            messages: [{ role: "user", content: prompt }],
        }),
    });
    if (!response.ok) {
        let detail = "";
        try {
            const errBody = await response.json();
            detail = errBody?.error?.message || "";
        }
        catch {
            // ignore
        }
        throw new Error(`APIエラー(status ${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const data = await response.json();
    const textBlock = data?.content?.find((c) => c.type === "text");
    if (!textBlock)
        throw new Error("応答からテキストを取得できませんでした");
    const raw = textBlock.text;
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1)
        throw new Error("JSONが見つかりませんでした");
    const parsedOuter = JSON.parse(raw.slice(start, end + 1));
    // Backward/forward compatible: normally { recipes: [...] }, but fall
    // back to treating the object itself as a single recipe if the model
    // ever returns the older flat shape.
    const list = Array.isArray(parsedOuter.recipes) && parsedOuter.recipes.length > 0
        ? parsedOuter.recipes
        : [parsedOuter];
    return list.map((parsed) => ({
        title: parsed.title || "",
        servings: parsed.servings || "",
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        memo: parsed.memo || "",
        dishCategory: parsed.dishCategory,
        meatType: parsed.meatType,
    }));
}
// Sends a cropped screenshot directly to Claude's vision API and asks for a
// plain-text transcription (not structured JSON) — this slots into the
// existing screenshot pipeline in place of Tesseract when an API key is
// set, so the rest of the review/extract flow stays unchanged. Vision
// handles stylized on-screen text (video overlays, decorative fonts) far
// better than OCR.
async function transcribeImageWithClaude(canvas, apiKey) {
    const base64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-6",
            max_tokens: 1500,
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
                        {
                            type: "text",
                            text: "この画像に写っている文字をそのまま書き起こしてください。材料名と分量が対になっていればその対応が伝わるように、手順に番号が付いていればその番号も含めて、レイアウトの意味が分かる形でテキスト化してください。説明や前置きは不要で、書き起こした文字だけを出力してください。",
                        },
                    ],
                },
            ],
        }),
    });
    if (!response.ok) {
        let detail = "";
        try {
            const errBody = await response.json();
            detail = errBody?.error?.message || "";
        }
        catch {
            // ignore
        }
        throw new Error(`APIエラー(status ${response.status})${detail ? `: ${detail}` : ""}`);
    }
    const data = await response.json();
    const textBlock = data?.content?.find((c) => c.type === "text");
    if (!textBlock)
        throw new Error("応答からテキストを取得できませんでした");
    return textBlock.text;
}
// =====================================================================
// Family ToDo / shopping list — ported from the person's earlier standalone
// app. Shares this same Firebase project (rtdb, set up above) instead of
// its own separate one. Kept largely in its original React.createElement
// form for a faithful, low-risk port rather than a full JSX rewrite.
// =====================================================================
// per-device (not synced) storage — used for "which device already
// unlocked with the shared password" and "this device's display name"
const local = {
    get(key) {
        try {
            return localStorage.getItem(key);
        }
        catch (e) {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        }
        catch (e) { }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        }
        catch (e) { }
    },
};
const TODO_PALETTE = {
    paper: COLORS.paper, card: COLORS.paperCard, ink: COLORS.ink, inkSoft: COLORS.inkSoft,
    sage: COLORS.accent, sageSoft: COLORS.accentSoft, clay: COLORS.plum, hanko: COLORS.plum, line: COLORS.line,
};
const FAMILY_COLORS = [
    { dot: "#6F8564", bg: "#E4EADD" }, { dot: "#C97B5A", bg: "#F3E1D6" },
    { dot: "#4C7A9E", bg: "#DCE7EE" }, { dot: "#A15C7C", bg: "#EFDDE5" },
    { dot: "#8A7B4E", bg: "#EAE4D3" }, { dot: "#5C6B8A", bg: "#DEE2EA" },
];
function colorForName(name) {
    if (!name)
        return { dot: TODO_PALETTE.inkSoft, bg: TODO_PALETTE.line };
    let h = 0;
    for (let i = 0; i < name.length; i++)
        h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return FAMILY_COLORS[h % FAMILY_COLORS.length];
}
function todayStrLocal(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}
function formatDueDate(dateStr) {
    if (!dateStr)
        return "";
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", weekday: "short" });
}
function isOverdue(dateStr, done) {
    if (!dateStr || done)
        return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + "T00:00:00");
    return d < today;
}
function sortByDueDate(list) {
    return [...list].sort((a, b) => {
        if (!a.dueDate && !b.dueDate)
            return 0;
        if (!a.dueDate)
            return 1;
        if (!b.dueDate)
            return -1;
        return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
    });
}
const TODO_FONT_DISPLAY = "'Noto Sans JP', sans-serif";
const TODO_FONT_BODY = "'Noto Sans JP', sans-serif";
const LISTS = {
    todo: { dbKey: "todos", groupsKey: "todos-groups", label: "今日のToDo", placeholder: "やることを入力...", emptyAll: "タスクを追加してみましょう" },
    shopping: { dbKey: "shopping", groupsKey: "shopping-groups", label: "買い物リスト", placeholder: "買うものを入力...", emptyAll: "買うものを追加してみましょう" },
};
const NO_GROUP = "__none__";
const RECIPE_GROUP = "__recipe__";
// Shared by RecipeNotebook (writer) and TodoApp (reader/renderer): appends
// recipe ingredients into the same "shopping" list used by the 買い物 tab,
// tagged with source:"recipe" + recipeTitle so they can be filtered
// separately from manually-typed items there.
async function addIngredientsToSharedShopping(recipeTitle, ingredients) {
    const newItems = ingredients.map((ing) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: `${splitNameGroup(ing.name).base || ing.name}${ing.amount ? " " + ing.amount : ""}`,
        done: false,
        createdAt: Date.now(),
        addedBy: "",
        dueDate: null,
        memo: "",
        groupId: null,
        source: "recipe",
        recipeTitle,
    }));
    try {
        const snap = await uref("shopping").once("value");
        const existing = snap.val() || [];
        await uref("shopping").set([...newItems, ...existing]);
    }
    catch {
        // best-effort — the person can still add items manually from the 買い物 tab
    }
}
async function hashPassword(pw) {
    const enc = new TextEncoder().encode(pw);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function shoppingCategory(text) {
    const v = String(text || "").replace(/\s+/g, "");
    const rules = [
        { label: "野菜・果物", icon: "🥬", words: ["ねぎ","ネギ","玉ねぎ","たまねぎ","人参","にんじん","大根","キャベツ","白菜","レタス","トマト","きゅうり","胡瓜","なす","茄子","ピーマン","パプリカ","じゃがいも","ジャガイモ","さつまいも","里芋","かぼちゃ","南瓜","ほうれん草","小松菜","もやし","ごぼう","れんこん","ブロッコリー","きのこ","しめじ","えのき","椎茸","しいたけ","舞茸","にら","ニラ","生姜","しょうが","にんにく","ニンニク","りんご","リンゴ","バナナ","みかん","レモン","アボカド"] },
        { label: "肉・魚", icon: "🥩", words: ["牛肉","豚肉","鶏肉","ひき肉","挽肉","肉","ベーコン","ハム","ソーセージ","ウインナー","鮭","サーモン","さば","サバ","鯖","まぐろ","マグロ","ツナ","えび","エビ","海老","いか","イカ","たこ","タコ","魚","ぶり","ブリ","鱈","たら"] },
        { label: "乳製品・卵", icon: "🥛", words: ["牛乳","ミルク","豆乳","チーズ","バター","ヨーグルト","生クリーム","卵","たまご","玉子"] },
        { label: "豆腐・加工品", icon: "🍢", words: ["豆腐","油揚げ","厚揚げ","納豆","こんにゃく","蒟蒻","ちくわ","竹輪","かまぼこ","蒲鉾","はんぺん"] },
        { label: "主食", icon: "🍚", words: ["米","ご飯","ごはん","パン","食パン","うどん","そば","蕎麦","パスタ","スパゲティ","麺","中華麺","そうめん","素麺","餅"] },
        { label: "調味料・乾物", icon: "🧂", words: ["醤油","しょうゆ","味噌","みそ","砂糖","塩","酢","みりん","酒","料理酒","油","オイル","ごま油","胡麻油","マヨネーズ","ケチャップ","ソース","だし","出汁","コンソメ","鶏ガラ","片栗粉","小麦粉","薄力粉","強力粉","パン粉","ごま","胡麻","海苔","のり","わかめ","ワカメ","昆布","かつお節","鰹節","カレー粉","こしょう","胡椒"] }
    ];
    for (const rule of rules) {
        if (rule.words.some((word) => v.includes(word))) return rule;
    }
    return { label: "その他", icon: "🛒" };
}


function ShoppingEmptyState() {
    return React.createElement("div", { style: {
            flex: 1,
            minHeight: 360,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "26px 16px 72px"
        } },
        React.createElement("div", { style: { textAlign: "center" } },
            React.createElement("div", { style: {
                    width: 126,
                    height: 126,
                    margin: "0 auto 18px",
                    borderRadius: "50%",
                    background: "#EEF5EE",
                    display: "grid",
                    placeItems: "center",
                    position: "relative"
                } },
                React.createElement("div", { style: {
                        width: 62,
                        height: 42,
                        border: `3px solid ${TODO_PALETTE.sage}`,
                        borderRadius: "6px 6px 12px 12px",
                        position: "relative"
                    } },
                    React.createElement("div", { style: {
                            position: "absolute",
                            width: 34,
                            height: 22,
                            left: 11,
                            top: -18,
                            border: `3px solid ${TODO_PALETTE.sage}`,
                            borderBottom: "none",
                            borderRadius: "16px 16px 0 0"
                        } }),
                    [0,1,2].map((i) => React.createElement("span", { key: i, style: {
                            position: "absolute",
                            width: 7,
                            height: 7,
                            border: `2px solid ${TODO_PALETTE.sage}`,
                            borderRadius: 2,
                            left: 10 + i * 17,
                            top: 14
                        } }))
                ),
                React.createElement("span", { style: { position:"absolute", left:8, top:48, color:"#BFD6C1", fontSize:20 } }, "◌"),
                React.createElement("span", { style: { position:"absolute", right:7, bottom:29, color:"#BFD6C1", fontSize:18 } }, "✦")
            ),
            React.createElement("div", { style: {
                    fontSize: 17,
                    fontWeight: 800,
                    color: TODO_PALETTE.ink,
                    marginBottom: 8
                } }, "リストは空です"),
            React.createElement("div", { style: {
                    fontSize: 13,
                    color: TODO_PALETTE.inkSoft,
                    lineHeight: 1.65
                } }, "下の入力欄から買うものを追加してみましょう")
        )
    );
}

function TodoApp({ listKey, myName, ungroupedLabel }) {
    const [items, setItems] = useState({ todo: [], shopping: [] });
    const [readyLists, setReadyLists] = useState({ todo: false, shopping: false });
    const [groups, setGroups] = useState({ todo: [], shopping: [] });
    const [input, setInput] = useState("");
    const [dueDateDraft, setDueDateDraft] = useState("");
    const [newMemoDraft, setNewMemoDraft] = useState("");
    const [showNewMemo, setShowNewMemo] = useState(false);
    const [newGroupId, setNewGroupId] = useState(NO_GROUP);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [groupFilter, setGroupFilter] = useState("all"); // "all" | NO_GROUP | group id — freely reflects whatever groups exist in グループ管理
    const [composerOpen, setComposerOpen] = useState(false);
    const [openDetailId, setOpenDetailId] = useState(null);
    const inputRef = useRef(null);
    const activeList = listKey;
    // realtime listeners for todos/shopping/groups
    useEffect(() => {
        const refs = [];
        Object.keys(LISTS).forEach((key) => {
            const itemsRef = uref(LISTS[key].dbKey);
            const cb = itemsRef.on("value", (snap) => {
                const val = snap.val();
                setItems((prev) => ({ ...prev, [key]: val ? val : [] }));
                setReadyLists((prev) => ({ ...prev, [key]: true }));
            });
            refs.push([itemsRef, cb]);
            const groupsRef = uref(LISTS[key].groupsKey);
            const cb2 = groupsRef.on("value", (snap) => {
                const val = snap.val();
                setGroups((prev) => ({ ...prev, [key]: val ? val : [] }));
            });
            refs.push([groupsRef, cb2]);
        });
        return () => refs.forEach(([r, cb]) => r.off("value", cb));
    }, []);
    function saveItems(key, next) {
        setItems((prev) => ({ ...prev, [key]: next }));
        uref(LISTS[key].dbKey).set(next);
    }
    function saveGroups(key, next) {
        setGroups((prev) => ({ ...prev, [key]: next }));
        uref(LISTS[key].groupsKey).set(next);
    }
    function defaultGroupForFilter() {
        return (groupFilter !== "all" && groupFilter !== RECIPE_GROUP) ? groupFilter : NO_GROUP;
    }
    function addItem() {
        const text = input.trim();
        if (!text)
            return;
        const next = [
            { id: Date.now().toString(), text, done: false, createdAt: Date.now(),
                addedBy: myName || "", dueDate: dueDateDraft || null,
                memo: newMemoDraft.trim(), groupId: newGroupId === NO_GROUP ? null : newGroupId },
            ...items[activeList],
        ];
        saveItems(activeList, next);
        setInput("");
        setDueDateDraft("");
        setNewMemoDraft("");
        setShowNewMemo(false);
        setNewGroupId(defaultGroupForFilter());
        setShowGroupPicker(false);
        inputRef.current && inputRef.current.focus();
    }
    function openComposer() {
        setNewGroupId(defaultGroupForFilter());
        setComposerOpen(true);
        setTimeout(() => inputRef.current && inputRef.current.focus(), 60);
    }
    function closeComposer() {
        setComposerOpen(false);
        setShowNewMemo(false);
        setShowGroupPicker(false);
    }
    function toggleItem(id) {
        saveItems(activeList, items[activeList].map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    }
    function deleteItem(id) {
        saveItems(activeList, items[activeList].filter((t) => t.id !== id));
    }
    function clearDone() {
        saveItems(activeList, items[activeList].filter((t) => !t.done));
    }
    function completeAll() {
        saveItems(activeList, items[activeList].map((t) => (t.done ? t : { ...t, done: true })));
    }
    function setItemDueDate(id, dateStr) {
        saveItems(activeList, items[activeList].map((t) => (t.id === id ? { ...t, dueDate: dateStr || null } : t)));
    }
    function setItemMemo(id, memo) {
        saveItems(activeList, items[activeList].map((t) => (t.id === id ? { ...t, memo: memo || "" } : t)));
    }
    function setItemGroup(id, groupId) {
        saveItems(activeList, items[activeList].map((t) => (t.id === id ? { ...t, groupId: groupId || null } : t)));
    }
    function setItemText(id, text) {
        const trimmed = text.trim();
        if (!trimmed) return;
        saveItems(activeList, items[activeList].map((t) => (t.id === id ? { ...t, text: trimmed } : t)));
    }
    const currentItems = items[activeList] || [];
    const currentGroups = groups[activeList] || [];
    const total = currentItems.length;
    const remaining = currentItems.filter((t) => !t.done).length;
    const doneItems = currentItems.filter((t) => t.done);
    const pendingItems = currentItems.filter((t) => !t.done);
    const groupCounts = currentGroups.map((g) => ({ ...g, count: pendingItems.filter((t) => t.groupId === g.id).length }));
    const ungroupedCount = pendingItems.filter((t) => t.source !== "recipe" && (!t.groupId || !currentGroups.some((g) => g.id === t.groupId))).length;
    const recipeCount = pendingItems.filter((t) => t.source === "recipe").length;
    const visible = currentItems
        .filter((t) => {
        if (groupFilter === "all")
            return true;
        if (groupFilter === RECIPE_GROUP)
            return t.source === "recipe";
        if (groupFilter === NO_GROUP)
            return t.source !== "recipe" && (!t.groupId || !currentGroups.some((g) => g.id === t.groupId));
        return t.groupId === groupFilter;
    })
        .filter((t) => !t.done)
        .filter((t) => !searchQuery.trim() || t.text.toLowerCase().includes(searchQuery.trim().toLowerCase()));
    let sections = [];
    if (activeList === "shopping" && groupFilter === "all") {
        const categoryOrder = ["野菜・果物","肉・魚","乳製品・卵","豆腐・加工品","主食","調味料・乾物","その他"];
        const byCategory = new Map();
        visible.forEach((t) => {
            const cat = shoppingCategory(t.text);
            if (!byCategory.has(cat.label)) byCategory.set(cat.label, { icon: cat.icon, items: [] });
            byCategory.get(cat.label).items.push(t);
        });
        categoryOrder.forEach((label) => {
            const group = byCategory.get(label);
            if (group && group.items.length) sections.push({ label: `${group.icon} ${label}`, items: group.items });
        });
    }
    else if (groupFilter === RECIPE_GROUP) {
        const byRecipe = new Map();
        visible.forEach((t) => {
            const key = t.recipeTitle || "その他";
            if (!byRecipe.has(key)) byRecipe.set(key, []);
            byRecipe.get(key).push(t);
        });
        byRecipe.forEach((items, label) => {
            sections.push({ label, items: sortByDueDate(items) });
        });
    }
    else if (currentGroups.length > 0) {
        currentGroups.forEach((g) => {
            const inGroup = visible.filter((t) => t.groupId === g.id);
            if (inGroup.length > 0) sections.push({ label: g.name, items: sortByDueDate(inGroup) });
        });
        const fromRecipe = visible.filter((t) => t.source === "recipe" && (!t.groupId || !currentGroups.some((g) => g.id === t.groupId)));
        if (fromRecipe.length > 0) sections.push({ label: "レシピ", items: sortByDueDate(fromRecipe) });
        const ungrouped = visible.filter((t) => t.source !== "recipe" && (!t.groupId || !currentGroups.some((g) => g.id === t.groupId)));
        if (ungrouped.length > 0) sections.push({ label: ungroupedLabel || "グループなし", items: sortByDueDate(ungrouped) });
    }
    else {
        const withDate = visible.filter((t) => t.dueDate);
        const noDate = visible.filter((t) => !t.dueDate);
        if (withDate.length > 0) sections.push({ label: "期日あり", items: sortByDueDate(withDate) });
        if (noDate.length > 0) sections.push({ label: "期日なし", items: noDate });
    }
    const today = new Date();
    const dateStr = today.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
    return React.createElement("div", { style: { fontFamily: TODO_FONT_BODY, background: TODO_PALETTE.paper, minHeight: "100%", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", color: TODO_PALETTE.ink, fontSize: 13 } }, 
    // header
    React.createElement("div", { style: { padding: "18px 16px 10px" } },
        React.createElement("div", { style: { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: TODO_PALETTE.sage, marginBottom: 3 } }, "SHOPPING LIST"),
        React.createElement("div", null,
            React.createElement("div", { style: { fontFamily: TODO_FONT_DISPLAY, fontSize: 24, fontWeight: 800, letterSpacing: "0.01em" } }, LISTS[activeList].label),
            React.createElement("div", { style: { fontSize: 11, color: TODO_PALETTE.inkSoft, marginTop: 3 } }, dateStr)
        ),
        React.createElement("div", { style: { marginTop: 10, fontSize: 11, color: TODO_PALETTE.inkSoft } }, "買うものを売り場ごとに自動でまとめています")
    ), (currentGroups.length > 0 || recipeCount > 0) && React.createElement("div", { style: { display: "flex", gap: 6, padding: "0 14px 8px", overflowX: "auto", WebkitOverflowScrolling: "touch" } }, [
        { key: "all", label: `すべて (${remaining})` },
        ...(recipeCount > 0 ? [{ key: RECIPE_GROUP, label: `レシピ (${recipeCount})` }] : []),
        ...groupCounts.map((g) => ({ key: g.id, label: `${g.name} (${g.count})` })),
        ...(ungroupedCount > 0 ? [{ key: NO_GROUP, label: `${ungroupedLabel || "グループなし"} (${ungroupedCount})` }] : []),
    ].map((f) => React.createElement("button", { key: f.key, onClick: () => setGroupFilter(f.key),
        style: { flexShrink: 0, cursor: "pointer", padding: "6px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, fontFamily: TODO_FONT_DISPLAY, whiteSpace: "nowrap",
            background: groupFilter === f.key ? TODO_PALETTE.ink : TODO_PALETTE.card, color: groupFilter === f.key ? "#fff" : TODO_PALETTE.inkSoft,
            border: groupFilter === f.key ? "none" : `1px solid ${TODO_PALETTE.line}` } }, f.label))), myName && React.createElement("div", { style: { margin: "0 14px 8px", fontSize: 11, color: TODO_PALETTE.inkSoft, display: "flex", alignItems: "center", gap: 5 } }, React.createElement("span", { style: { width: 7, height: 7, borderRadius: "50%", background: colorForName(myName).dot, display: "inline-block" } }), `あなた：${myName}`), 
    // action row (search / complete-all)
    React.createElement("div", { style: { display: "flex", gap: 6, padding: "0 14px 8px", alignItems: "center" } }, listKey === "shopping" && currentItems.some((t) => !t.done) && React.createElement("button", { onClick: completeAll, title: "すべて完了にする",
        style: { border: `1px solid ${TODO_PALETTE.sage}`, cursor: "pointer", background: TODO_PALETTE.sageSoft, color: TODO_PALETTE.sage, fontSize: 11, fontFamily: TODO_FONT_BODY, borderRadius: 999, padding: "4px 10px", whiteSpace: "nowrap" } }, "\u2713 \u4E00\u62EC\u5B8C\u4E86"), React.createElement("button", { onClick: () => setShowSearch((s) => !s), "aria-label": "検索",
        style: { marginLeft: "auto", border: "none", background: "transparent", color: showSearch ? TODO_PALETTE.sage : TODO_PALETTE.inkSoft, fontSize: 13, cursor: "pointer", padding: "2px 6px" } }, "\uD83D\uDD0D")), showSearch && React.createElement("div", { style: { padding: "0 14px 8px" } }, React.createElement("input", { autoFocus: true, value: searchQuery, onChange: (e) => setSearchQuery(e.target.value),
        placeholder: "キーワードで検索...",
        style: { width: "100%", boxSizing: "border-box", border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 16, fontFamily: TODO_FONT_BODY, outline: "none", background: TODO_PALETTE.card } })), 
    // list
    React.createElement("div", { style: { flex: 1, padding: "4px 14px 118px", display: "flex", flexDirection: "column", gap: 8 } }, readyLists[activeList] && visible.length === 0 && doneItems.length === 0 && React.createElement(ShoppingEmptyState, null), sections.map((sec, i) => React.createElement(React.Fragment, { key: sec.label }, React.createElement("div", { style: { fontSize: 11, color: TODO_PALETTE.inkSoft, fontWeight: 800, letterSpacing: "0.05em", margin: i === 0 ? "5px 3px 1px" : "14px 3px 1px" } }, sec.label), sec.items.map((t) => React.createElement(ItemCard, { key: t.id, item: t, groupsList: currentGroups,
        onToggle: toggleItem, onDelete: deleteItem, onSetDueDate: setItemDueDate, onSetMemo: setItemMemo, onSetGroup: setItemGroup, onOpenDetail: setOpenDetailId })))),
    doneItems.length > 0 && React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 2px 6px" } },
            React.createElement("div", { style: { fontSize: 10.5, color: TODO_PALETTE.inkSoft, fontWeight: 700, letterSpacing: "0.03em" } }, "完了タスク"),
            React.createElement("button", { onClick: clearDone, title: "完了タスクを削除", "aria-label": "完了タスクを削除",
                style: { border: "none", cursor: "pointer", background: "transparent", color: TODO_PALETTE.clay, padding: "3px", display: "flex", alignItems: "center" } }, React.createElement(Trash2, { size: 15 }))),
        sortByDueDate(doneItems).map((t) => React.createElement(ItemCard, { key: t.id, item: t, groupsList: currentGroups,
            onToggle: toggleItem, onDelete: deleteItem, onSetDueDate: setItemDueDate, onSetMemo: setItemMemo, onSetGroup: setItemGroup, onOpenDetail: setOpenDetailId })))), 
    // add bar — collapsed to a FAB; tapping it opens a quick-add card
    // (group pills / text box / today-tomorrow chips / memo, matching the
    // family's other todo app), pre-targeted at whichever tab is selected
    composerOpen && React.createElement("div", { onClick: closeComposer, style: {
        position: "fixed", inset: 0, zIndex: 55, background: "transparent"
    } }),
    composerOpen ? React.createElement("div", { style: {
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
        width: "100%",
        maxWidth: 480,
        zIndex: 60,
        boxSizing: "border-box",
        padding: "10px 14px",
        background: `linear-gradient(${TODO_PALETTE.paper}00, ${TODO_PALETTE.paper} 30%)`
    }, onClick: (e) => e.stopPropagation() },
        React.createElement("div", { style: {
            background: "#fff", border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 20, padding: 14,
            boxShadow: "0 10px 32px rgba(51,48,42,0.14)", display: "flex", flexDirection: "column", gap: 10
        } },
            currentGroups.length > 0 && React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } },
                React.createElement("button", { onClick: () => setNewGroupId(NO_GROUP), style: {
                        border: "none", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                        background: newGroupId === NO_GROUP ? TODO_PALETTE.sage : TODO_PALETTE.sageSoft,
                        color: newGroupId === NO_GROUP ? "#fff" : TODO_PALETTE.sage
                    } }, "グループなし"),
                currentGroups.map((g) => React.createElement("button", { key: g.id, onClick: () => setNewGroupId(g.id), style: {
                        border: "none", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                        background: newGroupId === g.id ? TODO_PALETTE.sage : TODO_PALETTE.sageSoft,
                        color: newGroupId === g.id ? "#fff" : TODO_PALETTE.sage
                    } }, g.name))),
            React.createElement("textarea", {
                ref: inputRef,
                value: input,
                onChange: (e) => setInput(e.target.value),
                onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addItem(); } },
                placeholder: "何を買いますか？",
                rows: 1,
                style: {
                    width: "100%", boxSizing: "border-box", border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 14,
                    padding: "12px 14px", fontSize: 17, fontFamily: TODO_FONT_BODY, color: TODO_PALETTE.ink,
                    background: TODO_PALETTE.paper, resize: "none", minHeight: 48
                }
            }),
            React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 7 } },
                React.createElement("div", { style: {
                        position: "relative", display: "inline-flex", alignItems: "center", gap: 5,
                        border: `1px solid ${dueDateDraft ? TODO_PALETTE.sage : TODO_PALETTE.line}`, borderRadius: 999,
                        padding: dueDateDraft ? "6px 8px 6px 13px" : "6px 13px", fontSize: 12.5, fontWeight: 700,
                        color: dueDateDraft ? TODO_PALETTE.sage : TODO_PALETTE.inkSoft, background: dueDateDraft ? TODO_PALETTE.sageSoft : "transparent"
                    } },
                    React.createElement(CalendarIcon, { size: 13, style: { pointerEvents: "none" } }),
                    React.createElement("span", { style: { pointerEvents: "none" } }, dueDateDraft ? formatDueDate(dueDateDraft) : "期限"),
                    dueDateDraft && React.createElement("button", { onClick: (e) => { e.stopPropagation(); setDueDateDraft(""); }, "aria-label": "\u671F\u9650\u3092\u30AF\u30EA\u30A2", style: {
                            border: "none", background: "transparent", color: TODO_PALETTE.sage, fontSize: 13, padding: "0 2px", lineHeight: 1, position: "relative", zIndex: 1
                        } }, "\u00D7"),
                    React.createElement("input", { type: "date", value: dueDateDraft, onChange: (e) => setDueDateDraft(e.target.value),
                        style: { position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%" } })),
                React.createElement("button", { onClick: () => setDueDateDraft(todayStrLocal(0)), style: {
                        border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700,
                        cursor: "pointer", background: "transparent", color: TODO_PALETTE.inkSoft
                    } }, "今日"),
                React.createElement("button", { onClick: () => setDueDateDraft(todayStrLocal(1)), style: {
                        border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700,
                        cursor: "pointer", background: "transparent", color: TODO_PALETTE.inkSoft
                    } }, "明日")),
            showNewMemo && React.createElement("textarea", {
                autoFocus: true,
                value: newMemoDraft,
                onChange: (e) => setNewMemoDraft(e.target.value),
                placeholder: "メモを入力...",
                rows: 2,
                style: {
                    width: "100%", boxSizing: "border-box", border: `1px solid ${TODO_PALETTE.line}`,
                    borderRadius: 10, padding: "8px 10px", fontSize: 15, fontFamily: TODO_FONT_BODY,
                    color: TODO_PALETTE.ink, background: TODO_PALETTE.paper, resize: "vertical"
                }
            }),
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
                    React.createElement("button", { onClick: closeComposer, "aria-label": "閉じる", title: "閉じる", style: {
                            width: 32, height: 32, borderRadius: "50%", border: "none", background: "transparent",
                            color: TODO_PALETTE.inkSoft, display: "grid", placeItems: "center"
                        } }, React.createElement(X, { size: 16 })),
                    React.createElement("button", { onClick: () => setShowNewMemo((v) => !v), "aria-label": "メモ", title: "メモ", style: {
                            width: 32, height: 32, borderRadius: "50%", border: "none",
                            background: newMemoDraft || showNewMemo ? TODO_PALETTE.sageSoft : "transparent",
                            color: newMemoDraft || showNewMemo ? TODO_PALETTE.sage : TODO_PALETTE.inkSoft,
                            display: "grid", placeItems: "center"
                        } }, React.createElement(Edit2, { size: 15 }))),
                React.createElement("button", {
                    onClick: addItem,
                    disabled: !input.trim(),
                    "aria-label": "追加",
                    title: "追加",
                    style: {
                        width: 40, height: 40, borderRadius: "50%",
                        border: "none",
                        background: input.trim() ? TODO_PALETTE.sage : TODO_PALETTE.line,
                        color: input.trim() ? "#fff" : TODO_PALETTE.inkSoft,
                        display: "grid", placeItems: "center", flexShrink: 0,
                        boxShadow: input.trim() ? "0 2px 8px rgba(63,174,106,0.35)" : "none",
                        transition: "background 0.15s, color 0.15s"
                    }
                }, React.createElement(ArrowUp, { size: 18, strokeWidth: 2.5 }))))
    ) : React.createElement("button", {
        onClick: openComposer,
        "aria-label": "追加",
        title: "追加",
        style: {
            position: "fixed",
            right: "max(20px, calc(50% - 238px))",
            bottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
            width: 58, height: 58, borderRadius: "50%",
            border: "none", background: TODO_PALETTE.sage, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60,
            boxShadow: "0 10px 28px rgba(67,84,69,0.28)"
        }
    }, React.createElement(Plus, { size: 26 })),
    openDetailId && React.createElement(ItemDetailModal, {
        item: currentItems.find((t) => t.id === openDetailId),
        groupsList: currentGroups,
        onClose: () => setOpenDetailId(null),
        onToggle: toggleItem,
        onDelete: (id) => { deleteItem(id); setOpenDetailId(null); },
        onSetDueDate: setItemDueDate,
        onSetMemo: setItemMemo,
        onSetGroup: setItemGroup,
        onSetText: setItemText,
    }));
}
function ItemCard({ item, groupsList, onToggle, onSetDueDate, onSetMemo, onOpenDetail }) {
    const [memoOpen, setMemoOpen] = useState(false);
    const overdue = isOverdue(item.dueDate, item.done);
    const hasMemo = !!(item.memo && item.memo.trim());
    return React.createElement("div", {
        style: { background: TODO_PALETTE.card, border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 16, padding: "14px 13px",
            boxShadow: "0 2px 10px rgba(51,48,42,0.035)",
            display: "flex", alignItems: "flex-start", gap: 10, opacity: item.done ? 0.55 : 1, cursor: "pointer" },
        onClick: () => onOpenDetail(item.id)
    },
        React.createElement("button", { onClick: (e) => { e.stopPropagation(); onToggle(item.id); },
            style: { width: 30, height: 30, borderRadius: "50%", border: `2px solid ${item.done ? TODO_PALETTE.hanko : TODO_PALETTE.line}`, background: "transparent", flexShrink: 0, marginTop: 0, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" } },
            item.done && React.createElement("span", { style: { position: "absolute", inset: -2, borderRadius: "50%", border: `2px solid ${TODO_PALETTE.hanko}`, transform: "rotate(-8deg)", boxSizing: "border-box" } }),
            item.done && React.createElement("span", { style: { color: TODO_PALETTE.hanko, fontSize: 10, fontWeight: 700, fontFamily: TODO_FONT_DISPLAY, transform: "rotate(-8deg)" } }, "済")),
        React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 6 } },
                React.createElement("div", { style: { flex: 1, fontSize: 16, fontWeight: 650, lineHeight: 1.45, textDecoration: item.done ? "line-through" : "none", color: item.done ? TODO_PALETTE.inkSoft : TODO_PALETTE.ink, wordBreak: "break-word" } }, item.text),
                hasMemo && React.createElement("button", { onClick: (e) => { e.stopPropagation(); setMemoOpen((v) => !v); }, "aria-label": "メモ", title: "メモ",
                    style: { border: "none", background: "transparent", color: TODO_PALETTE.inkSoft, cursor: "pointer", flexShrink: 0, padding: 2, marginTop: 2, display: "flex", transform: memoOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" } },
                    React.createElement(ChevronDown, { size: 15 }))),
            React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 } },
                item.dueDate && React.createElement("span", {
                    style: { fontSize: 9.5, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 999,
                        background: overdue ? "#F7DEDA" : TODO_PALETTE.sageSoft, color: overdue ? TODO_PALETTE.hanko : TODO_PALETTE.sage, fontFamily: TODO_FONT_BODY }
                }, `\uD83D\uDCC5 ${formatDueDate(item.dueDate)}`),
                item.source === "recipe" && item.recipeTitle && React.createElement("span", { style: { fontSize: 9, color: TODO_PALETTE.sage, opacity: 0.85, display: "inline-flex", alignItems: "center", padding: "1px 3px" } }, `\uD83C\uDF73 ${item.recipeTitle}`),
                item.addedBy && React.createElement("span", { style: { fontSize: 9, color: TODO_PALETTE.inkSoft, opacity: 0.7, display: "inline-flex", alignItems: "center", padding: "1px 3px" } }, `— ${item.addedBy}`)),
            memoOpen && hasMemo && React.createElement("div", { onClick: (e) => e.stopPropagation(), style: {
                    marginTop: 5, padding: "6px 8px", borderRadius: 8, background: TODO_PALETTE.paper,
                    fontSize: 11.5, lineHeight: 1.6, color: TODO_PALETTE.inkSoft, fontFamily: TODO_FONT_BODY, whiteSpace: "pre-wrap", wordBreak: "break-word"
                } }, item.memo)));
}
function ItemDetailModal({ item, groupsList, onClose, onToggle, onDelete, onSetDueDate, onSetMemo, onSetGroup, onSetText }) {
    const [textDraft, setTextDraft] = useState(item?.text || "");
    const [memoDraft, setMemoDraft] = useState(item?.memo || "");
    useEffect(() => { setTextDraft(item?.text || ""); setMemoDraft(item?.memo || ""); }, [item?.id]);
    if (!item) return null;
    const overdue = isOverdue(item.dueDate, item.done);
    function todayStr(offsetDays = 0) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().slice(0, 10);
    }
    return React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 90 } },
        React.createElement("div", { onClick: onClose, style: { position: "absolute", inset: 0, background: "rgba(32,35,31,0.32)" } }),
        React.createElement("div", { style: {
                position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 480, margin: "0 auto",
                background: TODO_PALETTE.paper, borderRadius: "22px 22px 0 0", padding: "14px 18px calc(22px + env(safe-area-inset-bottom,0px))",
                maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -8px 30px rgba(32,35,31,0.18)"
            } },
            React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 } },
                React.createElement("button", { onClick: onClose, "aria-label": "閉じる", style: { border: "none", background: "transparent", color: TODO_PALETTE.inkSoft, display: "flex", padding: 6 } },
                    React.createElement(X, { size: 20 })),
                React.createElement("button", { onClick: () => onToggle(item.id), style: {
                        border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                        background: item.done ? TODO_PALETTE.sageSoft : TODO_PALETTE.sage, color: item.done ? TODO_PALETTE.sage : "#fff"
                    } }, item.done ? "済 → 未完了に戻す" : "完了にする"),
                React.createElement("button", { onClick: () => onDelete(item.id), "aria-label": "削除", style: { border: "none", background: "transparent", color: TODO_PALETTE.clay, display: "flex", padding: 6 } },
                    React.createElement(Trash2, { size: 18 }))),
            React.createElement("textarea", { value: textDraft, onChange: (e) => setTextDraft(e.target.value), onBlur: () => onSetText(item.id, textDraft), rows: 2,
                style: { width: "100%", boxSizing: "border-box", border: "none", background: "transparent", resize: "none",
                    fontSize: 19, fontWeight: 700, color: TODO_PALETTE.ink, fontFamily: TODO_FONT_BODY, lineHeight: 1.4, marginBottom: 16, padding: 0 } }),
            React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid ${TODO_PALETTE.line}` } },
                React.createElement("div", { style: { position: "relative", flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 } },
                    React.createElement(CalendarIcon, { size: 17, color: TODO_PALETTE.sage, style: { pointerEvents: "none", flexShrink: 0 } }),
                    React.createElement("div", { style: { flex: 1, fontSize: 13.5, color: item.dueDate ? (overdue ? TODO_PALETTE.hanko : TODO_PALETTE.ink) : TODO_PALETTE.inkSoft, pointerEvents: "none" } }, item.dueDate ? formatDueDate(item.dueDate) : "期限"),
                    React.createElement("input", { type: "date", value: item.dueDate || "", onChange: (e) => onSetDueDate(item.id, e.target.value),
                        style: { position: "absolute", inset: 0, opacity: 0, width: "100%", height: "100%" } })),
                React.createElement("button", { onClick: () => onSetDueDate(item.id, todayStr(0)), style: { border: "none", background: TODO_PALETTE.sageSoft, color: TODO_PALETTE.sage, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, flexShrink: 0 } }, "今日"),
                React.createElement("button", { onClick: () => onSetDueDate(item.id, todayStr(1)), style: { border: "none", background: TODO_PALETTE.sageSoft, color: TODO_PALETTE.sage, borderRadius: 999, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, flexShrink: 0 } }, "明日"),
                item.dueDate && React.createElement("button", { onClick: () => onSetDueDate(item.id, ""), "aria-label": "期限をクリア", style: { border: "none", background: "transparent", color: TODO_PALETTE.inkSoft, fontSize: 14, padding: 4, flexShrink: 0 } }, "×")),
            groupsList.length > 0 && React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderTop: `1px solid ${TODO_PALETTE.line}` } },
                React.createElement(Bookmark, { size: 17, color: TODO_PALETTE.sage, style: { marginTop: 2 } }),
                React.createElement("div", { style: { flex: 1, display: "flex", flexWrap: "wrap", gap: 6 } },
                    React.createElement("button", { onClick: () => onSetGroup(item.id, null), style: {
                            border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                            background: !item.groupId ? TODO_PALETTE.sage : TODO_PALETTE.line, color: !item.groupId ? "#fff" : TODO_PALETTE.inkSoft
                        } }, "グループなし"),
                    groupsList.map((g) => React.createElement("button", { key: g.id, onClick: () => onSetGroup(item.id, g.id), style: {
                            border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                            background: item.groupId === g.id ? TODO_PALETTE.sage : TODO_PALETTE.line, color: item.groupId === g.id ? "#fff" : TODO_PALETTE.inkSoft
                        } }, g.name)))),
            React.createElement("div", { style: { padding: "10px 0", borderTop: `1px solid ${TODO_PALETTE.line}` } },
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 } },
                    React.createElement(Edit2, { size: 15, color: TODO_PALETTE.sage }),
                    React.createElement("span", { style: { fontSize: 12.5, color: TODO_PALETTE.inkSoft, fontWeight: 700 } }, "メモ")),
                React.createElement("textarea", { value: memoDraft, onChange: (e) => setMemoDraft(e.target.value), onBlur: () => onSetMemo(item.id, memoDraft.trim()),
                    placeholder: "メモを入力...", rows: 3, style: {
                        width: "100%", boxSizing: "border-box", border: `1px solid ${TODO_PALETTE.line}`, borderRadius: 10,
                        padding: "8px 10px", fontSize: 15, fontFamily: TODO_FONT_BODY, color: TODO_PALETTE.ink, background: "#fff", resize: "vertical"
                    } })),
            (item.source === "recipe" && item.recipeTitle) && React.createElement("div", { style: { padding: "10px 0 0", fontSize: 12, color: TODO_PALETTE.sage } }, `\uD83C\uDF73 ${item.recipeTitle} から追加`)));
}
function RecipeNotebook({ apiKey, jinaApiKey, categoryOrder, applianceOrder, initialView }) {
    useGoogleFonts();
    const [recipes, setRecipes] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [view, setView] = useState(initialView || "list"); // list | add | detail | editRecipe | calendar
    const [detailOrigin, setDetailOrigin] = useState("list"); // "list" | "calendar" — where "一覧へ" should return to
    const [calendarMode, setCalendarMode] = useState("plan"); // remembers which calendar tab was active across a detail-view detour
    const [addMode, setAddMode] = useState("url");
    const [selectedId, setSelectedId] = useState(null);
    const [editDraft, setEditDraft] = useState(null);
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState(null);
    const [meatTypeFilter, setMeatTypeFilter] = useState(null);
    const [noodleTypeFilter, setNoodleTypeFilter] = useState(null);
    const [vegTypeFilter, setVegTypeFilter] = useState(null);
    const [applianceFilter, setApplianceFilter] = useState(null);
    const [inputUrl, setInputUrl] = useState("");
    const [inputText, setInputText] = useState("");
    const [extractError, setExtractError] = useState("");
    const [draft, setDraft] = useState(null);
    const [saveError, setSaveError] = useState("");
    const [ocrRunning, setOcrRunning] = useState(false);
    const [ocrProgress, setOcrProgress] = useState("");
    const [ocrError, setOcrError] = useState("");
    const [cropQueue, setCropQueue] = useState([]); // [{file, url}]
    const [cropIndex, setCropIndex] = useState(0);
    const [cropResults, setCropResults] = useState([]); // [{file, rect|null}]
    const [urlImporting, setUrlImporting] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [screenshotImageUrl, setScreenshotImageUrl] = useState("");
    const [urlImportError, setUrlImportError] = useState("");
    const [urlImportNotice, setUrlImportNotice] = useState("");
    useEffect(() => {
        // Show cached data instantly while the Firebase listener connects, so
        // the app isn't blank on a slow connection.
        try {
            const cachedRecipes = localStorage.getItem("recipes");
            if (cachedRecipes)
                setRecipes(JSON.parse(cachedRecipes));
        }
        catch {
            // ignore
        }
        const recipesRef = uref("recipes");
        const recipesCallback = (snapshot) => {
            const val = snapshot.val();
            const list = val ? Object.values(val).sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || "")) : [];
            setRecipes(list);
            setLoaded(true);
            try {
                localStorage.setItem("recipes", JSON.stringify(list));
            }
            catch {
                // ignore — cache is best-effort
            }
        };
        recipesRef.on("value", recipesCallback, () => {
            // Firebase unreachable — fall back to whatever was cached locally
            setLoaded(true);
        });
        return () => {
            recipesRef.off("value", recipesCallback);
        };
    }, []);
    const [mealPlan, setMealPlan] = useState({}); // { "YYYY-MM-DD": { recipeId, title } }
    useEffect(() => {
        const planRef = uref("meal-plan");
        const cb = (snap) => {
            const val = snap.val() || {};
            // Normalize any legacy single-entry days (from before multiple
            // recipes per day was supported) into a 1-item array.
            const normalized = {};
            Object.keys(val).forEach((k) => {
                normalized[k] = Array.isArray(val[k]) ? val[k] : [val[k]];
            });
            setMealPlan(normalized);
        };
        planRef.on("value", cb);
        return () => planRef.off("value", cb);
    }, []);
    const MAX_MEALS_PER_DAY = 3;
    function addMealPlanEntry(dateStr, recipe) {
        // Compute the next array from the updater's `prev`, not the outer
        // `mealPlan` closure — otherwise two calls fired back-to-back for
        // the same day (e.g. auto-fill adding a main + a side dish) both
        // read the same stale snapshot and the second overwrites the first,
        // silently dropping it.
        setMealPlan((prev) => {
            const current = Array.isArray(prev[dateStr]) ? prev[dateStr] : [];
            if (current.some((e) => e.recipeId === recipe.id) || current.length >= MAX_MEALS_PER_DAY)
                return prev;
            const entry = { recipeId: recipe.id, title: recipe.title, imageUrl: recipe.imageUrl || recipe.imageUrl2 || "", dishCategory: recipe.dishCategory || null };
            const next = [...current, entry];
            uref(`meal-plan/${dateStr}`).set(next);
            return { ...prev, [dateStr]: next };
        });
    }
    function removeMealPlanEntry(dateStr, recipeId) {
        setMealPlan((prev) => {
            const current = Array.isArray(prev[dateStr]) ? prev[dateStr] : [];
            const next = current.filter((e) => e.recipeId !== recipeId);
            if (next.length > 0)
                uref(`meal-plan/${dateStr}`).set(next);
            else
                uref(`meal-plan/${dateStr}`).remove();
            const copy = { ...prev };
            if (next.length > 0)
                copy[dateStr] = next;
            else
                delete copy[dateStr];
            return copy;
        });
    }
    // Directly overwrites a day's whole entry list — used by the date-swap
    // screen, which moves already-built {recipeId,title,imageUrl,...}
    // entries between dates rather than re-adding from a fresh recipe.
    function setMealPlanEntries(dateStr, entries) {
        setMealPlan((prev) => {
            const copy = { ...prev };
            if (entries.length > 0) {
                copy[dateStr] = entries;
                uref(`meal-plan/${dateStr}`).set(entries);
            }
            else {
                delete copy[dateStr];
                uref(`meal-plan/${dateStr}`).remove();
            }
            return copy;
        });
    }
    const writeRecipe = useCallback(async (recipe) => {
        try {
            await uref(`recipes/${recipe.id}`).set(recipe);
        }
        catch {
            setSaveError("保存に失敗しました(通信環境を確認してください)。");
        }
    }, []);
    const removeRecipeRemote = useCallback(async (id) => {
        try {
            await uref(`recipes/${id}`).remove();
        }
        catch {
            setSaveError("削除に失敗しました(通信環境を確認してください)。");
        }
    }, []);
    // Adds a recipe's (already-scaled) ingredients into the shared family
    // shopping list (same store as the 買い物 tab), tagged with source:"recipe"
    // so they can be told apart from manually-typed items there.
    const addToShoppingList = async (recipeTitle, ingredients) => {
        await addIngredientsToSharedShopping(recipeTitle, ingredients);
    };
    const resetAddForm = () => {
        setInputUrl("");
        setInputText("");
        setDraft(null);
        setExtractError("");
        setOcrError("");
        setOcrProgress("");
        setUrlImportError("");
        setScreenshotImageUrl("");
    };
    // Step 1: user picks screenshots — queue them up for cropping rather than
    // OCR'ing immediately. Letting the person exclude photos/ads/nav bars
    // before OCR runs is the single biggest accuracy win we've found.
    const handleScreenshots = (fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0)
            return;
        setOcrError("");
        setCropResults([]);
        setCropIndex(0);
        setCropQueue(files.map((file) => ({ file, url: URL.createObjectURL(file) })));
        // Grab a color copy of the first screenshot to offer as the recipe's
        // photo, in case it's an actual photo of the finished dish rather than
        // a text screenshot (the person can remove it in the editor if not).
        fileToColorDataUrl(files[0], 900)
            .then((dataUrl) => setScreenshotImageUrl(dataUrl))
            .catch(() => {
            // non-critical — just skip attaching a photo
        });
    };
    const handleCropConfirm = (rect) => {
        const entry = { file: cropQueue[cropIndex].file, rect };
        advanceCropQueue([...cropResults, entry]);
    };
    const handleCropSkip = () => {
        advanceCropQueue(cropResults);
    };
    const advanceCropQueue = (resultsSoFar) => {
        if (cropIndex + 1 < cropQueue.length) {
            setCropResults(resultsSoFar);
            setCropIndex((i) => i + 1);
        }
        else {
            setCropQueue([]);
            setCropResults([]);
            runOcrBatch(resultsSoFar);
        }
    };
    const runOcrBatch = async (items) => {
        if (!items.length)
            return;
        setOcrRunning(true);
        let worker;
        try {
            let combined = "";
            let visionErrorMsg = "";
            if (apiKey) {
                for (let i = 0; i < items.length; i++) {
                    setOcrProgress(`${i + 1}/${items.length}枚目を読み取り中...`);
                    const canvas = await loadAndPreprocessImage(items[i].file, items[i].rect);
                    try {
                        const text = await transcribeImageWithClaude(canvas, apiKey);
                        combined += (combined ? "\n" : "") + text.trim();
                    }
                    catch (visionErr) {
                        // fall back to Tesseract for this one image rather than failing the whole batch
                        visionErrorMsg = visionErr?.message || "不明なエラー";
                        if (!worker) {
                            const { createWorker } = await import("tesseract.js");
                            worker = await createWorker("jpn");
                        }
                        const { data } = await worker.recognize(canvas);
                        combined += (combined ? "\n" : "") + (data?.text || "").trim();
                    }
                }
            }
            else {
                const { createWorker } = await import("tesseract.js");
                worker = await createWorker("jpn");
                for (let i = 0; i < items.length; i++) {
                    setOcrProgress(`${i + 1}/${items.length}枚目を読み取り中...`);
                    const canvas = await loadAndPreprocessImage(items[i].file, items[i].rect);
                    const { data } = await worker.recognize(canvas);
                    combined += (combined ? "\n" : "") + (data?.text || "").trim();
                }
            }
            const fullText = inputText ? `${inputText}\n${combined}` : combined;
            setInputText(fullText);
            if (visionErrorMsg) {
                setOcrError(`Claudeでの画像読み取りに失敗したため、OCRを使用しました: ${visionErrorMsg}`);
            }
            if (apiKey && combined.trim()) {
                setOcrProgress("レシピを抽出中...");
                await handleExtract(fullText);
            }
        }
        catch (e) {
            setOcrError("画像の読み取りに失敗しました。通信状況を確認して、もう一度試してください。");
        }
        finally {
            if (worker) {
                try {
                    await worker.terminate();
                }
                catch {
                    // ignore
                }
            }
            setOcrRunning(false);
            setOcrProgress("");
        }
    };
    const cleanupSteps = (steps) => (steps || []).map((s) => s.trim()).filter(Boolean);
    const saveRecipe = async (recipeData) => {
        const newRecipe = {
            ...recipeData,
            steps: cleanupSteps(recipeData.steps),
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            savedAt: new Date().toISOString(),
        };
        await writeRecipe(newRecipe);
        return newRecipe;
    };
    // overrideText lets callers (like the screenshot-OCR flow) trigger
    // extraction immediately with freshly-read text, without waiting on a
    // state update round-trip.
    const handleExtract = async (overrideText) => {
        const textToUse = typeof overrideText === "string" ? overrideText : inputText;
        if (!textToUse.trim()) {
            setExtractError("投稿のキャプション文を貼り付けてください。");
            return;
        }
        setExtractError("");
        setExtracting(true);
        try {
            let parsedList;
            if (apiKey) {
                try {
                    const structuredList = await extractWithClaude(textToUse, apiKey);
                    parsedList = structuredList.map((structured) => {
                        const classifyText = `${structured.title || ""} ${textToUse}`;
                        const inferred = resolveClassification(structured, classifyText, structured.ingredients || [], textToUse, true);
                        return {
                            title: structured.title || "",
                            servings: structured.servings || "",
                            ingredients: structured.ingredients || [],
                            steps: structured.steps || [],
                            tags: [],
                            memo: structured.memo || "",
                            dishCategory: inferred.dishCategory,
                            meatType: inferred.meatType,
                            noodleType: inferred.noodleType,
                            vegType: inferred.vegType,
                            appliance: inferred.appliance,
                        };
                    });
                }
                catch {
                    parsedList = [parseCaptionHeuristic(textToUse)];
                }
            }
            else {
                parsedList = [parseCaptionHeuristic(textToUse)];
            }
            // Always create the record(s) immediately — never block on a
            // review screen, even if Claude wasn't used or extraction was
            // partial; the person can always fix details afterward via edit.
            const savedRecipes = [];
            for (const parsed of parsedList) {
                const recipeData = {
                    ...parsed,
                    sourceUrl: inputUrl.trim(),
                    sourceType: detectSource(inputUrl),
                    imageUrl: screenshotImageUrl || "",
                };
                savedRecipes.push(await saveRecipe(recipeData));
            }
            resetAddForm();
            if (savedRecipes.length === 1) {
                setSelectedId(savedRecipes[0].id);
                setView("detail");
            }
            else {
                setView("list");
            }
        }
        finally {
            setExtracting(false);
        }
    };
    const handleUrlImport = async () => {
        const url = inputUrl.trim();
        if (!url) {
            setUrlImportError("URLを入力してください。");
            return;
        }
        if (/(?:^|\.)x\.com|(?:^|\.)twitter\.com/i.test(url)) {
            setUrlImportError("Xの投稿はログインしないと本文が見れない仕様のため、外部サービスからは読み込めません。下の「スクリーンショットから読み取る」をお使いください。");
            return;
        }
        setUrlImportError("");
        setUrlImportNotice("");
        setUrlImporting(true);
        try {
            const pageText = await fetchPageText(url, jinaApiKey);
            const imageUrl = extractHeroImageUrl(pageText);
            const pageTitle = extractPageTitle(pageText);
            let structuredList;
            let usedClaude = false;
            if (apiKey) {
                try {
                    structuredList = await extractWithClaude(pageText, apiKey);
                    usedClaude = true;
                }
                catch {
                    // fall back to local parsing rather than failing outright
                    structuredList = [parseCaptionHeuristic(pageText)];
                }
            }
            else {
                structuredList = [parseCaptionHeuristic(pageText)];
            }
            // Always create the record(s) immediately on a successful fetch —
            // never block on a review screen. Most pages have exactly one
            // recipe, but occasionally a single URL bundles two (e.g. a blog
            // post covering two dishes); extractWithClaude splits those into
            // separate entries, and each becomes its own saved recipe here.
            const savedRecipes = [];
            for (let i = 0; i < structuredList.length; i++) {
                const structured = structuredList[i];
                const finalTitle = structured.title || (i === 0 ? pageTitle : "");
                const classifyText = `${finalTitle} ${pageText.slice(0, 3000)}`;
                const applianceSource = `${finalTitle} ${(structured.steps || []).join(" ")} ${structured.memo || ""} ${pageText.slice(0, 3000)}`;
                const inferred = resolveClassification(structured, classifyText, structured.ingredients || [], applianceSource, usedClaude);
                const recipeData = {
                    title: finalTitle,
                    servings: structured.servings || "",
                    ingredients: structured.ingredients || [],
                    steps: structured.steps || [],
                    tags: [],
                    memo: structured.memo || "",
                    dishCategory: inferred.dishCategory,
                    meatType: inferred.meatType,
                    noodleType: inferred.noodleType,
                    vegType: inferred.vegType,
                    appliance: inferred.appliance,
                    sourceUrl: url,
                    sourceType: detectSource(url),
                    imageUrl: imageUrl || "",
                };
                savedRecipes.push(await saveRecipe(recipeData));
            }
            resetAddForm();
            const onlyRecipeIsEmpty = savedRecipes.length === 1 && savedRecipes[0].ingredients.length === 0 && savedRecipes[0].steps.length === 0;
            if (savedRecipes.length === 1 && !onlyRecipeIsEmpty) {
                setSelectedId(savedRecipes[0].id);
                setView("detail");
            }
            else if (onlyRecipeIsEmpty) {
                // Instagram in particular often blocks the fetch from seeing
                // the real caption at all — better to say so plainly than
                // to silently leave someone with a title-only, empty recipe
                // and no idea why.
                setUrlImportNotice("材料・手順を読み取れませんでした。ページの本文が取得できなかった可能性があります。レシピは仮の状態で保存したので、開いて「テキストから」でキャプションを貼り付けるか、スクリーンショットで読み取り直してください。");
                setView("list");
            }
            else {
                setUrlImportNotice(`${savedRecipes.length}件のレシピを見つけて追加しました。`);
                setView("list");
            }
        }
        catch (e) {
            setUrlImportError(`読み込みに失敗しました: ${e.message || "不明なエラー"}`);
        }
        finally {
            setUrlImporting(false);
        }
    };
    const handleSaveDraft = async () => {
        if (!draft)
            return;
        await saveRecipe(draft);
        resetAddForm();
        setView("list");
    };
    const handleDelete = async (id) => {
        await removeRecipeRemote(id);
        setView("list");
    };
    const toggleFavorite = async (recipe) => {
        await writeRecipe({ ...recipe, favorite: !recipe.favorite });
    };
    const [confirmDelete, setConfirmDelete] = useState(false);
    const handleUpdateRecipe = async () => {
        if (!editDraft)
            return;
        const cleaned = { ...editDraft, steps: cleanupSteps(editDraft.steps) };
        await writeRecipe(cleaned);
        setEditDraft(null);
        setView("detail");
    };
    const [favoriteOnly, setFavoriteOnly] = useState(false);
    const [viewMode, setViewMode] = useState(() => {
        try {
            return localStorage.getItem("recipeViewMode") || "grid";
        }
        catch {
            return "grid";
        }
    });
    const changeViewMode = (m) => {
        setViewMode(m);
        try {
            localStorage.setItem("recipeViewMode", m);
        }
        catch {
            // ignore
        }
    };
    const filtered = useMemo(() => {
        let list = recipes;
        if (favoriteOnly) {
            list = list.filter((r) => r.favorite);
        }
        if (categoryFilter) {
            list = list.filter((r) => (r.dishCategory || "その他") === categoryFilter);
        }
        if (categoryFilter === "肉料理" && meatTypeFilter) {
            list = list.filter((r) => (r.meatType || "その他") === meatTypeFilter);
        }
        if (categoryFilter === "麺類" && noodleTypeFilter) {
            list = list.filter((r) => (r.noodleType || "その他") === noodleTypeFilter);
        }
        if (categoryFilter === "野菜料理" && vegTypeFilter) {
            list = list.filter((r) => (r.vegType || "その他") === vegTypeFilter);
        }
        if (applianceFilter) {
            list = list.filter((r) => r.appliance === applianceFilter);
        }
        if (!query.trim())
            return list;
        const q = query.trim().toLowerCase();
        return list.filter((r) => {
            const hay = [
                r.title,
                r.dishCategory,
                r.meatType,
                r.appliance,
                ...(r.tags || []),
                ...(r.ingredients || []).map((i) => i.name),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(q);
        });
    }, [recipes, query, categoryFilter, meatTypeFilter, noodleTypeFilter, vegTypeFilter, applianceFilter, favoriteOnly]);
    const availableCategories = categoryOrder || DISH_CATEGORIES;
    const availableAppliances = applianceOrder || APPLIANCES;
    const selected = recipes.find((r) => r.id === selectedId);
    return (React.createElement("div", { style: {
            minHeight: "100vh",
            background: COLORS.paper,
            fontFamily: "'Noto Sans JP', sans-serif",
            color: COLORS.ink,
            display: "flex",
            justifyContent: "center",
            padding: "0",
        } },
        cropQueue.length > 0 && (React.createElement(LazyCropOverlay, { src: cropQueue[cropIndex].url, index: cropIndex, total: cropQueue.length, onConfirm: handleCropConfirm, onUseFull: () => handleCropConfirm(null), onSkip: handleCropSkip })),
        React.createElement("div", { style: {
                width: "100%",
                maxWidth: 520,
                padding: "22px 18px 118px",
            } },
            React.createElement(Header, { view: view, onBack: () => { setView(view === "detail" ? detailOrigin : "list"); setDetailOrigin("list"); resetAddForm(); setConfirmDelete(false); }, isFavorite: !!selected?.favorite, onToggleFavorite: () => selected && toggleFavorite(selected), onEdit: () => {
                    if (!selected)
                        return;
                    // If only the 2nd photo slot is filled, shift it into the
                    // main slot so there's never an empty gap before a used one.
                    // Also guard against older/malformed records missing
                    // array fields entirely (e.g. an ingredients-less record
                    // from an earlier version) — DraftEditor assumes arrays.
                    const normalized = { ...selected };
                    if (!Array.isArray(normalized.ingredients))
                        normalized.ingredients = [];
                    if (!Array.isArray(normalized.steps))
                        normalized.steps = [];
                    if (!Array.isArray(normalized.tags))
                        normalized.tags = [];
                    if (!normalized.imageUrl && normalized.imageUrl2) {
                        normalized.imageUrl = normalized.imageUrl2;
                        normalized.imageUrl2 = "";
                    }
                    setEditDraft(normalized);
                    setView("editRecipe");
                }, confirmDelete: confirmDelete, onArmDelete: () => setConfirmDelete(true), onConfirmDelete: () => selected && handleDelete(selected.id), onCancelDelete: () => setConfirmDelete(false) }),
            !loaded && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, color: COLORS.inkSoft, padding: 24 } },
                React.createElement(Loader2, { size: 18, className: "spin" }),
                React.createElement("span", null, "\u8AAD\u307F\u8FBC\u307F\u4E2D..."))),
            loaded && view === "list" && (React.createElement(ListView, { recipes: filtered, total: recipes.length, query: query, setQuery: setQuery, categoryFilter: categoryFilter, setCategoryFilter: setCategoryFilter, meatTypeFilter: meatTypeFilter, setMeatTypeFilter: setMeatTypeFilter, noodleTypeFilter: noodleTypeFilter, setNoodleTypeFilter: setNoodleTypeFilter, vegTypeFilter: vegTypeFilter, setVegTypeFilter: setVegTypeFilter, availableCategories: availableCategories, applianceFilter: applianceFilter, setApplianceFilter: setApplianceFilter, availableAppliances: availableAppliances, favoriteOnly: favoriteOnly, setFavoriteOnly: setFavoriteOnly, viewMode: viewMode, setViewMode: changeViewMode, onAdd: (mode = "url") => { setAddMode(mode); setView("add"); }, onSelect: (id) => { setSelectedId(id); setView("detail"); setConfirmDelete(false); }, onDeleteRecipe: handleDelete, notice: urlImportNotice, onDismissNotice: () => setUrlImportNotice("") })),
            loaded && view === "calendar" && (React.createElement(LazyCalendarView, { recipes: recipes, mealPlan: mealPlan, onAddEntry: addMealPlanEntry, onRemoveEntry: removeMealPlanEntry, onSetDayEntries: setMealPlanEntries, onBack: () => setView("list"), onSelectRecipe: (id) => { setSelectedId(id); setDetailOrigin("calendar"); setView("detail"); setConfirmDelete(false); }, initialMode: calendarMode, onModeChange: setCalendarMode })),
            loaded && view === "add" && (React.createElement(AddView, { inputUrl: inputUrl, setInputUrl: setInputUrl, inputText: inputText, setInputText: setInputText, extractError: extractError, onExtract: handleExtract, extracting: extracting, draft: draft, setDraft: setDraft, onSave: handleSaveDraft, onDiscard: () => setDraft(null), saveError: saveError, ocrRunning: ocrRunning, ocrProgress: ocrProgress, ocrError: ocrError, onScreenshots: handleScreenshots, urlImporting: urlImporting, urlImportError: urlImportError, onUrlImport: handleUrlImport, apiKey: apiKey, addMode: addMode, categoryOrder: categoryOrder, applianceOrder: applianceOrder })),
            loaded && view === "detail" && selected && (React.createElement(DetailView, { recipe: selected, onAddToShoppingList: addToShoppingList })),
            loaded && view === "editRecipe" && editDraft && (React.createElement(DraftEditor, { draft: editDraft, setDraft: setEditDraft, onSave: handleUpdateRecipe, onDiscard: () => {
                    setEditDraft(null);
                    setView("detail");
                }, saveError: saveError, mode: "edit", categoryOrder: categoryOrder, applianceOrder: applianceOrder }))),
        React.createElement("style", null, `
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input, textarea { font-family: inherit; }
        button { font-family: inherit; cursor: pointer; -webkit-tap-highlight-color: transparent; }
        button:active { transform: scale(0.985); }
        input, textarea, select { -webkit-appearance: none; }
        * { -webkit-tap-highlight-color: transparent; }
        ::selection { background: ${COLORS.accent}55; }
      `)));
}
function Header({ view, onBack, isFavorite, onToggleFavorite, onEdit, confirmDelete, onArmDelete, onConfirmDelete, onCancelDelete }) {
    return (React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 22, minHeight: 48 } }, view !== "list" ? (React.createElement(React.Fragment, null,
        React.createElement("button", { onClick: onBack, style: {
                background: "none",
                border: "none",
                color: COLORS.ink,
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontSize: 14,
                fontWeight: 700,
                padding: "6px 8px 6px 0",
                flexShrink: 0,
            } },
            React.createElement(ChevronLeft, { size: 20 }),
            " \u4E00\u89A7\u3078"),
        view === "detail" && (confirmDelete ? (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("button", { onClick: onConfirmDelete, style: { border: "none", background: COLORS.plum, color: "#fff", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" } }, "\u524A\u9664"),
            React.createElement("button", { onClick: onCancelDelete, style: { border: `1px solid ${COLORS.line}`, background: "none", color: COLORS.inkSoft, borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" } }, "\u30AD\u30E3\u30F3\u30BB\u30EB"))) : (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4 } },
            React.createElement("button", { onClick: onToggleFavorite, "aria-label": "\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF", style: { background: isFavorite ? `${COLORS.accent}22` : "none", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", display: "flex" } },
                React.createElement(Bookmark, { size: 19, color: isFavorite ? COLORS.accent : COLORS.inkSoft })),
            React.createElement("button", { onClick: onEdit, "aria-label": "\u7DE8\u96C6", style: { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" } },
                React.createElement(Edit2, { size: 18, color: COLORS.inkSoft })),
            React.createElement("button", { onClick: onArmDelete, "aria-label": "\u524A\u9664", style: { background: "none", border: "none", padding: 8, cursor: "pointer", display: "flex" } },
                React.createElement(Trash2, { size: 18, color: COLORS.inkSoft }))))))) : (React.createElement(React.Fragment, null,
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 3 } },
            React.createElement("div", { style: { fontSize: 10, letterSpacing: "0.18em", fontWeight: 700, color: COLORS.sage } }, "MY KITCHEN"),
            React.createElement("h1", { style: {
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: 27,
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: "-0.04em",
                    lineHeight: 1.18,
                } }, "\u30EC\u30B7\u30D4\u30CE\u30FC\u30C8"))))));
}
function groupByDishCategory(recipes) {
    const groups = {};
    for (const r of recipes) {
        const cat = r.dishCategory || "その他";
        if (!groups[cat])
            groups[cat] = [];
        groups[cat].push(r);
    }
    const ordered = DISH_CATEGORIES.filter((c) => groups[c]?.length);
    Object.keys(groups).forEach((c) => {
        if (!ordered.includes(c))
            ordered.push(c);
    });
    return ordered.map((cat) => {
        const items = groups[cat];
        if (cat === "肉料理") {
            const byMeat = {};
            for (const r of items) {
                const mt = r.meatType || "その他";
                if (!byMeat[mt])
                    byMeat[mt] = [];
                byMeat[mt].push(r);
            }
            const orderedMeat = MEAT_TYPES.filter((m) => byMeat[m]?.length);
            Object.keys(byMeat).forEach((m) => {
                if (!orderedMeat.includes(m))
                    orderedMeat.push(m);
            });
            return { cat, subGroups: orderedMeat.map((m) => ({ label: m, items: byMeat[m] })) };
        }
        return { cat, subGroups: null, items };
    });
}
function ListView({ recipes, total, query, setQuery, categoryFilter, setCategoryFilter, meatTypeFilter, setMeatTypeFilter, noodleTypeFilter, setNoodleTypeFilter, vegTypeFilter, setVegTypeFilter, availableCategories, applianceFilter, setApplianceFilter, availableAppliances, favoriteOnly, setFavoriteOnly, viewMode, setViewMode, onAdd, onSelect, onDeleteRecipe, notice, onDismissNotice, }) {
    useEffect(() => {
        if (!notice)
            return;
        const t = setTimeout(() => onDismissNotice(), Math.min(9000, 3000 + notice.length * 60));
        return () => clearTimeout(t);
    }, [notice]);
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [showApplianceFilter, setShowApplianceFilter] = useState(false);
    const quickAddItems = [
        { label: "URLから追加", icon: Link2, mode: "url" },
        { label: "画像から追加", icon: GridIcon, mode: "image" },
        { label: "撮影して追加", icon: Camera, mode: "camera" },
        { label: "テキストから", icon: ClipboardPaste, mode: "text" },
        { label: "手動で入力", icon: Edit2, mode: "manual" },
    ];
    return (React.createElement("div", { style: { paddingBottom: 24 } },
        notice && React.createElement("div", { onClick: onDismissNotice, style: {
                display: "flex", alignItems: "center", gap: 8, background: COLORS.accentSoft, color: COLORS.accent,
                borderRadius: 12, padding: "10px 14px", fontSize: 13, fontWeight: 700, marginBottom: 12, cursor: "pointer"
            } },
            React.createElement(Check, { size: 15, style: { flexShrink: 0 } }),
            React.createElement("span", { style: { flex: 1 } }, notice)),
        React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } },
            React.createElement("div", { style: {
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "#fff",
                    borderRadius: 999,
                    padding: "11px 16px",
                    boxShadow: "0 1px 4px rgba(46,42,36,0.06)",
                } },
                React.createElement(Search, { size: 16, color: COLORS.inkSoft, style: { flexShrink: 0 } }),
                React.createElement("input", { value: query, onChange: (e) => setQuery(e.target.value), placeholder: "\u30EC\u30B7\u30D4\u3092\u691C\u7D22", style: {
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        flex: 1,
                        minWidth: 0,
                        width: "100%",
                        fontSize: 16,
                        color: COLORS.ink,
                    } })),
            React.createElement("button", { onClick: () => setViewMode(viewMode === "grid" ? "list" : "grid"), title: viewMode === "grid" ? "\u30EA\u30B9\u30C8\u8868\u793A\u306B\u5207\u308A\u66FF\u3048" : "\u30B0\u30EA\u30C3\u30C9\u8868\u793A\u306B\u5207\u308A\u66FF\u3048", "aria-label": "\u8868\u793A\u5207\u308A\u66FF\u3048", style: {
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#fff",
                    border: "none",
                    borderRadius: "50%",
                    boxShadow: "0 1px 4px rgba(46,42,36,0.06)",
                    cursor: "pointer",
                } }, viewMode === "grid" ? React.createElement(ListIcon, { size: 17, color: COLORS.inkSoft }) : React.createElement(GridIcon, { size: 17, color: COLORS.inkSoft })),
            React.createElement("button", { onClick: () => setFavoriteOnly((v) => !v), title: "\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u3060\u3051\u8868\u793A", "aria-label": "\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u3060\u3051\u8868\u793A", style: {
                    flexShrink: 0,
                    width: 44,
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: favoriteOnly ? COLORS.accent : "#fff",
                    border: "none",
                    borderRadius: "50%",
                    boxShadow: "0 1px 4px rgba(46,42,36,0.06)",
                    cursor: "pointer",
                } },
                React.createElement(Bookmark, { size: 17, color: favoriteOnly ? "#fff" : COLORS.inkSoft }))),
        favoriteOnly && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 12, fontSize: 12, color: COLORS.accent, fontWeight: 700 } },
            React.createElement(Bookmark, { size: 13 }),
            " \u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u3057\u305F\u30EC\u30B7\u30D4\u306E\u307F\u8868\u793A\u4E2D")),
        availableAppliances.length > 0 && (React.createElement("div", { style: { marginBottom: 14 } },
            React.createElement("button", { onClick: () => setShowApplianceFilter((v) => !v), style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: applianceFilter ? COLORS.sageSoft : "none",
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: applianceFilter ? COLORS.sage : COLORS.inkSoft,
                } },
                React.createElement(ChevronDown, { size: 13, style: { transform: showApplianceFilter ? "rotate(180deg)" : "none", transition: "transform 0.15s" } }),
                applianceFilter ? `\u8ABF\u7406\u5BB6\u96FB: ${applianceFilter}` : "\u8ABF\u7406\u5BB6\u96FB\u3067\u7D5E\u308A\u8FBC\u3080"),
            showApplianceFilter && (React.createElement("div", { style: {
                    display: "flex",
                    gap: 18,
                    overflowX: "auto",
                    marginTop: 8,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${COLORS.line}`,
                    WebkitOverflowScrolling: "touch",
                } },
                React.createElement("button", { onClick: () => setApplianceFilter(null), style: {
                        flexShrink: 0,
                        background: "none",
                        border: "none",
                        borderBottom: `2px solid ${!applianceFilter ? COLORS.accent : "transparent"}`,
                        padding: "0 2px 8px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: !applianceFilter ? COLORS.ink : COLORS.inkSoft,
                        whiteSpace: "nowrap",
                    } }, "\u3059\u3079\u3066"),
                availableAppliances.map((ap) => (React.createElement("button", { key: ap, onClick: () => setApplianceFilter(applianceFilter === ap ? null : ap), style: {
                        flexShrink: 0,
                        background: "none",
                        border: "none",
                        borderBottom: `2px solid ${applianceFilter === ap ? COLORS.accent : "transparent"}`,
                        padding: "0 2px 8px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: applianceFilter === ap ? COLORS.ink : COLORS.inkSoft,
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                    } }, ap))))))),
        availableCategories.length > 1 && (React.createElement("div", { style: {
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                marginBottom: 16,
                WebkitOverflowScrolling: "touch",
            } },
            React.createElement("button", { onClick: () => { setCategoryFilter(null); setMeatTypeFilter(null); setNoodleTypeFilter(null); setVegTypeFilter(null); }, style: {
                    flexShrink: 0,
                    fontSize: 12.5,
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "none",
                    background: !categoryFilter ? COLORS.accent : COLORS.chipBg,
                    color: !categoryFilter ? "#fff" : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, "\u3059\u3079\u3066"),
            availableCategories.map((cat) => (React.createElement("button", { key: cat, onClick: () => { setCategoryFilter(categoryFilter === cat ? null : cat); setMeatTypeFilter(null); setNoodleTypeFilter(null); setVegTypeFilter(null); }, style: {
                    flexShrink: 0,
                    fontSize: 12.5,
                    padding: "8px 16px",
                    borderRadius: 999,
                    border: "none",
                    background: categoryFilter === cat ? COLORS.accent : COLORS.chipBg,
                    color: categoryFilter === cat ? "#fff" : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                } }, cat))))),
        categoryFilter === "肉料理" && (React.createElement("div", { style: {
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                marginBottom: 16,
                marginTop: -8,
                WebkitOverflowScrolling: "touch",
            } },
            React.createElement("button", { onClick: () => setMeatTypeFilter(null), style: {
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    border: `1px solid ${!meatTypeFilter ? COLORS.sage : COLORS.line}`,
                    background: !meatTypeFilter ? COLORS.sageSoft : "transparent",
                    color: !meatTypeFilter ? COLORS.sage : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, "\u3059\u3079\u3066\u306E\u8089"),
            MEAT_TYPES.map((mt) => (React.createElement("button", { key: mt, onClick: () => setMeatTypeFilter(meatTypeFilter === mt ? null : mt), style: {
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    border: `1px solid ${meatTypeFilter === mt ? COLORS.sage : COLORS.line}`,
                    background: meatTypeFilter === mt ? COLORS.sageSoft : "transparent",
                    color: meatTypeFilter === mt ? COLORS.sage : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, mt))))),
        categoryFilter === "麺類" && (React.createElement("div", { style: {
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                marginBottom: 16,
                marginTop: -8,
                WebkitOverflowScrolling: "touch",
            } },
            React.createElement("button", { onClick: () => setNoodleTypeFilter(null), style: {
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    border: `1px solid ${!noodleTypeFilter ? COLORS.sage : COLORS.line}`,
                    background: !noodleTypeFilter ? COLORS.sageSoft : "transparent",
                    color: !noodleTypeFilter ? COLORS.sage : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, "\u3059\u3079\u3066\u306E\u9EBA"),
            NOODLE_TYPES.map((nt) => (React.createElement("button", { key: nt, onClick: () => setNoodleTypeFilter(noodleTypeFilter === nt ? null : nt), style: {
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    border: `1px solid ${noodleTypeFilter === nt ? COLORS.sage : COLORS.line}`,
                    background: noodleTypeFilter === nt ? COLORS.sageSoft : "transparent",
                    color: noodleTypeFilter === nt ? COLORS.sage : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, nt))))),
        categoryFilter === "野菜料理" && (React.createElement("div", { style: {
                display: "flex",
                gap: 8,
                overflowX: "auto",
                paddingBottom: 4,
                marginBottom: 16,
                marginTop: -8,
                WebkitOverflowScrolling: "touch",
            } },
            React.createElement("button", { onClick: () => setVegTypeFilter(null), style: {
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    border: `1px solid ${!vegTypeFilter ? COLORS.sage : COLORS.line}`,
                    background: !vegTypeFilter ? COLORS.sageSoft : "transparent",
                    color: !vegTypeFilter ? COLORS.sage : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, "\u3059\u3079\u3066\u306E\u91CE\u83DC\u6599\u7406"),
            VEG_TYPES.map((vt) => (React.createElement("button", { key: vt, onClick: () => setVegTypeFilter(vegTypeFilter === vt ? null : vt), style: {
                    flexShrink: 0,
                    fontSize: 11.5,
                    padding: "6px 13px",
                    borderRadius: 999,
                    border: `1px solid ${vegTypeFilter === vt ? COLORS.sage : COLORS.line}`,
                    background: vegTypeFilter === vt ? COLORS.sageSoft : "transparent",
                    color: vegTypeFilter === vt ? COLORS.sage : COLORS.inkSoft,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                } }, vt))))),
        total === 0 ? (React.createElement(EmptyState, { onAdd: onAdd })) : recipes.length === 0 ? (React.createElement("p", { style: { color: COLORS.inkSoft, fontSize: 14, padding: "20px 4px" } }, query.trim() && categoryFilter
            ? `「${categoryFilter}」の中に「${query}」に一致するレシピが見つかりませんでした。`
            : query.trim()
                ? `「${query}」に一致するレシピが見つかりませんでした。`
                : `「${categoryFilter}」のレシピはまだありません。`)) : viewMode === "grid" ? (React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } }, recipes.map((r) => (React.createElement(RecipeGridCard, { key: r.id, recipe: r, onClick: () => onSelect(r.id) }))))) : (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10 } }, recipes.map((r) => (React.createElement(RecipeListCard, { key: r.id, recipe: r, onClick: () => onSelect(r.id) }))))),
        showQuickAdd && React.createElement("div", { onClick: () => setShowQuickAdd(false), style: {
                position: "fixed", inset: 0, background: "rgba(32,35,31,0.20)", zIndex: 80
            } }),
        showQuickAdd && React.createElement("div", { style: {
                position: "fixed",
                right: "max(20px, calc(50% - 238px))",
                bottom: "calc(154px + env(safe-area-inset-bottom, 0px))",
                zIndex: 90,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 10,
            } }, quickAddItems.map((item) => {
                const Icon = item.icon;
                return React.createElement("button", { key: item.label, onClick: () => { setShowQuickAdd(false); onAdd(item.mode); }, style: {
                        border: "none", background: "transparent", padding: 0, display: "flex", alignItems: "center", gap: 10
                    } },
                    React.createElement("span", { style: {
                            background: "rgba(255,255,255,0.98)", color: COLORS.ink, borderRadius: 12, padding: "8px 12px",
                            fontSize: 13, fontWeight: 700, boxShadow: "0 6px 22px rgba(32,35,31,0.12)", whiteSpace: "nowrap"
                        } }, item.label),
                    React.createElement("span", { style: {
                            width: 48, height: 48, borderRadius: "50%", background: COLORS.accent, color: "#fff",
                            display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(67,84,69,0.28)"
                        } }, React.createElement(Icon, { size: 21 }))
                );
            })),
        React.createElement("button", { onClick: () => setShowQuickAdd((v) => !v), style: {
                position: "fixed",
                right: "max(20px, calc(50% - 238px))",
                bottom: "calc(82px + env(safe-area-inset-bottom, 0px))",
                width: 58,
                height: 58,
                borderRadius: "50%",
                background: COLORS.accent,
                color: "#fff",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 28px rgba(67,84,69,0.28)",
                zIndex: 100,
                transform: showQuickAdd ? "rotate(45deg)" : "rotate(0deg)",
                transition: "transform 180ms ease",
            }, "aria-label": showQuickAdd ? "追加メニューを閉じる" : "レシピを追加" },
            React.createElement(Plus, { size: 26 }))));
}
// Same on-demand pattern as LazyCalendarView, for the photo crop/position
// editors — only needed while someone is actively adjusting a photo.
function makeLazyWrapper(exportName) {
    return function LazyWrapped(props) {
        const [Comp, setComp] = useState(null);
        useEffect(() => {
            let cancelled = false;
            import("./photo-editor.js").then((m) => {
                if (!cancelled)
                    setComp(() => m[exportName]);
            });
            return () => { cancelled = true; };
        }, []);
        if (!Comp) {
            return React.createElement("div", { style: { position: "fixed", inset: 0, zIndex: 95, background: "rgba(20,22,18,0.9)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13.5 } }, "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026");
        }
        return React.createElement(Comp, props);
    };
}
const LazyPhotoPositionEditor = makeLazyWrapper("PhotoPositionEditor");
const LazyCropOverlay = makeLazyWrapper("CropOverlay");
// A simple day-by-day meal plan: pick which saved recipe you'll make on
// each of the next two weeks, so "what's for dinner Tuesday" is answered
// in advance instead of decided from scratch every evening. The actual
// CalendarView (and its several sub-screens) lives in calendar.js, loaded
// on demand only when this tab is opened, rather than in the main bundle.
function LazyCalendarView(props) {
    const [Comp, setComp] = useState(null);
    useEffect(() => {
        let cancelled = false;
        import("./calendar.js").then((m) => {
            if (!cancelled)
                setComp(() => m.CalendarView);
        });
        return () => { cancelled = true; };
    }, []);
    if (!Comp) {
        return React.createElement("div", { style: { padding: "60px 20px", textAlign: "center", color: COLORS.inkSoft, fontSize: 13.5 } }, "\u8AAD\u307F\u8FBC\u307F\u4E2D\u2026");
    }
    return React.createElement(Comp, props);
}
function EmptyState({ onAdd }) {
    return (React.createElement("div", { style: {
            textAlign: "center",
            padding: "48px 20px",
            color: COLORS.inkSoft,
        } },
        React.createElement(Instagram, { size: 32, color: COLORS.line, style: { marginBottom: 10 } }),
        React.createElement("p", { style: { fontSize: 14, lineHeight: 1.7, margin: "0 0 16px" } },
            "\u307E\u3060\u30EC\u30B7\u30D4\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
            React.createElement("br", null),
            "Instagram \u3084 X \u306E\u6295\u7A3F\u306E\u30AD\u30E3\u30D7\u30B7\u30E7\u30F3\u6587\u3092\u30B3\u30D4\u30FC\u3057\u3066\u3001",
            React.createElement("br", null),
            "\u8CBC\u308A\u4ED8\u3051\u308B\u3068\u30EC\u30B7\u30D4\u5F62\u5F0F\u306B\u6574\u7406\u3055\u308C\u307E\u3059\u3002"),
        React.createElement("button", { onClick: onAdd, style: {
                background: COLORS.accent,
                color: "#fff",
                border: "none",
                borderRadius: 12,
                padding: "10px 20px",
                fontWeight: 700,
                fontSize: 14,
            } }, "\u6700\u521D\u306E\u30EC\u30B7\u30D4\u3092\u8FFD\u52A0")));
}
function RecipeGridCard({ recipe, onClick }) {
    return (React.createElement("div", { onClick: onClick, style: {
            borderRadius: 22,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 8px 26px rgba(32,35,31,0.075)",
            cursor: "pointer",
        } },
        React.createElement("div", { style: {
                width: "100%",
                aspectRatio: "4 / 5",
                background: COLORS.chipBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            } }, (recipe.imageUrl || recipe.imageUrl2) ? (React.createElement("img", { src: recipe.imageUrl || recipe.imageUrl2, alt: "", onError: (e) => {
                e.target.style.display = "none";
            }, style: { width: "100%", height: "100%", objectFit: "cover" } })) : (React.createElement("span", { style: { fontSize: 11, color: COLORS.inkSoft, opacity: 0.6 } }, "No Photo"))),
        React.createElement("div", { style: { padding: "12px 13px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 } },
            React.createElement("h3", { style: {
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: 1.4,
                    color: COLORS.ink,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                } }, recipe.title || "無題のレシピ"),
            recipe.favorite && React.createElement(Bookmark, { size: 14, color: COLORS.accent, style: { flexShrink: 0, marginTop: 2 } }))));
}
function RecipeListCard({ recipe, onClick }) {
    return (React.createElement("div", { onClick: onClick, style: {
            display: "flex",
            alignItems: "center",
            borderRadius: 16,
            overflow: "hidden",
            background: "#fff",
            boxShadow: "0 1px 6px rgba(46,42,36,0.08)",
            cursor: "pointer",
        } },
        React.createElement("div", { style: {
                width: 72,
                height: 72,
                flexShrink: 0,
                background: COLORS.chipBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
            } }, (recipe.imageUrl || recipe.imageUrl2) ? (React.createElement("img", { src: recipe.imageUrl || recipe.imageUrl2, alt: "", onError: (e) => {
                e.target.style.display = "none";
            }, style: { width: "100%", height: "100%", objectFit: "cover" } })) : (React.createElement("span", { style: { fontSize: 9.5, color: COLORS.inkSoft, opacity: 0.6 } }, "No Photo"))),
        React.createElement("div", { style: { flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 14px" } },
            React.createElement("h3", { style: {
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: 14,
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: 1.4,
                    color: COLORS.ink,
                } }, recipe.title || "無題のレシピ"),
            recipe.favorite && React.createElement(Bookmark, { size: 15, color: COLORS.accent, style: { flexShrink: 0 } }))));
}
function JinaKeySettings({ jinaApiKey, saveJinaApiKey }) {
    const [value, setValue] = useState(jinaApiKey || "");
    const [saved, setSaved] = useState(false);
    return (React.createElement("div", { style: {
            border: `1px solid ${COLORS.line}`,
            borderRadius: 10,
            padding: 12,
            background: COLORS.paperCard,
        } },
        React.createElement("p", { style: { fontSize: 12, color: COLORS.inkSoft, lineHeight: 1.6, margin: "0 0 8px" } }, "URL\u8AAD\u307F\u8FBC\u307F\u304C\u5931\u6557\u3057\u3084\u3059\u3044\u6642\u306F\u3001jina.ai \u3067\u767A\u884C\u3067\u304D\u308B\u7121\u6599\u306EAPI\u30AD\u30FC\u3092\u8CBC\u308A\u4ED8\u3051\u308B\u3068\u6539\u5584\u3059\u308B\u3053\u3068\u304C\u3042\u308A\u307E\u3059\u3002\u306A\u304F\u3066\u3082\u4F7F\u3048\u307E\u3059\u3002"),
        React.createElement("input", { type: "password", value: value, onChange: (e) => {
                setValue(e.target.value);
                setSaved(false);
            }, placeholder: "jina_...", style: { ...inputStyle, marginBottom: 8, fontSize: 12.5 } }),
        React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("button", { onClick: () => {
                    saveJinaApiKey(value.trim());
                    setSaved(true);
                }, style: {
                    flex: 1,
                    background: COLORS.sage,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "9px 0",
                    fontWeight: 700,
                    fontSize: 12.5,
                } }, "\u4FDD\u5B58"),
            jinaApiKey && (React.createElement("button", { onClick: () => {
                    setValue("");
                    saveJinaApiKey("");
                    setSaved(false);
                }, style: {
                    flex: 1,
                    background: "none",
                    border: `1px solid ${COLORS.line}`,
                    color: COLORS.plum,
                    borderRadius: 10,
                    padding: "9px 0",
                    fontWeight: 700,
                    fontSize: 12.5,
                } }, "\u524A\u9664"))),
        saved && React.createElement("p", { style: { fontSize: 11, color: COLORS.sage, margin: "8px 0 0" } }, "\u4FDD\u5B58\u3057\u307E\u3057\u305F")));
}
function ApiKeySettings({ apiKey, saveApiKey }) {
    const [value, setValue] = useState(apiKey || "");
    const [saved, setSaved] = useState(false);
    return (React.createElement("div", { style: {
            border: `1px solid ${COLORS.line}`,
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
            background: COLORS.paperCard,
        } },
        React.createElement("p", { style: { fontSize: 12, color: COLORS.inkSoft, lineHeight: 1.6, margin: "0 0 8px" } }, "console.anthropic.com \u3067\u767A\u884C\u3057\u305FAPI\u30AD\u30FC\u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\u3002\u3053\u306E\u7AEF\u672B\u306E\u30D6\u30E9\u30A6\u30B6\u3060\u3051\u306B\u4FDD\u5B58\u3055\u308C\u3001\u4ED6\u306B\u306F\u9001\u4FE1\u3055\u308C\u307E\u305B\u3093\u3002"),
        React.createElement("input", { type: "password", value: value, onChange: (e) => {
                setValue(e.target.value);
                setSaved(false);
            }, placeholder: "sk-ant-...", style: { ...inputStyle, marginBottom: 8, fontSize: 12.5 } }),
        React.createElement("div", { style: { display: "flex", gap: 8 } },
            React.createElement("button", { onClick: () => {
                    saveApiKey(value.trim());
                    setSaved(true);
                }, style: {
                    flex: 1,
                    background: COLORS.sage,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "9px 0",
                    fontWeight: 700,
                    fontSize: 12.5,
                } }, "\u4FDD\u5B58"),
            apiKey && (React.createElement("button", { onClick: () => {
                    setValue("");
                    saveApiKey("");
                    setSaved(false);
                }, style: {
                    flex: 1,
                    background: "none",
                    border: `1px solid ${COLORS.line}`,
                    color: COLORS.plum,
                    borderRadius: 10,
                    padding: "9px 0",
                    fontWeight: 700,
                    fontSize: 12.5,
                } }, "\u524A\u9664"))),
        saved && (React.createElement("p", { style: { fontSize: 11.5, color: COLORS.sage, margin: "6px 0 0", fontWeight: 700 } }, "\u4FDD\u5B58\u3057\u307E\u3057\u305F"))));
}
function AddView({ inputUrl, setInputUrl, inputText, setInputText, extractError, onExtract, extracting, draft, setDraft, onSave, onDiscard, saveError, ocrRunning, ocrProgress, ocrError, onScreenshots, urlImporting, urlImportError, onUrlImport, apiKey, addMode = "url", categoryOrder, applianceOrder, }) {
    const [showMore, setShowMore] = useState(addMode === "text" || addMode === "image" || addMode === "camera");
    const imagePickerRef = useRef(null);
    const cameraPickerRef = useRef(null);
    useEffect(() => {
        if (addMode === "manual" && !draft) {
            setDraft({ title: "", servings: "", ingredients: [], steps: [], tags: [], memo: "", dishCategory: "その他", meatType: null, noodleType: null, vegType: null, appliance: null, sourceUrl: "", sourceType: "other", imageUrl: "", imageUrl2: "" });
        } else if (addMode === "image") {
            setTimeout(() => imagePickerRef.current && imagePickerRef.current.click(), 80);
        } else if (addMode === "camera") {
            setTimeout(() => cameraPickerRef.current && cameraPickerRef.current.click(), 80);
        }
    }, [addMode]);
    if (draft) {
        return React.createElement(DraftEditor, { draft: draft, setDraft: setDraft, onSave: onSave, onDiscard: onDiscard, saveError: saveError, mode: addMode === "manual" ? "manual" : "create", categoryOrder: categoryOrder, applianceOrder: applianceOrder });
    }
    return (React.createElement("div", null,
        React.createElement("div", { style: {
            background: "linear-gradient(135deg, #FFFFFF 0%, #F2F6F2 100%)",
            border: `1px solid ${COLORS.line}`, borderRadius: 18, padding: "15px 16px",
            marginBottom: 18, boxShadow: "0 3px 14px rgba(46,42,36,0.04)"
        } },
            React.createElement("div", { style: { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: COLORS.sage, marginBottom: 4 } }, "ADD RECIPE"),
            React.createElement("div", { style: { fontSize: 17, fontWeight: 800, color: COLORS.ink } },
                addMode === "url" ? "URLを貼るだけで追加" :
                addMode === "image" ? "写真からレシピを追加" :
                addMode === "camera" ? "撮影してレシピを追加" :
                addMode === "text" ? "文章を貼り付けて追加" : "レシピを手入力"),
            React.createElement("div", { style: { fontSize: 11.5, lineHeight: 1.55, color: COLORS.inkSoft, marginTop: 4 } },
                addMode === "url" ? "レシピページのURLを貼り付けると、内容を自動で読み取ります。" :
                addMode === "text" ? "SNSのキャプションやメモをそのまま貼り付けてOK。" :
                "読み取った内容は、保存する前に確認・編集できます。")
        ),
        React.createElement("input", { ref: imagePickerRef, type: "file", accept: "image/*", multiple: true, onChange: (e) => { onScreenshots(e.target.files); e.target.value = ""; }, style: { display: "none" } }),
        React.createElement("input", { ref: cameraPickerRef, type: "file", accept: "image/*", capture: "environment", onChange: (e) => { onScreenshots(e.target.files); e.target.value = ""; }, style: { display: "none" } }),
        addMode === "url" && (React.createElement(React.Fragment, null,
            React.createElement("label", { style: fieldLabelStyle }, "\u30EC\u30B7\u30D4\u306EURL"),
            React.createElement("div", { style: { position: "relative", marginBottom: 8 } },
                React.createElement(Link2, { size: 15, color: COLORS.inkSoft, style: { position: "absolute", left: 12, top: 12, pointerEvents: "none" } }),
                React.createElement("input", { value: inputUrl, onChange: (e) => setInputUrl(e.target.value), placeholder: "https://cookpad.com/recipe/...", style: { ...inputStyle, paddingLeft: 34, paddingRight: inputUrl ? 34 : 14, marginBottom: 0 } }),
                inputUrl && React.createElement("button", { onClick: () => setInputUrl(""), "aria-label": "URL\u3092\u30AF\u30EA\u30A2", style: {
                        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                        border: "none", background: COLORS.chipBg, color: COLORS.inkSoft, borderRadius: "50%",
                        width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", padding: 0
                    } }, React.createElement(X, { size: 13 }))),
            React.createElement("button", { onClick: onUrlImport, disabled: urlImporting, style: {
                    width: "100%",
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
                    opacity: urlImporting ? 0.7 : 1,
                    marginBottom: 6,
                } },
                urlImporting ? React.createElement(Loader2, { size: 17, className: "spin" }) : React.createElement(Link2, { size: 17 }),
                urlImporting ? "読み込み中..." : "URLから自動で読み込む"),
            urlImportError && (React.createElement("div", { style: errorBoxStyle },
                React.createElement(AlertCircle, { size: 15 }),
                " ",
                urlImportError)),
            React.createElement("button", { onClick: () => setShowMore((v) => !v), style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "none",
                    border: "none",
                    color: COLORS.inkSoft,
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "8px 0",
                    marginTop: 10,
                    borderTop: `1px solid ${COLORS.line}`,
                    width: "100%",
                } },
                showMore ? "▲" : "▼",
                " URL\u304C\u8AAD\u307F\u8FBC\u3081\u306A\u3044\u6642\u306F(\u30B3\u30D4\u30DA\u30FB\u30B9\u30AF\u30B7\u30E7)"),
            showMore && (React.createElement("div", { style: { marginTop: 12 } },
                React.createElement("label", { style: fieldLabelStyle }, "\u30B9\u30AF\u30EA\u30FC\u30F3\u30B7\u30E7\u30C3\u30C8\u304B\u3089\u8AAD\u307F\u53D6\u308B(\u8907\u6570\u9078\u629E\u53EF)"),
                React.createElement("label", { style: {
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        border: `1px dashed ${COLORS.accent}`,
                        borderRadius: 12,
                        padding: "14px 12px",
                        marginBottom: 14,
                        color: COLORS.accent,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: ocrRunning ? "default" : "pointer",
                        opacity: ocrRunning ? 0.6 : 1,
                    } },
                    ocrRunning ? React.createElement(Loader2, { size: 16, className: "spin" }) : React.createElement(Camera, { size: 16 }),
                    ocrRunning ? ocrProgress || "読み取り中..." : "画像を選んで読み取る",
                    React.createElement("input", { type: "file", accept: "image/*", multiple: true, disabled: ocrRunning, onChange: (e) => {
                            onScreenshots(e.target.files);
                            e.target.value = "";
                        }, style: { display: "none" } })),
                ocrError && (React.createElement("div", { style: errorBoxStyle },
                    React.createElement(AlertCircle, { size: 15 }),
                    " ",
                    ocrError)),
                React.createElement("label", { style: fieldLabelStyle }, "\u30AD\u30E3\u30D7\u30B7\u30E7\u30F3\u6587"),
                React.createElement("textarea", { value: inputText, onChange: (e) => setInputText(e.target.value), placeholder: "\u6295\u7A3F\u672C\u6587\u3092\u3053\u3053\u306B\u8CBC\u308A\u4ED8\u3051(\u307E\u305F\u306F\u4E0A\u3067\u30B9\u30AF\u30B7\u30E7\u3092\u8AAD\u307F\u53D6\u308A)...", rows: 8, style: { ...inputStyle, resize: "vertical", lineHeight: 1.6 } }),
                extractError && (React.createElement("div", { style: errorBoxStyle },
                    React.createElement(AlertCircle, { size: 15 }),
                    " ",
                    extractError)),
                React.createElement("button", { onClick: () => onExtract(), disabled: extracting, style: {
                        width: "100%",
                        marginTop: 16,
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
                        opacity: extracting ? 0.7 : 1,
                    } }, extracting ? (React.createElement(React.Fragment, null,
                    React.createElement(Loader2, { size: 17, className: "spin" }),
                    " ",
                    "抽出中...")) : (React.createElement(React.Fragment, null,
                    React.createElement(ClipboardPaste, { size: 17 }),
                    " \u30EC\u30B7\u30D4\u3092\u62BD\u51FA\u3059\u308B"))))))),
        addMode === "text" && (React.createElement(React.Fragment, null,
            React.createElement("label", { style: fieldLabelStyle }, "\u30AD\u30E3\u30D7\u30B7\u30E7\u30F3\u6587"),
            React.createElement("textarea", { value: inputText, onChange: (e) => setInputText(e.target.value), placeholder: "\u6295\u7A3F\u672C\u6587\u3092\u3053\u3053\u306B\u8CBC\u308A\u4ED8\u3051...", rows: 8, style: { ...inputStyle, resize: "vertical", lineHeight: 1.6 } }),
            extractError && (React.createElement("div", { style: errorBoxStyle },
                React.createElement(AlertCircle, { size: 15 }),
                " ",
                extractError)),
            React.createElement("button", { onClick: () => onExtract(), disabled: extracting, style: {
                    width: "100%",
                    marginTop: 12,
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
                    opacity: extracting ? 0.7 : 1,
                } }, extracting ? (React.createElement(React.Fragment, null,
                React.createElement(Loader2, { size: 17, className: "spin" }),
                " ",
                "抽出中...")) : (React.createElement(React.Fragment, null,
                React.createElement(ClipboardPaste, { size: 17 }),
                " \u30EC\u30B7\u30D4\u3092\u62BD\u51FA\u3059\u308B"))))),
        (addMode === "image" || addMode === "camera") && (React.createElement(React.Fragment, null,
            React.createElement("label", { style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    border: `1px dashed ${COLORS.accent}`,
                    borderRadius: 12,
                    padding: "14px 12px",
                    marginBottom: 14,
                    color: COLORS.accent,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: ocrRunning ? "default" : "pointer",
                    opacity: ocrRunning ? 0.6 : 1,
                } },
                ocrRunning ? React.createElement(Loader2, { size: 16, className: "spin" }) : (addMode === "camera" ? React.createElement(Camera, { size: 16 }) : React.createElement(GridIcon, { size: 16 })),
                ocrRunning ? ocrProgress || "読み取り中..." : (addMode === "camera" ? "もう一度撮影する" : "画像を選び直す"),
                addMode === "camera" ? (React.createElement("input", { type: "file", accept: "image/*", capture: "environment", disabled: ocrRunning, onChange: (e) => {
                        onScreenshots(e.target.files);
                        e.target.value = "";
                    }, style: { display: "none" } })) : (React.createElement("input", { type: "file", accept: "image/*", multiple: true, disabled: ocrRunning, onChange: (e) => {
                        onScreenshots(e.target.files);
                        e.target.value = "";
                    }, style: { display: "none" } }))),
            ocrError && (React.createElement("div", { style: errorBoxStyle },
                React.createElement(AlertCircle, { size: 15 }),
                " ",
                ocrError)),
            inputText && (React.createElement(React.Fragment, null,
                React.createElement("label", { style: fieldLabelStyle }, "\u8AAD\u307F\u53D6\u3063\u305F\u6587\u7AE0(\u5FC5\u8981\u306B\u5FDC\u3058\u3066\u7DE8\u96C6\u3067\u304D\u307E\u3059)"),
                React.createElement("textarea", { value: inputText, onChange: (e) => setInputText(e.target.value), rows: 8, style: { ...inputStyle, resize: "vertical", lineHeight: 1.6 } }),
                extractError && (React.createElement("div", { style: errorBoxStyle },
                    React.createElement(AlertCircle, { size: 15 }),
                    " ",
                    extractError)),
                React.createElement("button", { onClick: () => onExtract(), disabled: extracting, style: {
                        width: "100%",
                        marginTop: 12,
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
                        opacity: extracting ? 0.7 : 1,
                    } }, extracting ? (React.createElement(React.Fragment, null,
                    React.createElement(Loader2, { size: 17, className: "spin" }),
                    " ",
                    "抽出中...")) : (React.createElement(React.Fragment, null,
                    React.createElement(ClipboardPaste, { size: 17 }),
                    " \u30EC\u30B7\u30D4\u3092\u62BD\u51FA\u3059\u308B")))))))));
}
function DraftEditor({ draft, setDraft, onSave, onDiscard, saveError, mode = "create", categoryOrder, applianceOrder }) {
    // Defensive normalization: a record from an older version of the app
    // (or any future caller) might be missing an array field entirely,
    // which would otherwise crash every .map/.forEach below.
    if (!Array.isArray(draft.ingredients) || !Array.isArray(draft.steps) || !Array.isArray(draft.tags)) {
        draft = {
            ...draft,
            ingredients: Array.isArray(draft.ingredients) ? draft.ingredients : [],
            steps: Array.isArray(draft.steps) ? draft.steps : [],
            tags: Array.isArray(draft.tags) ? draft.tags : [],
        };
    }
    const [categoryManual, setCategoryManual] = useState(false);
    const [pendingPhotoFile, setPendingPhotoFile] = useState(null);
    const [editingExistingPhoto, setEditingExistingPhoto] = useState(false);
    const [photoSlot, setPhotoSlot] = useState(1); // 1 | 2 — which of the two photo slots is being added/edited
    const update = (patch) => setDraft({ ...draft, ...patch });
    const updateTitle = (value) => {
        if (categoryManual) {
            update({ title: value });
        }
        else {
            const inferred = inferDishCategory(value, draft.ingredients);
            update({ title: value, dishCategory: inferred.dishCategory, meatType: inferred.meatType, noodleType: inferred.noodleType, vegType: inferred.vegType });
        }
    };
    const updateDishCategory = (value) => {
        setCategoryManual(true);
        update({
            dishCategory: value,
            meatType: value === "肉料理" ? draft.meatType || "その他" : null,
            noodleType: value === "麺類" ? draft.noodleType || "その他" : null,
            vegType: value === "野菜料理" ? draft.vegType || "その他" : null,
        });
    };
    const updateMeatType = (value) => {
        setCategoryManual(true);
        update({ meatType: value });
    };
    const updateNoodleType = (value) => {
        setCategoryManual(true);
        update({ noodleType: value });
    };
    const updateVegType = (value) => {
        setCategoryManual(true);
        update({ vegType: value });
    };
    // Changing the servings count rescales every ingredient amount from the
    // current base, then that new count becomes the base for next time.
    const currentServings = parseBaseServings(draft.servings);
    const handleServingsChange = (newValue) => {
        // Editing the base servings here only relabels how many people the
        // written-down amounts are for — it does not rescale the ingredient
        // amounts. Scaling for a specific serving count happens separately
        // on the recipe detail screen (which doesn't touch the saved data).
        update({ servings: `${newValue}人分` });
    };
    const updateIngredient = (idx, patch) => {
        const next = [...draft.ingredients];
        next[idx] = { ...next[idx], ...patch };
        update({ ingredients: next });
    };
    const removeIngredient = (idx) => update({ ingredients: draft.ingredients.filter((_, i) => i !== idx) });
    // Ingredient names store their sub-group as a trailing "(下味)" style tag.
    // These helpers let the UI show/edit grouped sections without the caller
    // having to deal with that string format directly.
    const updateIngredientBaseName = (idx, newBase) => {
        const { group } = splitNameGroup(draft.ingredients[idx].name);
        updateIngredient(idx, { name: group ? `${newBase}(${group})` : newBase });
    };
    const addIngredientToGroup = (group) => {
        const name = group ? `(${group})` : "";
        update({ ingredients: [...draft.ingredients, { name, amount: "" }] });
    };
    const renameGroup = (oldLabel, newLabel) => {
        const next = draft.ingredients.map((ing) => {
            const { base, group } = splitNameGroup(ing.name);
            if (group !== oldLabel)
                return ing;
            return { ...ing, name: newLabel.trim() ? `${base}(${newLabel.trim()})` : base };
        });
        update({ ingredients: next });
    };
    const addNewGroup = () => {
        update({ ingredients: [...draft.ingredients, { name: "(新しいグループ)", amount: "" }] });
    };
    // Group ingredients by their (group) tag, preserving original array indices
    // so edits/removals still target the right item.
    const ingredientGroups = [];
    {
        const indexByLabel = {};
        draft.ingredients.forEach((ing, idx) => {
            const { group } = splitNameGroup(ing.name);
            const key = group || "";
            if (!(key in indexByLabel)) {
                indexByLabel[key] = ingredientGroups.length;
                ingredientGroups.push({ label: group, entries: [] });
            }
            ingredientGroups[indexByLabel[key]].entries.push(idx);
        });
        if (ingredientGroups.length === 0) {
            ingredientGroups.push({ label: null, entries: [] });
        }
    }
    return (React.createElement("div", null,
        mode !== "manual" && React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10, color: COLORS.sage, background: COLORS.sageSoft, borderRadius: 15, padding: "12px 13px", fontSize: 12.5, fontWeight: 700, marginBottom: 18, lineHeight: 1.5 } },
            React.createElement("div", { style: { width: 26, height: 26, borderRadius: 13, background: "#fff", display: "grid", placeItems: "center", flexShrink: 0 } }, React.createElement(Check, { size: 15 })),
            React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 13.5, color: COLORS.ink, marginBottom: 2 } }, mode === "edit" ? "レシピを編集中" : "読み取りできました"),
                React.createElement("div", { style: { color: COLORS.inkSoft, fontWeight: 500 } }, mode === "edit" ? "内容を確認して保存してください。" : "内容を確認して、必要なところだけ直して保存してください。")
            )),
        React.createElement("label", { style: fieldLabelStyle }, "\u6599\u7406\u540D"),
        React.createElement("input", { value: draft.title, onChange: (e) => updateTitle(e.target.value), style: inputStyle }),
        React.createElement("label", { style: fieldLabelStyle }, "\u5199\u771F\uFF08\u6700\u59272\u679A\uFF09"),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 } },
            [1, 2].map((slot) => {
                const field = slot === 1 ? "imageUrl" : "imageUrl2";
                const url = draft[field];
                return React.createElement(React.Fragment, { key: slot },
                    url ? React.createElement("div", { style: { position: "relative", width: 96, height: 96, flexShrink: 0 } },
                        React.createElement("img", { src: url, alt: "", onClick: () => { setPhotoSlot(slot); setEditingExistingPhoto(true); }, onError: (e) => {
                                e.target.style.display = "none";
                            }, style: {
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                borderRadius: 12,
                                border: `1px solid ${COLORS.line}`,
                                display: "block",
                                cursor: "pointer",
                            } }),
                        React.createElement("div", { style: {
                                position: "absolute", left: 4, bottom: 4, width: 22, height: 22, borderRadius: 11,
                                background: "rgba(32,35,31,0.55)", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none"
                            } }, React.createElement(Edit2, { size: 11, color: "#fff" })),
                        React.createElement("button", { onClick: () => update({ [field]: "" }), style: {
                                position: "absolute",
                                top: -6,
                                right: -6,
                                background: COLORS.plum,
                                border: "2px solid #fff",
                                borderRadius: 999,
                                width: 24,
                                height: 24,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }, "aria-label": "\u5199\u771F\u3092\u524A\u9664" },
                            React.createElement(X, { size: 13, color: "#fff" })))
                        : React.createElement("label", { style: {
                                width: 96,
                                height: 96,
                                flexShrink: 0,
                                borderRadius: 12,
                                border: `1.5px dashed ${COLORS.accent}`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                            } },
                            React.createElement(Plus, { size: 26, color: COLORS.accent }),
                            React.createElement("input", { type: "file", accept: "image/*", style: { display: "none" }, onChange: (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (!file)
                                        return;
                                    setPhotoSlot(slot);
                                    setPendingPhotoFile(file);
                                } })));
            })),
        (pendingPhotoFile || editingExistingPhoto) && React.createElement(LazyPhotoPositionEditor, {
            file: pendingPhotoFile || undefined,
            source: !pendingPhotoFile && editingExistingPhoto ? draft[photoSlot === 2 ? "imageUrl2" : "imageUrl"] : undefined,
            onCancel: () => { setPendingPhotoFile(null); setEditingExistingPhoto(false); },
            onConfirm: (dataUrl) => { update({ [photoSlot === 2 ? "imageUrl2" : "imageUrl"]: dataUrl }); setPendingPhotoFile(null); setEditingExistingPhoto(false); },
        }),
        React.createElement("label", { style: fieldLabelStyle }, "\u4EBA\u6570\uFF08\u4F55\u4EBA\u5206\u306E\u5206\u91CF\u304B\u3092\u8A18\u9332\u3057\u307E\u3059\uFF09"),
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } },
            React.createElement("button", { onClick: () => handleServingsChange(Math.max(1, (currentServings?.value || 1) - 1)), style: servingsStepBtnStyle, "aria-label": "\u4EBA\u6570\u3092\u6E1B\u3089\u3059" },
                React.createElement(Minus, { size: 14 })),
            React.createElement("input", { key: currentServings?.value ?? "empty", type: "number", min: "1", step: "1", defaultValue: currentServings?.value || "", placeholder: "\u4EBA\u6570", onBlur: (e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v > 0)
                        handleServingsChange(v);
                }, onKeyDown: (e) => {
                    if (e.key === "Enter") {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v > 0)
                            handleServingsChange(v);
                        e.target.blur();
                    }
                }, style: { ...inputStyle, marginBottom: 0, width: 70, textAlign: "center" } }),
            React.createElement("button", { onClick: () => handleServingsChange((currentServings?.value || 0) + 1), style: servingsStepBtnStyle, "aria-label": "\u4EBA\u6570\u3092\u5897\u3084\u3059" },
                React.createElement(Plus, { size: 14 })),
            React.createElement("span", { style: { fontSize: 13, color: COLORS.inkSoft } }, "\u4EBA\u5206")),
        draft.servings && (React.createElement("p", { style: { fontSize: 12, color: COLORS.sage, margin: "-6px 0 14px", fontWeight: 700 } },
            "\u73FE\u5728\u306E\u8A2D\u5B9A: ",
            draft.servings)),
        React.createElement("label", { style: fieldLabelStyle }, "\u6599\u7406\u306E\u30B8\u30E3\u30F3\u30EB"),
        React.createElement("select", { value: draft.dishCategory || "その他", onChange: (e) => updateDishCategory(e.target.value), style: { ...inputStyle, color: COLORS.ink, marginBottom: (draft.dishCategory === "肉料理" || draft.dishCategory === "麺類" || draft.dishCategory === "野菜料理") ? 8 : 14 } }, (categoryOrder || DISH_CATEGORIES).map((cat) => (React.createElement("option", { key: cat, value: cat }, cat)))),
        draft.dishCategory === "肉料理" && (React.createElement("select", { value: draft.meatType || "その他", onChange: (e) => updateMeatType(e.target.value), style: { ...inputStyle, color: COLORS.sage, fontSize: 13 } }, MEAT_TYPES.map((mt) => (React.createElement("option", { key: mt, value: mt }, mt))))),
        draft.dishCategory === "麺類" && (React.createElement("select", { value: draft.noodleType || "その他", onChange: (e) => updateNoodleType(e.target.value), style: { ...inputStyle, color: COLORS.sage, fontSize: 13 } }, NOODLE_TYPES.map((nt) => (React.createElement("option", { key: nt, value: nt }, nt))))),
        draft.dishCategory === "野菜料理" && (React.createElement("select", { value: draft.vegType || "その他", onChange: (e) => updateVegType(e.target.value), style: { ...inputStyle, color: COLORS.sage, fontSize: 13 } }, VEG_TYPES.map((vt) => (React.createElement("option", { key: vt, value: vt }, vt))))),
        React.createElement("label", { style: fieldLabelStyle }, "\u4F7F\u3063\u305F\u8ABF\u7406\u5BB6\u96FB(\u4EFB\u610F)"),
        React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 } },
            React.createElement("button", { onClick: () => update({ appliance: null }), style: {
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${!draft.appliance ? COLORS.accent : COLORS.line}`,
                    background: !draft.appliance ? COLORS.accent : "transparent",
                    color: !draft.appliance ? "#fff" : COLORS.inkSoft,
                    fontWeight: 700,
                } }, "\u306A\u3057"),
            (applianceOrder || APPLIANCES).map((ap) => (React.createElement("button", { key: ap, onClick: () => update({ appliance: draft.appliance === ap ? null : ap }), style: {
                    fontSize: 12.5,
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: `1px solid ${draft.appliance === ap ? COLORS.accent : COLORS.line}`,
                    background: draft.appliance === ap ? COLORS.accent : "transparent",
                    color: draft.appliance === ap ? "#fff" : COLORS.inkSoft,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                } }, ap)))),
        React.createElement("label", { style: fieldLabelStyle }, "\u6750\u6599"),
        React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 14, marginBottom: 8 } }, ingredientGroups.map((g, gi) => (React.createElement("div", { key: gi },
            g.label !== null && (React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } },
                React.createElement("input", { value: g.label, onChange: (e) => renameGroup(g.label, e.target.value), placeholder: "\u30B0\u30EB\u30FC\u30D7\u540D", style: {
                        border: "none",
                        borderBottom: `1px solid ${COLORS.sage}55`,
                        background: "transparent",
                        color: COLORS.sage,
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "2px 0",
                        width: 140,
                    } }))),
            React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, g.entries.map((idx) => {
                const { base } = splitNameGroup(draft.ingredients[idx].name);
                return (React.createElement("div", { key: idx, style: { display: "flex", gap: 6 } },
                    React.createElement("input", { value: base, onChange: (e) => updateIngredientBaseName(idx, e.target.value), placeholder: "\u6750\u6599\u540D", style: { ...inputStyle, flex: 2, marginBottom: 0 } }),
                    React.createElement("input", { value: draft.ingredients[idx].amount, onChange: (e) => updateIngredient(idx, { amount: e.target.value }), placeholder: "\u5206\u91CF", style: { ...inputStyle, flex: 1, marginBottom: 0 } }),
                    React.createElement("button", { onClick: () => removeIngredient(idx), style: iconBtnStyle },
                        React.createElement(X, { size: 16, color: COLORS.plum }))));
            })),
            React.createElement("button", { onClick: () => addIngredientToGroup(g.label), style: { ...addBtnStyle, marginTop: 6 } },
                React.createElement(Plus, { size: 14 }),
                " ",
                g.label ? `${g.label}に材料を追加` : "材料を追加"))))),
        React.createElement("label", { style: { ...fieldLabelStyle, marginTop: 16 } }, "\u624B\u9806(1\u884C\u306B\u3064\u304D1\u3064\u306E\u624B\u9806)"),
        React.createElement("textarea", { value: draft.steps.join("\n"), onChange: (e) => update({ steps: e.target.value.split("\n") }), placeholder: "①材料を切る\n②炒める\n③盛り付ける", rows: 8, style: { ...inputStyle, resize: "vertical", lineHeight: 1.8 } }),
        React.createElement("label", { style: { ...fieldLabelStyle, marginTop: 16 } }, "\u30E1\u30E2"),
        React.createElement("textarea", { value: draft.memo, onChange: (e) => update({ memo: e.target.value }), rows: 2, style: { ...inputStyle, resize: "vertical" } }),
        saveError && (React.createElement("div", { style: errorBoxStyle },
            React.createElement(AlertCircle, { size: 15 }),
            " ",
            saveError)),
        React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 18 } },
            React.createElement("button", { onClick: onDiscard, style: {
                    flex: 1,
                    background: "none",
                    border: `1px solid ${COLORS.line}`,
                    borderRadius: 12,
                    padding: "12px 0",
                    fontWeight: 700,
                    color: COLORS.inkSoft,
                } }, mode === "edit" ? "キャンセル" : "破棄する"),
            React.createElement("button", { onClick: onSave, style: {
                    flex: 2,
                    background: COLORS.sage,
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 0",
                    fontWeight: 700,
                    color: "#fff",
                } }, mode === "edit" ? "変更を保存" : "ノートに保存"))));
}
function ServingsAdjuster({ baseValue, suffix, value, onChange }) {
    const step = baseValue < 1 ? 0.5 : 1;
    return (React.createElement("div", { style: { margin: "8px 0 4px" } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("button", { onClick: () => onChange(roundNice(Math.max(step, value - step))), style: servingsStepBtnStyle, "aria-label": "\u4EBA\u6570\u3092\u6E1B\u3089\u3059" },
                React.createElement(Minus, { size: 14 })),
            React.createElement("span", { style: { fontSize: 15, fontWeight: 700, minWidth: 64, textAlign: "center" } },
                value,
                suffix),
            React.createElement("button", { onClick: () => onChange(roundNice(value + step)), style: servingsStepBtnStyle, "aria-label": "\u4EBA\u6570\u3092\u5897\u3084\u3059" },
                React.createElement(Plus, { size: 14 })),
            value !== baseValue && (React.createElement("button", { onClick: () => onChange(baseValue), style: {
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "none",
                    color: COLORS.accent,
                    fontSize: 12,
                    fontWeight: 700,
                    marginLeft: 4,
                } },
                React.createElement(RotateCcw, { size: 12 }),
                " \u5143\u306E\u5206\u91CF")))));
}
const servingsStepBtnStyle = {
    width: 30,
    height: 30,
    borderRadius: "50%",
    border: `1px solid ${COLORS.line}`,
    background: COLORS.paperCard,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: COLORS.ink,
};
function GroupedIngredientList({ ingredients, ratio }) {
    const groups = [];
    const indexByKey = {};
    ingredients.forEach((ing) => {
        const { base, group } = splitNameGroup(ing.name);
        const key = group || "__ungrouped__";
        if (!(key in indexByKey)) {
            indexByKey[key] = groups.length;
            groups.push({ label: group, items: [] });
        }
        groups[indexByKey[key]].items.push({ base, amount: ing.amount });
    });
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 16 } }, groups.map((g, gi) => (React.createElement("div", { key: gi },
        g.label && (React.createElement("p", { style: {
                fontSize: 12,
                fontWeight: 700,
                color: COLORS.sage,
                margin: "0 0 4px",
                letterSpacing: 0.4,
            } }, g.label)),
        React.createElement("ul", { style: { margin: 0, padding: 0, listStyle: "none" } }, g.items.map((ing, i) => (React.createElement("li", { key: i, style: {
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: i < g.items.length - 1 ? `1px dashed ${COLORS.line}` : "none",
                fontSize: 14,
            } },
            React.createElement("span", null, ing.base),
            React.createElement("span", { style: { color: COLORS.inkSoft } }, scaleAmountText(ing.amount, ratio)))))))))));
}
function DetailView({ recipe, onAddToShoppingList }) {
    const [addedToList, setAddedToList] = useState(false);
    const baseServings = useMemo(() => parseBaseServings(recipe.servings), [recipe.servings]);
    const [targetServings, setTargetServings] = useState(baseServings?.value || null);
    const ratio = baseServings && targetServings ? targetServings / baseServings.value : 1;
    const handleAddToShoppingList = () => {
        const scaledIngredients = (recipe.ingredients || []).map((ing) => ({
            ...ing,
            amount: scaleAmountText(ing.amount, ratio),
        }));
        onAddToShoppingList(recipe.title, scaledIngredients);
        setAddedToList(true);
        setTimeout(() => setAddedToList(false), 2000);
    };
    return (React.createElement("div", null,
        (recipe.imageUrl || recipe.imageUrl2) && (React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 18 } },
            recipe.imageUrl && React.createElement("img", { src: recipe.imageUrl, alt: "", onError: (e) => {
                    e.target.style.display = "none";
                }, style: {
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    height: 260,
                    objectFit: "cover",
                    borderRadius: 20,
                    border: `1px solid ${COLORS.line}`,
                    boxShadow: "0 8px 24px rgba(46,42,36,0.08)",
                } }),
            recipe.imageUrl2 && React.createElement("img", { src: recipe.imageUrl2, alt: "", onError: (e) => {
                    e.target.style.display = "none";
                }, style: {
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    height: 260,
                    objectFit: "cover",
                    borderRadius: 20,
                    border: `1px solid ${COLORS.line}`,
                    boxShadow: "0 8px 24px rgba(46,42,36,0.08)",
                } }))),
        React.createElement("div", { style: { marginBottom: 4 } },
            React.createElement("h2", { style: { fontFamily: "'Noto Sans JP', sans-serif", fontSize: 25, fontWeight: 800, margin: 0, lineHeight: 1.35, letterSpacing: "-0.025em" } }, recipe.title)),
        (recipe.dishCategory || recipe.meatType || recipe.noodleType || recipe.vegType || recipe.appliance || (recipe.sourceType && recipe.sourceType !== "other")) && (React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 } },
            recipe.sourceType && recipe.sourceType !== "other" && React.createElement("span", { style: {
                    fontSize: 11.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageSoft,
                    borderRadius: 999, padding: "4px 11px",
                } }, SOURCE_LABELS[recipe.sourceType] || recipe.sourceType),
            recipe.dishCategory && recipe.dishCategory !== "その他" && React.createElement("span", { style: {
                    fontSize: 11.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageSoft,
                    borderRadius: 999, padding: "4px 11px",
                } }, recipe.dishCategory),
            recipe.meatType && React.createElement("span", { style: {
                    fontSize: 11.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageSoft,
                    borderRadius: 999, padding: "4px 11px",
                } }, recipe.meatType),
            recipe.noodleType && React.createElement("span", { style: {
                    fontSize: 11.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageSoft,
                    borderRadius: 999, padding: "4px 11px",
                } }, recipe.noodleType),
            recipe.vegType && React.createElement("span", { style: {
                    fontSize: 11.5, fontWeight: 700, color: COLORS.sage, background: COLORS.sageSoft,
                    borderRadius: 999, padding: "4px 11px",
                } }, recipe.vegType),
            recipe.appliance && React.createElement("span", { style: {
                    fontSize: 11.5, fontWeight: 700, color: COLORS.mustard, background: "#F5EDE1",
                    borderRadius: 999, padding: "4px 11px",
                } }, recipe.appliance))),
        baseServings ? (React.createElement(ServingsAdjuster, { baseValue: baseServings.value, suffix: baseServings.suffix || "人分", value: targetServings, onChange: setTargetServings })) : (recipe.servings && React.createElement("p", { style: { color: COLORS.inkSoft, fontSize: 13, margin: "4px 0 0" } }, recipe.servings)),
        recipe.ingredients?.length > 0 && (React.createElement("button", { onClick: handleAddToShoppingList, style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                background: addedToList ? COLORS.sageSoft : "#fff",
                color: addedToList ? COLORS.sage : COLORS.accent,
                border: `1px solid ${addedToList ? COLORS.sage : COLORS.accent}`,
                borderRadius: 14,
                padding: "12px 0",
                fontWeight: 700,
                fontSize: 14,
                margin: "10px 0 4px",
            } },
            addedToList ? React.createElement(Check, { size: 16 }) : React.createElement("span", { style: { fontSize: 16 } }, "\uD83D\uDED2"),
            addedToList ? "買い物リストに追加しました" : "買い物リストに追加")),
        recipe.tags?.length > 0 && (React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" } }, recipe.tags.map((t, i) => (React.createElement("span", { key: i, style: {
                fontSize: 12,
                color: COLORS.sage,
                border: `1px solid ${COLORS.sage}55`,
                borderRadius: 999,
                padding: "2px 9px",
            } },
            "#",
            t))))),
        recipe.sourceUrl && (React.createElement("button", { onClick: () => window.open(recipe.sourceUrl, "_blank", "noopener,noreferrer"), style: {
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                color: COLORS.accent,
                textDecoration: "none",
                marginBottom: 14,
                border: "none",
                background: "none",
                padding: 0,
                cursor: "pointer",
            } },
            React.createElement(Link2, { size: 13 }),
            " \u5143\u306E\u6295\u7A3F\u3092\u898B\u308B")),
        React.createElement(SectionBlock, { title: "\u6750\u6599" }, recipe.ingredients?.length ? (React.createElement(GroupedIngredientList, { ingredients: recipe.ingredients, ratio: ratio })) : (React.createElement("p", { style: { fontSize: 13, color: COLORS.inkSoft } }, "\u6750\u6599\u306E\u8A18\u8F09\u306A\u3057"))),
        React.createElement(SectionBlock, { title: "\u624B\u9806" }, recipe.steps?.length ? (React.createElement("ol", { style: { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 } }, recipe.steps.map((s, i) => (React.createElement("li", { key: i, style: { fontSize: 14, lineHeight: 1.7 } }, s))))) : (React.createElement("p", { style: { fontSize: 13, color: COLORS.inkSoft } }, "\u624B\u9806\u306E\u8A18\u8F09\u306A\u3057"))),
        recipe.memo && (React.createElement(SectionBlock, { title: "\u30E1\u30E2" },
            React.createElement("p", { style: { fontSize: 13.5, lineHeight: 1.7, margin: 0, color: COLORS.inkSoft } }, recipe.memo)))));
}
function SectionBlock({ title, children }) {
    return (React.createElement("section", { style: {
            marginTop: 14,
            background: "#fff",
            border: `1px solid ${COLORS.line}`,
            borderRadius: 18,
            padding: "16px 15px",
            boxShadow: "0 2px 12px rgba(46,42,36,0.035)"
        } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12 } },
            React.createElement("span", { style: { width: 4, height: 18, borderRadius: 99, background: COLORS.accent, display: "inline-block" } }),
            React.createElement("h4", { style: {
                    fontFamily: "'Noto Sans JP', sans-serif",
                    fontSize: 15,
                    fontWeight: 800,
                    color: COLORS.ink,
                    margin: 0,
                    letterSpacing: 0.2,
                } }, title)
        ),
        children));
}
const fieldLabelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.inkSoft,
    margin: "0 0 6px",
};
const inputStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${COLORS.line}`,
    borderRadius: 12,
    padding: "11px 12px",
    fontSize: 16,
    color: COLORS.ink,
    background: COLORS.paperCard,
    marginBottom: 14,
    outline: "none",
};
const iconBtnStyle = {
    background: "none",
    border: "none",
    padding: "10px 2px 0",
};
const addBtnStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    background: "none",
    border: `1px dashed ${COLORS.sage}`,
    color: COLORS.sage,
    borderRadius: 10,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
};
const errorBoxStyle = {
    display: "flex",
    alignItems: "flex-start",
    gap: 6,
    color: COLORS.plum,
    fontSize: 12.5,
    lineHeight: 1.6,
    marginTop: 8,
    wordBreak: "break-word",
};

function SettingsPanel({
    onClose,
    myName, nameDraft, setNameDraft, saveName,
    apiKey, saveApiKey,
    jinaApiKey, saveJinaApiKey,
    groups, newGroupName, setNewGroupName,
    addGroup, deleteGroup, moveGroup,
    editingGroupId, editingGroupName, setEditingGroupName,
    startRenameGroup, saveRenameGroup,
    ungroupedLabel, setUngroupedLabel, saveUngroupedLabel,
    exportBackup, importBackup,
    categoryOrder, applianceOrder, moveCategoryOrder, moveApplianceOrder,
    newApplianceDraft, setNewApplianceDraft, addAppliance, deleteAppliance,
    editingApplianceIndex, editingApplianceName, setEditingApplianceName,
    startRenameAppliance, saveRenameAppliance,
}) {
    const [openSection, setOpenSection] = useState(null);
    const card = { background:"#fff", border:`1px solid ${COLORS.line}`, borderRadius:20, overflow:"hidden", marginBottom:14, boxShadow:"0 2px 12px rgba(45,42,36,.035)" };
    const row = { width:"100%", border:"none", background:"#fff", display:"flex", alignItems:"center", gap:14, padding:"17px 16px", textAlign:"left", color:COLORS.ink };
    const icon = { width:38, height:38, borderRadius:13, display:"grid", placeItems:"center", background:COLORS.sageSoft, color:COLORS.accent, flexShrink:0, fontSize:18, fontWeight:800 };
    const title = { fontSize:15.5, fontWeight:750, margin:0 };
    const sub = { fontSize:11.5, color:COLORS.inkSoft, margin:"3px 0 0", lineHeight:1.45 };
    const divider = { height:1, background:COLORS.line, marginLeft:68 };
    const editor = { padding:"2px 16px 16px 68px", background:"#fff" };
    const input = { ...inputStyle, margin:0, background:COLORS.paper, fontSize:16 };
    const action = { border:"none", background:COLORS.accent, color:"#fff", borderRadius:12, padding:"10px 14px", fontSize:12.5, fontWeight:800 };
    const toggle = (key) => setOpenSection(openSection === key ? null : key);
    const arrow = (key) => React.createElement("span",{style:{marginLeft:"auto",fontSize:20,color:COLORS.inkSoft,transform:openSection===key?"rotate(90deg)":"none",transition:"transform .18s"}},"›");
    return React.createElement("div",{style:{position:"fixed",inset:0,zIndex:110,background:COLORS.paper,overflowY:"auto",paddingBottom:"calc(30px + env(safe-area-inset-bottom,0px))"}},
        React.createElement("div",{style:{position:"sticky",top:0,zIndex:2,display:"grid",gridTemplateColumns:"44px 1fr 44px",alignItems:"center",padding:"calc(13px + env(safe-area-inset-top,0px)) 14px 12px",background:"rgba(247,246,242,.95)",backdropFilter:"blur(16px)"}},
            React.createElement("button",{onClick:onClose,style:{border:"none",background:"none",width:40,height:40,display:"grid",placeItems:"center"}},React.createElement(ChevronLeft,{size:26})),
            React.createElement("h2",{style:{fontSize:20,fontWeight:800,textAlign:"center",margin:0}},"設定"),
            React.createElement("div",null)
        ),
        React.createElement("div",{style:{maxWidth:520,margin:"0 auto",padding:"14px 14px 28px"}},
            React.createElement("div",{style:card},
                React.createElement("button",{onClick:()=>toggle("profile"),style:row},
                    React.createElement("div",{style:icon},"☺"),
                    React.createElement("div",null,React.createElement("p",{style:title},"プロフィール"),React.createElement("p",{style:sub},myName?`${myName} で利用中`:"名前を設定")),
                    arrow("profile")),
                openSection==="profile" && React.createElement("div",{style:editor},
                    React.createElement("div",{style:{display:"flex",gap:8}},
                        React.createElement("input",{value:nameDraft,onChange:e=>setNameDraft(e.target.value),onKeyDown:e=>e.key==="Enter"&&saveName(),placeholder:"あなたの名前",style:{...input,flex:1}}),
                        React.createElement("button",{onClick:saveName,style:action},"保存")))
            ),
            React.createElement("div",{style:card},
                React.createElement("button",{onClick:()=>toggle("import"),style:row},
                    React.createElement("div",{style:icon},"↗"),
                    React.createElement("div",null,React.createElement("p",{style:title},"レシピ取り込み"),React.createElement("p",{style:sub},apiKey?"AI読み取り設定済み":"AI読み取りの設定")),
                    arrow("import")),
                openSection==="import" && React.createElement("div",{style:editor},React.createElement(ApiKeySettings,{apiKey,saveApiKey}),React.createElement("div",{style:{height:8}}),React.createElement(JinaKeySettings,{jinaApiKey,saveJinaApiKey}))
            ),
            React.createElement("div",{style:card},
                React.createElement("button",{onClick:()=>toggle("categories"),style:row},
                    React.createElement("div",{style:icon},"🍽"),
                    React.createElement("div",null,React.createElement("p",{style:title},"レシピのジャンル"),React.createElement("p",{style:sub},"並び替え")),
                    arrow("categories")),
                openSection==="categories" && React.createElement("div",{style:editor},
                    (categoryOrder||[]).map((cat,i)=>React.createElement("div",{key:cat,style:{display:"flex",alignItems:"center",gap:6,padding:"8px 0",borderBottom:`1px solid ${COLORS.line}`}},
                        React.createElement("span",{style:{flex:1,fontSize:13.5,fontWeight:650}},cat),
                        React.createElement("button",{onClick:()=>moveCategoryOrder(i,-1),disabled:i===0,style:{border:"none",background:"none",opacity:i===0?.25:1}},"↑"),
                        React.createElement("button",{onClick:()=>moveCategoryOrder(i,1),disabled:i===categoryOrder.length-1,style:{border:"none",background:"none",opacity:i===categoryOrder.length-1?.25:1}},"↓"))))
            ),
            React.createElement("div",{style:card},
                React.createElement("button",{onClick:()=>toggle("appliances"),style:row},
                    React.createElement("div",{style:icon},"🍳"),
                    React.createElement("div",null,React.createElement("p",{style:title},"調理家電"),React.createElement("p",{style:sub},"追加・名前変更・並び替え")),
                    arrow("appliances")),
                openSection==="appliances" && React.createElement("div",{style:editor},
                    (applianceOrder||[]).map((ap,i)=>React.createElement("div",{key:ap,style:{display:"flex",alignItems:"center",gap:6,padding:"8px 0",borderBottom:`1px solid ${COLORS.line}`}},
                        editingApplianceIndex===i?React.createElement("input",{autoFocus:true,value:editingApplianceName,onChange:e=>setEditingApplianceName(e.target.value),onKeyDown:e=>e.key==="Enter"&&saveRenameAppliance(),onBlur:saveRenameAppliance,style:{...input,flex:1,padding:"8px"}}):React.createElement("span",{style:{flex:1,fontSize:13.5,fontWeight:650}},ap),
                        React.createElement("button",{onClick:()=>moveApplianceOrder(i,-1),disabled:i===0,style:{border:"none",background:"none",opacity:i===0?.25:1}},"↑"),
                        React.createElement("button",{onClick:()=>moveApplianceOrder(i,1),disabled:i===applianceOrder.length-1,style:{border:"none",background:"none",opacity:i===applianceOrder.length-1?.25:1}},"↓"),
                        React.createElement("button",{onClick:()=>startRenameAppliance(i),style:{border:"none",background:"none",color:COLORS.accent,fontWeight:700}},"編集"),
                        React.createElement("button",{onClick:()=>deleteAppliance(i),style:{border:"none",background:"none",color:COLORS.plum}},"削除"))),
                    React.createElement("div",{style:{display:"flex",gap:8,marginTop:12}},
                        React.createElement("input",{value:newApplianceDraft,onChange:e=>setNewApplianceDraft(e.target.value),onKeyDown:e=>e.key==="Enter"&&addAppliance(),placeholder:"新しい調理家電",style:{...input,flex:1}}),
                        React.createElement("button",{onClick:addAppliance,style:action},"追加")))
            ),
            React.createElement("div",{style:card},
                React.createElement("button",{onClick:()=>toggle("groups"),style:row},
                    React.createElement("div",{style:icon},"▰"),
                    React.createElement("div",null,React.createElement("p",{style:title},"買い物リストのグループ"),React.createElement("p",{style:sub},"追加・名前変更・並び替え")),
                    arrow("groups")),
                openSection==="groups" && React.createElement("div",{style:editor},
                    groups.map((g,i)=>React.createElement("div",{key:g.id,style:{display:"flex",alignItems:"center",gap:6,padding:"8px 0",borderBottom:`1px solid ${COLORS.line}`}},
                        editingGroupId===g.id?React.createElement("input",{autoFocus:true,value:editingGroupName,onChange:e=>setEditingGroupName(e.target.value),onKeyDown:e=>e.key==="Enter"&&saveRenameGroup(),onBlur:saveRenameGroup,style:{...input,flex:1,padding:"8px"}}):React.createElement("span",{style:{flex:1,fontSize:13.5,fontWeight:650}},g.name),
                        React.createElement("button",{onClick:()=>moveGroup(i,-1),disabled:i===0,style:{border:"none",background:"none",opacity:i===0?.25:1}},"↑"),
                        React.createElement("button",{onClick:()=>moveGroup(i,1),disabled:i===groups.length-1,style:{border:"none",background:"none",opacity:i===groups.length-1?.25:1}},"↓"),
                        React.createElement("button",{onClick:()=>startRenameGroup(g.id,g.name),style:{border:"none",background:"none",color:COLORS.accent,fontWeight:700}},"編集"),
                        React.createElement("button",{onClick:()=>deleteGroup(g.id),style:{border:"none",background:"none",color:COLORS.plum}},"削除"))),
                    React.createElement("div",{style:{display:"flex",gap:8,marginTop:12}},
                        React.createElement("input",{value:newGroupName,onChange:e=>setNewGroupName(e.target.value),onKeyDown:e=>e.key==="Enter"&&addGroup(),placeholder:"新しいグループ",style:{...input,flex:1}}),
                        React.createElement("button",{onClick:addGroup,style:action},"追加")))
            ),
            React.createElement("div",{style:card},
                React.createElement("button",{onClick:exportBackup,style:row},
                    React.createElement("div",{style:icon},"⇧"),
                    React.createElement("div",null,React.createElement("p",{style:title},"データをバックアップ"),React.createElement("p",{style:sub},"レシピと買い物リストをファイルに保存")),
                    React.createElement("span",{style:{marginLeft:"auto",fontSize:20,color:COLORS.inkSoft}},"›")),
                React.createElement("div",{style:divider}),
                React.createElement("button",{onClick:importBackup,style:row},
                    React.createElement("div",{style:icon},"⇩"),
                    React.createElement("div",null,React.createElement("p",{style:title},"データを復元"),React.createElement("p",{style:sub},"バックアップファイルから戻す")),
                    React.createElement("span",{style:{marginLeft:"auto",fontSize:20,color:COLORS.inkSoft}},"›"))
            ),
            React.createElement("div",{style:card},
                React.createElement("div",{style:{...row,cursor:"default"}},
                    React.createElement("div",{style:icon},"i"),
                    React.createElement("div",null,React.createElement("p",{style:title},"レシピノート"),React.createElement("p",{style:sub},"シンプルに、ためて、作って、買い物へ。")),
                    React.createElement("span",{style:{marginLeft:"auto",fontSize:11,color:COLORS.inkSoft}},"v1"))
            )
        )
    );
}

function App() {
    useGoogleFonts();
    const [mode, setMode] = useState(() => {
        try {
            const saved = localStorage.getItem("appMode");
            return saved && saved !== "todo" ? saved : "recipe";
        }
        catch {
            return "recipe";
        }
    });
    const switchMode = (m) => {
        setMode(m);
        try {
            localStorage.setItem("appMode", m);
        }
        catch {
            // ignore
        }
    };
    // ---- unified settings (name / API key / group management for both lists) ----
    const [showSettings, setShowSettings] = useState(false);
    const [recipeHomeToken, setRecipeHomeToken] = useState(0);
    const [recipeInitialView, setRecipeInitialView] = useState("list");
    const [myName, setMyName] = useState("");
    const [nameDraft, setNameDraft] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [jinaApiKey, setJinaApiKey] = useState("");
    const [allGroups, setAllGroups] = useState({ todo: [], shopping: [] });
    const [newGroupDraft, setNewGroupDraft] = useState({ todo: "", shopping: "" });
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [ungroupedLabels, setUngroupedLabels] = useState({ todo: "グループなし", shopping: "グループなし" });
    const [editingUngroupedLabel, setEditingUngroupedLabel] = useState({ todo: "グループなし", shopping: "グループなし" });
    const [categoryOrder, setCategoryOrder] = useState(DISH_CATEGORIES);
    const [applianceOrder, setApplianceOrder] = useState(APPLIANCES);
    const [newApplianceDraft, setNewApplianceDraft] = useState("");
    const [editingApplianceIndex, setEditingApplianceIndex] = useState(null);
    const [editingApplianceName, setEditingApplianceName] = useState("");
    useEffect(() => {
        const n = local.get("myName");
        if (n) {
            setMyName(n);
            setNameDraft(n);
        }
        try {
            const saved = localStorage.getItem("anthropic_api_key");
            if (saved)
                setApiKey(saved);
            const savedJina = localStorage.getItem("jina_api_key");
            if (savedJina)
                setJinaApiKey(savedJina);
        }
        catch {
            // ignore
        }
    }, []);
    useEffect(() => {
        const refs = [];
        Object.keys(LISTS).forEach((key) => {
            const groupsRef = uref(LISTS[key].groupsKey);
            const cb = groupsRef.on("value", (snap) => {
                const val = snap.val();
                setAllGroups((prev) => ({ ...prev, [key]: val ? val : [] }));
            });
            refs.push([groupsRef, cb]);
            const labelRef = uref(`${key}-ungrouped-label`);
            const labelCb = labelRef.on("value", (snap) => {
                const val = snap.val();
                const label = val || "グループなし";
                setUngroupedLabels((prev) => ({ ...prev, [key]: label }));
                setEditingUngroupedLabel((prev) => ({ ...prev, [key]: label }));
            });
            refs.push([labelRef, labelCb]);
        });
        return () => refs.forEach(([r, cb]) => r.off("value", cb));
    }, []);
    // Reconciles a saved custom order with the current master list: keeps
    // only entries still valid, then appends any new ones (e.g. "パン" was
    // added later) so nothing silently disappears from the settings screen.
    function reconcileOrder(saved, base) {
        // `saved` is the person's customized list (their own added/removed/
        // reordered items) and is the source of truth once it exists — we
        // must NOT drop entries just because they aren't in the hardcoded
        // `base` list, or custom additions would vanish the moment the list
        // re-syncs (e.g. right after a reorder). We only append any brand
        // new built-in items that predate the person's customization.
        if (!saved || !Array.isArray(saved))
            return base;
        const missing = base.filter((x) => !saved.includes(x));
        return [...saved, ...missing];
    }
    useEffect(() => {
        const catRef = uref("recipe-category-order");
        const catCb = catRef.on("value", (snap) => {
            setCategoryOrder(reconcileOrder(snap.val(), DISH_CATEGORIES));
        });
        const apRef = uref("recipe-appliance-order");
        const apCb = apRef.on("value", (snap) => {
            setApplianceOrder(reconcileOrder(snap.val(), APPLIANCES));
        });
        return () => {
            catRef.off("value", catCb);
            apRef.off("value", apCb);
        };
    }, []);
    function saveName() {
        const n = nameDraft.trim();
        if (!n)
            return;
        setMyName(n);
        local.set("myName", n);
    }
    const saveApiKey = (key) => {
        setApiKey(key);
        try {
            if (key)
                localStorage.setItem("anthropic_api_key", key);
            else
                localStorage.removeItem("anthropic_api_key");
        }
        catch {
            // ignore
        }
    };
    const saveJinaApiKey = (key) => {
        setJinaApiKey(key);
        try {
            if (key)
                localStorage.setItem("jina_api_key", key);
            else
                localStorage.removeItem("jina_api_key");
        }
        catch {
            // ignore
        }
    };
    function addGroupTo(listKey) {
        const name = (newGroupDraft[listKey] || "").trim();
        if (!name)
            return;
        const next = [...(allGroups[listKey] || []), { id: Date.now().toString(), name }];
        setAllGroups((prev) => ({ ...prev, [listKey]: next }));
        uref(LISTS[listKey].groupsKey).set(next);
        setNewGroupDraft((prev) => ({ ...prev, [listKey]: "" }));
    }
    async function deleteGroupFrom(listKey, id) {
        const next = (allGroups[listKey] || []).filter((g) => g.id !== id);
        setAllGroups((prev) => ({ ...prev, [listKey]: next }));
        uref(LISTS[listKey].groupsKey).set(next);
        try {
            const snap = await uref(LISTS[listKey].dbKey).once("value");
            const items = snap.val() || [];
            const cleaned = items.map((t) => (t.groupId === id ? { ...t, groupId: null } : t));
            await uref(LISTS[listKey].dbKey).set(cleaned);
        }
        catch {
            // best-effort cleanup
        }
    }
    function startRenameGroup(id, currentName) {
        setEditingGroupId(id);
        setEditingGroupName(currentName);
    }
    function saveRenameGroup(listKey) {
        const name = editingGroupName.trim();
        if (!name) {
            setEditingGroupId(null);
            return;
        }
        const next = (allGroups[listKey] || []).map((g) => (g.id === editingGroupId ? { ...g, name } : g));
        setAllGroups((prev) => ({ ...prev, [listKey]: next }));
        uref(LISTS[listKey].groupsKey).set(next);
        setEditingGroupId(null);
    }
    function moveGroup(listKey, index, direction) {
        const list = [...(allGroups[listKey] || [])];
        const target = index + direction;
        if (target < 0 || target >= list.length)
            return;
        [list[index], list[target]] = [list[target], list[index]];
        setAllGroups((prev) => ({ ...prev, [listKey]: list }));
        uref(LISTS[listKey].groupsKey).set(list);
    }
    function moveCategoryOrder(index, direction) {
        const list = [...categoryOrder];
        const target = index + direction;
        if (target < 0 || target >= list.length)
            return;
        [list[index], list[target]] = [list[target], list[index]];
        setCategoryOrder(list);
        uref("recipe-category-order").set(list);
    }
    function moveApplianceOrder(index, direction) {
        const list = [...applianceOrder];
        const target = index + direction;
        if (target < 0 || target >= list.length)
            return;
        [list[index], list[target]] = [list[target], list[index]];
        setApplianceOrder(list);
        uref("recipe-appliance-order").set(list);
    }
    function addAppliance() {
        const name = newApplianceDraft.trim();
        if (!name || applianceOrder.includes(name))
            return;
        const next = [...applianceOrder, name];
        setApplianceOrder(next);
        uref("recipe-appliance-order").set(next);
        setNewApplianceDraft("");
    }
    async function cascadeRecipeField(field, oldValue, newValue) {
        // Used when a category/appliance is renamed or deleted, so existing
        // recipes tagged with the old value follow along (or fall back to
        // a sensible default) instead of silently keeping an orphaned tag.
        try {
            const snap = await uref("recipes").once("value");
            const recipes = snap.val() || {};
            const updates = {};
            Object.keys(recipes).forEach((id) => {
                if (recipes[id]?.[field] === oldValue) {
                    updates[id] = { ...recipes[id], [field]: newValue };
                    if (field === "dishCategory" && oldValue === "肉料理") {
                        updates[id].meatType = null;
                    }
                }
            });
            if (Object.keys(updates).length > 0) {
                await Promise.all(Object.keys(updates).map((id) => uref(`recipes/${id}`).set(updates[id])));
            }
        }
        catch {
            // best-effort cleanup
        }
    }
    function deleteAppliance(index) {
        const removed = applianceOrder[index];
        const next = applianceOrder.filter((_, i) => i !== index);
        setApplianceOrder(next);
        uref("recipe-appliance-order").set(next);
        cascadeRecipeField("appliance", removed, null);
    }
    function startRenameAppliance(index) {
        setEditingApplianceIndex(index);
        setEditingApplianceName(applianceOrder[index]);
    }
    function saveRenameAppliance() {
        const name = editingApplianceName.trim();
        const oldValue = applianceOrder[editingApplianceIndex];
        if (!name || name === oldValue || applianceOrder.includes(name)) {
            setEditingApplianceIndex(null);
            return;
        }
        const next = applianceOrder.map((a, i) => (i === editingApplianceIndex ? name : a));
        setApplianceOrder(next);
        uref("recipe-appliance-order").set(next);
        setEditingApplianceIndex(null);
        cascadeRecipeField("appliance", oldValue, name);
    }

    async function exportBackup() {
        try {
            const snap = await uref("/").once("value");
            const payload = {
                app: "recipe-notebook",
                version: 1,
                exportedAt: new Date().toISOString(),
                firebase: snap.val() || {},
                local: {
                    myName: localStorage.getItem("myName") || "",
                    apiKey: localStorage.getItem("anthropic_api_key") || ""
                }
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `recipe-notebook-backup-${new Date().toISOString().slice(0,10)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (e) {
            alert("バックアップの作成に失敗しました。");
        }
    }
    function importBackup() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json,.json";
        input.onchange = async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            try {
                const parsed = JSON.parse(await file.text());
                if (!parsed || parsed.app !== "recipe-notebook" || !parsed.firebase) {
                    alert("このアプリのバックアップファイルではありません。");
                    return;
                }
                if (!confirm("現在のデータをバックアップ内容で置き換えます。よろしいですか？")) return;
                await uref("/").set(parsed.firebase);
                if (parsed.local?.myName) {
                    localStorage.setItem("myName", parsed.local.myName);
                    setMyName(parsed.local.myName);
                    setNameDraft(parsed.local.myName);
                }
                alert("データを復元しました。");
                setRecipeHomeToken((v) => v + 1);
            } catch (e) {
                alert("バックアップファイルを読み込めませんでした。");
            }
        };
        input.click();
    }

    function saveUngroupedLabel(listKey) {
        const label = (editingUngroupedLabel[listKey] || "").trim() || "グループなし";
        setUngroupedLabels((prev) => ({ ...prev, [listKey]: label }));
        setEditingUngroupedLabel((prev) => ({ ...prev, [listKey]: label }));
        uref(`${listKey}-ungrouped-label`).set(label);
    }
    return (React.createElement("div", { style: { display: "flex", flexDirection: "column", height: "100dvh" } },
        React.createElement("div", { style: {
                position: "fixed",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 0,
                width: "100%",
                maxWidth: 520,
                zIndex: 70,
                display: "flex",
                alignItems: "center",
                background: "rgba(255,255,255,0.96)",
                borderTop: `1px solid ${COLORS.line}`,
                padding: "7px 8px calc(7px + env(safe-area-inset-bottom, 0px))",
                boxShadow: "0 -8px 26px rgba(32,35,31,0.06)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
            } },
            React.createElement("button", { onClick: () => { switchMode("recipe"); setRecipeInitialView("list"); setRecipeHomeToken((v) => v + 1); setShowSettings(false); }, style: {
                    flex: 1, border: "none", background: "none", padding: "7px 0 5px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    fontSize: 10.5, fontWeight: 700, color: mode === "recipe" && recipeInitialView === "list" ? COLORS.accent : COLORS.inkSoft,
                } }, React.createElement(BookOpen, { size: 21 }), "レシピ"),
            React.createElement("button", { onClick: () => { switchMode("recipe"); setRecipeInitialView("calendar"); setRecipeHomeToken((v) => v + 1); setShowSettings(false); }, style: {
                    flex: 1, border: "none", background: "none", padding: "7px 0 5px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    fontSize: 10.5, fontWeight: 700, color: mode === "recipe" && recipeInitialView === "calendar" ? COLORS.accent : COLORS.inkSoft,
                } }, React.createElement(CalendarIcon, { size: 21 }), "献立"),
            React.createElement("button", { onClick: () => switchMode("shopping"), style: {
                    flex: 1, border: "none", background: "none", padding: "7px 0 5px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    fontSize: 10.5, fontWeight: 700, color: mode === "shopping" ? COLORS.accent : COLORS.inkSoft,
                } }, React.createElement(ClipboardPaste, { size: 21 }), "買い物"),
            React.createElement("button", { onClick: () => setShowSettings(true), title: "設定", "aria-label": "設定", style: {
                    flex: 1, border: "none", background: "none", padding: "7px 0 5px",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    fontSize: 10.5, fontWeight: 700, color: COLORS.inkSoft,
                } }, React.createElement(Settings, { size: 21 }), "設定")),
        React.createElement("div", { style: { flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: "calc(70px + env(safe-area-inset-bottom, 0px))", background: COLORS.paper } },
            mode === "recipe" && React.createElement(RecipeNotebook, { key: recipeHomeToken, initialView: recipeInitialView, apiKey: apiKey, jinaApiKey: jinaApiKey, categoryOrder: categoryOrder, applianceOrder: applianceOrder }),
            mode === "shopping" && React.createElement(TodoApp, { listKey: "shopping", myName: myName, ungroupedLabel: ungroupedLabels.shopping })),
        showSettings && React.createElement(SettingsPanel, {
            onClose: () => setShowSettings(false),
            myName: myName,
            nameDraft: nameDraft,
            setNameDraft: setNameDraft,
            saveName: saveName,
            apiKey: apiKey,
            saveApiKey: saveApiKey,
            jinaApiKey: jinaApiKey,
            saveJinaApiKey: saveJinaApiKey,
            groups: allGroups.shopping || [],
            newGroupName: newGroupDraft.shopping || "",
            setNewGroupName: (value) => setNewGroupDraft((prev) => ({ ...prev, shopping: value })),
            addGroup: () => addGroupTo("shopping"),
            deleteGroup: (id) => deleteGroupFrom("shopping", id),
            moveGroup: (index, direction) => moveGroup("shopping", index, direction),
            editingGroupId: editingGroupId,
            editingGroupName: editingGroupName,
            setEditingGroupName: setEditingGroupName,
            startRenameGroup: startRenameGroup,
            saveRenameGroup: () => saveRenameGroup("shopping"),
            ungroupedLabel: editingUngroupedLabel.shopping || "",
            setUngroupedLabel: (value) => setEditingUngroupedLabel((prev) => ({ ...prev, shopping: value })),
            saveUngroupedLabel: () => saveUngroupedLabel("shopping"),
            exportBackup: exportBackup,
            importBackup: importBackup,
            categoryOrder: categoryOrder,
            applianceOrder: applianceOrder,
            moveCategoryOrder: moveCategoryOrder,
            moveApplianceOrder: moveApplianceOrder,
            newApplianceDraft: newApplianceDraft,
            setNewApplianceDraft: setNewApplianceDraft,
            addAppliance: addAppliance,
            deleteAppliance: deleteAppliance,
            editingApplianceIndex: editingApplianceIndex,
            editingApplianceName: editingApplianceName,
            setEditingApplianceName: setEditingApplianceName,
            startRenameAppliance: startRenameAppliance,
            saveRenameAppliance: saveRenameAppliance,
        })));
}
const rootEl = document.getElementById("root");
createRoot(rootEl).render(React.createElement(App, null));
