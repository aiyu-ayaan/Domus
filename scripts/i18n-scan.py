# Lists UI text still hard-coded in apps/web/src (run from apps/web: python3 ../../scripts/i18n-scan.py [files]).
# Heuristic: expect a few false positives (import lists, hooks, "Domus" brand); a file is done when only those remain.
import re,sys,glob,os
files=sys.argv[1:] or glob.glob('src/**/*.ts*',recursive=True)
attr=r'(?:title|label|placeholder|aria-label|alt|hint|description|message|confirmLabel|empty|info|sub|text|error|subtitle|heading|name)'
pats=[
 (re.compile(r'>\s*([A-Za-z][^<>{}\n]*[A-Za-z.!?…:)])\s*(?=<|$)'),'jsx'),
 (re.compile(r'^\s+([A-Z][A-Za-z0-9 ,.\'’!?:·–—…&()/+-]{2,})\s*$'),'line'),
 (re.compile(attr+r'=(?:"([^"]*[A-Za-z]{3}[^"]*)")'),'attr'),
 (re.compile(r'\b(?:title|message|label|confirmLabel|hint|description|placeholder|empty|sub|info)\s*:\s*(?:`([^`]*[A-Za-z]{3}[^`]*)`|\'([^\']*[A-Za-z]{3}[^\']*)\')'),'prop'),
 (re.compile(r'\? (?:\'([A-Z][^\']*)\'|`([A-Z][^`]*)`) :'),'tern'),
 (re.compile(r'new Error\((?:\'([^\']*)\'|`([^`]*)`)'),'err'),
]
skip=re.compile(r'^\s*(import|//|\*|/\*)|className=|t\(\'|^\s*[a-z-]+:\s|from \'')
n=0
for f in sorted(files):
    if f.endswith('.d.ts') or 'locales' in f: continue
    for i,l in enumerate(open(f),1):
        if skip.search(l) and not re.search(r'(title|label|message)\s*[:=]',l): continue
        for rx,k in pats:
            m=rx.search(l)
            if m:
                txt=next((g for g in m.groups() if g),'')
                if re.fullmatch(r'[\W\d_a-z]*',txt) and k!='err' : continue
                if "t('" in l and k in('line',): continue
                print(f"{f}:{i}: [{k}] {txt.strip()[:90]}"); n+=1; break
print(n,'candidates',file=sys.stderr)
