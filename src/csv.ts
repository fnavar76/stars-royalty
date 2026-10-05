/** RFC-style quoted fields, escaped quotes, embedded newlines and a UTF-8 BOM. */
export function parseCSV(source:string):string[][] {
  const input=source.replace(/^\uFEFF/,'');const delimiter=input.slice(0,input.indexOf('\n')<0?input.length:input.indexOf('\n')).includes(';')?';':','
  const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false
  for(let i=0;i<input.length;i++){
    const c=input[i]
    if(c==='"'){if(quoted&&input[i+1]==='"'){field+='"';i++}else if(quoted||field==='')quoted=!quoted;else throw new Error('Comillas inválidas en el archivo CSV.')}
    else if(c===delimiter&&!quoted){row.push(field);field=''}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field=''}
    else field+=c
  }
  if(quoted)throw new Error('Hay un campo con comillas sin cerrar.')
  row.push(field);if(row.some(v=>v.trim()))rows.push(row)
  return rows
}
