#!/usr/bin/env python3
"""把词表转换成 WordTok 可提交的 pages 载荷，并按 relay 限制分批。

用法:
  python3 build_pages.py --input cet4.json --name "CET4 核心词" --out ./plans/cet4
  python3 build_pages.py --input words.csv --format csv --name "自建" --page-size 20

输入: JSON 数组 (qwerty 格式: name/trans/usphone/ukphone/example)
      CSV/TSV (列: word,translation[,phonetic][,example])
      TXT (每行 word<TAB|逗号|空格>translation)
输出: out/batch-01.json ... + out/manifest.json
"""
import argparse, csv, hashlib, json, os, re, sys

MAX_CARDS = 500
MAX_BYTES = 900_000  # relay 硬限 1 MiB，留出 JSON-RPC 包装余量


def norm_trans(v):
    if isinstance(v, list):
        parts = [str(x).strip() for x in v if str(x).strip()]
    elif isinstance(v, str):
        parts = [p.strip() for p in re.split(r"[\n;；]+", v) if p.strip()]
    else:
        parts = []
    out = []
    for p in parts:  # 去重保序
        if p not in out:
            out.append(p)
    return "；".join(out)


def load(path):
    ext = os.path.splitext(path)[1].lower()
    rows = []
    if ext == ".json":
        data = json.load(open(path, encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get("words") or data.get("data") or []
        for it in data:
            rows.append({
                "word": str(it.get("name") or it.get("word") or it.get("headWord") or "").strip(),
                "trans": norm_trans(it.get("trans") or it.get("translation") or it.get("meaning")),
                "phonetic": str(it.get("usphone") or it.get("phonetic") or it.get("ukphone") or "").strip(),
                "example": str(it.get("example") or it.get("sentence") or "").strip(),
            })
    elif ext in (".csv", ".tsv"):
        with open(path, encoding="utf-8-sig", newline="") as f:
            sample = f.read(4096); f.seek(0)
            delim = "\t" if (ext == ".tsv" or sample.count("\t") > sample.count(",")) else ","
            rdr = csv.reader(f, delimiter=delim)
            for i, r in enumerate(rdr):
                if not r or not r[0].strip():
                    continue
                if i == 0 and re.search(r"word|单词|词汇|name", r[0], re.I):
                    continue
                rows.append({
                    "word": r[0].strip(),
                    "trans": norm_trans(r[1] if len(r) > 1 else ""),
                    "phonetic": r[2].strip() if len(r) > 2 else "",
                    "example": r[3].strip() if len(r) > 3 else "",
                })
    else:
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            m = re.split(r"\t+|\s*[|,，;；:：]\s*|\s{2,}", line, maxsplit=1)
            if len(m) == 1:  # 「word 中文」单空格分隔：在首个中文字符前切开
                mm = re.match(r"^([A-Za-z][A-Za-z'’.\- ]*?)\s+([^\x00-\x7f].*)$", line)
                if mm:
                    m = [mm.group(1), mm.group(2)]
            rows.append({
                "word": m[0].strip(),
                "trans": norm_trans(m[1] if len(m) > 1 else ""),
                "phonetic": "", "example": "",
            })
    return rows


def build(rows, name, page_size):
    seen, kept, dropped, blank = set(), [], [], []
    for r in rows:
        w = r["word"]
        if not w or not r["trans"]:
            blank.append(w or "<空词形>")
            continue
        key = w.casefold()
        if key in seen:
            dropped.append(w)
            continue
        seen.add(key)
        kept.append(r)
    pages = []
    for start in range(0, len(kept), page_size):
        chunk = kept[start:start + page_size]
        entries = []
        for r in chunk:
            wid = "e-" + hashlib.sha1(r["word"].casefold().encode()).hexdigest()[:10]
            blocks = [
                {"id": "word", "label": "词形", "text": r["word"], "format": "text", "initially_visible": True},
                {"id": "trans", "label": "释义",
                 "text": (f"**{r['phonetic']}**　" if r["phonetic"] else "") + r["trans"],
                 "format": "markdown", "initially_visible": False},
            ]
            if r["example"]:
                blocks.append({"id": "example", "label": "例句", "text": r["example"],
                               "format": "text", "initially_visible": False})
            entries.append({"id": wid, "layout": "compact", "blocks": blocks})
        n = start + 1
        m = start + len(chunk)
        pages.append({"id": f"p-{start // page_size + 1:03d}",
                      "title": f"{name} {n:04d}–{m:04d}",
                      "entries": entries})
    return pages, kept, dropped, blank


def pack(pages, name):
    batches, cur, cur_cards = [], [], 0
    for p in pages:
        trial = cur + [p]
        size = len(json.dumps({"name": name, "pages": trial}, ensure_ascii=False).encode())
        cards = cur_cards + len(p["entries"])
        if cur and (size > MAX_BYTES or cards > MAX_CARDS):
            batches.append(cur)
            cur, cur_cards = [p], len(p["entries"])
        else:
            cur, cur_cards = trial, cards
    if cur:
        batches.append(cur)
    return batches


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--page-size", type=int, default=30)
    ap.add_argument("--source", default="")
    ap.add_argument("--license", default="")
    a = ap.parse_args()

    rows = load(a.input)
    pages, kept, dropped, blank = build(rows, a.name, max(1, a.page_size))
    os.makedirs(a.out, exist_ok=True)
    batches = pack(pages, a.name)

    manifest = {
        "book_name": a.name, "source": a.source, "license": a.license,
        "input_rows": len(rows), "count": len(kept), "pages": len(pages),
        "page_size": a.page_size, "duplicates": len(dropped),
        "duplicate_sample": dropped[:10], "missing_fields": len(blank),
        "missing_sample": blank[:10], "batches": [],
    }
    for i, b in enumerate(batches, 1):
        fn = f"batch-{i:02d}.json"
        payload = {"name": a.name, "pages": b}
        raw = json.dumps(payload, ensure_ascii=False)
        open(os.path.join(a.out, fn), "w", encoding="utf-8").write(raw)
        manifest["batches"].append({
            "file": fn, "mode": "compose" if i == 1 else "append",
            "cards": sum(len(p["entries"]) for p in b), "bytes": len(raw.encode()),
            "page_ids": [p["id"] for p in b],
        })
    json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in manifest.items() if k != "batches"}, ensure_ascii=False))
    for b in manifest["batches"]:
        print(f"  {b['file']}  {b['mode']}  {b['cards']} 条  {b['bytes']} B  {len(b['page_ids'])} 页")
    if rows and len(blank) > len(rows) * 0.2:
        print("警告: 超过 20% 的词条缺词形或释义，检查来源格式", file=sys.stderr)


if __name__ == "__main__":
    main()
