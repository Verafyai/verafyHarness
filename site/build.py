"""Build harness.verafy.ai.

    python3 site/build.py        (needs: pip install markdown)

Writes site/index.html from site/src/, and site/run.html, site/testnet.html and
site/coin-agnostic.html from the guides in docs/. Run it after any change to
those guides, and commit the output: Vercel serves site/ as static files with
no build step.
"""
import html as H
import pathlib
import re

import markdown

SITE = pathlib.Path(__file__).resolve().parent
REPO = SITE.parent
SRC = SITE / 'src'
GH = 'https://github.com/Verafyai/verafyHarness/blob/main/'
HOST = 'https://harness.verafy.ai'

MARK = ('<svg class="mark" viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">'
        '<path d="M6 20V6h14M44 6h14v14M58 44v14H44M20 58H6V44" stroke="currentColor" stroke-width="5" stroke-linecap="square" fill="none"/>'
        '<path d="M32 13v7M32 44v7M13 32h7M44 32h7" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>'
        '<circle cx="32" cy="32" r="11" fill="var(--accent)"/><circle cx="32" cy="32" r="4" fill="var(--paper)"/></svg>')

import json as _json
VERSION = _json.loads((REPO / 'docs' / 'spec' / 'requirements.json').read_text())['version']
RELEASE = '/blog/v' + VERSION.replace('.', '-')

# One menu, grouped. The logo is home.
MENU = [
    ('Verafy Harness', [
        ('/signer', 'Judiciary Signer'),
        ('/policies', 'Policies'),
        ('/launch', 'Launch a harness'),
        ('/run', 'Run a harness'),
        ('/testnet', 'Testnet'),
        ('/economics', 'Economics'),
        ('/coin-agnostic', 'Coin Agnostic'),
        ('/learn', 'Learn'),
        ('/spec', 'Specification'),
        ('/roadmap', 'Roadmap'),
        ('/pilots', 'Pilots'),
        ('/blog', 'Release notes'),
    ]),
    ('Verafy Chain', [
        ('https://chain.verafy.ai', 'Verafy Chain'),
        ('https://chain.verafy.ai/constitution', 'Constitution'),
        ('https://chain.verafy.ai/#roadmap', 'Roadmap'),
    ]),
    ('More', [
        ('https://asc.verafy.ai', 'Actually Smart Contracts'),
        ('https://github.com/Verafyai/verafyHarness', 'GitHub'),
    ]),
]
TABS = [item for _, items in MENU for item in items]

HEADER_CSS = r"""
.top{display:flex;align-items:center;gap:14px;padding-block:18px;border-bottom:1px solid var(--rule);position:relative;flex-wrap:nowrap}
.top .brand{margin-right:auto;white-space:nowrap}
.ver{font-family:var(--mono);font-size:13px;color:var(--accent);border:1px solid currentColor;padding:4px 9px;border-radius:2px;text-decoration:none;white-space:nowrap}
.ver:hover{background:var(--accent-soft)}
.menu{position:relative}
.menu>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:9px;font-family:var(--display);font-weight:600;font-size:15px;color:var(--ink);border:1px solid var(--rule);border-radius:2px;padding:7px 11px;background:var(--sheet);user-select:none}
.menu>summary::-webkit-details-marker{display:none}
.menu>summary:hover,.menu[open]>summary{border-color:var(--ink)}
.burger{display:inline-flex;flex-direction:column;gap:3.5px}.burger i{display:block;width:17px;height:2px;background:currentColor;border-radius:1px}
.menu[open] .burger i:nth-child(1){transform:translateY(5.5px) rotate(45deg)}.menu[open] .burger i:nth-child(2){opacity:0}.menu[open] .burger i:nth-child(3){transform:translateY(-5.5px) rotate(-45deg)}
.menu nav{position:absolute;right:0;top:calc(100% + 8px);z-index:50;width:min(300px,calc(100vw - 32px));background:var(--sheet);border:1px solid var(--rule);border-top:3px solid var(--accent);border-radius:3px;padding:10px 0;box-shadow:0 12px 32px rgba(15,21,27,.18)}
.menu nav .grp{font-family:var(--mono);font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute);padding:10px 18px 4px}
.menu nav a{display:block;padding:8px 18px;font-family:var(--display);font-weight:600;font-size:15.5px;color:var(--ink);text-decoration:none;border-left:3px solid transparent}
.menu nav a:hover{background:var(--paper);border-left-color:var(--rule)}
.menu nav a[aria-current="page"]{border-left-color:var(--accent);color:var(--accent)}
.menu nav hr{border:0;border-top:1px solid var(--rule);margin:8px 0}
@media (max-width:420px){.menu>summary .lab{display:none}.ver{font-size:12px;padding:3px 7px}.top{gap:10px}.top .brand{font-size:17px;gap:7px}.top .brand .mark{width:24px;height:24px}}
"""

MENU_JS = """<script>(function(){var d=document.querySelector('.menu');if(!d)return;document.addEventListener('click',function(e){if(d.open&&!d.contains(e.target))d.open=false});document.addEventListener('keydown',function(e){if(e.key==='Escape')d.open=false})})();</script>"""

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800'
         '&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">')

COINFREE = '''<section class="coinfree" aria-labelledby="coinfreeH">
  <div class="wrap">
    <h2 id="coinfreeH">Coin-free guarantee.</h2>
    <p>There is no coin, and Verafy Harness will never need one. A harness is paid in whatever token a contract offers and pays its own AI and hosting bills from that. No presale, no airdrop, no points, no treasury. <a href="/coin-agnostic">How payment works</a></p>
  </div>
</section>'''

FOOT = f'''<footer class="wrap foot">
  <p>Verafy Harness is the validator for Verafy Chain, a Verafy research concept. It is a prototype, not a running network, and there is no token.</p>
  <p>Code: <a href="https://github.com/Verafyai/verafyHarness">Verafyai/verafyHarness</a>, MIT, built on <a href="https://github.com/deepseek-ai/deepseek-harness">DeepSeek Harness</a>. The concept: <a href="https://chain.verafy.ai">chain.verafy.ai</a>.</p>
</footer>'''


PAGES = {}  # path -> (title, desc), for the sitemap and llms.txt


def jsonld(title, desc, path):
    url = HOST + path
    if path == '/':
        data = {'@context': 'https://schema.org', '@graph': [
            {'@type': 'WebSite', 'name': 'Verafy Harness', 'url': HOST + '/', 'description': desc},
            {'@type': 'SoftwareApplication', 'name': 'Verafy Harness', 'applicationCategory': 'DeveloperApplication', 'operatingSystem': 'Linux, macOS, Windows',
             'softwareVersion': VERSION, 'license': 'https://opensource.org/licenses/MIT', 'url': HOST + '/', 'codeRepository': 'https://github.com/Verafyai/verafyHarness',
             'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}, 'description': desc}]}
    else:
        crumbs = [{'@type': 'ListItem', 'position': 1, 'name': 'Verafy Harness', 'item': HOST + '/'}]
        parts = [x for x in path.strip('/').split('/') if x]
        for i, _ in enumerate(parts):
            sub = '/' + '/'.join(parts[:i + 1])
            crumbs.append({'@type': 'ListItem', 'position': i + 2, 'name': PAGES.get(sub, (parts[i].replace('-', ' ').title(),))[0] if sub != path else title, 'item': HOST + sub})
        kind = 'BlogPosting' if path.startswith('/blog/') else 'TechArticle'
        data = {'@context': 'https://schema.org', '@graph': [
            {'@type': kind, 'headline': title, 'description': desc, 'url': url, 'inLanguage': 'en', 'isPartOf': {'@type': 'WebSite', 'name': 'Verafy Harness', 'url': HOST + '/'},
             'author': {'@type': 'Organization', 'name': 'Verafy', 'url': 'https://verafy.ai'}, 'publisher': {'@type': 'Organization', 'name': 'Verafy', 'url': 'https://verafy.ai'},
             **({'datePublished': '2026-11-06'} if kind == 'BlogPosting' else {})},
            {'@type': 'BreadcrumbList', 'itemListElement': crumbs}]}
    return '<script type="application/ld+json">' + _json.dumps(data, separators=(',', ':')).replace('</', '<\\/') + '</script>'


def head(title, desc, path, css):
    url = HOST + path
    PAGES[path] = (title, desc)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{H.escape(title)}</title>
<meta name="description" content="{H.escape(desc)}">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Verafy Harness">
<meta property="og:title" content="{H.escape(title)}">
<meta property="og:description" content="{H.escape(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{HOST}/banner.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{HOST}/banner.png">
<meta name="twitter:title" content="{H.escape(title)}">
<meta name="twitter:description" content="{H.escape(desc)}">
<link rel="alternate" type="text/plain" title="llms.txt" href="/llms.txt">
<link rel="alternate" type="application/rss+xml" title="Verafy Harness release notes" href="/blog/feed.xml">
{jsonld(title, desc, path)}
{FONTS}
<style>
{css}
{HEADER_CSS}
</style>
</head>
<body>
'''


def header(current):
    groups = []
    for i, (name, items) in enumerate(MENU):
        links = ''.join(f'<a href="{h}"{" aria-current=\"page\"" if l == current else ""}>{l}</a>' for h, l in items)
        groups.append(('<hr>' if i else '') + f'<div class="grp">{name}</div>{links}')
    return (f'''<header class="wrap top">
  <a class="brand" href="/">{MARK}Verafy Harness</a>
  <a class="ver" href="{RELEASE}" title="Release notes for v{VERSION}">v{VERSION}</a>
  <details class="menu">
    <summary aria-label="Menu"><span class="burger" aria-hidden="true"><i></i><i></i><i></i></span><span class="lab">Menu</span></summary>
    <nav aria-label="Site">{''.join(groups)}</nav>
  </details>
</header>
{MENU_JS}
''')


def check(name, text):
    low = text.lower()
    # The names from before the rename, with or without a space. Planned commands
    # are written `verafy harness ...`; nothing should still say the old names.
    old = re.search(r'swarm\s?(chain|harness|testnet)', low)
    assert not old, f'{name}: still says "{old.group(0) if old else ""}"'
    assert '\u2014' not in text and '\u2013' not in text, f'{name}: em or en dash'


LANDING_EXTRA = '''
.hero-lead{font-size:20px;max-width:38em}
.cta{display:flex;flex-wrap:wrap;gap:10px}
.cta .btn{text-decoration:none;display:inline-block}
.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin-top:12px;max-width:1040px}
@media (max-width:760px){.facts{grid-template-columns:minmax(0,1fr)}}
.fact{border-top:2px solid var(--ink);padding-top:12px;display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.fact .big{font-family:var(--display);font-weight:800;font-stretch:80%;font-size:40px;line-height:1;color:var(--accent)}
.fact p{font-size:16.5px;color:var(--mute)}
pre{background:var(--sheet);border:1px solid var(--rule);border-radius:3px;padding:14px 16px;overflow-x:auto;font-size:14px;line-height:1.55;margin:0}
code{font-family:var(--mono);font-size:.88em}
pre code{font-size:inherit}
td code{background:var(--paper);padding:1px 5px;border-radius:2px}
a.card.go{text-decoration:none;color:var(--ink)}
a.card.go:hover{border-color:var(--accent)}
a.card.go h3{color:var(--accent)}
.col .tag{align-self:flex-start}
'''


def landing():
    css = (SRC / 'landing.css').read_text() + LANDING_EXTRA
    body = (SRC / 'landing.html').read_text().replace('@@FIGURE@@', (SRC / 'harness-figure.html').read_text().rstrip())
    out = (head('Verafy Harness', 'An AI validator anyone can run: one model in a harness that rules on contracts written in words, holds its own keys and pays its own bills. No token.', '/', css)
           + COINFREE + '\n' + header('Verafy Harness') + '\n<main class="wrap">\n' + body + '</main>\n\n' + FOOT + '\n</body>\n</html>\n')
    check('index.html', out)
    (SITE / 'index.html').write_text(out)


DOC_CSS = r'''
:root{--paper:#EDF0F3;--sheet:#FFFFFF;--ink:#16212C;--mute:#566473;--rule:#CDD5DD;--accent:#3640C9;--accent-soft:#DADDF7;--allow:#1C7A4E;--hold:#A0561A;--code:#F4F6F8;
--display:"Archivo","Helvetica Neue",Arial,sans-serif;--body:"Source Serif 4",Georgia,serif;--mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--paper:#0F151B;--sheet:#161E26;--ink:#E4EAF0;--mute:#93A1AF;--rule:#2A3541;--accent:#8A92FF;--accent-soft:#252A55;--allow:#5CC995;--hold:#E0A060;--code:#1B242E;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#0F151B;--sheet:#161E26;--ink:#E4EAF0;--mute:#93A1AF;--rule:#2A3541;--accent:#8A92FF;--accent-soft:#252A55;--allow:#5CC995;--hold:#E0A060;--code:#1B242E;color-scheme:dark}
*{box-sizing:border-box}body{background:var(--paper);color:var(--ink);font-family:var(--body);font-size:17.5px;line-height:1.6;margin:0}
a{color:var(--accent);text-underline-offset:3px}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
img{max-width:100%;height:auto}
.wrap{max-width:1240px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.coinfree{background:var(--sheet);border-top:3px solid var(--accent);border-bottom:1px solid var(--rule)}
.coinfree .wrap{padding-block:18px 20px;display:flex;flex-direction:column;gap:6px}
.coinfree h2{font-family:var(--display);font-weight:750;font-size:clamp(22px,2.4vw,28px);margin:0}
.coinfree p{max-width:46em;margin:0;overflow-wrap:break-word}
.top{display:flex;align-items:center;gap:16px;padding-block:20px;border-bottom:1px solid var(--rule);flex-wrap:wrap}
.brand{font-family:var(--display);font-weight:800;font-size:20px;font-stretch:110%;color:var(--ink);text-decoration:none;display:inline-flex;align-items:center;gap:10px}
.brand .mark{color:var(--ink);flex:none}
.tabs{display:flex;flex-wrap:wrap;gap:4px;margin-right:auto;margin-left:12px}
.tabs a{font-family:var(--display);font-weight:600;font-size:15px;color:var(--mute);text-decoration:none;padding:6px 10px;border-radius:2px;border:1px solid transparent}
.tabs a:hover{color:var(--ink);border-color:var(--rule)}.tabs a[aria-current="page"]{color:var(--ink);border-color:var(--ink)}
.status{font-family:var(--mono);font-size:12.5px;color:var(--hold);border:1px solid currentColor;padding:4px 10px;border-radius:2px}
.tabs{order:3;width:100%;margin:0 0 0 -10px}
.top .status{margin-left:auto}
@media (max-width:560px){.top .status{margin-left:0}}
.layout{display:grid;grid-template-columns:250px minmax(0,1fr);gap:48px;padding-block:40px 80px}
@media (max-width:900px){.layout{grid-template-columns:minmax(0,1fr)}.side{position:static!important;max-height:none!important}}
.side{position:sticky;top:16px;align-self:start;max-height:calc(100vh - 32px);overflow:auto;font-size:15px}
.side .lbl{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);display:block;margin-bottom:8px}
.side ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.side ul ul{padding-left:14px;margin:2px 0 6px}
.side a{color:var(--mute);text-decoration:none;display:block;padding:3px 8px;border-left:2px solid transparent}
.side a:hover{color:var(--ink)}.side a.on{color:var(--ink);border-left-color:var(--accent)}
article{min-width:0;max-width:52rem}
article h1{font-family:var(--display);font-weight:800;font-size:clamp(34px,4.6vw,52px);line-height:1.05;letter-spacing:-.015em;margin:0 0 18px}
article h2{font-family:var(--display);font-weight:750;font-size:28px;line-height:1.15;margin:48px 0 14px;padding-top:18px;border-top:1px solid var(--rule)}
article h3{font-family:var(--display);font-weight:700;font-size:20px;margin:28px 0 10px}
article p,article li{max-width:44em}
article img{display:block;border:1px solid var(--rule);border-radius:3px;background:#fff}
article blockquote{margin:18px 0;padding:14px 18px;background:var(--sheet);border:1px solid var(--hold);border-radius:2px;color:var(--ink)}
article blockquote p{margin:0}
code{font-family:var(--mono);font-size:.86em;background:var(--code);padding:1px 5px;border-radius:2px}
pre{background:var(--code);border:1px solid var(--rule);border-radius:3px;padding:14px 16px;overflow-x:auto;font-size:14px;line-height:1.5}
pre code{background:none;padding:0;font-size:inherit}
.tbl{overflow-x:auto;border:1px solid var(--rule);border-radius:3px;background:var(--sheet);margin:16px 0}
table{border-collapse:collapse;width:100%;min-width:560px;font-size:15.5px}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--rule);vertical-align:top}
th{font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);font-weight:400}
tr:last-child td{border-bottom:0}
.foot{padding-block:24px 48px;border-top:1px solid var(--rule);font-size:15px;color:var(--mute);display:flex;flex-direction:column;gap:6px}
.foot p{margin:0}
'''

TOC_JS = '''<script>(function(){var links=[].slice.call(document.querySelectorAll('.side a[href^="#"]'));var hs=links.map(function(a){return document.getElementById(decodeURIComponent(a.hash.slice(1)))}).filter(Boolean);function on(){var y=window.scrollY+120,cur=null;hs.forEach(function(h){if(h.offsetTop<=y)cur=h.id});links.forEach(function(a){a.classList.toggle('on',decodeURIComponent(a.hash.slice(1))===cur)})}window.addEventListener('scroll',on,{passive:true});on()})();</script>'''


def fix_links(md):
    md = md.replace('](testnet.md', '](/testnet').replace('](coin-agnostic.md', '](/coin-agnostic').replace('](run-a-harness.md', '](/run')
    md = md.replace('](judiciary-signer.md', '](/signer').replace('](policies.md', '](/policies').replace('](roadmap.md', '](/roadmap').replace('](pilots.md', '](/pilots')
    md = md.replace('](assets/', '](/assets/')
    md = re.sub(r'\]\(\.\./([^)#]+)', lambda m: f']({GH}{m.group(1)}', md)
    md = re.sub(r'\]\(((?:dsh|simds|blog)[^)]*)', lambda m: f']({GH}docs/{m.group(1)}', md)
    return md


def doc(src, out, path, tab, desc):
    text = fix_links((REPO / 'docs' / src).read_text())
    title = re.search(r'^# (.+)$', text, re.M).group(1).strip()
    m = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc'], extension_configs={'toc': {'toc_depth': '2-3'}})
    body = m.convert(text)
    body = body.replace('<table>', '<div class="tbl"><table>').replace('</table>', '</table></div>')
    page = (head(title, desc, path, DOC_CSS) + COINFREE + '\n' + header(tab)
            + f'<div class="wrap layout"><aside class="side" aria-label="On this page"><span class="lbl">On this page</span>{m.toc}</aside><article>{body}</article></div>\n'
            + FOOT + '\n' + TOC_JS + '\n</body>\n</html>\n')
    check(out, page)
    (SITE / out).write_text(page)


ECON_CSS = r"""
article.wide{max-width:none}
.lede{font-size:19px;max-width:44em}
.note{font-size:15px;color:var(--mute);max-width:52em}
.facts3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:18px 0 10px}
@media (max-width:760px){.facts3{grid-template-columns:minmax(0,1fr)}}
.fact{border-top:2px solid var(--ink);padding-top:10px}
.fact .big{font-family:var(--display);font-weight:800;font-stretch:80%;font-size:40px;line-height:1;color:var(--accent);display:block}
.fact p{font-size:15.5px;color:var(--mute);margin:8px 0 0}
.presets{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px}
.presets button{font-family:var(--display);font-weight:600;font-size:14.5px;padding:8px 12px;border:1px solid var(--ink);background:var(--sheet);color:var(--ink);border-radius:2px;cursor:pointer}
.presets button:hover{border-color:var(--accent);color:var(--accent)}
#share{border-style:dashed}
.calc{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:28px;margin-top:14px;align-items:start}
@media (max-width:1100px){.calc{grid-template-columns:minmax(0,1fr)}}
.inputs fieldset{border:1px solid var(--rule);border-radius:3px;background:var(--sheet);margin:0 0 14px;padding:10px 14px 12px}
.inputs legend{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:0 6px}
.in{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--rule);font-size:15px}
.in:last-child{border-bottom:0}
.in .nm{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.in input[type=number]{width:120px;font-family:var(--mono);font-size:14px;padding:5px 8px;border:1px solid var(--rule);border-radius:2px;background:var(--paper);color:var(--ink)}
.in input[type=checkbox]{width:20px;height:20px;justify-self:end;accent-color:var(--accent)}
.tag{font-family:var(--mono);font-size:10.5px;padding:1px 6px;border:1px solid var(--rule);border-radius:2px;color:var(--mute);white-space:nowrap}
.tag.vr{color:var(--hold);border-color:currentColor}.tag.m{color:var(--allow);border-color:currentColor}.tag.mo{color:var(--accent);border-color:currentColor}
.outputs{background:var(--sheet);border:1px solid var(--rule);border-top:3px solid var(--accent);border-radius:3px;padding:14px 18px 18px;position:sticky;top:12px}
@media (max-width:1100px){.outputs{position:static}}
.ohead{display:flex;justify-content:space-between;align-items:baseline;margin:6px 0 4px}
.ohead .lbl{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.pill{font-family:var(--mono);font-size:12px;color:var(--accent);border:1px solid currentColor;padding:2px 8px;border-radius:2px}
.kv{display:grid;grid-template-columns:minmax(9em,1fr) minmax(0,1.4fr);gap:7px 14px;margin:6px 0 14px;font-size:15px}
.kv dt{color:var(--mute)}.kv dd{margin:0;font-family:var(--mono);font-size:14.5px;text-align:right;font-variant-numeric:tabular-nums}
.bar{display:flex;height:16px;border:1px solid var(--rule);border-radius:2px;overflow:hidden;margin:4px 0 8px}
.bar span{display:block;height:100%}
.legend{list-style:none;padding:0;margin:0 0 12px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13.5px;color:var(--mute)}
.legend i{display:inline-block;width:10px;height:10px;margin-right:6px;border-radius:1px}
.warn{color:var(--hold);border:1px solid currentColor;padding:8px 10px;border-radius:2px;font-size:14.5px}
.steps{display:flex;flex-direction:column;gap:10px}
.callout{background:var(--sheet);border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:2px;padding:12px 16px;margin:16px 0;max-width:52em}
td.v{font-family:var(--mono);font-size:14px;white-space:nowrap;font-variant-numeric:tabular-nums}
td.k{color:var(--mute)}
td.neg{color:var(--deny,#B3263A)}td.pos{color:var(--allow)}
.chart{background:var(--sheet);border:1px solid var(--rule);border-radius:3px;padding:8px;overflow-x:auto}
.chart svg{display:block;width:100%;min-width:560px;height:auto}
.figure{background:var(--sheet);border:1px solid var(--rule);border-radius:3px;overflow-x:auto;margin:16px 0}
.figure svg{display:block;width:100%;min-width:640px;height:auto}
article section{scroll-margin-top:16px}
"""

ECON_MENU = [('overview', 'The short version'), ('problem', 'Why proofs need packing'), ('calculator', 'Calculator'), ('packing', 'Proof packing'),
             ('versus', 'Unpacked and packed'), ('screens', 'Fast screens (Jev)'), ('cascade', 'Difficulty sorting'), ('reasoning', 'Reasoning and storage'),
             ('solana', 'Settling on Solana'), ('machine', 'The proving machine'), ('earnings', 'Who earns what'), ('sources', 'Assumptions and sources')]


def economics():
    lib = (REPO / 'packages' / 'economics' / 'src' / 'index.js').read_text()
    lib = re.sub(r'^export ', '', lib, flags=re.M)
    js = lib + ';\n' + (SRC / 'economics.js').read_text()
    menu = '<ul>' + ''.join(f'<li><a href="#{a}">{t}</a></li>' for a, t in ECON_MENU) + '</ul>'
    body = (SRC / 'economics.html').read_text()
    page = (head('Economics and proof packing', 'What it costs to prove AI rulings, how proof packing cuts it, and what proving operators and verifiers earn. Modeled, with every source named.', '/economics', DOC_CSS + ECON_CSS)
            + COINFREE + '\n' + header('Economics')
            + f'<div class="wrap layout"><aside class="side" aria-label="On this page"><span class="lbl">Economics</span>{menu}</aside><article class="wide">{body}</article></div>\n'
            + FOOT + '\n' + TOC_JS.replace("hs.forEach(function(h){if(h.offsetTop<=y)cur=h.id})", "hs.forEach(function(h){if(h.offsetTop<=y)cur=h.id})") + f'\n<script>\n{js}\n</script>\n</body>\n</html>\n')
    check('economics.html', page)
    (SITE / 'economics.html').write_text(page)


import subprocess as _sp
import os as _os


def score_data():
    chain = _os.environ.get('VERAFY_CHAIN_DIR', '')
    args = ['node', str(REPO / 'scripts' / 'score.mjs'), '--json'] + ([f'--chain={chain}'] if chain else [])
    return _json.loads(_sp.run(args, capture_output=True, text=True, check=True).stdout)


def score_svg(sc):
    rows = list(sc['areas'].items())
    W, row, L = 760, 30, 250
    h = 20 + row * len(rows) + 10
    out = [f'<figure class="chart"><svg viewBox="0 0 {W} {h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Scorecard by area, v{sc["version"]}: overall {round(sc["overall"]*100)} percent" font-family="JetBrains Mono, ui-monospace, monospace" font-size="13">']
    for i, (k, a) in enumerate(rows):
        y = 20 + i * row
        w = (W - L - 70) * a['score']
        out.append(f'<text x="0" y="{y+15}" fill="var(--ink)">{k}</text><text x="70" y="{y+15}" fill="var(--mute)" font-size="11.5">{H.escape(a["name"][:26])}</text>')
        out.append(f'<rect x="{L}" y="{y+3}" width="{W-L-70}" height="16" fill="var(--paper)" stroke="var(--rule)"/>')
        out.append(f'<rect x="{L}" y="{y+3}" width="{w:.1f}" height="16" fill="var(--accent)"/>')
        out.append(f'<text x="{W-60}" y="{y+16}" fill="var(--ink)">{round(a["score"]*100)}%</text>')
    out.append(f'</svg><figcaption>Scored by <code>npm run score</code> at v{sc["version"]}: {round(sc["overall"]*100)}% overall, weighted. Built means tested with mocks or scripted models; verified means run live or on a devnet.</figcaption></figure>')
    return ''.join(out)


ARCH_V1 = dict(ethics=('GOV, planned', False), prover=('PROVE, designed', False), verifiers=('sampled, designed', False), solana=('SOL, via SIMDs', False), bsvc=('deposits, designed', False))
ARCH_V2 = dict(ethics=('GOV, built', True), prover=('PROVE, mock prover', True), verifiers=('every proof, built', True), solana=('SOL, local validator', True), bsvc=('deposits, built', True))


def arch_svg(L=ARCH_V2):
    B = lambda x, y, w, t, sub, solid=True: (f'<rect x="{x}" y="{y}" width="{w}" height="58" rx="3" fill="{"var(--accent-soft)" if solid else "var(--sheet)"}" stroke="var(--accent)" stroke-width="1.6" {"" if solid else "stroke-dasharray=\"5 4\""}/>'
        f'<text x="{x+12}" y="{y+24}" fill="var(--ink)" font-weight="600">{t}</text><text x="{x+12}" y="{y+44}" fill="var(--mute)" font-size="11.5">{sub}</text>')
    A = lambda x1, y1, x2, y2: f'<path d="M{x1} {y1} L{x2} {y2}" stroke="var(--mute)" stroke-width="1.5" marker-end="url(#ah)"/>'
    g = ['<figure class="chart"><svg viewBox="0 0 900 430" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture: contract, ethics gate, atomizer, router, settled or proven lane, packer, prover, verifiers, jury, TinySVM, record on Verafy Chain or Solana, banker and light client. Solid boxes are built; dashed are designed or planned." font-family="JetBrains Mono, ui-monospace, monospace" font-size="13">',
         '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--mute)"/></marker></defs>']
    g += [B(10, 20, 150, 'Contract', 'verafy.asc/1'), B(190, 20, 150, 'Ethics gate', *L['ethics']), B(370, 20, 150, 'Atomizer', 'PACK, built'), B(550, 20, 150, 'Router', 'ROUTE, built'), B(730, 20, 160, 'Settled', 'screen or panel')]
    g += [A(160, 49, 188, 49), A(340, 49, 368, 49), A(520, 49, 548, 49), A(700, 49, 728, 49)]
    g += [B(550, 120, 150, 'Packer', 'PACK, built'), B(370, 120, 150, 'Prover', *L['prover']), B(190, 120, 150, 'Verifiers', *L['verifiers'])]
    g += [A(625, 78, 625, 118), A(550, 149, 522, 149), A(370, 149, 342, 149)]
    g += ['<text x="632" y="104" fill="var(--mute)" font-size="11.5">L2 only</text>']
    g += [B(10, 220, 200, 'Jury', 'commit, reveal, bar'), B(240, 220, 200, 'TinySVM', 'SETTLE, built'), B(470, 220, 200, 'Verafy Chain', 'CHAIN, built'), B(700, 220, 190, 'Solana', *L['solana'])]
    g += [A(210, 249, 238, 249), A(440, 249, 468, 249), A(670, 249, 698, 249), A(265, 178, 110, 218), A(810, 78, 110, 218)]
    g += [B(10, 320, 200, 'Banker', 'BANK, core built'), B(240, 320, 200, 'Keyblock, wallet', 'BANK, built'), B(470, 320, 200, 'Light client', 'LIGHT, built'), B(700, 320, 190, 'BankerService', *L['bsvc'])]
    g += ['<text x="10" y="415" fill="var(--mute)" font-size="12">Solid: built and tested. Dashed: designed or planned. The record goes to Verafy Chain today, or to Solana accounts if the SIMDs are implemented.</text>']
    g.append('</svg></figure>')
    return ''.join(g)


SPEC_CSS = r"""
.learnnav .grp-l{display:block;font-family:var(--mono);font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:12px 0 4px 8px}
.learnnav>li:first-child .grp-l{margin-top:0}
.learnnav ul{padding-left:0!important}
@media (max-width:900px){.side:has(.learnnav){display:none}}
.crumb{font-family:var(--mono);font-size:13px;margin:0 0 10px}
figure.chart{margin:20px 0;background:var(--sheet);border:1px solid var(--rule);border-radius:3px;padding:14px;overflow-x:auto}
figure.chart svg{display:block;width:100%;min-width:620px;height:auto}
figure.chart figcaption{font-size:14px;color:var(--mute);margin-top:8px}
img.anim{display:block;width:100%;height:auto;border:1px solid var(--rule);border-radius:3px;margin:18px 0}
.postmeta{font-family:var(--mono);font-size:13px;color:var(--mute)}
.posts{list-style:none;padding:0;margin:20px 0;display:flex;flex-direction:column;gap:16px}
.posts li{background:var(--sheet);border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:3px;padding:16px 18px}
.posts a{font-family:var(--display);font-weight:750;font-size:22px;text-decoration:none}
.posts p{margin:6px 0 0;color:var(--mute)}
"""


def md_page(md_text, out, path, title, desc, current, side='On this page', fixes=()):
    for a, b in fixes:
        md_text = md_text.replace(a, b)
    m = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc'], extension_configs={'toc': {'toc_depth': '2-3'}})
    body = m.convert(md_text)
    body = body.replace('<table>', '<div class="tbl"><table>').replace('</table>', '</table></div>')
    return body, m.toc


def write_page(out, path, title, desc, current, body, toc, side='On this page'):
    page = (head(title, desc, path, DOC_CSS + SPEC_CSS) + COINFREE + '\n' + header(current)
            + f'<div class="wrap layout"><aside class="side" aria-label="{side}"><span class="lbl">{side}</span>{toc}</aside><article>{body}</article></div>\n'
            + FOOT + '\n' + TOC_JS + '\n</body>\n</html>\n')
    check(out, page)
    p = SITE / out
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page)


def spec_page(sc):
    spec = (REPO / 'docs' / 'spec' / 'VERAFY-SPEC.md').read_text()
    card = (REPO / 'docs' / 'spec' / 'SCORECARD.md').read_text().split('\n', 1)[1]
    gh = 'https://github.com/Verafyai/verafyHarness/blob/main/docs/spec/'
    md = spec.replace('<!-- score -->', '<!-- score -->\n\n@@SCORE@@\n', 1) + '\n\n## Scorecard\n' + card.replace('# ', '### ', 0)
    fixes = [('](requirements.json)', f']({gh}requirements.json)'), ('](SCORECARD.md)', '](#scorecard)'), ('](CHANGELOG.md)', f']({gh}CHANGELOG.md)'), ('](banker.md)', f']({gh}banker.md)'), ('](VERAFY-SPEC.md)', '](/spec)')]
    body, toc = md_page(md, 'spec.html', '/spec', '', '', '', fixes=fixes)
    body = body.replace('<p>@@SCORE@@</p>', score_svg(sc))
    write_page('spec.html', '/spec', f'Verafy specification v{VERSION}', f'The Verafy Harness and Verafy Chain specification, v{VERSION}: every requirement with a stable ID and a status, checked against the code by a scoring pass.', 'Specification', body, toc)


POSTS = [('v0-0-4-alpha', 'v0.0.4-alpha', '2026-11-07', 'Verafy Harness v0.0.4-alpha: the Judiciary Signer', 'A Squads multisig member that votes only as a jury rules, policies and Covenant Launch, model certification, a harness registry that finds and pays harnesses on Solana, and hardware attestation started.'),
         ('v0-0-3-alpha', 'v0.0.3-alpha', '2026-11-07', 'Verafy Harness v0.0.3-alpha: stake, slashing and open-weight models', 'Bonds that are slashed for misbehavior, a jury scheduler seeded by a randomness beacon, operator caps, payouts held through a challenge window, challenge bonds, and juries of open-weight models counted by family.'),
         ('v0-0-2-alpha', 'v0.0.2-alpha', '2026-11-06', 'Verafy Harness v0.0.2-alpha: run it anywhere', 'The harness daemon, verafy up for every cloud, a testnet on one machine, a Solana ruling program, proof packing end to end, a calibration set, the Banker as a service, and a Learn section.'),
         ('v0-0-1-alpha', 'v0.0.1-alpha', '2026-11-06', 'Verafy Harness v0.0.1-alpha: the first spec, scored', 'The first versioned spec, a scoring pass that checks it against the code, multi-model routing with calibration and audits, proof packing routed, and the economics rewritten.')]


def blog(sc):
    items = ''.join(f'<li><a href="/blog/{slug}">{H.escape(t)}</a><div class="postmeta">{ver}, {date}</div><p>{H.escape(d)}</p></li>' for slug, ver, date, t, d in POSTS)
    body = f'<h1 id="release-notes">Release notes</h1><p>What changed in each version of Verafy Harness and its spec. The current version is <a href="{RELEASE}">v{VERSION}</a>.</p><ul class="posts">{items}</ul>'
    write_page('blog.html', '/blog', 'Release notes', 'Release notes for Verafy Harness and the Verafy spec.', 'Release notes', body, '<ul><li><a href="#release-notes">Release notes</a></li></ul>', side='Blog')
    for slug, ver, date, t, d in POSTS:
        snap = SRC / 'blog' / f'{slug}.score.json'
        if ver == 'v' + VERSION:
            snap.write_text(_json.dumps({'version': sc['version'], 'overall': sc['overall'], 'areas': sc['areas'], 'rows': [{'id': r['id']} for r in sc['rows']], 'gaps': [{k: g.get(k) for k in ('id', 'status', 'title', 'rex')} for g in sc['gaps'][:10]]}, indent=1))
        psc = _json.loads(snap.read_text()) if snap.exists() else sc
        top = psc['gaps'][:10]
        area_rows = '\n'.join(f"| {k}: {a['name']} | {a['count']} | {round(a['score']*100)}% |" for k, a in psc['areas'].items())
        md = (SRC / 'blog' / f'{slug}.md').read_text()
        md = (md.replace('@@OVERALL@@', f"{round(psc['overall']*100)}%").replace('@@COUNT@@', str(len(psc['rows'])))
                .replace('@@AREA_TABLE@@', '| Area | Requirements | Score |\n|---|---|---|\n' + area_rows)
                .replace('@@GAPS@@', '\n'.join(f"{i+1}. **{g['id']}** ({g['status']}{', needs Rex' if g.get('rex') else ''}): {g['title']}." for i, g in enumerate(top))))
        body, toc = md_page(md, f'blog/{slug}.html', f'/blog/{slug}', t, d, 'Release notes')
        body = body.replace('<p>@@SCORE_SVG@@</p>', score_svg(psc)).replace('<p>@@ARCH_SVG@@</p>', arch_svg(ARCH_V1 if ver == 'v0.0.1-alpha' else ARCH_V2))
        write_page(f'blog/{slug}.html', f'/blog/{slug}', t, d, 'Release notes', body, toc)



LAUNCH_CSS = r"""
.lede{font-size:19px;max-width:44em}
.note{font-size:15px;color:var(--mute);max-width:52em}
.launch{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.3fr);gap:24px;align-items:start;margin-top:12px}
@media (max-width:1000px){.launch{grid-template-columns:minmax(0,1fr)}}
.inputs fieldset{border:1px solid var(--rule);border-radius:3px;background:var(--sheet);margin:0 0 14px;padding:10px 14px 14px}
.inputs legend{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);padding:0 6px}
.opts{display:flex;flex-direction:column;gap:6px}
.opts label{display:flex;gap:8px;align-items:center;font-size:16px}
.opts input{accent-color:var(--accent);width:18px;height:18px}
.row{display:block;font-size:14.5px;color:var(--mute);margin:10px 0 4px}
.inputs select,.inputs input:not([type=radio]){width:100%;font:inherit;font-size:15px;padding:8px 10px;border:1px solid var(--rule);border-radius:2px;background:var(--paper);color:var(--ink)}
.outputs{background:var(--sheet);border:1px solid var(--rule);border-top:3px solid var(--accent);border-radius:3px;padding:12px 18px 18px;min-width:0}
.ohead{display:flex;justify-content:space-between;align-items:baseline}
.ohead .lbl{font-family:var(--mono);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
.pill{font-family:var(--mono);font-size:12px;color:var(--accent);border:1px solid currentColor;padding:2px 8px;border-radius:2px}
.outputs h3{font-size:17px;margin:18px 0 6px}
.codebox{position:relative}
.codebox pre{margin:0;max-height:420px;overflow:auto;padding-right:70px}
.copy{position:absolute;top:8px;right:8px;font-family:var(--display);font-weight:600;font-size:13px;padding:5px 10px;border:1px solid var(--rule);border-radius:2px;background:var(--sheet);color:var(--ink);cursor:pointer}
.copy:hover{border-color:var(--accent);color:var(--accent)}
.warn{color:var(--hold);border:1px solid currentColor;padding:8px 10px;border-radius:2px;font-size:14.5px}
.btns{display:flex;flex-wrap:wrap;gap:10px}
.btn{display:inline-block;font-family:var(--display);font-weight:650;font-size:15px;padding:10px 14px;border-radius:2px;background:var(--ink);color:var(--paper);text-decoration:none}
.btn:hover{background:var(--accent);color:#fff}
td.v{font-family:var(--mono);font-size:14px;white-space:nowrap}
article section{scroll-margin-top:16px}
"""


def launch():
    profiles = (REPO / 'packages' / 'deploy' / 'src' / 'profiles.js').read_text()
    cinit = (REPO / 'packages' / 'deploy' / 'src' / 'cloudinit.js').read_text()
    lib = re.sub(r'^export ', '', profiles + ';\n' + cinit, flags=re.M)
    js = lib + ';\n' + (SRC / 'launch.js').read_text()
    body = (SRC / 'launch.html').read_text()
    toc = '<ul>' + ''.join(f'<li><a href="#{a}">{t}</a></li>' for a, t in [('quick', 'The quick way'), ('try', 'A testnet for free'), ('configure', 'Configure one'), ('hardware', 'Models by machine'), ('hosted', 'Hosted harnesses'), ('safety', 'Keys and safety')]) + '</ul>'
    page = (head('Launch a harness', 'Launch a Verafy Harness on your machine, in Docker, on DigitalOcean or Hetzner, or on any cloud. Pick a model; get the command, the first-boot script or a one-click button.', '/launch', DOC_CSS + LAUNCH_CSS)
            + COINFREE + '\n' + header('Launch a harness')
            + f'<div class="wrap layout"><aside class="side" aria-label="On this page"><span class="lbl">Launch</span>{toc}</aside><article class="wide">{body}</article></div>\n'
            + FOOT + '\n' + TOC_JS + f'\n<script>\n{js}\n</script>\n</body>\n</html>\n')
    check('launch.html', page)
    (SITE / 'launch.html').write_text(page)


def learn():
    meta = _json.loads((SRC / 'learn' / 'index.json').read_text())
    groups = {}
    for slug, m in meta.items():
        groups.setdefault(m['group'], []).append(slug)
    side = ''.join(f'<li><span class="grp-l">{g}</span><ul>' + ''.join(f'<li><a href="/learn/{s}">{H.escape(meta[s]["title"])}</a></li>' for s in groups[g]) + '</ul></li>' for g in ['Basics', 'Wallets', 'Stake', 'Settlement', 'Proofs', 'Routing', 'Money', 'Governance', 'Running one'] if g in groups)
    side = f'<ul class="learnnav">{side}</ul>'
    body, _ = md_page((SRC / 'learn' / 'index.md').read_text(), 'learn.html', '/learn', '', '', '')
    write_page('learn.html', '/learn', 'Learn Verafy Harness', 'Every concept in Verafy Harness and Verafy Chain in plain words: Actually Smart Contracts, juries, proof packing, routing, the Banker, Solana settlement and more.', 'Learn', body, side, side='Learn')
    for slug, m in meta.items():
        body, _ = md_page((SRC / 'learn' / f'{slug}.md').read_text(), f'learn/{slug}.html', f'/learn/{slug}', '', '', '')
        body = f'<p class="crumb"><a href="/learn">Learn</a> / {H.escape(m["group"])}</p>' + body
        cur = side.replace(f'<a href="/learn/{slug}">', f'<a href="/learn/{slug}" class="on" aria-current="page">')
        write_page(f'learn/{slug}.html', f'/learn/{slug}', f'{m["title"]}: Verafy Harness', m['desc'], 'Learn', body, cur, side='Learn')


def machine_readable():
    """llms.txt, llms-full.txt, sitemap.xml, robots.txt and the release-notes feed."""
    meta = _json.loads((SRC / 'learn' / 'index.json').read_text())
    sections = [
        ('Start here', [('/', 'Verafy Harness'), ('/signer', None), ('/policies', None), ('/launch', None), ('/run', None), ('/testnet', None), ('/roadmap', None), ('/pilots', None)]),
        ('Learn', [('/learn', None)] + [(f'/learn/{s}', None) for s in meta]),
        ('Reference', [('/spec', None), ('/economics', None), ('/coin-agnostic', None)]),
        ('Release notes', [('/blog', None)] + [(f'/blog/{slug}', None) for slug, *_ in POSTS]),
    ]
    L = ['# Verafy Harness', '', f'> An AI validator anyone can run: one model in a harness that rules on contracts written in words (Actually Smart Contracts), with juries across open-weight model families, commit and reveal, bonds that are slashed for misbehavior, exact settlement, and no token. Version {VERSION}. A prototype, not a running network.', '',
         'Every number on this site is labeled measured, vendor-reported, modeled or illustrative. Code: https://github.com/Verafyai/verafyHarness (MIT). The concept chain: https://chain.verafy.ai.', '']
    for name, items in sections:
        L.append(f'## {name}')
        L.append('')
        for path, label in items:
            title, desc = PAGES.get(path, (label or path, ''))
            title = title.removesuffix(': Verafy Harness')
            L.append(f'- [{title}]({HOST}{path}): {desc}')
        L.append('')
    L += ['## Optional', '', f'- [Full text of the Learn pages and the spec]({HOST}/llms-full.txt)', '- [requirements.json](https://github.com/Verafyai/verafyHarness/blob/main/docs/spec/requirements.json): every requirement with its status, machine-readable', '']
    (SITE / 'llms.txt').write_text('\n'.join(L))
    full = [f'# Verafy Harness, full text (v{VERSION})', '', 'The Learn pages, then the specification. Generated from the site sources.', '']
    for s in meta:
        full.append(re.sub(r'\]\(/', f']({HOST}/', (SRC / 'learn' / f'{s}.md').read_text()))
        full.append(f'Source: {HOST}/learn/{s}\n')
    full.append((REPO / 'docs' / 'spec' / 'VERAFY-SPEC.md').read_text())
    (SITE / 'llms-full.txt').write_text('\n'.join(full))
    urls = sorted(PAGES)
    (SITE / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{HOST}{u}</loc><lastmod>2026-11-06</lastmod></url>\n' for u in urls) + '</urlset>\n')
    (SITE / 'robots.txt').write_text(f'User-agent: *\nAllow: /\n\nSitemap: {HOST}/sitemap.xml\n')
    items = ''.join(f'<item><title>{H.escape(t)}</title><link>{HOST}/blog/{slug}</link><guid>{HOST}/blog/{slug}</guid><pubDate>Fri, 06 Nov 2026 12:00:00 -0800</pubDate><description>{H.escape(d)}</description></item>' for slug, ver, date, t, d in POSTS)
    (SITE / 'blog').mkdir(exist_ok=True)
    (SITE / 'blog' / 'feed.xml').write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Verafy Harness release notes</title><link>{HOST}/blog</link><description>What changed in each version of Verafy Harness and its spec.</description>{items}</channel></rss>\n')


if __name__ == '__main__':
    landing()
    economics()
    _sc = score_data()
    spec_page(_sc)
    blog(_sc)
    launch()
    learn()
    doc('run-a-harness.md', 'run.html', '/run', 'Run a harness',
        'How to run a Verafy Harness: machine requirements, models, how a model is proven, install, configure, costs and earnings.')
    doc('testnet.md', 'testnet.html', '/testnet', 'Testnet',
        'The Verafy Chain local devnet you can run now, and the plan for Testnet 0.')
    doc('coin-agnostic.md', 'coin-agnostic.html', '/coin-agnostic', 'Coin Agnostic',
        'Why there is no coin, what the money pays for, and how the Verafy Harness routing agent moves it.')
    doc('judiciary-signer.md', 'signer.html', '/signer', 'Judiciary Signer',
        'A Squads multisig member no person holds a key for. It signs only what the wallet policy allows, as a jury of AI models rules.')
    doc('policies.md', 'policies.html', '/policies', 'Policies',
        'The rules a Judiciary Signer enforces: hard rules, intent and judgment, with templates for Covenant Launch, treasuries and upgrade keys.')
    doc('roadmap.md', 'roadmap.html', '/roadmap', 'Roadmap',
        'Three stages: build on Solana programs with no SIMD, prove it with 10 to 50 pilots, then show the demand and scale to a SIMD.')
    doc('pilots.md', 'pilots.html', '/pilots', 'Pilots',
        'Top Solana apps by revenue, and the jury projects that would make or save them money.')
    machine_readable()
    print('built', ', '.join(str(p.relative_to(SITE)) for p in sorted(SITE.rglob('*.html')) if 'src' not in p.parts))
