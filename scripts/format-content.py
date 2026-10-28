import sys,json,subprocess
from pathlib import Path
sys.path.insert(0,str(Path('.tmp/format-tools').resolve()))
import jsbeautifier
from jsbeautifier.javascript.tokenizer import Tokenizer
files='Models/Content.js Controllers/contentControl.js Routes/contentRoute.js services/contentService.js services/postContentCreationService.js services/contentSyncStatusService.js services/ticktickContentService.js services/notionContentService.js validators/contentDestinations.js validators/contentValidator.js Routes/notionContentRoute.js services/notionDestinationService.js utils/notionContentBlocks.js utils/notionApi.js utils/notionErrors.js validators/notionValidator.js extension/notion.js extension/sync-status.js'.split()
files += [str(p).replace('\\', '/') for p in Path('swagger/UI').glob('*.js')]
files += ['extension/v2-layout.js', 'tests/swaggerQuality.test.js']
opts=jsbeautifier.default_options();opts.indent_size=4;opts.brace_style='expand';opts.preserve_newlines=True;opts.max_preserve_newlines=2

def tokens(s):
    stream=Tokenizer(s,opts).tokenize();out=[]
    while stream.hasNext():
        t=stream.next();out.append((t.type,t.text))
    return out
for name in files:
    p=Path(name);before=p.read_text();after=jsbeautifier.beautify(before,opts)+'\n'
    assert tokens(before)==tokens(after),name
    backup=Path('.tmp/style-before')/name;backup.parent.mkdir(parents=True,exist_ok=True);
    if not backup.exists(): backup.write_text(before)
    p.write_text(after);subprocess.run(['node','--check',name],check=True)
print('Formatted and token-verified',len(files),'files')
Path('.tmp/style-files.json').write_text(json.dumps(files))
