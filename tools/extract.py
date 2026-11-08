"""Build data/content.js for the SpeakUp-1 platform from ~/Desktop/Speakup-1.
Run: python3 extract.py <source folder> <platform folder>"""
import zipfile, re, sys, json, os, shutil, html
import xml.etree.ElementTree as ET
A='{http://schemas.openxmlformats.org/drawingml/2006/main}'
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
SRC, OUT = sys.argv[1], sys.argv[2]
num = lambda s: int(re.findall(r'\d+', s)[0])

def slide_paras(z, n):
    root = ET.fromstring(z.read(n)); out = []
    for p in root.iter(A+'p'):
        t = ''.join(x.text or '' for x in p.iter(A+'t')).strip()
        if t: out.append(t)
    return out

def read_pptx(path):
    z = zipfile.ZipFile(path)
    names = sorted([n for n in z.namelist() if re.match(r'ppt/slides/slide\d+\.xml$', n)], key=num)
    return [slide_paras(z, n) for n in names]

def build_part(pi, fname, pdfname):
    slides = read_pptx(os.path.join(SRC, '1 - Lessons', fname))
    units, cur = [], None
    def close(end):
        if cur: cur['end'] = end
    for i, ps in enumerate(slides, 1):
        head = ps[0] if ps else ''
        if head in ('DARS', 'NAZORAT') and len(ps) > 2 and ps[1].isdigit():
            close(i - 1)
            cur = {'type': 'lesson' if head == 'DARS' else 'quiz', 'num': int(ps[1]), 'title': ps[2], 'start': i}
            if head == 'DARS':
                obj = ps[ps.index('Bugun oʻrganamiz:') + 1:] if 'Bugun oʻrganamiz:' in ps else ps[3:]
                cur['objectives'] = obj
            else:
                cur['objectives'] = ps[3:]
            units.append(cur)
        elif i == len(slides) and head.startswith('Barakalla'):
            close(i - 1)
            cur = {'type': 'outro', 'num': pi, 'title': head, 'start': i, 'objectives': ps[1:2]}
            units.append(cur)
        elif i == 1:
            cur = {'type': 'intro', 'num': pi, 'title': ps[1] if len(ps) > 1 else head, 'start': 1, 'objectives': []}
            units.append(cur)
    close(len(slides))
    for u in units:
        u['part'] = pi
        u['slides'] = []
        for s in range(u['start'], u['end'] + 1):
            ps = slides[s - 1]
            u['slides'].append({'n': s, 'label': ps[0] if ps else '', 'title': ps[1] if len(ps) > 1 else '', 'text': ps[2:40]})
        if u['type'] == 'intro':
            u['objectives'] = [p for p in slides[1][2:] if not p.isdigit()][:20] if len(slides) > 1 else []
    return {'num': pi, 'title': slides[0][1] if len(slides[0]) > 1 else '', 'pptx': 'content/1 - Lessons/' + fname,
            'pdf': 'content/1 - Lessons/PDF/' + pdfname, 'slideCount': len(slides)}, units

# ---------- docx -> html ----------
def esc(s): return html.escape(s, quote=False)
def run_html(r):
    rpr = r.find(W+'rPr'); parts = []
    for ch in r:
        tag = ch.tag.replace(W, '')
        if tag == 't': parts.append(esc(ch.text or ''))
        elif tag == 'tab': parts.append('&emsp;')
        elif tag == 'br': parts.append('<br>')
    s = ''.join(parts)
    if not s: return ''
    s = re.sub(r'_{3,}', lambda m: '<input class="blank" size="%d" aria-label="answer">' % max(4, min(24, len(m.group()))), s)
    st = []
    if rpr is not None:
        c = rpr.find(W+'color')
        if c is not None and c.get(W+'val') not in (None, 'auto', '000000'): st.append('color:#' + c.get(W+'val'))
        b = rpr.find(W+'b')
        if b is not None and b.get(W+'val') not in ('0', 'false'): s = '<b>' + s + '</b>'
        i = rpr.find(W+'i')
        if i is not None and i.get(W+'val') not in ('0', 'false'): s = '<i>' + s + '</i>'
    return '<span style="%s">%s</span>' % (';'.join(st), s) if st else s

def para_html(p, in_table=False):
    inner = ''.join(run_html(r) for r in p.iter(W+'r'))
    text = ''.join(x.text or '' for x in p.iter(W+'t')).strip()
    if not text: return '' if in_table else ''
    szs = [int(s.get(W+'val')) for s in p.iter(W+'sz') if s.get(W+'val')]
    sz = max(szs) if szs else 22
    shd = [s.get(W+'fill') for s in p.iter(W+'shd') if s.get(W+'fill') not in (None, 'auto')]
    style = ' style="background:#%s"' % shd[0] if shd else ''
    if in_table: return '<p>%s</p>' % inner
    if sz >= 40: return '<h1 class="hw-title">%s</h1>' % inner
    if sz >= 26: return '<h3 class="hw-h">%s</h3>' % inner
    if text.startswith('☐'): return '<label class="hw-check"><input type="checkbox"> %s</label>' % esc(text.lstrip('☐ '))
    cls = 'hw-kicker' if sz <= 20 else ('hw-sub' if sz == 24 else ('hw-box' if shd else 'hw-p'))
    return '<p class="%s"%s>%s</p>' % (cls, style, inner)

def table_html(t):
    rows = t.findall(W+'tr')
    if not rows: return ''
    out = ['<div class="hw-table-wrap"><table class="hw-table">']
    for ri, tr in enumerate(rows):
        out.append('<tr>')
        for tc in tr.findall(W+'tc'):
            shd = [s.get(W+'fill') for s in tc.iter(W+'shd') if s.get(W+'fill') not in (None, 'auto')]
            span = tc.find(W+'tcPr/'+W+'gridSpan')
            attrs = ' colspan="%s"' % span.get(W+'val') if span is not None else ''
            dark = shd and shd[0].upper() in ('2E2364', '1FB5A6', 'FF6B5B')
            if shd: attrs += ' style="background:#%s%s"' % (shd[0], ';color:#fff' if dark else '')
            tag = 'th' if dark else 'td'
            inner = ''.join(para_html(p, True) for p in tc.findall(W+'p'))
            inner += ''.join(table_html(x) for x in tc.findall(W+'tbl'))
            out.append('<%s%s>%s</%s>' % (tag, attrs, inner, tag))
        out.append('</tr>')
    out.append('</table></div>')
    return ''.join(out)

def docx_html(path):
    z = zipfile.ZipFile(path)
    body = ET.fromstring(z.read('word/document.xml')).find(W+'body')
    out = []
    for el in body:
        tag = el.tag.replace(W, '')
        if tag == 'p': out.append(para_html(el))
        elif tag == 'tbl': out.append(table_html(el))
    return '\n'.join(x for x in out if x)

def docx_paras(path):
    z = zipfile.ZipFile(path)
    body = ET.fromstring(z.read('word/document.xml')).find(W+'body')
    return [''.join(x.text or '' for x in p.iter(W+'t')).strip() for p in body.iter(W+'p')]

# ---------- build ----------
parts, units = [], []
for pi, (f, pdf) in enumerate([('Part 1 - Lessons 01-10.pptx', 'Part 1 - Lessons 01-10.pdf'),
                               ('Part 2 - Lessons 11-20.pptx', 'Part 2 - Lessons 11-20.pdf'),
                               ('Part 3 - Lessons 21-30.pptx', 'Part 3 - Lessons 21-30.pdf')], 1):
    p, us = build_part(pi, f, pdf); parts.append(p); units += us

hw_dir = os.path.join(SRC, '2 - Homeworks')
homeworks = []
for f in sorted(os.listdir(hw_dir)):
    m = re.match(r'Homework - Lesson (\d+)\.docx$', f)
    if not m: continue
    n = int(m.group(1)); ps = [x for x in docx_paras(os.path.join(hw_dir, f)) if x]
    homeworks.append({'num': n, 'title': ps[1] if len(ps) > 1 else f, 'subtitle': ps[2] if len(ps) > 2 else '',
                      'docx': 'content/2 - Homeworks/' + f, 'pdf': 'content/2 - Homeworks/PDF/' + f.replace('.docx', '.pdf'),
                      'html': docx_html(os.path.join(hw_dir, f))})

ak = os.path.join(SRC, '3 - Answers', 'Homework - Answer Key.docx')
answers, cur = {}, None
akp = [x for x in docx_paras(ak) if x]
for line in akp[2:]:
    m = re.match(r'Lesson (\d+):', line)
    if m: cur = int(m.group(1)); answers[cur] = {'title': line, 'items': []}
    elif cur: answers[cur]['items'].append(line)
answer_key = {'title': akp[0], 'intro': akp[1], 'docx': 'content/3 - Answers/Homework - Answer Key.docx',
              'pdf': 'content/3 - Answers/PDF/Homework - Answer Key.pdf', 'lessons': answers}

data = {'parts': parts, 'units': units, 'homeworks': homeworks, 'answerKey': answer_key}
os.makedirs(os.path.join(OUT, 'data'), exist_ok=True)
with open(os.path.join(OUT, 'data', 'content.js'), 'w', encoding='utf-8') as fh:
    fh.write('/* Generated by extract.py from ~/Desktop/Speakup-1 — do not edit by hand. */\nwindow.SU1 = ')
    json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    fh.write(';\n')
# copy every source file so the platform carries the whole folder
dst = os.path.join(OUT, 'content')
if os.path.exists(dst): shutil.rmtree(dst)
shutil.copytree(SRC, dst, ignore=shutil.ignore_patterns('.DS_Store'))
print('parts', len(parts), 'units', len(units), 'lessons', sum(u['type'] == 'lesson' for u in units),
      'quizzes', sum(u['type'] == 'quiz' for u in units), 'homeworks', len(homeworks), 'answers', len(answers))
