from pathlib import Path
import sys, re, asyncio, subprocess, json, math
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.demo-tools'))
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg
import edge_tts

OUT = Path(__file__).resolve().parent
ASSETS = OUT / 'assets'
ASSETS.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
SCRIPT = (ROOT / 'docs/guion-demo-video.md').read_text(encoding='utf-8')
TEXTS = re.findall('“(.*?)”', SCRIPT, re.S)
TITLES = ['Toda tu academia, conectada', 'Visibilidad para decidir', 'El atleta en el centro', 'Una temporada bien organizada', 'Cada evento bajo control', 'Orden en cada movimiento', 'Más cerca de las familias', 'Un equipo. Una plataforma.']
LABELS = ['STARS ROYALTY', 'RESUMEN EJECUTIVO', 'EXPEDIENTE 360°', 'OPERACIÓN DEPORTIVA', 'CALENDARIO Y COMPETENCIAS', 'FINANZAS Y ACTIVOS', 'FAMILIAS Y REPORTES', 'CONFIGURACIÓN']
CARDS = [
 [('Deporte', 'Atletas · Equipos · Rendimiento'), ('Administración', 'Cobranza · Inventario · Vestuario'), ('Comunidad', 'Familias · Agenda · Comunicación')],
 [('Indicadores', 'Atletas, asistencia y rendimiento'), ('Finanzas', 'Cobranza del periodo'), ('Prioridades', 'Eventos y alertas operativas')],
 [('Perfil integral', 'Contacto, equipo y documentos'), ('Desarrollo', 'Evaluaciones, metas y asistencias'), ('Seguimiento', 'Historial médico, pagos y credencial')],
 [('Estructura', 'Disciplinas y categorías'), ('Equipos', 'Plantillas y asignación de atletas'), ('Evaluación', 'Rúbricas de Cheerleading y Gimnasia')],
 [('Agenda', 'Entrenamientos y evaluaciones'), ('Organización', 'Reuniones, exhibiciones y competencias'), ('Seguimiento', 'Convocatorias, logística y resultados')],
 [('Cobranza', 'Cargos, pagos, egresos y recibos'), ('Inventario', 'Productos, existencias y movimientos'), ('Vestuario', 'Uniformes por atleta y equipo')],
 [('Portal familiar', 'Consulta y seguimiento'), ('Credenciales', 'Identificación institucional con QR'), ('Reportes', 'Información para impresión o PDF')],
 [('Administración', 'Usuarios, roles, sedes y salones'), ('Control', 'Rúbricas y privacidad'), ('Stars Royalty', 'Orden, visibilidad y atención cercana')],
]

async def voices():
    for i, text in enumerate(TEXTS):
        p = ASSETS / f'voz-{i}.mp3'
        if not p.exists():
            await edge_tts.Communicate(text, 'es-MX-DaliaNeural', rate='-18%').save(str(p))
        print(f'Voz {i+1}/8', flush=True)

def font(n, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/segoeui'+('b' if bold else '')+'.ttf', n)

def wrap(d, text, f, width):
    lines, line = [], ''
    for word in text.split():
        candidate = (line+' '+word).strip()
        if d.textlength(candidate, font=f) > width and line:
            lines.append(line); line=word
        else: line=candidate
    return lines+[line]

def slide(i):
    im=Image.new('RGB',(1920,1080),'#101222'); d=ImageDraw.Draw(im)
    for y in range(1080):
        d.line((0,y,1920,y),fill=(16+int(y/120),18+int(y/150),34+int(y/65)))
    d.ellipse((1400,-500,2400,500),fill='#21203d')
    d.ellipse((1630,-210,2120,280),outline='#9e7c38',width=2)
    logo=Image.open(ROOT/'logo.png').convert('RGBA'); logo.thumbnail((156,156))
    im.paste(logo,(94,54),logo)
    d.text((276,84),'STARS ROYALTY',font=font(33,True),fill='#f1dfad')
    d.text((277,132),'GESTIÓN DEPORTIVA',font=font(18),fill='#a9aec7')
    d.text((104,245),LABELS[i],font=font(24,True),fill='#d4b36c')
    d.text((100,299),TITLES[i],font=font(68,True),fill='#faf8f2')
    d.line((104,410,230,410),fill='#d4b36c',width=5)
    for j,(title,body) in enumerate(CARDS[i]):
        x=104+j*584
        d.rounded_rectangle((x,484,x+548,780),radius=22,fill='#25283e',outline='#3c3e56',width=2)
        d.ellipse((x+30,517,x+88,575),fill='#d4b36c')
        d.text((x+47,525),str(j+1),font=font(27,True),fill='#171a2c')
        d.text((x+30,608),title,font=font(34,True),fill='#ffffff')
        for k,line in enumerate(wrap(d,body,font(26),478)):
            d.text((x+30,671+k*37),line,font=font(26),fill='#c2c6d8')
    d.text((104,1008),'PRESENTACIÓN ILUSTRATIVA  ·  Basada en el guion de la plataforma',font=font(18),fill='#9298b1')
    d.text((1670,1006),f'{i+1:02d} / 08',font=font(23),fill='#d4b36c')
    p=ASSETS/f'escena-{i}.png'; im.save(p); return p

def run(args):
    subprocess.run([FF,'-hide_banner','-loglevel','error','-y']+args,check=True)

def duration(p):
    r=subprocess.run([FF,'-i',str(p)],capture_output=True,text=True)
    m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',r.stderr)
    return int(m[1])*3600+int(m[2])*60+float(m[3])

def stamp(t):
    ms=round(t*1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

def render():
    subs=[]; elapsed=0; manifest=[]
    for i,text in enumerate(TEXTS):
        p=slide(i); audio=ASSETS/f'voz-{i}.mp3'; dur=duration(audio)+2
        # Static type stays legible; slow camera movement and fades animate each scene.
        vf=f"scale=1960:1102,crop=1920:1080:x='20+18*sin(t/12)':y=11,fade=t=in:st=0:d=0.7,fade=t=out:st={dur-0.7}:d=0.7,format=yuv420p"
        run(['-loop','1','-framerate','24','-i',str(p),'-i',str(audio),'-vf',vf,'-af','adelay=600|600,apad','-t',str(dur),'-c:v','libx264','-preset','fast','-crf','21','-c:a','aac','-b:a','160k',str(ASSETS/f'clip-{i}.mp4')])
        sentences=re.split(r'(?<=[.!?])\s+',text)
        pos=elapsed+0.6
        for sentence in sentences:
            length=(dur-2)*len(sentence)/sum(map(len,sentences))
            subs.append(f'{len(subs)+1}\n{stamp(pos)} --> {stamp(pos+length)}\n{sentence}\n')
            pos+=length
        manifest.append({'capitulo':LABELS[i],'inicio':round(elapsed,2),'duracion':round(dur,2)})
        elapsed+=dur
        print(f'Escena {i+1}/8 lista ({dur:.1f} s)',flush=True)
    (OUT/'Stars-Royalty-Demo.srt').write_text('\n'.join(subs),encoding='utf-8')
    (ASSETS/'concat.txt').write_text('\n'.join(f"file 'clip-{i}.mp4'" for i in range(8)),encoding='utf-8')
    run(['-f','concat','-safe','0','-i',str(ASSETS/'concat.txt'),'-i',str(OUT/'Stars-Royalty-Demo.srt'),'-map','0:v','-map','0:a','-map','1:0','-c:v','copy','-c:a','copy','-c:s','mov_text','-metadata:s:s:0','language=spa','-metadata','title=Stars Royalty | Presentación demo','-movflags','+faststart',str(OUT/'Stars-Royalty-Demo.mp4')])
    (OUT/'capitulos.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    sheet=Image.new('RGB',(960,1080))
    for i in range(8):
        pic=Image.open(ASSETS/f'escena-{i}.png');pic.thumbnail((480,270));sheet.paste(pic,((i%2)*480,(i//2)*270))
    sheet.save(OUT/'vista-previa.jpg')
    print(f'Video terminado: {elapsed:.1f} segundos',flush=True)

if __name__=='__main__':
    if '--voice' in sys.argv: asyncio.run(voices())
    else: render()
