const SUPABASE_URL='https://lgefivcocbjrjpfzwfmy.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_L9GxbR8iPPRta8AResUJ1w_919i_EOf';

const el=(q)=>document.querySelector(q);
const authView=el('#authView'),appView=el('#appView'),loginForm=el('#loginForm'),authStatus=el('#authStatus'),orgPicker=el('#orgPicker'),orgMode=el('#orgMode'),nav=el('#nav'),content=el('#content'),orgName=el('#orgName'),orgType=el('#orgType'),roleSummary=el('#roleSummary'),identityMini=el('#identityMini'),legacyLaunch=el('#legacyLaunch'),toast=el('#toast');

const state={session:null,identity:null,memberships:[],organizations:[],roles:[],rolePermissions:[],integrations:[],selected:null,memberRows:[],people:[],memberRoles:new Map(),tdt:null,view:'overview'};

const NAV=[
  ['overview','⌂','Overview',['organization.view']],
  ['members','◎','Members',['members.view']],
  ['leagues','L','Leagues',['leagues.view']],
  ['teams','T','Teams',['teams.view']],
  ['schedule','S','Schedule',['leagues.view']],
  ['standings','≡','Standings',['leagues.view']],
  ['results','✓','Results',['scores.submit']],
  ['tournaments','B','Tournaments',['tournaments.view']],
  ['venues','V','Venues',['organization.view']],
  ['admin','⚙','Administration',['organization.manage']],
];

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));}
function showToast(message){toast.textContent=message;toast.classList.remove('hidden');setTimeout(()=>toast.classList.add('hidden'),3200);}
function setAuthStatus(message,ok=false){authStatus.textContent=message||'';authStatus.style.color=ok?'#86efac':'#fca5a5';}
function fmtDate(value){if(!value)return'TBA';const d=new Date(value);return Number.isNaN(d.getTime())?'TBA':d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function shortDate(value){if(!value)return'';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleDateString([], {month:'short',day:'numeric'});}
function dayName(n){return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][Number(n)]||'TBA';}
function timeText(value){if(!value)return'TBA';const [h,m]=String(value).split(':');const d=new Date();d.setHours(Number(h),Number(m||0),0,0);return d.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});}

async function jsonFetch(url,options={}){const response=await fetch(url,options);const text=await response.text();let body=null;try{body=text?JSON.parse(text):null}catch{body=text}if(!response.ok){const message=body?.msg||body?.message||body?.error_description||body?.error||text||`${response.status}`;throw new Error(message)}return body;}
async function signIn(email,password){return jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({email,password})});}
async function refreshSession(refreshToken){return jsonFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refreshToken})});}
function saveSession(session){state.session=session;localStorage.setItem('nexus_org_session',JSON.stringify(session));}
function clearSession(){state.session=null;localStorage.removeItem('nexus_org_session');}

async function api(path,schema='public'){
  if(!state.session?.access_token)throw new Error('No active session.');
  return jsonFetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${state.session.access_token}`,Accept:'application/json','Accept-Profile':schema}});
}
async function safeApi(path,schema='public'){try{return await api(path,schema)}catch(error){console.warn(`NEXUS bridge read failed: ${schema}.${path}`,error);return[];}}

function currentMembership(){return state.selected;}
function currentOrg(){return state.selected?.organization||null;}
function currentRoleCodes(){return state.selected?.roles?.map(r=>r.role_code)||[];}
function permissionSet(){const roles=currentRoleCodes();return new Set(state.rolePermissions.filter(r=>roles.includes(r.role_code)).map(r=>r.permission_code));}
function hasPermission(permission){return permissionSet().has(permission);}
function canAny(required=[]){return required.length===0||required.some(hasPermission);}
function roleLabels(){return currentRoleCodes().map(code=>state.roles.find(r=>r.code===code)?.name||code);}

async function loadIdentity(){
  const uid=state.session?.user?.id;if(!uid)throw new Error('No Supabase user ID returned.');
  const people=await api(`nexus_people?auth_user_id=eq.${encodeURIComponent(uid)}&select=id,nexus_id,display_name,city,state,is_test&limit=1`);
  state.identity=people?.[0];
  if(!state.identity)throw new Error('This Auth account is not linked to a NEXUS identity.');
  const [memberships,organizations,roles,rolePermissions,integrations]=await Promise.all([
    api(`nexus_organization_memberships?person_id=eq.${encodeURIComponent(state.identity.id)}&status=eq.active&select=id,organization_id,person_id,status`),
    api('nexus_organizations?status=eq.active&select=id,slug,name,organization_type,description&order=name.asc'),
    api('nexus_roles?is_active=eq.true&select=code,name,rank'),
    api('nexus_role_permissions?select=role_code,permission_code'),
    safeApi('nexus_organization_integrations?status=eq.active&select=id,organization_id,integration_key,source_schema,mode,migration_stage,launch_url,capabilities,metadata')
  ]);
  state.organizations=organizations||[];state.roles=roles||[];state.rolePermissions=rolePermissions||[];state.integrations=integrations||[];
  state.memberships=memberships||[];
  for(const m of state.memberships){
    m.organization=state.organizations.find(o=>o.id===m.organization_id)||{id:m.organization_id,name:'Unknown organization',slug:'unknown',organization_type:'organization'};
    m.roles=await api(`nexus_membership_roles?membership_id=eq.${encodeURIComponent(m.id)}&select=role_code`);
    m.integration=state.integrations.find(i=>i.organization_id===m.organization_id)||null;
  }
  state.memberships.sort((a,b)=>a.organization.name.localeCompare(b.organization.name));
  state.selected=state.memberships.find(m=>m.organization.slug==='space-city-darts')||state.memberships[0]||null;
  if(!state.selected)throw new Error('This NEXUS identity has no active organization membership.');
}

async function loadOrganization(){
  const membership=currentMembership();if(!membership)return;
  const orgId=membership.organization_id;
  state.memberRows=await safeApi(`nexus_organization_memberships?organization_id=eq.${encodeURIComponent(orgId)}&status=eq.active&select=id,organization_id,person_id,status,joined_at`);
  const visiblePeople=await safeApi('nexus_people?status=eq.active&select=id,nexus_id,display_name,nickname,city,state,is_test');
  const ids=new Set(state.memberRows.map(r=>r.person_id));state.people=(visiblePeople||[]).filter(p=>ids.has(p.id));
  state.memberRoles=new Map();
  for(const row of state.memberRows){const roles=await safeApi(`nexus_membership_roles?membership_id=eq.${encodeURIComponent(row.id)}&select=role_code,assignment_source`);state.memberRoles.set(row.id,roles||[]);}
  state.tdt=null;
  if(membership.organization.slug==='texas-double-top')state.tdt=await loadTdt();
}

async function loadTdt(){
  const uid=state.session.user.id;
  const [profiles,venues,leagues,seasons,teams,matches,standings,announcements,registrations,notifications]=await Promise.all([
    safeApi('profiles?select=id,tdt_player_id,display_name,nickname,city,state,preferred_platform&order=display_name.asc','tdt'),
    safeApi('venues?select=id,name,city,state,active&order=name.asc','tdt'),
    safeApi('leagues?select=id,name,dart_system,format,venue_id,registration_open,active,day_of_week,start_time,league_type_id&order=created_at.desc','tdt'),
    safeApi('seasons?select=id,league_id,name,starts_on,ends_on,status&order=starts_on.desc','tdt'),
    safeApi('teams?select=id,league_id,season_id,name,captain_user_id,status&order=name.asc','tdt'),
    safeApi('matches?select=id,league_id,season_id,home_team_id,away_team_id,scheduled_at,venue_id,board_label,status,home_score,away_score&order=scheduled_at.asc','tdt'),
    safeApi('standings?select=season_id,team_id,played,wins,losses,draws,points,legs_for,legs_against','tdt'),
    safeApi('announcements?select=id,league_id,title,body,created_at&order=created_at.desc&limit=10','tdt'),
    safeApi('registrations?select=id,league_id,season_id,user_id,registration_type,status,created_at&order=created_at.desc','tdt'),
    safeApi(`notifications?user_id=eq.${encodeURIComponent(uid)}&select=id,title,body,read_at,created_at&order=created_at.desc&limit=10`,'tdt')
  ]);
  return{profiles,venues,leagues,seasons,teams,matches,standings,announcements,registrations,notifications};
}

function renderShell(){
  authView.classList.add('hidden');appView.classList.remove('hidden');
  orgPicker.innerHTML=state.memberships.map(m=>`<option value="${escapeHtml(m.id)}">${escapeHtml(m.organization.name)}</option>`).join('');orgPicker.value=state.selected.id;
  const org=currentOrg(),integration=currentMembership().integration;
  orgName.textContent=org.name;orgType.textContent=String(org.organization_type||'organization').replaceAll('_',' ').toUpperCase();
  roleSummary.textContent=roleLabels().join(' · ')||'Member';
  identityMini.innerHTML=`<div class="identity-name">${escapeHtml(state.identity.display_name)}</div><div class="identity-id">${escapeHtml(state.identity.nexus_id)}</div>`;
  if(integration){orgMode.innerHTML=`<span class="pill bridge">BRIDGE</span> Stage ${integration.migration_stage} · ${escapeHtml(integration.source_schema||integration.integration_key)}`;legacyLaunch.href=integration.launch_url||'#';legacyLaunch.classList.toggle('hidden',!integration.launch_url)}
  else{orgMode.innerHTML='<span class="pill active">NATIVE</span> NEXUS organization';legacyLaunch.classList.add('hidden')}
  renderNav();renderView();
}

function renderNav(){
  const available=NAV.filter(([, , ,required])=>canAny(required));
  if(!available.some(([key])=>key===state.view))state.view='overview';
  nav.innerHTML=available.map(([key,icon,label])=>`<button class="nav-btn ${state.view===key?'active':''}" data-view="${key}"><b>${icon}</b><span>${label}</span></button>`).join('');
  nav.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{state.view=btn.dataset.view;renderNav();renderView()}));
}

function renderView(){
  const views={overview:renderOverview,members:renderMembers,leagues:renderLeagues,teams:renderTeams,schedule:renderSchedule,standings:renderStandings,results:renderResults,tournaments:renderTournaments,venues:renderVenues,admin:renderAdmin};
  (views[state.view]||renderOverview)();
}

function renderOverview(){
  const org=currentOrg(),integration=currentMembership().integration,tdt=state.tdt;
  const cards=tdt?[
    [tdt.profiles.length,'Players'],[tdt.leagues.length,'Leagues'],[tdt.teams.length,'Teams'],[tdt.matches.length,'Matches']
  ]:[[state.memberRows.length,'Members'],[currentRoleCodes().length,'Your roles'],[hasPermission('leagues.manage')?'Yes':'No','League control'],[hasPermission('tournaments.manage')?'Yes':'No','Tournament control']];
  content.innerHTML=`${integration?`<div class="legacy-strip"><div><b>TDT is now connected to NEXUS</b><small>Existing TDT operations remain the write source while generic NEXUS modules replace them one by one.</small></div><span class="pill bridge">MIGRATION STAGE ${integration.migration_stage}</span></div>`:''}
  <section class="hero"><div class="eyebrow">${escapeHtml(org.name)} · ORGANIZATION HOME</div><h2>${escapeHtml(state.identity.display_name)}</h2><p>You are viewing ${escapeHtml(org.name)} through your NEXUS identity. Navigation and actions are generated from your organization-scoped roles.</p></section>
  <div class="kpi-grid">${cards.map(([value,label])=>`<div class="kpi"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}</div>
  <div class="section-head"><div><h3>Available modules</h3><p>One platform, permission-aware by organization.</p></div></div>
  <div class="module-grid">${NAV.filter(([, , ,req])=>canAny(req)).map(([key,,label])=>`<div class="module-card"><b>${escapeHtml(label)}</b><p>${moduleDescription(key)}</p></div>`).join('')}</div>
  ${tdt?renderAnnouncementsBlock(tdt.announcements):''}`;
}

function renderMembers(){
  const rows=state.memberRows.map(m=>{const p=state.people.find(x=>x.id===m.person_id)||{};const roles=(state.memberRoles.get(m.id)||[]).map(r=>state.roles.find(x=>x.code===r.role_code)?.name||r.role_code);return{...p,roles};});
  content.innerHTML=`<div class="section-head"><div><h3>People & memberships</h3><p>Canonical NEXUS identities inside ${escapeHtml(currentOrg().name)}.</p></div><span class="pill active">${rows.length} ACTIVE</span></div>${rows.length?`<div class="table"><div class="row head"><span>Person</span><span>NEXUS ID</span><span>Roles</span><span>Location</span></div>${rows.map(r=>`<div class="row"><b>${escapeHtml(r.display_name||'Member')}</b><span class="muted">${escapeHtml(r.nexus_id||'—')}</span><span>${escapeHtml(r.roles.join(', ')||'Member')}</span><span class="muted">${escapeHtml([r.city,r.state].filter(Boolean).join(', ')||'—')}</span></div>`).join('')}</div>`:'<div class="empty">No members are visible to this role.</div>'}`;
}

function renderLeagues(){const d=state.tdt;if(!d)return nativePlaceholder('Leagues','The generic NEXUS League Engine will replace organization-specific league implementations here.');content.innerHTML=`${bridgeNotice('League data is being read from the existing TDT schema. Writes still use the TDT app during Stage 1.')}<div class="section-head"><div><h3>Leagues</h3><p>Existing Texas Double Top league catalogue inside NEXUS.</p></div><span class="pill bridge">LEGACY READ</span></div>${d.leagues.length?`<div class="table"><div class="row head"><span>League</span><span>Platform</span><span>Schedule</span><span>Status</span></div>${d.leagues.map(l=>`<div class="row"><b>${escapeHtml(l.name)}</b><span>${escapeHtml(l.dart_system||l.format||'—')}</span><span class="muted">${escapeHtml(dayName(l.day_of_week))} · ${escapeHtml(timeText(l.start_time))}</span><span><span class="pill ${l.active?'active':''}">${l.active?'ACTIVE':'INACTIVE'}</span></span></div>`).join('')}</div>`:'<div class="empty">No TDT leagues have been created yet.</div>'}`;}
function renderTeams(){const d=state.tdt;if(!d)return nativePlaceholder('Teams','NEXUS team and captain workflows will live here.');content.innerHTML=`${bridgeNotice('Team records remain in TDT while the generic NEXUS roster model is built.')}<div class="section-head"><div><h3>Teams</h3><p>Current TDT teams visible to your role.</p></div></div>${d.teams.length?`<div class="table"><div class="row head"><span>Team</span><span>League</span><span>Season</span><span>Status</span></div>${d.teams.map(t=>`<div class="row"><b>${escapeHtml(t.name)}</b><span>${escapeHtml(leagueName(d,t.league_id))}</span><span class="muted">${escapeHtml(seasonName(d,t.season_id))}</span><span><span class="pill ${t.status==='active'?'active':''}">${escapeHtml(t.status)}</span></span></div>`).join('')}</div>`:'<div class="empty">No teams are visible.</div>'}`;}
function renderSchedule(){const d=state.tdt;if(!d)return nativePlaceholder('Schedule','League and tournament scheduling will converge into the NEXUS scheduling engine.');content.innerHTML=`${bridgeNotice('TDT scheduling is read-only here during the bridge.')}<div class="section-head"><div><h3>Schedule</h3><p>Upcoming and managed TDT matches.</p></div></div>${d.matches.length?`<div class="stack">${d.matches.slice(0,40).map(m=>`<div class="card"><div class="row" style="grid-template-columns:1.4fr .8fr .8fr .7fr;padding:0;border:0"><b>${escapeHtml(teamName(d,m.home_team_id))} vs ${escapeHtml(teamName(d,m.away_team_id))}</b><span>${escapeHtml(fmtDate(m.scheduled_at))}</span><span class="muted">${escapeHtml(venueName(d,m.venue_id))}${m.board_label?` · ${escapeHtml(m.board_label)}`:''}</span><span class="pill ${m.status==='final'?'active':''}">${escapeHtml(m.status)}</span></div></div>`).join('')}</div>`:'<div class="empty">No matches are visible.</div>'}`;}
function renderStandings(){const d=state.tdt;if(!d)return nativePlaceholder('Standings','Standings will be calculated by the shared NEXUS competition engine.');const rows=[...d.standings].sort((a,b)=>Number(b.points||0)-Number(a.points||0));content.innerHTML=`${bridgeNotice('These standings are still calculated by TDT result workflows.')}<div class="section-head"><div><h3>Standings</h3><p>Current standings visible inside NEXUS.</p></div></div>${rows.length?`<div class="table"><div class="row head"><span>Team</span><span>Played</span><span>Record</span><span>Points</span></div>${rows.map(r=>`<div class="row"><b>${escapeHtml(teamName(d,r.team_id))}</b><span>${escapeHtml(r.played)}</span><span class="muted">${escapeHtml(`${r.wins||0}-${r.losses||0}-${r.draws||0}`)}</span><b>${escapeHtml(r.points)}</b></div>`).join('')}</div>`:'<div class="empty">No official standings yet.</div>'}`;}
function renderResults(){const d=state.tdt;if(!d)return nativePlaceholder('Results','NEXUS score submission and confirmation will use the same permission model as tournaments and leagues.');const finals=d.matches.filter(m=>m.status==='final');content.innerHTML=`${bridgeNotice('Result submission, opposing-captain confirmation and disputes still execute in the TDT app until NEXUS write parity is complete.')}<div class="section-head"><div><h3>Results</h3><p>Finalized TDT match results.</p></div></div>${finals.length?`<div class="stack">${finals.slice(-30).reverse().map(m=>`<div class="card"><b>${escapeHtml(teamName(d,m.home_team_id))} ${escapeHtml(m.home_score??'—')} – ${escapeHtml(m.away_score??'—')} ${escapeHtml(teamName(d,m.away_team_id))}</b><div class="muted">${escapeHtml(fmtDate(m.scheduled_at))}</div></div>`).join('')}</div>`:'<div class="empty">No finalized results yet.</div>'}`;}
function renderVenues(){const d=state.tdt;if(!d)return nativePlaceholder('Venues','Venue records, boards and platform capabilities will become shared NEXUS resources.');content.innerHTML=`${bridgeNotice('TDT venues are the first source for the future NEXUS venue catalogue.')}<div class="section-head"><div><h3>Venues</h3><p>Locations currently configured by Texas Double Top.</p></div></div>${d.venues.length?`<div class="table"><div class="row head"><span>Venue</span><span>City</span><span>State</span><span>Status</span></div>${d.venues.map(v=>`<div class="row"><b>${escapeHtml(v.name)}</b><span>${escapeHtml(v.city||'—')}</span><span>${escapeHtml(v.state||'—')}</span><span class="pill ${v.active?'active':''}">${v.active?'ACTIVE':'INACTIVE'}</span></div>`).join('')}</div>`:'<div class="empty">No venues are visible.</div>'}`;}
function renderTournaments(){content.innerHTML=`<div class="section-head"><div><h3>Tournaments</h3><p>The NEXUS Tournament Director remains a shared platform module, independent of TDT's league migration.</p></div></div><div class="module-grid"><div class="module-card"><b>Tournament Director</b><p>Single elimination, double elimination, blind draw and director controls remain a native NEXUS capability.</p></div><div class="module-card"><b>Shared player identity</b><p>Tournament entries can resolve to the same NEXUS person used by leagues and organizations.</p></div><div class="module-card"><b>Next cutover</b><p>Link tournament registrations and match results to organization membership and NEXUS ratings.</p></div></div>`;}
function renderAdmin(){const i=currentMembership().integration;content.innerHTML=`<div class="section-head"><div><h3>Organization administration</h3><p>Tenant configuration and migration status.</p></div></div><div class="grid"><div class="card"><div class="eyebrow">YOUR ACCESS</div><h3>${escapeHtml(roleLabels().join(' · '))}</h3><p class="muted">${escapeHtml([...permissionSet()].sort().join(' · '))}</p></div><div class="card"><div class="eyebrow">DATA MODE</div><h3>${i?'Legacy bridge':'Native NEXUS'}</h3><p class="muted">${i?`Stage ${i.migration_stage}. Source schema: ${escapeHtml(i.source_schema||'external')}.`:'This organization is not attached to a legacy application.'}</p></div></div>${i?`<div class="section-head"><div><h3>TDT → NEXUS migration</h3><p>Bridge-first cutover protects the working league app.</p></div></div><div class="module-grid"><div class="module-card"><b>Stage 1 · Identity</b><p>Shared Auth, NEXUS ID, organization membership and role mapping.</p></div><div class="module-card"><b>Stage 2 · Directory & venues</b><p>Move player directory, locations and league opportunities to generic NEXUS tables.</p></div><div class="module-card"><b>Stage 3–4 · League engine</b><p>Move leagues, seasons, teams, registration, scheduling, results and standings.</p></div></div>`:''}`;}

function nativePlaceholder(title,text){content.innerHTML=`<div class="section-head"><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(currentOrg().name)}</p></div><span class="pill active">NATIVE NEXUS</span></div><div class="empty">${escapeHtml(text)}<br><br>The organization shell and permission layer are active now; operational data will attach here as each generic module is promoted.</div>`;}
function bridgeNotice(text){return`<div class="notice">${escapeHtml(text)}</div>`;}
function renderAnnouncementsBlock(rows=[]){if(!rows.length)return'';return`<div class="section-head"><div><h3>Announcements</h3><p>Latest organization updates.</p></div></div><div class="card">${rows.slice(0,6).map(a=>`<div class="activity"><div><b>${escapeHtml(a.title)}</b><div class="muted">${escapeHtml(a.body)}</div></div><time>${escapeHtml(shortDate(a.created_at))}</time></div>`).join('')}</div>`;}
function moduleDescription(key){return({overview:'Organization snapshot, roles, activity and migration status.',members:'One canonical people directory and organization memberships.',leagues:'League opportunities, seasons, registration and director controls.',teams:'Rosters, captains, lineups and team operations.',schedule:'League and tournament scheduling with venue/board assignment.',standings:'Official standings derived from finalized results.',results:'Score submission, confirmation, disputes and audit history.',tournaments:'Bracket, check-in, boards and tournament operations.',venues:'Venues, dart systems, boards and recurring activity.',admin:'Organization settings, roles and tenant configuration.'})[key]||'';}
function leagueName(d,id){return d.leagues.find(x=>x.id===id)?.name||'League';}
function seasonName(d,id){return d.seasons.find(x=>x.id===id)?.name||'Season';}
function teamName(d,id){return d.teams.find(x=>x.id===id)?.name||'Team';}
function venueName(d,id){return d.venues.find(x=>x.id===id)?.name||'Venue TBA';}

loginForm.addEventListener('submit',async(event)=>{event.preventDefault();setAuthStatus('Signing in…',true);try{const session=await signIn(el('#email').value.trim(),el('#password').value);saveSession(session);await loadIdentity();await loadOrganization();renderShell();setAuthStatus('')}catch(error){clearSession();setAuthStatus(error.message||'Unable to sign in.')}});
orgPicker.addEventListener('change',async()=>{const next=state.memberships.find(m=>m.id===orgPicker.value);if(!next)return;state.selected=next;state.view='overview';content.innerHTML='<div class="empty">Loading organization…</div>';await loadOrganization();renderShell();showToast(`Switched to ${next.organization.name}`);});
el('#logoutBtn').addEventListener('click',async()=>{try{if(state.session?.access_token)await fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${state.session.access_token}`}})}catch{}clearSession();location.reload();});

(async function restore(){const raw=localStorage.getItem('nexus_org_session');if(!raw)return;try{let session=JSON.parse(raw);if(session.expires_at&&session.expires_at*1000<Date.now()+60000&&session.refresh_token)session=await refreshSession(session.refresh_token);saveSession(session);await loadIdentity();await loadOrganization();renderShell()}catch(error){console.warn(error);clearSession();}})();
