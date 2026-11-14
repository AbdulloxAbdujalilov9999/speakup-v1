"""Build the v2 course ("English from Zero v2") for the SpeakUp-1 platform.

Run:  python tools/import_v2.py "<.../English from Zero v2>" .

Reads the folder that holds "1 - Lessons", "2 - Homeworks", "3 - Answers" and
"4 - Data for SpeakUp/course_v2.json" and writes:
  data/content-v2.js   window.SU1 for v2: parts, units (one per PowerPoint section),
                       homeworks (HTML + an answer key per blank), answer key
  data/course-v2.js    window.SU1C = course_v2.json (the interactive practice data)
  slides-v2/*.pdf      one small PDF per lesson / check / intro / big review
  content-v2/          a copy of the source folder (decks, homework, answer keys)
v2 homework ids are 100 + lesson number, so v1 (1-30) answers stay apart.
"""
import zipfile, re, sys, json, os, shutil, html
import xml.etree.ElementTree as ET

A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SRC, OUT = sys.argv[1], sys.argv[2]
HW_BASE = 100
DECKS = ['Part 1 - Lessons 01-10', 'Part 2 - Lessons 11-20', 'Part 3 - Lessons 21-30']


def load_course():
    with open(os.path.join(SRC, '4 - Data for SpeakUp', 'course_v2.json'), encoding='utf-8') as fh:
        return json.load(fh)


# ---------------- decks: split by PowerPoint section ----------------
def deck_slides(path):
    z = zipfile.ZipFile(path)
    pres = z.read('ppt/presentation.xml').decode('utf8')
    rels = z.read('ppt/_rels/presentation.xml.rels').decode('utf8')
    rid = {}
    for m in re.finditer(r'<Relationship ([^>]*)/>', rels):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(1)))
        rid[a['Id']] = a['Target']
    order = re.findall(r'<p:sldId [^>]*id="(\d+)"[^>]*r:id="(rId\d+)"', pres)
    pos = {sid: i + 1 for i, (sid, _) in enumerate(order)}
    slides = []
    for sid, r in order:
        root = ET.fromstring(z.read('ppt/' + rid[r]))
        ps = []
        for p in root.iter(A + 'p'):
            t = ''.join(x.text or '' for x in p.iter(A + 't')).strip()
            if t:
                ps.append(t)
        slides.append(ps)
    sections = []
    for name, body in re.findall(r'<p14:section name="([^"]*)"[^>]*>(.*?)</p14:section>', pres, re.S):
        ids = [pos[i] for i in re.findall(r'id="(\d+)"', body) if i in pos]
        if ids:
            sections.append((html.unescape(name), min(ids), max(ids)))
    return slides, sections


def build_units(course):
    lessons = {l['n']: l for l in course['lessons']}
    checks = {c['k']: c for c in course['checks']}
    parts, units = [], []
    for pi, deck in enumerate(DECKS, 1):
        slides, sections = deck_slides(os.path.join(SRC, '1 - Lessons', deck + '.pptx'))
        pmeta = course['parts'][pi - 1]
        parts.append({'num': pi, 'title': '%s · %s' % (pmeta['name'], pmeta['sub']),
                      'pptx': 'content-v2/1 - Lessons/%s.pptx' % deck, 'pdf': 'content-v2/1 - Lessons/%s.pdf' % deck,
                      'slideCount': len(slides)})
        for name, start, end in sections:
            m_l = re.match(r'(\d+)-dars:\s*(.*)$', name)
            m_k = re.match(r'(\d+)-nazorat', name)
            if m_l:
                n = int(m_l.group(1)); L = lessons[n]
                u = {'type': 'lesson', 'num': n, 'title': L['title'], 'titleUz': L['titleUz'], 'objectives': L['goals']}
            elif m_k:
                k = int(m_k.group(1)); c = checks[k]
                u = {'type': 'quiz', 'num': k, 'title': c['titleUz'] + ': ' + ' · '.join(lessons[x]['title'] for x in c['covers']),
                     'objectives': ['%d-dars: %s' % (x, lessons[x]['title']) for x in c['covers']], 'covers': c['covers']}
            elif 'kirish' in name:
                u = {'type': 'intro', 'num': pi, 'title': slides[start - 1][1] if len(slides[start - 1]) > 1 else name,
                     'objectives': ['%d. %s' % (l['n'], l['title']) for l in course['lessons'] if pmeta['from'] <= l['n'] <= pmeta['to']]}
            else:   # "1-qism – katta takrorlash": the part's big review + Jeopardy
                u = {'type': 'outro', 'num': pi, 'title': 'Katta takrorlash: %d–%d-darslar' % (pmeta['from'], pmeta['to']),
                     'objectives': ['Qoidalar bir joyda', 'Aralash test', 'Oʻyin: “Savol-ball” (Jeopardy)']}
            u.update({'part': pi, 'start': start, 'end': end, 'section': name, 'slides': []})
            for s in range(start, end + 1):
                ps = slides[s - 1]
                label = ps[0] if ps else ''
                title = ps[1] if len(ps) > 1 else ''
                sl = {'n': s, 'label': label, 'title': title, 'text': ps[2:40]}
                if re.search(r'javoblar', label + ' ' + title, re.I):
                    sl['ans'] = 1
                u['slides'].append(sl)
            units.append(u)
    return parts, units


# ---------------- homework docx -> html (+ the key of every blank) ----------------
def esc(s):
    return html.escape(s, quote=False)


class HW:
    """docx -> html exactly like tools/extract.py, recording (exercise, item) for every blank."""

    def __init__(self):
        self.blanks = []      # [(ex, item)] in document order
        self.ex = 0
        self.item = 0

    def run_html(self, r):
        rpr = r.find(W + 'rPr'); parts = []
        for ch in r:
            tag = ch.tag.replace(W, '')
            if tag == 't': parts.append(esc(ch.text or ''))
            elif tag == 'tab': parts.append('&emsp;')
            elif tag == 'br': parts.append('<br>')
        s = ''.join(parts)
        if not s: return ''

        def blank(m):
            self.blanks.append((self.ex, self.item, ''))
            return '<input class="blank" size="%d" aria-label="answer">' % max(4, len(m.group()))
        s = re.sub(r'_{3,}', blank, s)
        st = []
        if rpr is not None:
            c = rpr.find(W + 'color')
            if c is not None and c.get(W + 'val') not in (None, 'auto', '000000'): st.append('color:#' + c.get(W + 'val'))
            b = rpr.find(W + 'b')
            if b is not None and b.get(W + 'val') not in ('0', 'false'): s = '<b>' + s + '</b>'
            i = rpr.find(W + 'i')
            if i is not None and i.get(W + 'val') not in ('0', 'false'): s = '<i>' + s + '</i>'
        return '<span style="%s">%s</span>' % (';'.join(st), s) if st else s

    def para_html(self, p, in_table=False):
        text = ''.join(x.text or '' for x in p.iter(W + 't')).strip()
        m = re.match(r'(\d+)-mashq', text)
        if m: self.ex, self.item = int(m.group(1)), 0
        else:
            m = re.match(r'(\d+)\.\s', text)
            if m and self.ex: self.item = int(m.group(1))
        first = len(self.blanks)
        inner = ''.join(self.run_html(r) for r in p.iter(W + 'r'))
        ctx = re.sub(r'_{3,}', '___', re.sub(r'^\d+\.\s*', '', text)).strip()
        if re.match(r'\d+\.\s', text): self.itext = ctx
        if ctx == '___' or not ctx.replace('___', '').strip(): ctx = getattr(self, 'itext', '')   # a whole-line answer: the numbered line above
        for j in range(first, len(self.blanks)):      # the line around each blank: shown to the teacher
            self.blanks[j] = self.blanks[j][:2] + (ctx[:120],)
        if not text: return ''
        szs = [int(s.get(W + 'val')) for s in p.iter(W + 'sz') if s.get(W + 'val')]
        sz = max(szs) if szs else 22
        shd = [s.get(W + 'fill') for s in p.iter(W + 'shd') if s.get(W + 'fill') not in (None, 'auto')]
        style = ' style="background:#%s"' % shd[0] if shd else ''
        if in_table: return '<p>%s</p>' % inner
        if sz >= 40: return '<h1 class="hw-title">%s</h1>' % inner
        if sz >= 26 or re.match(r'\d+-mashq', text): return '<h3 class="hw-h">%s</h3>' % inner
        if text.startswith('☐'): return '<label class="hw-check"><input type="checkbox"> %s</label>' % esc(text.lstrip('☐ '))
        cls = 'hw-kicker' if sz <= 20 else ('hw-sub' if sz == 24 else ('hw-box' if shd else 'hw-p'))
        if re.match(r'^\(.*\)$', text): cls += ' hw-uz'
        return '<p class="%s"%s>%s</p>' % (cls, style, inner)

    def table_html(self, t):
        rows = t.findall(W + 'tr')
        if not rows: return ''
        out = ['<div class="hw-table-wrap"><table class="hw-table">']
        for tr in rows:
            out.append('<tr>')
            for tc in tr.findall(W + 'tc'):
                shd = [s.get(W + 'fill') for s in tc.iter(W + 'shd') if s.get(W + 'fill') not in (None, 'auto')]
                span = tc.find(W + 'tcPr/' + W + 'gridSpan')
                attrs = ' colspan="%s"' % span.get(W + 'val') if span is not None else ''
                dark = shd and shd[0].upper() in ('2E2364', '1FB5A6', 'FF6B5B', '5416B5', '0F083B')
                if shd: attrs += ' style="background:#%s%s"' % (shd[0], ';color:#fff' if dark else '')
                tag = 'th' if dark else 'td'
                inner = ''.join(self.para_html(p, True) for p in tc.findall(W + 'p'))
                inner += ''.join(self.table_html(x) for x in tc.findall(W + 'tbl'))
                out.append('<%s%s>%s</%s>' % (tag, attrs, inner, tag))
            out.append('</tr>')
        out.append('</table></div>')
        return ''.join(out)

    def docx_html(self, path):
        body = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find(W + 'body')
        out = []
        for el in body:
            tag = el.tag.replace(W, '')
            if tag == 'p': out.append(self.para_html(el))
            elif tag == 'tbl': out.append(self.table_html(el))
        return '\n'.join(x for x in out if x)


def docx_paras(path):
    body = ET.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find(W + 'body')
    return [''.join(x.text or '' for x in p.iter(W + 't')).strip() for p in body.iter(W + 'p')]


def parse_answer_key(path):
    """'4-mashq:  1–f;  2–e' / '2-mashq:  1) is;  2) am' -> {ex: {item: text}}, {ex: label}, title"""
    ps = [p for p in docx_paras(path) if p]
    keys, kinds = {}, {}
    for line in ps[1:]:
        m = re.match(r'(\d+)-mashq(?:\s*\(([^)]*)\))?:\s*(.*)$', line)
        if not m: continue
        ex, kind, body = int(m.group(1)), (m.group(2) or ''), m.group(3)
        kinds[ex] = kind
        items = {}
        for part in re.split(r';\s+(?=\d+\s*[)–-])', body.strip()):
            q = re.match(r'\s*(\d+)\s*\)\s*(.*?);?\s*$', part) or re.match(r'\s*(\d+)\s*[–-]\s*([a-z])\s*;?\s*$', part)
            if q: items[int(q.group(1))] = q.group(2).strip()
        keys[ex] = items
    return ps[0], keys, kinds, ps


def blank_keys(blanks, keys, kinds):
    """one entry per blank: {a: [alternatives], k: kind} or None (name/date lines, writing, open answers)"""
    per = {}
    for b in blanks: per[b[:2]] = per.get(b[:2], 0) + 1
    seen, out = {}, []
    for ex, item, ctx in blanks:
        seen[(ex, item)] = j = seen.get((ex, item), 0) + 1
        raw = keys.get(ex, {}).get(item)
        kind = kinds.get(ex, '')
        if not ex or not item or raw is None or 'yozish' in kind or re.search(r'har xil', raw or ''):
            out.append(None); continue
        cnt = per[(ex, item)]
        if cnt == 1:
            alts = raw
        else:
            segs = re.split(r'\s*…\s*', raw)
            if len(segs) != cnt: out.append(None); continue
            alts = segs[j - 1]
        e = {'a': [x.strip() for x in alts.split(' / ') if x.strip()] if cnt == 1 or ' / ' in alts else [alts.strip()], 'ex': ex, 'i': item}
        if ctx and ctx != '___': e['q'] = ctx
        if 'oʻqish' in kind: e['open'] = 1        # reading answers: a guide for the teacher, not auto-checked
        out.append(e)
    return out


def build_homeworks(course):
    hw_dir = os.path.join(SRC, '2 - Homeworks'); ak_dir = os.path.join(SRC, '3 - Answers')
    homeworks, ak_lessons = [], {}
    for f in sorted(os.listdir(hw_dir)):
        m = re.match(r'Homework - Lesson (\d+)\.docx$', f)
        if not m: continue
        n = int(m.group(1))
        h = HW(); body = h.docx_html(os.path.join(hw_dir, f))
        title, keys, kinds, akps = parse_answer_key(os.path.join(ak_dir, 'Answer Key - Lesson %02d.docx' % n))
        ps = [x for x in docx_paras(os.path.join(hw_dir, f)) if x]
        bk = blank_keys(h.blanks, keys, kinds)
        homeworks.append({'num': HW_BASE + n, 'n': n, 'title': ps[0] if ps else f, 'subtitle': ps[1] if len(ps) > 1 else '',
                          'docx': 'content-v2/2 - Homeworks/' + f, 'pdf': 'content-v2/2 - Homeworks/' + f.replace('.docx', '.pdf'),
                          'html': body, 'keys': bk})
        ak_lessons[HW_BASE + n] = {'title': title, 'items': akps[1:],
                                   'docx': 'content-v2/3 - Answers/Answer Key - Lesson %02d.docx' % n,
                                   'pdf': 'content-v2/3 - Answers/Answer Key - Lesson %02d.pdf' % n}
        auto = sum(1 for k in bk if k and not k.get('open'))
        print('  homework %2d: %3d blanks, %3d auto-checked, %2d open' % (n, len(bk), auto, sum(1 for k in bk if k and k.get('open'))))
    allp = [p for p in docx_paras(os.path.join(ak_dir, 'Answer Key - All Homework.docx')) if p]
    answer_key = {'title': allp[0], 'intro': allp[1], 'docx': 'content-v2/3 - Answers/Answer Key - All Homework.docx',
                  'pdf': 'content-v2/3 - Answers/Answer Key - All Homework.pdf', 'lessons': ak_lessons}
    return homeworks, answer_key


def main():
    course = load_course()
    parts, units = build_units(course)
    homeworks, answer_key = build_homeworks(course)
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError:
        sys.exit('pip install --user pypdf')
    sd = os.path.join(OUT, 'slides-v2')
    if os.path.exists(sd): shutil.rmtree(sd)
    os.makedirs(sd)
    readers = {i + 1: PdfReader(os.path.join(SRC, '1 - Lessons', d + '.pdf')) for i, d in enumerate(DECKS)}
    for u in units:
        w = PdfWriter()
        for s in range(u['start'], u['end'] + 1):
            w.add_page(readers[u['part']].pages[s - 1])
        name = 'slides-v2/part%d-%s-%02d.pdf' % (u['part'], u['type'], u['num'])
        with open(os.path.join(OUT, name), 'wb') as fh: w.write(fh)
        u['pdf'] = name
    data = {'version': 'v2', 'hwBase': HW_BASE, 'parts': parts, 'units': units, 'homeworks': homeworks, 'answerKey': answer_key}
    os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)
    with open(os.path.join(OUT, 'data', 'content-v2.js'), 'w', encoding='utf-8') as fh:
        fh.write('/* Generated by tools/import_v2.py from "English from Zero v2" — do not edit by hand. */\nwindow.SU1 = ')
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    with open(os.path.join(OUT, 'data', 'course-v2.js'), 'w', encoding='utf-8') as fh:
        fh.write('/* course_v2.json from "English from Zero v2/4 - Data for SpeakUp" — the practice data. */\nwindow.SU1C = ')
        json.dump(course, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    dst = os.path.join(OUT, 'content-v2')
    if os.path.exists(dst): shutil.rmtree(dst)
    shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns('.DS_Store', '4 - Data for SpeakUp'))
    print('parts', len(parts), 'units', len(units), 'lessons', sum(u['type'] == 'lesson' for u in units),
          'checks', sum(u['type'] == 'quiz' for u in units), 'slides', sum(len(u['slides']) for u in units),
          'homeworks', len(homeworks))


main()
