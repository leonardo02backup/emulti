const data = window.SIAPS_DATA || [];
const fmt = new Intl.NumberFormat('pt-BR');
const dec = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
let sort = {key: 'media', direction: -1};

const $ = id => document.getElementById(id);
const apFilter = $('apFilter');
const cnesFilter = $('cnesFilter');
const searchInput = $('searchInput');

function ratio(a, b, factor = 1) { return b ? a / b * factor : 0; }
function currentData() {
  const q = searchInput.value.trim().toLocaleLowerCase('pt-BR');
  return data.filter(d => (apFilter.value === 'all' || d.ap === apFilter.value) &&
    (cnesFilter.value === 'all' || d.cnes === cnesFilter.value) &&
    (!q || `${d.equipe} ${d.estabelecimento} ${d.cnes} ${d.ine}`.toLocaleLowerCase('pt-BR').includes(q)));
}
function totals(rows) {
  return rows.reduce((a,d) => {a.pessoas+=d.pessoas;a.atendimentos+=d.atendimentos;a.compartilhadas+=d.compartilhadas;a.acoes+=d.acoes;return a}, {pessoas:0,atendimentos:0,compartilhadas:0,acoes:0});
}
function status(value, average) { return value >= average * 1.1 ? 'good' : value >= average * .9 ? 'mid' : 'low'; }
function escapeHtml(value) { const el=document.createElement('div'); el.textContent=value; return el.innerHTML; }

function renderKpis(rows) {
  const t=totals(rows), m1=ratio(t.atendimentos,t.pessoas),m2=ratio(t.compartilhadas,t.acoes,100);
  $('kpiTeams').textContent=fmt.format(rows.length); $('kpiPeople').textContent=fmt.format(t.pessoas);
  $('kpiVisits').textContent=fmt.format(t.atendimentos); $('kpiAverage').textContent=dec.format(m1);
  $('kpiShared').textContent=fmt.format(t.compartilhadas); $('kpiShareRate').textContent=`${dec.format(m2)}% do total de ações`;
}
function grouped(rows) {
  const groups={}; rows.forEach(d=>{groups[d.ap]??=[];groups[d.ap].push(d)});
  return Object.entries(groups).map(([ap,items])=>{const t=totals(items);return {ap,teams:items.length,m1:ratio(t.atendimentos,t.pessoas),m2:ratio(t.compartilhadas,t.acoes,100)}}).sort((a,b)=>a.ap.localeCompare(b.ap));
}
function chart(target, groups, key) {
  const max=Math.max(...groups.map(g=>g[key]),1), best=Math.max(...groups.map(g=>g[key]));
  $(target).innerHTML=groups.map(g=>`<div class="bar-row"><strong>AP ${g.ap}</strong><div class="track" title="${g.teams} equipes"><div class="bar ${g[key]===best?'best':''}" style="width:${g[key]/max*100}%"></div></div><span class="bar-value">${dec.format(g[key])}${key==='m2'?'%':''}</span></div>`).join('') || '<p>Sem dados para o filtro.</p>';
}
function renderTerritory(rows) {
  const groups=grouped(rows); chart('m1Chart',groups,'m1');chart('m2Chart',groups,'m2');
  if(!groups.length){$('territoryInsight').textContent='Nenhum registro corresponde aos filtros selecionados.';return}
  const a=[...groups].sort((x,y)=>y.m1-x.m1)[0],b=[...groups].sort((x,y)=>y.m2-x.m2)[0];
  $('territoryInsight').innerHTML=`<strong>Leitura do recorte:</strong> a AP ${a.ap} apresenta a maior média de atendimentos por pessoa (${dec.format(a.m1)}), enquanto a AP ${b.ap} registra a maior proporção de ações compartilhadas (${dec.format(b.m2)}%). Os resultados descrevem registros de produção e precisam ser contextualizados antes de qualquer juízo de desempenho.`;
}
function geoPoints(value, points=[]) {
  if(Array.isArray(value)&&typeof value[0]==='number') points.push(value);
  else if(Array.isArray(value)) value.forEach(v=>geoPoints(v,points));
  return points;
}
function renderMap() {
  const geo=window.AP_GEOJSON;
  if(!geo?.features?.length){$('apMap').innerHTML='<p>Mapa territorial indisponível.</p>';return}
  const points=geoPoints(geo.features.map(f=>f.geometry.coordinates));
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const width=800,height=360,pad=14,scale=Math.min((width-pad*2)/(maxX-minX),(height-pad*2)/(maxY-minY));
  const offsetX=(width-(maxX-minX)*scale)/2,offsetY=(height-(maxY-minY)*scale)/2;
  const project=p=>[offsetX+(p[0]-minX)*scale,height-(offsetY+(p[1]-minY)*scale)];
  const pathFor=geometry=>{
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    return polygons.map(poly=>poly.map(ring=>ring.map((p,i)=>`${i?'L':'M'}${project(p).map(n=>n.toFixed(1)).join(',')}`).join('')+'Z').join('')).join('');
  };
  const regions=geo.features.map(f=>{
    const ap=f.properties.COD_AP_SMS.replace('AP ','');
    const pts=geoPoints(f.geometry.coordinates),px=pts.map(project),cx=(Math.min(...px.map(p=>p[0]))+Math.max(...px.map(p=>p[0])))/2,cy=(Math.min(...px.map(p=>p[1]))+Math.max(...px.map(p=>p[1])))/2;
    return `<g class="ap-region" data-ap="${ap}" tabindex="0" role="button" aria-label="Selecionar Área Programática ${ap}"><title>AP ${ap} · selecionar território</title><path class="ap-shape" fill-rule="evenodd" d="${pathFor(f.geometry)}"></path><text class="ap-label" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">${ap}</text></g>`;
  }).join('');
  $('apMap').innerHTML=`<svg viewBox="0 0 ${width} ${height}" aria-hidden="true">${regions}</svg>`;
  document.querySelectorAll('.ap-region').forEach(region=>{
    const select=()=>{apFilter.value=region.dataset.ap;cnesFilter.value='all';render()};
    region.addEventListener('click',select);region.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select()}});
  });
}
function renderTerritoryProfile(rows) {
  const t=totals(rows), selected=apFilter.value, place=selected==='all'?'Município do Rio de Janeiro':`Área Programática ${selected}`;
  $('territoryProfile').innerHTML=`<div><span class="profile-label">Território selecionado</span><h3>${place}</h3><p>${selected==='all'?'Visão consolidada da produção eMulti nas dez Áreas Programáticas.':'Todos os indicadores do painel estão filtrados para este território.'}</p></div><div class="profile-stats"><div><strong>${fmt.format(rows.length)}</strong><span>equipes</span></div><div><strong>${fmt.format(t.pessoas)}</strong><span>pessoas</span></div><div><strong>${dec.format(ratio(t.atendimentos,t.pessoas))}</strong><span>média M1</span></div><div><strong>${dec.format(ratio(t.compartilhadas,t.acoes,100))}%</strong><span>ações compart.</span></div></div>`;
  document.querySelectorAll('.ap-region').forEach(r=>r.classList.toggle('selected',selected===r.dataset.ap));
}
function facilities(rows) {
  const groups={};
  rows.forEach(d=>{groups[d.cnes]??={cnes:d.cnes,estabelecimento:d.estabelecimento,ap:d.ap,teams:0,pessoas:0,atendimentos:0,acoes:0,compartilhadas:0};const g=groups[d.cnes];g.teams++;g.pessoas+=d.pessoas;g.atendimentos+=d.atendimentos;g.acoes+=d.acoes;g.compartilhadas+=d.compartilhadas});
  return Object.values(groups).map(g=>({...g,media:ratio(g.atendimentos,g.pessoas),proporcao:ratio(g.compartilhadas,g.acoes,100)}));
}
function renderFacilities(rows) {
  const metric=$('rankingMetric').value, list=facilities(rows).sort((a,b)=>b[metric]-a[metric] || a.estabelecimento.localeCompare(b.estabelecimento));
  const labels={media:'média de atendimentos',proporcao:'proporção de ações compartilhadas',pessoas:'pessoas atendidas',atendimentos:'atendimentos'};
  $('cnesRows').innerHTML=list.map((g,i)=>`<tr><td><span class="rank-number ${i<3?'top':''}">${i+1}</span></td><td><span class="team-name">CNES ${g.cnes}</span><span class="unit-name">${escapeHtml(g.estabelecimento)}</span></td><td>${g.ap}</td><td>${g.teams}</td><td>${fmt.format(g.pessoas)}</td><td>${fmt.format(g.atendimentos)}</td><td><span class="metric-chip">${dec.format(g.media)}</span></td><td>${fmt.format(g.acoes)}</td><td>${fmt.format(g.compartilhadas)}</td><td><span class="metric-chip">${dec.format(g.proporcao)}%</span></td></tr>`).join('');
  $('cnesCount').textContent=`${fmt.format(list.length)} estabelecimentos classificados no recorte atual.`;
  $('rankingSummary').innerHTML=list.length?`Líder no recorte: <strong>CNES ${list[0].cnes}</strong><br>${escapeHtml(list[0].estabelecimento)} · ${labels[metric]}`:'Nenhum estabelecimento corresponde aos filtros.';
}
function renderTable(rows) {
  const t=totals(rows), avg1=ratio(t.atendimentos,t.pessoas),avg2=ratio(t.compartilhadas,t.acoes,100);
  const sorted=[...rows].sort((a,b)=>{const x=a[sort.key],y=b[sort.key];return (typeof x==='string'?x.localeCompare(y):(x-y))*sort.direction});
  $('teamRows').innerHTML=sorted.map(d=>`<tr><td><span class="team-name">${escapeHtml(d.equipe)}</span><span class="unit-name">${escapeHtml(d.estabelecimento)} · CNES ${d.cnes} · INE ${d.ine}</span></td><td>${d.ap}</td><td>${fmt.format(d.pessoas)}</td><td>${fmt.format(d.atendimentos)}</td><td><span class="metric-chip ${status(d.media,avg1)}">${dec.format(d.media)}</span></td><td>${fmt.format(d.acoes)}</td><td>${fmt.format(d.compartilhadas)}</td><td><span class="metric-chip ${status(d.proporcao,avg2)}">${dec.format(d.proporcao)}%</span></td></tr>`).join('');
  $('tableCount').textContent=`${fmt.format(rows.length)} equipes exibidas. Clique no título de uma coluna para ordenar.`;
}
function render(){const rows=currentData();renderKpis(rows);renderTerritory(rows);renderTerritoryProfile(rows);renderFacilities(rows);renderTable(rows)}

[...new Set(data.map(d=>d.ap))].sort().forEach(ap=>apFilter.add(new Option(`AP ${ap}`,ap)));
[...new Map(data.map(d=>[d.cnes,d.estabelecimento])).entries()].sort((a,b)=>a[1].localeCompare(b[1])).forEach(([cnes,name])=>cnesFilter.add(new Option(`${cnes} · ${name.replace(/^SMS\s+/,'')}`,cnes)));
renderMap();
const requestedAp=new URLSearchParams(location.search).get('ap');
if(requestedAp&&[...apFilter.options].some(o=>o.value===requestedAp))apFilter.value=requestedAp;
apFilter.addEventListener('change',render);cnesFilter.addEventListener('change',render);searchInput.addEventListener('input',render);$('rankingMetric').addEventListener('change',render);
$('resetMap').addEventListener('click',()=>{apFilter.value='all';cnesFilter.value='all';render()});
$('clearFilters').addEventListener('click',()=>{apFilter.value='all';cnesFilter.value='all';searchInput.value='';render()});
document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$(btn.dataset.panel).classList.add('active')}));
const requestedPanel=new URLSearchParams(location.search).get('panel');
if(requestedPanel&&$(requestedPanel)){document.querySelectorAll('.tab,.panel').forEach(x=>x.classList.remove('active'));document.querySelector(`[data-panel="${requestedPanel}"]`)?.classList.add('active');$(requestedPanel).classList.add('active')}
document.querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{sort.direction=sort.key===th.dataset.sort?-sort.direction:-1;sort.key=th.dataset.sort;renderTable(currentData())}));
$('exportCsv').addEventListener('click',()=>{const rows=currentData(),keys=['cnes','ine','ap','estabelecimento','equipe','pessoas','atendimentos','media','acoes','compartilhadas','proporcao'];const csv=[keys.join(';'),...rows.map(d=>keys.map(k=>`"${String(d[k]).replaceAll('"','""')}"`).join(';'))].join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download='indicadores_emulti_dez_2025.csv';a.click();URL.revokeObjectURL(a.href)});
render();
