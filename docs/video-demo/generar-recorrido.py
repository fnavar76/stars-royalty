"""Edita capturas auténticas del navegador con el guion narrado del demo."""
from pathlib import Path
import sys, json, subprocess, re
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.demo-tools'))
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

OUT = Path(__file__).resolve().parent
CAP = OUT / 'recorrido'
BUILD = CAP / 'edicion'
BUILD.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
CHAPTERS = [
 ('Stars Royalty · Recorrido de la plataforma', ['01-resumen','02-atletas','08-calendario']),
 ('Resumen ejecutivo', ['01-resumen','01-resumen']),
 ('Atletas · Expediente integral 360°', ['02-atletas','03-expediente']),
 ('Operación deportiva', ['04-categorias','05-equipos','07-asistencia','06-rendimiento']),
 ('Calendario y competencias', ['08-calendario','09-competencias']),
 ('Cobranza, inventario y vestuario', ['10-cobranza','11-flujo','12-inventario','13-vestuario']),
 ('Familias, credenciales y reportes', ['14-familias','15-credenciales','16-reportes']),
 ('Configuración · Una academia conectada', ['17-configuracion','18-sedes','01-resumen']),
]
NAMES = {'01-resumen':'Indicadores y prioridades','02-atletas':'Directorio de atletas','03-expediente':'Expediente de prueba','04-categorias':'Disciplinas y categorías','05-equipos':'Equipos y plantillas','06-rendimiento':'Evaluación técnica','07-asistencia':'Pase de lista','08-calendario':'Agenda académica','09-competencias':'Preparación de competencias','10-cobranza':'Cargos y pagos','11-flujo':'Flujo de efectivo','12-inventario':'Productos y existencias','13-vestuario':'Entregas de uniformes','14-familias':'Vista con cuenta de tutor','15-credenciales':'Identificación institucional','16-reportes':'Centro de reportes','17-configuracion':'Usuarios y roles','18-sedes':'Sedes y salones'}

def run(args):
    subprocess.run([FF,'-hide_banner','-loglevel','error','-y']+args, check=True)

def duration(path):
    r=subprocess.run([FF,'-i',str(path)],capture_output=True,text=True)
    m=re.search(r'Duration: (\d+):(\d+):([\d.]+)',r.stderr)
    return int(m[1])*3600+int(m[2])*60+float(m[3])

def font(size,bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/segoeui'+('b' if bold else '')+'.ttf',size)

def frame(chapter,name,index):
    im=Image.new('RGB',(1920,1080),'#171122'); d=ImageDraw.Draw(im)
    d.rectangle((0,0,1920,6),fill='#a625d1')
    d.text((42,29),'STARS ROYALTY',font=font(25,True),fill='#ffffff')
    d.text((360,28),chapter,font=font(27),fill='#e7d9f0')
    shot=Image.open(CAP/(name+'.jpg')).convert('RGB')
    shot.thumbnail((1840,890),Image.Resampling.LANCZOS)
    x=(1920-shot.width)//2; y=101+(890-shot.height)//2
    im.paste(shot,(x,y))
    d.text((42,1022),NAMES[name],font=font(24,True),fill='#ffffff')
    d.text((1050,1026),'RECORRIDO EDITADO · CAPTURAS REALES DE LA APLICACIÓN',font=font(17),fill='#c6b9d0')
    p=BUILD/f'frame-{index:02}.png';im.save(p);return p

def main():
    elapsed=0; manifest=[]; shots=[]; total=0
    for i,(title,names) in enumerate(CHAPTERS):
        voice=OUT/'assets'/f'voz-{i}.mp3'
        seconds=duration(voice)+2
        chapter_frames=round(seconds*24)
        counts=[chapter_frames//len(names)]*len(names)
        counts[-1]+=chapter_frames-sum(counts)
        for j,(name,count) in enumerate(zip(names,counts)):
            picture=frame(title,name,total)
            clip=BUILD/f'shot-{total:02}.mp4'
            run(['-loop','1','-framerate','24','-i',str(picture),'-vf','fade=t=in:st=0:d=0.25,format=yuv420p','-frames:v',str(count),'-c:v','libx264','-preset','veryfast','-crf','20','-an',str(clip)])
            shots.append(picture); total+=1
        listing=BUILD/f'list-{i}.txt'
        start=total-len(names)
        listing.write_text('\n'.join(f"file 'shot-{n:02}.mp4'" for n in range(start,total)),encoding='utf-8')
        run(['-f','concat','-safe','0','-i',str(listing),'-i',str(voice),'-af','adelay=600|600,apad','-t',str(chapter_frames/24),'-c:v','copy','-c:a','aac','-b:a','160k',str(BUILD/f'chapter-{i}.mp4')])
        manifest.append({'titulo':title,'inicio':round(elapsed,3),'duracion':chapter_frames/24,'capturas':names})
        elapsed+=chapter_frames/24
        print(f'Capítulo {i+1}/8 exportado',flush=True)
    (BUILD/'all.txt').write_text('\n'.join(f"file 'chapter-{i}.mp4'" for i in range(8)),encoding='utf-8')
    run(['-f','concat','-safe','0','-i',str(BUILD/'all.txt'),'-i',str(OUT/'Stars-Royalty-Demo.srt'),'-map','0:v','-map','0:a','-map','1:0','-c','copy','-c:s','mov_text','-metadata:s:s:0','language=spa','-metadata','title=Stars Royalty | Recorrido de la aplicación','-movflags','+faststart',str(OUT/'Stars-Royalty-Recorrido-App.mp4')])
    (OUT/'capitulos-recorrido.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    sheet=Image.new('RGB',(960,1080))
    for i,m in enumerate(manifest):
        preview=frame(m['titulo'],m['capturas'][0],100+i)
        sheet.paste(Image.open(preview).resize((480,270)),((i%2)*480,(i//2)*270))
    sheet.save(OUT/'vista-previa-recorrido.jpg',quality=92)
    print(f'Final: {elapsed:.2f} segundos',flush=True)
    run(['-i',str(OUT/'Stars-Royalty-Recorrido-App.mp4'),'-f','null','-'])
    print('Verificación de decodificación completa: OK',flush=True)

if __name__=='__main__':main()
