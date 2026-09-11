import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { api, ApiError } from "./api.js";
import { useDeviceHeading, useLiveRadar, usePresence, useHeartbeat } from "./hooks.js";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:"#07080f", surface:"#0e0f1c", card:"#13152a", border:"#1e2040",
  accent:"#4f6ef7", accentGlow:"#4f6ef722", accentSoft:"#4f6ef711",
  green:"#00d48a", greenGlow:"#00d48a18", gold:"#f5c842", goldGlow:"#f5c84218",
  red:"#ff4c6a", orange:"#ff6b35", text:"#eef0ff", sub:"#8890b8",
  muted:"#4a5080", linkedIn:"#0A66C2",
};

const SECTORS = ["All Sectors","Finance","Technology","AI & ML","Energy","Healthcare","Real Estate","Policy & Gov","VC & PE"];
const SEEKING_OPTIONS = ["Investors","Talent","Partners","Enterprise clients","Founders","Just exploring"];
const SEEKING_FILTERS = ["All", ...SEEKING_OPTIONS];
const SECTOR_FILTERS  = ["All", ...SECTORS.slice(1)];

// ─── SHARED UI ────────────────────────────────────────────────────────────────
const Tag = ({label,color=C.accent,bg=C.accentSoft}) => (
  <span style={{background:bg,border:`1px solid ${color}33`,borderRadius:20,padding:"3px 10px",fontSize:11,color,fontWeight:600,whiteSpace:"nowrap"}}>{label}</span>
);

function ProximLogo({size=20}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      <svg width={size*1.7} height={size*1.7} viewBox="0 0 40 40" fill="none">
        <path d="M4 20 A16 16 0 0 1 36 20" stroke={C.accent} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.35"/>
        <path d="M9 20 A11 11 0 0 1 31 20" stroke={C.accent} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.65"/>
        <path d="M14 20 A6 6 0 0 1 26 20" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" fill="none"/>
        <circle cx="20" cy="20" r="3" fill={C.accent}/>
        <line x1="20" y1="17" x2="20" y2="31" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.3"/>
      </svg>
      <div>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:size,letterSpacing:-0.5,color:C.text,lineHeight:1}}>PROX<span style={{color:C.accent}}>IM</span></div>
        <div style={{fontFamily:"'Syne Mono',monospace",fontSize:8,color:C.muted,letterSpacing:2}}>MEET WITH PRECISION</div>
      </div>
    </div>
  );
}

const inputStyle = {width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 13px",fontSize:14,color:C.text,outline:"none",fontFamily:"inherit"};
const primaryBtn = {width:"100%",background:`linear-gradient(135deg,${C.accent},#7c5fff)`,border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"};

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function useAuth() {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | signed-out | signed-in
  const [health, setHealth] = useState(null);
  const [popupError, setPopupError] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get("/api/auth/me");
      if (data.authenticated) { setUser(data.user); setStatus("signed-in"); }
      else { setUser(null); setStatus("signed-out"); }
    } catch {
      setUser(null); setStatus("signed-out");
    }
  }, []);

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(setHealth).catch(() => setHealth({ ok:false }));
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handler = e => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "PROXIM_LINKEDIN_SUCCESS") { setConnecting(false); refresh(); }
      if (e.data?.type === "PROXIM_LINKEDIN_ERROR") { setConnecting(false); setPopupError(e.data.message || "Sign-in failed."); }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [refresh]);

  const login = useCallback(async () => {
    setPopupError(null);
    setConnecting(true);
    try {
      const { authUrl } = await api.get("/api/auth/linkedin");
      const popup = window.open(authUrl, "linkedin-oauth", "width=600,height=700,scrollbars=yes,top=100,left=200");
      if (!popup) { setConnecting(false); setPopupError("Your browser blocked the sign-in popup. Allow popups for this site and try again."); return; }
      const check = setInterval(() => { if (popup.closed) { clearInterval(check); setConnecting(false); } }, 500);
    } catch (e) {
      setConnecting(false);
      setPopupError(e instanceof ApiError && e.status === 503 ? e.message : "Could not start LinkedIn sign-in.");
    }
  }, []);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => {});
    setUser(null); setStatus("signed-out");
  }, []);

  const updateProfile = useCallback(async patch => {
    const { user: updated } = await api.patch("/api/me", patch);
    setUser(updated);
    return updated;
  }, []);

  return { user, status, health, connecting, popupError, login, logout, updateProfile, refresh };
}

// ─── LINKEDIN MODAL ───────────────────────────────────────────────────────────
function LinkedInModal({ onClose, auth }) {
  const { user, connecting, popupError, login, health } = auth;
  const linkedInReady = health?.linkedInConfigured;

  return (
    <div style={{position:"fixed",inset:0,background:"#000b",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={!connecting?onClose:undefined}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:24,padding:28,width:"100%",maxWidth:400}} onClick={e=>e.stopPropagation()}>
        {user ? <>
          <div style={{textAlign:"center",padding:"8px 0 20px"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>Connected</div>
            <div style={{color:C.sub,fontSize:14,lineHeight:1.6}}>Signed in as {user.name}.</div>
          </div>
          <button onClick={onClose} style={primaryBtn}>Go to PROXIM →</button>
        </> : <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{width:46,height:46,borderRadius:12,background:C.linkedIn,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,color:"#fff"}}>in</div>
            <div>
              <div style={{fontWeight:800,fontSize:17}}>Sign in with LinkedIn</div>
              <div style={{color:C.sub,fontSize:13}}>Your PROXIM identity</div>
            </div>
          </div>
          <div style={{background:C.card,borderRadius:12,padding:16,marginBottom:18,fontSize:13,color:C.sub,lineHeight:1.65}}>
            PROXIM imports your <span style={{color:C.text}}>name, photo, and email</span> from LinkedIn.
            LinkedIn's sign-in does not share your role, company, or skills — you'll add those yourself next.
          </div>
          {popupError && <div style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:10,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:14}}>{popupError}</div>}
          {health && !linkedInReady && (
            <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.orange,marginBottom:14}}>
              ⚠️ LinkedIn sign-in isn't configured on this deployment yet.
            </div>
          )}
          <button onClick={login} disabled={connecting || !linkedInReady} style={{...primaryBtn, background:C.linkedIn, opacity:(connecting||!linkedInReady)?0.6:1, cursor:(connecting||!linkedInReady)?"not-allowed":"pointer", display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            {connecting ? "Waiting for LinkedIn…" : "Continue with LinkedIn"}
          </button>
          <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:C.muted,cursor:"pointer",marginTop:10,fontSize:13,padding:"8px 0",fontFamily:"inherit"}}>Not now</button>
        </>}
      </div>
    </div>
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingForm({ user, onSave }) {
  const [role, setRole] = useState(user.role || "");
  const [company, setCompany] = useState(user.company || "");
  const [sector, setSector] = useState(user.sector || SECTORS[1]);
  const [seeking, setSeeking] = useState(user.seeking || SEEKING_OPTIONS[0]);
  const [bio, setBio] = useState(user.bio || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const canSave = role.trim() && company.trim();

  const submit = async () => {
    setSaving(true); setError(null);
    try { await onSave({ role: role.trim(), company: company.trim(), sector, seeking, bio: bio.trim() }); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:20}}>
      <div style={{fontWeight:800,fontSize:16,marginBottom:4}}>Complete your profile</div>
      <div style={{color:C.sub,fontSize:13,marginBottom:16,lineHeight:1.5}}>LinkedIn doesn't share this — fill it in so people can find you at events.</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <input value={role} onChange={e=>setRole(e.target.value)} placeholder="Your role, e.g. Founder & CEO" style={inputStyle} maxLength={120}/>
        <input value={company} onChange={e=>setCompany(e.target.value)} placeholder="Company" style={inputStyle} maxLength={120}/>
        <select value={sector} onChange={e=>setSector(e.target.value)} style={inputStyle}>
          {SECTORS.slice(1).map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={seeking} onChange={e=>setSeeking(e.target.value)} style={inputStyle}>
          {SEEKING_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="One line about what you do (optional)" maxLength={280} rows={2} style={{...inputStyle, resize:"vertical", fontFamily:"inherit"}}/>
      </div>
      {error && <div style={{color:C.red,fontSize:12,marginTop:10}}>{error}</div>}
      <button onClick={submit} disabled={!canSave || saving} style={{...primaryBtn, marginTop:14, opacity:(!canSave||saving)?0.6:1, cursor:(!canSave||saving)?"not-allowed":"pointer"}}>
        {saving ? "Saving…" : "Save profile"}
      </button>
    </div>
  );
}

// ─── RADAR (SVG) ──────────────────────────────────────────────────────────────
// Distances beyond RADAR_RANGE_M are drawn at the ring's edge, not to scale —
// the label still shows the real distance. This keeps close-by people legible
// without pretending the radar is a precise map.
const RADAR_RANGE_M = 200;

function Radar({ people, onSelect, highlightedId, deviceHeading }) {
  const S=280, CENTER=S/2, maxR=CENTER-28;
  // Rotate the whole field so "up" is the direction the phone is facing, when
  // we know it; otherwise "up" is true north (a north-up radar, clearly labeled).
  const rotation = deviceHeading != null ? -deviceHeading : 0;
  return (
    <div style={{display:"flex",justifyContent:"center"}}>
      <svg width={S} height={S}>
        <defs>
          <radialGradient id="rg"><stop offset="0%" stopColor="#4f6ef722"/><stop offset="100%" stopColor={C.bg} stopOpacity="0"/></radialGradient>
          <style>{`@keyframes sweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes rp{0%{r:14;opacity:.7}100%{r:28;opacity:0}} .sw{transform-origin:${CENTER}px ${CENTER}px;animation:sweep 4s linear infinite} .rp{animation:rp 1.5s ease-out infinite}`}</style>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={CENTER-2} fill={C.surface} stroke={C.border} strokeWidth={1}/>
        <circle cx={CENTER} cy={CENTER} r={CENTER-2} fill="url(#rg)"/>
        {[.33,.66,1].map((r,i)=><circle key={i} cx={CENTER} cy={CENTER} r={maxR*r} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="4 8" opacity={.5}/>)}
        <line className="sw" x1={CENTER} y1={CENTER} x2={S-14} y2={CENTER} stroke={C.accent} strokeWidth={2} opacity={.4}/>
        <g style={{transform:`rotate(${rotation}deg)`,transformOrigin:`${CENTER}px ${CENTER}px`,transition:"transform 0.4s ease"}}>
          <text x={CENTER} y={16} textAnchor="middle" fontSize={9} fill={C.green} fontWeight="700" style={{transform:`rotate(${-rotation}deg)`,transformOrigin:`${CENTER}px 16px`}}>N</text>
          {people.map(p => {
            const rad = ((p.bearingDeg - 90) * Math.PI) / 180;
            const r = Math.min((p.distanceM / RADAR_RANGE_M) * maxR, maxR);
            const x = CENTER + r*Math.cos(rad), y = CENTER + r*Math.sin(rad);
            const hi = highlightedId === p.id;
            const initials = p.name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
            return (
              <g key={p.id} onClick={()=>onSelect(p)} style={{cursor:"pointer"}}>
                {hi && <circle className="rp" cx={x} cy={y} r={14} fill={C.accentGlow}/>}
                <g style={{transform:`rotate(${-rotation}deg)`,transformOrigin:`${x}px ${y}px`}}>
                  <circle cx={x} cy={y} r={15} fill={hi?C.accent:C.card} stroke={hi?C.accent:C.border} strokeWidth={2}/>
                  <text x={x} y={y+4} textAnchor="middle" fontSize={8} fill={C.text} fontWeight="700">{initials}</text>
                </g>
              </g>
            );
          })}
        </g>
        <circle cx={CENTER} cy={CENTER} r={11} fill={C.green}/>
        <text x={CENTER} y={CENTER+4} textAnchor="middle" fontSize={7} fill="#000" fontWeight="900">YOU</text>
      </svg>
    </div>
  );
}

// ─── COMPASS NAVIGATION ───────────────────────────────────────────────────────
function NavigationScreen({ eventId, target, onBack }) {
  const radarState = useLiveRadar(eventId, true, { intervalMs: 4000 });
  const heading = useDeviceHeading();
  const live = radarState.radar.find(p => p.id === target.id);

  useEffect(() => {
    if (!heading.needsPermission) return; // already started automatically
    heading.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bearingToTarget = live?.distanceM === 0 ? 0 : live?.bearingDeg;
  const arrowAngle = heading.heading != null && bearingToTarget != null ? bearingToTarget - heading.heading - 90 : (bearingToTarget ?? 0) - 90;
  const arrived = live && live.distanceM < 8;

  return (
    <div style={{display:"flex",flexDirection:"column",padding:"20px 20px 0",minHeight:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{fontFamily:"'Syne Mono',monospace",fontSize:10,color:C.muted,letterSpacing:2}}>PROXIM NAVIGATION</div>
      </div>
      <div style={{background:C.card,borderRadius:16,padding:18,marginBottom:20,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
        <Avatar name={target.name} photo={target.photo} size={50}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15}}>{target.name}</div>
          <div style={{color:C.sub,fontSize:13}}>{target.role} · {target.company}</div>
        </div>
        <div style={{background:C.accentGlow,border:`1px solid ${C.accent}`,borderRadius:20,padding:"4px 10px",fontSize:11,color:C.accent,fontFamily:"'Syne Mono',monospace"}}>{live ? "EN ROUTE" : "OUT OF RANGE"}</div>
      </div>

      {!live && radarState.status === "active" && (
        <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.orange,marginBottom:16}}>
          {target.name.split(" ")[0]} isn't showing on the radar right now — they may have stepped away, turned off location sharing, or moved out of GPS range.
        </div>
      )}
      {radarState.status === "error" && (
        <div style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red,marginBottom:16}}>{radarState.error}</div>
      )}

      <div style={{position:"relative",width:240,height:240,margin:"0 auto 24px"}}>
        <svg width={240} height={240} style={{position:"absolute"}}>
          <defs><radialGradient id="cg"><stop offset="0%" stopColor={C.surface}/><stop offset="100%" stopColor={C.bg}/></radialGradient></defs>
          <circle cx={120} cy={120} r={118} fill="url(#cg)" stroke={C.border} strokeWidth={1.5}/>
          {[0,45,90,135,180,225,270,315].map(deg=>{const r2=deg%90===0?96:104;const rad=(deg-90)*Math.PI/180;return <line key={deg} x1={120+113*Math.cos(rad)} y1={120+113*Math.sin(rad)} x2={120+r2*Math.cos(rad)} y2={120+r2*Math.sin(rad)} stroke={C.border} strokeWidth={deg%90===0?2:1}/>;  })}
          {["N","E","S","W"].map((d,i)=>{
            const worldRad=(i*90-90)*Math.PI/180;
            const screenDeg = heading.heading != null ? (i*90) - heading.heading - 90 : (i*90) - 90;
            const rad = (screenDeg)*Math.PI/180;
            return <text key={d} x={120+82*Math.cos(rad)} y={120+82*Math.sin(rad)+4} textAnchor="middle" fontSize={13} fill={d==="N"?C.green:C.muted} fontWeight="700">{d}</text>;
          })}
        </svg>
        {live && (
          <div style={{position:"absolute",inset:0,transform:`rotate(${arrowAngle}deg)`,transformOrigin:"50% 50%",transition:"transform 0.5s ease"}}>
            <svg width={240} height={240}>
              <polygon points="120,26 135,86 120,74 105,86" fill={arrived?C.green:C.accent}/>
              <polygon points="120,214 135,154 120,166 105,154" fill={C.border}/>
            </svg>
          </div>
        )}
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
          <div style={{fontFamily:"'Syne Mono',monospace",fontSize:live?30:20,fontWeight:700,color:arrived?C.green:C.text,lineHeight:1}}>
            {!live ? "—" : arrived ? "👋" : `${live.distanceM}m`}
          </div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{live ? (arrived?"ARRIVED!":"away") : "no signal"}</div>
        </div>
      </div>

      {heading.status !== "active" && (
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:13,color:C.sub,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <span>{heading.status === "denied" ? "Compass permission denied — showing north-up instead." : "Compass unavailable on this device — showing north-up instead."}</span>
          {heading.needsPermission && heading.status !== "denied" && (
            <button onClick={heading.request} style={{background:C.accent,border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>Enable</button>
          )}
        </div>
      )}

      {live && (
        <div style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.border}`,marginBottom:14}}>
          <div style={{textAlign:"center",fontSize:13,color:arrived?C.green:C.sub}}>
            {arrived ? "You've arrived — say hi! 🤝" : live.distanceM<20 ? "Almost there, look around!" : "Keep walking in the arrow direction"}
          </div>
          {live.accuracyM != null && live.accuracyM > 25 && (
            <div style={{textAlign:"center",fontSize:11,color:C.muted,marginTop:8}}>GPS accuracy is about ±{Math.round(live.accuracyM)}m right now — distance may be approximate.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ name, photo, size=44 }) {
  const initials = (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  if (photo) return <img src={photo} alt={name} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}}/>;
  return <div style={{width:size,height:size,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:size*0.32,flexShrink:0}}>{initials}</div>;
}

// ─── PERSON SHEET ─────────────────────────────────────────────────────────────
function PersonSheet({ person, onClose, onNavigate, canNavigate }) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:"22px 22px 0 0",padding:24,width:"100%",maxWidth:480,border:`1px solid ${C.border}`,paddingBottom:36}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:C.border,borderRadius:99,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:18}}>
          <Avatar name={person.name} photo={person.photo} size={60}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:18}}>{person.name}</div>
            <div style={{color:C.sub,fontSize:13}}>{person.role}</div>
            <div style={{color:C.accent,fontSize:13,fontWeight:600}}>{person.company}</div>
          </div>
          {person.distanceM != null && (
            <div style={{textAlign:"right"}}>
              <div style={{fontFamily:"'Syne Mono',monospace",fontSize:22,fontWeight:700,color:C.green}}>{person.distanceM}m</div>
              <div style={{fontSize:10,color:C.muted}}>away now</div>
            </div>
          )}
        </div>
        {person.sector && <div style={{marginBottom:14}}><Tag label={person.sector}/></div>}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:6,fontFamily:"'Syne Mono',monospace"}}>SEEKING</div>
          <div style={{fontSize:14,color:C.text}}>{person.seeking || "Not specified"}</div>
        </div>
        {canNavigate && person.distanceM != null ? (
          <button onClick={()=>onNavigate(person)} style={primaryBtn}>🧭 Navigate to {person.name.split(" ")[0]}</button>
        ) : (
          <div style={{textAlign:"center",fontSize:12,color:C.muted,padding:"10px 0"}}>
            {person.distanceM == null ? "Turn on location sharing to navigate to people on the radar." : "Enable location sharing to navigate."}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EVENT CARD ───────────────────────────────────────────────────────────────
function EventCard({ event, onSelect, rsvpd, onRsvp }) {
  return (
    <div onClick={()=>onSelect(event)} style={{background:C.card,border:`1px solid ${event.featured?C.accent+"55":C.border}`,borderRadius:18,padding:18,marginBottom:14,cursor:"pointer",position:"relative",overflow:"hidden"}}>
      {event.featured&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${C.accent},#a78bfa)`}}/>}
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <div style={{width:50,height:50,borderRadius:14,background:C.surface,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{event.image}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            {event.featured&&<Tag label="FEATURED" color={C.gold} bg={C.goldGlow}/>}
            {event.aiSourced&&<Tag label="AI-SUGGESTED" color={C.sub} bg="transparent"/>}
            <Tag label={event.sector}/>
          </div>
          <div style={{fontWeight:800,fontSize:15,marginBottom:3,lineHeight:1.3}}>{event.name}</div>
          <div style={{color:C.sub,fontSize:12,marginBottom:6}}>📅 {event.date} · 📍 {event.city}, {event.country}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{event.tags.slice(0,3).map(t=><Tag key={t} label={`#${t}`} color={C.sub} bg="transparent"/>)}</div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:12,color:C.muted}}><span style={{color:C.text,fontWeight:700}}>{event.attendees}</span> expected</div>
        <button onClick={e=>{e.stopPropagation();onRsvp(event.id);}} style={{borderRadius:10,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${rsvpd?C.green:"transparent"}`,background:rsvpd?C.greenGlow:`linear-gradient(135deg,${C.accent},#7c5fff)`,color:rsvpd?C.green:"#fff",transition:"all .2s",fontFamily:"inherit"}}>
          {rsvpd?"✓ Attending":"RSVP"}
        </button>
      </div>
    </div>
  );
}

// ─── EVENT DETAIL ─────────────────────────────────────────────────────────────
function EventDetail({ event, rsvpd, onRsvp, onBack, onCheckIn, isCheckedIn, presence }) {
  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"0 16px 16px",display:"flex",alignItems:"center",gap:12,borderBottom:`1px solid ${C.border}`}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:13}}>←</button>
        <div style={{fontWeight:800,fontSize:16,flex:1,lineHeight:1.2}}>{event.name}</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px 0"}}>
        <div style={{background:C.card,borderRadius:16,padding:20,marginBottom:16,border:`1px solid ${C.border}`,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>{event.image}</div>
          <div style={{color:C.sub,fontSize:13,marginBottom:2}}>📅 {event.date}</div>
          <div style={{color:C.sub,fontSize:13,marginBottom:14}}>📍 {event.venue}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center",marginBottom:16}}>{event.tags.map(t=><Tag key={t} label={`#${t}`}/>)}</div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>onRsvp(event.id)} style={{flex:1,borderRadius:12,padding:13,fontSize:13,fontWeight:700,cursor:"pointer",border:`1px solid ${rsvpd?C.green:"transparent"}`,background:rsvpd?C.greenGlow:`linear-gradient(135deg,${C.accent},#7c5fff)`,color:rsvpd?C.green:"#fff",fontFamily:"inherit"}}>
              {rsvpd?"✓ Attending":"RSVP — I'm Going"}
            </button>
            <button onClick={onCheckIn} style={{flex:1,borderRadius:12,padding:13,fontSize:13,fontWeight:700,cursor:"pointer",border:`1px solid ${C.green}`,background:isCheckedIn?C.green:C.greenGlow,color:isCheckedIn?"#000":C.green,fontFamily:"inherit"}}>
              {isCheckedIn ? "📡 Checked In" : "📡 Check In"}
            </button>
          </div>
        </div>
        <div style={{background:C.card,borderRadius:14,padding:18,border:`1px solid ${C.border}`,fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:20}}>
          {event.description}
          <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {[["Organizer",event.organizer],["Sector",event.sector],["Expected",`${event.attendees} pax`],["Checked in now",isCheckedIn ? `${presence.length+1} (incl. you)` : `${presence.length}`]].map(([k,v])=>(
              <div key={k}><div style={{fontSize:10,color:C.muted,letterSpacing:1}}>{k.toUpperCase()}</div><div style={{color:C.text,fontWeight:600,marginTop:2}}>{v}</div></div>
            ))}
          </div>
        </div>
        {!isCheckedIn && (
          <div style={{textAlign:"center",padding:"20px 20px 40px",color:C.muted,fontSize:13}}>Check in to see who else is here right now.</div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ProximV3() {
  const auth = useAuth();
  const [screen, setScreen] = useState("events");
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState(null);
  const [rsvpIds, setRsvpIds] = useState(new Set());
  const [checkedIn, setCheckedIn] = useState(null); // { event, checkedInAt, shareLocation } | null
  const [checkinLoaded, setCheckinLoaded] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [navTarget, setNavTarget] = useState(null);
  const [showLinkedIn, setShowLinkedIn] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [sectorEvFilter, setSectorEvFilter] = useState("All Sectors");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [seekingFilter, setSeekingFilter] = useState("All");

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState("");
  const [aiSugLoading, setAiSugLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try { const { events } = await api.get("/api/events"); setEvents(events); setEventsError(null); }
    catch (e) { setEventsError(e.message); }
    setEventsLoading(false);
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (auth.status !== "signed-in") { setRsvpIds(new Set()); setCheckedIn(null); setCheckinLoaded(false); return; }
    api.get("/api/me/rsvps").then(({ eventIds }) => setRsvpIds(new Set(eventIds))).catch(() => {});
    api.get("/api/me/checkin").then(({ checkedIn }) => {
      setCheckedIn(checkedIn ? { event: checkedIn.event, checkedInAt: checkedIn.checkedInAt, shareLocation: checkedIn.shareLocation } : null);
      setCheckinLoaded(true);
    }).catch(() => setCheckinLoaded(true));
  }, [auth.status]);

  useHeartbeat(checkedIn?.event?.id, Boolean(checkedIn));
  const presence = usePresence(checkedIn?.event?.id);
  const radarState = useLiveRadar(checkedIn?.event?.id, Boolean(checkedIn?.shareLocation));

  const requireSignedIn = () => {
    if (auth.status === "signed-in") return true;
    setShowLinkedIn(true);
    return false;
  };

  const handleRsvp = async eventId => {
    if (!requireSignedIn()) return;
    try {
      const { rsvped } = await api.post(`/api/events/${eventId}/rsvp`);
      setRsvpIds(prev => { const n = new Set(prev); rsvped ? n.add(eventId) : n.delete(eventId); return n; });
    } catch (e) { console.error(e); }
  };

  const handleCheckIn = async event => {
    if (!requireSignedIn()) return;
    if (!auth.user.onboarded) { setScreen("profile"); return; }
    try {
      await api.post(`/api/events/${event.id}/checkin`, { shareLocation: checkedIn?.event?.id === event.id ? checkedIn.shareLocation : false });
      setCheckedIn({ event, checkedInAt: new Date().toISOString(), shareLocation: checkedIn?.event?.id === event.id ? checkedIn.shareLocation : false });
      setSelectedEvent(null);
      setScreen("radar");
    } catch (e) { console.error(e); }
  };

  const handleCheckOut = async () => {
    if (!checkedIn) return;
    try { await api.post(`/api/events/${checkedIn.event.id}/checkout`); } catch (e) { console.error(e); }
    setCheckedIn(null);
  };

  const toggleShareLocation = async () => {
    if (!checkedIn) return;
    const next = !checkedIn.shareLocation;
    setCheckedIn(c => ({ ...c, shareLocation: next }));
    try { await api.post(`/api/events/${checkedIn.event.id}/checkin`, { shareLocation: next }); }
    catch (e) { console.error(e); setCheckedIn(c => ({ ...c, shareLocation: !next })); }
  };

  const handleAIEvents = async () => {
    setAiError("");
    if (!requireSignedIn()) return;
    setAiLoading(true);
    try {
      await api.post("/api/events/ai", { sector: sectorEvFilter, region: "All Regions", query: searchQuery });
      await loadEvents();
    } catch (e) { setAiError(e.message); }
    setAiLoading(false);
  };

  const handleAISuggest = async () => {
    setAiSuggestion("");
    if (!checkedIn) return;
    setAiSugLoading(true);
    try { const { suggestion } = await api.post("/api/ai/suggest", { eventId: checkedIn.event.id }); setAiSuggestion(suggestion); }
    catch (e) { setAiSuggestion(e.message); }
    setAiSugLoading(false);
  };

  const filteredEvents = useMemo(() => events.filter(ev => {
    const q = searchQuery.toLowerCase();
    return (!q || ev.name.toLowerCase().includes(q) || ev.tags.some(t=>t.toLowerCase().includes(q)) || ev.city.toLowerCase().includes(q))
      && (sectorEvFilter === "All Sectors" || ev.sector === sectorEvFilter);
  }), [events, searchQuery, sectorEvFilter]);

  const filteredPresence = useMemo(() => presence.people.filter(p =>
    (sectorFilter === "All" || p.sector === sectorFilter) && (seekingFilter === "All" || p.seeking === seekingFilter)
  ), [presence.people, sectorFilter, seekingFilter]);

  const radarPeople = useMemo(() => radarState.radar.filter(p =>
    (sectorFilter === "All" || p.sector === sectorFilter) && (seekingFilter === "All" || p.seeking === seekingFilter)
  ), [radarState.radar, sectorFilter, seekingFilter]);

  const myEvents = useMemo(() => events.filter(ev => rsvpIds.has(ev.id)), [events, rsvpIds]);

  if (navTarget) return (
    <Shell auth={auth} onLinkedIn={()=>setShowLinkedIn(true)} checkedIn={checkedIn}>
      {showLinkedIn && <LinkedInModal onClose={()=>setShowLinkedIn(false)} auth={auth}/>}
      <div style={{overflowY:"auto",flex:1}}>
        <NavigationScreen eventId={checkedIn.event.id} target={navTarget} onBack={()=>setNavTarget(null)}/>
      </div>
    </Shell>
  );

  if (selectedEvent) return (
    <Shell auth={auth} onLinkedIn={()=>setShowLinkedIn(true)} checkedIn={checkedIn}>
      {showLinkedIn && <LinkedInModal onClose={()=>setShowLinkedIn(false)} auth={auth}/>}
      <EventDetail
        event={selectedEvent} rsvpd={rsvpIds.has(selectedEvent.id)} onRsvp={handleRsvp}
        onBack={()=>setSelectedEvent(null)} onCheckIn={()=>handleCheckIn(selectedEvent)}
        isCheckedIn={checkedIn?.event?.id === selectedEvent.id}
        presence={checkedIn?.event?.id === selectedEvent.id ? presence.people : []}
      />
    </Shell>
  );

  return (
    <Shell auth={auth} onLinkedIn={()=>setShowLinkedIn(true)} checkedIn={checkedIn} screen={screen} setScreen={setScreen}>
      {showLinkedIn && <LinkedInModal onClose={()=>setShowLinkedIn(false)} auth={auth}/>}
      {selectedPerson && (
        <PersonSheet person={selectedPerson} onClose={()=>setSelectedPerson(null)}
          canNavigate={Boolean(checkedIn?.shareLocation)}
          onNavigate={p=>{setSelectedPerson(null);setNavTarget(p);}}/>
      )}

      <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>

        {screen==="events" && <div style={{paddingBottom:20}}>
          <div style={{marginBottom:14}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted}}>🔍</span>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search events, cities, topics..." style={{...inputStyle, padding:"13px 14px 13px 40px"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:4}}>
            <select value={sectorEvFilter} onChange={e=>setSectorEvFilter(e.target.value)} style={{background:sectorEvFilter!=="All Sectors"?C.accentGlow:C.card,border:`1px solid ${sectorEvFilter!=="All Sectors"?C.accent:C.border}`,color:sectorEvFilter!=="All Sectors"?C.accent:C.sub,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:600,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
              {SECTORS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          {auth.health && !auth.health.aiConfigured ? null : (
            <button onClick={handleAIEvents} disabled={aiLoading} style={{width:"100%",marginBottom:14,background:aiLoading?C.card:`linear-gradient(135deg,${C.accent}cc,#7c5fff)`,border:`1px solid ${aiLoading?C.border:C.accent+"44"}`,borderRadius:12,padding:"12px",fontSize:13,fontWeight:700,color:aiLoading?C.muted:"#fff",cursor:aiLoading?"not-allowed":"pointer",fontFamily:"inherit"}}>
              {aiLoading?"⏳ Searching events...":"✨ AI: Find more events matching filters"}
            </button>
          )}
          {aiError && <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"11px 14px",fontSize:12,color:C.orange,marginBottom:14}}>{aiError}</div>}
          {eventsError && (
            <div style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red,marginBottom:14}}>
              Couldn't load events: {eventsError}
              <button onClick={loadEvents} style={{display:"block",marginTop:8,background:"none",border:`1px solid ${C.red}66`,color:C.red,borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>Retry</button>
            </div>
          )}
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{eventsLoading ? "Loading events…" : `${filteredEvents.length} events`}</div>
          {filteredEvents.map(ev=><EventCard key={ev.id} event={ev} onSelect={setSelectedEvent} rsvpd={rsvpIds.has(ev.id)} onRsvp={handleRsvp}/>)}
          {!eventsLoading && !eventsError && filteredEvents.length===0 && <div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}>No events match these filters.</div>}
        </div>}

        {screen==="radar" && <div style={{paddingBottom:20}}>
          {!checkinLoaded && auth.status==="signed-in" ? (
            <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>Loading…</div>
          ) : checkedIn ? <>
            <div style={{background:C.greenGlow,border:`1px solid ${C.green}44`,borderRadius:16,padding:14,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:1.5}}>📡 CHECKED IN</div>
                  <div style={{fontWeight:800,fontSize:16,marginTop:2}}>{checkedIn.event.name}</div>
                  <div style={{color:C.sub,fontSize:12}}>{checkedIn.event.venue}</div>
                </div>
                <button onClick={handleCheckOut} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Check out</button>
              </div>
            </div>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:14,marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{fontSize:13,fontWeight:600}}>Share my live location</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>Shows your GPS distance and bearing to others here. Off by default.</div>
              </div>
              <button onClick={toggleShareLocation} style={{width:46,height:26,borderRadius:99,border:"none",cursor:"pointer",background:checkedIn.shareLocation?C.green:C.border,position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",top:3,left:checkedIn.shareLocation?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
              </button>
            </div>

            {checkedIn.shareLocation ? <>
              {radarState.status==="error" && <div style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red,marginBottom:14}}>{radarState.error}</div>}
              {radarState.accuracyM != null && radarState.accuracyM > 30 && (
                <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"11px 14px",fontSize:12,color:C.orange,marginBottom:14}}>
                  ⚠️ GPS accuracy is about ±{Math.round(radarState.accuracyM)}m — indoors, distances can be off by tens of meters.
                </div>
              )}
              <Radar people={radarPeople} onSelect={setSelectedPerson} highlightedId={selectedPerson?.id}/>
            </> : (
              <div style={{textAlign:"center",padding:"30px 20px",color:C.muted,fontSize:13}}>Turn on location sharing to see the live radar.</div>
            )}

            <div style={{display:"flex",gap:8,margin:"14px 0",overflowX:"auto",paddingBottom:4}}>
              {SECTOR_FILTERS.map(f=>(
                <button key={f} onClick={()=>setSectorFilter(f)} style={{borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",border:`1px solid ${sectorFilter===f?C.accent:C.border}`,background:sectorFilter===f?C.accentGlow:"transparent",color:sectorFilter===f?C.accent:C.sub,fontFamily:"inherit"}}>{f}</button>
              ))}
            </div>

            {auth.health?.aiConfigured && <>
              <button onClick={handleAISuggest} disabled={aiSugLoading} style={{width:"100%",background:aiSugLoading?C.card:`linear-gradient(135deg,${C.orange}cc,${C.red}cc)`,border:`1px solid ${aiSugLoading?C.border:C.orange+"44"}`,borderRadius:12,padding:"13px",fontSize:13,fontWeight:700,color:aiSugLoading?C.muted:"#fff",cursor:aiSugLoading?"not-allowed":"pointer",marginBottom:12,fontFamily:"inherit"}}>
                {aiSugLoading?"🤖 Analysing room...":"✨ AI: Who should I meet right now?"}
              </button>
              {aiSuggestion && <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:16,fontSize:14,color:C.text,lineHeight:1.65,marginBottom:14,whiteSpace:"pre-wrap"}}>{aiSuggestion}</div>}
            </>}

            <div style={{fontSize:12,color:C.muted,marginBottom:10}}>{presence.people.length} {presence.people.length===1?"person":"people"} checked in</div>
            {filteredPresence.map(p=>{
              const withDist = radarPeople.find(r=>r.id===p.id);
              return (
                <div key={p.id} onClick={()=>setSelectedPerson(withDist||p)} style={{background:C.card,border:`1px solid ${selectedPerson?.id===p.id?C.accent:C.border}`,borderRadius:14,padding:14,marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                  <Avatar name={p.name} photo={p.photo} size={42}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
                    <div style={{color:C.sub,fontSize:12}}>{p.role} · {p.company}</div>
                  </div>
                  {withDist ? <div style={{fontFamily:"'Syne Mono',monospace",fontSize:16,fontWeight:700,color:C.green}}>{withDist.distanceM}m</div>
                    : <div style={{fontSize:11,color:C.muted}}>in the room</div>}
                </div>
              );
            })}
          </> : (
            <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
              <div style={{fontSize:36,marginBottom:12}}>📡</div>
              <div style={{fontSize:15,marginBottom:6}}>Not checked in yet</div>
              <div style={{fontSize:13,marginBottom:18}}>Open an event and tap Check In to go live</div>
              {myEvents.length>0 && (
                <button onClick={()=>handleCheckIn(myEvents[0])} style={{...primaryBtn, width:"auto", padding:"10px 20px", fontSize:13}}>Check in to {myEvents[0].name}</button>
              )}
            </div>
          )}
        </div>}

        {screen==="people" && <div style={{paddingBottom:20}}>
          {!checkedIn ? (
            <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>👥</div>
              <div style={{fontSize:15,marginBottom:6}}>Check in to an event to see who's there</div>
              <div style={{fontSize:13}}>The People list is scoped to your current event, not a public directory.</div>
            </div>
          ) : <>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:8,fontFamily:"'Syne Mono',monospace"}}>FILTER BY SECTOR</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
                {SECTOR_FILTERS.map(f=>(
                  <button key={f} onClick={()=>setSectorFilter(f)} style={{borderRadius:20,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${sectorFilter===f?C.accent:C.border}`,background:sectorFilter===f?C.accentGlow:"transparent",color:sectorFilter===f?C.accent:C.sub,fontFamily:"inherit"}}>{f}</button>
                ))}
              </div>
              <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:8,fontFamily:"'Syne Mono',monospace"}}>SEEKING</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {SEEKING_FILTERS.map(f=>(
                  <button key={f} onClick={()=>setSeekingFilter(f)} style={{borderRadius:20,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:`1px solid ${seekingFilter===f?C.green:C.border}`,background:seekingFilter===f?C.greenGlow:"transparent",color:seekingFilter===f?C.green:C.sub,fontFamily:"inherit"}}>{f}</button>
                ))}
              </div>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{filteredPresence.length} people match, at {checkedIn.event.name}</div>
            {filteredPresence.map(p=>{
              const withDist = radarPeople.find(r=>r.id===p.id);
              return (
                <div key={p.id} onClick={()=>setSelectedPerson(withDist||p)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:16,marginBottom:12,cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                    <Avatar name={p.name} photo={p.photo}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15}}>{p.name}</div>
                      <div style={{color:C.sub,fontSize:13}}>{p.role} · {p.company}</div>
                    </div>
                    {withDist && <div style={{textAlign:"right"}}><div style={{fontFamily:"'Syne Mono',monospace",fontSize:18,fontWeight:700,color:C.green}}>{withDist.distanceM}m</div><div style={{fontSize:10,color:C.muted}}>away</div></div>}
                  </div>
                  {p.sector && <div style={{marginBottom:8}}><Tag label={p.sector}/></div>}
                  <div style={{fontSize:12,color:C.muted}}>Seeking: <span style={{color:C.text}}>{p.seeking||"Not specified"}</span></div>
                </div>
              );
            })}
            {filteredPresence.length===0 && <div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}>Nobody matches these filters right now.</div>}
          </>}
        </div>}

        {screen==="myevents" && <div style={{paddingBottom:20}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>My Events</div>
            <div style={{color:C.sub,fontSize:14}}>{rsvpIds.size} RSVPs · {checkedIn?"1 active":"no active"} check-in</div>
          </div>
          {auth.status !== "signed-in" && <div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}>Sign in to RSVP and check in to events.</div>}
          {checkedIn && (
            <div style={{background:C.greenGlow,border:`1px solid ${C.green}55`,borderRadius:16,padding:18,marginBottom:16}}>
              <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:1.5,marginBottom:6}}>📡 CHECKED IN NOW</div>
              <div style={{fontWeight:800,fontSize:16}}>{checkedIn.event.name}</div>
              <div style={{color:C.sub,fontSize:13,marginBottom:12}}>{checkedIn.event.venue}</div>
              <button onClick={()=>setScreen("radar")} style={{background:C.green,border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,color:"#000",cursor:"pointer",fontFamily:"inherit"}}>View Live Radar →</button>
            </div>
          )}
          {myEvents.map(ev=>(
            <div key={ev.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:18,marginBottom:12}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{fontSize:28}}>{ev.image}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:3}}>{ev.name}</div>
                  <div style={{color:C.sub,fontSize:12,marginBottom:8}}>📅 {ev.date} · 📍 {ev.city}</div>
                  <div style={{fontSize:12,color:C.green,fontWeight:600}}>✓ Attending</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <button onClick={()=>setSelectedEvent(ev)} style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:600,color:C.sub,cursor:"pointer",fontFamily:"inherit"}}>Details</button>
                <button onClick={()=>handleCheckIn(ev)} style={{flex:1,background:checkedIn?.event?.id===ev.id?C.green:`linear-gradient(135deg,${C.accent},#7c5fff)`,border:"none",borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,color:checkedIn?.event?.id===ev.id?"#000":"#fff",cursor:"pointer",fontFamily:"inherit"}}>
                  {checkedIn?.event?.id===ev.id ? "✓ Checked In" : "📡 Check In"}
                </button>
              </div>
            </div>
          ))}
          {auth.status==="signed-in" && rsvpIds.size===0 && <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:12}}>📅</div>No RSVPs yet. Browse events and hit RSVP!</div>}
        </div>}

        {screen==="profile" && <div style={{paddingBottom:20}}>
          {auth.status !== "signed-in" ? (
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24,textAlign:"center"}}>
              <div style={{width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:24,margin:"0 auto 14px"}}>👤</div>
              <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>Your Profile</div>
              <div style={{color:C.sub,fontSize:14,marginBottom:20}}>Sign in with LinkedIn to get started</div>
              <button onClick={()=>setShowLinkedIn(true)} style={{...primaryBtn, background:C.linkedIn, width:"auto", padding:"13px 24px", display:"inline-flex",alignItems:"center",gap:8}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                Connect LinkedIn
              </button>
            </div>
          ) : <>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24,marginBottom:16,textAlign:"center"}}>
              <div style={{margin:"0 auto 14px",width:72,height:72}}><Avatar name={auth.user.name} photo={auth.user.photo} size={72}/></div>
              <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>{auth.user.name}</div>
              {auth.user.role && <div style={{color:C.sub,fontSize:14,marginBottom:4}}>{auth.user.role} · {auth.user.company}</div>}
              <div style={{color:C.sub,fontSize:13,marginBottom:16}}>{auth.user.email}</div>
              <button onClick={auth.logout} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 24px",fontSize:13,color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>Sign out</button>
            </div>
            <OnboardingForm user={auth.user} onSave={auth.updateProfile}/>
          </>}
        </div>}

      </div>
    </Shell>
  );
}

// ─── SHELL ────────────────────────────────────────────────────────────────────
function Shell({ children, auth, onLinkedIn, checkedIn, screen, setScreen }) {
  return (
    <div style={{background:C.bg,color:C.text,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        select option{background:#13152a;color:#eef0ff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#2a2d55;border-radius:2px;}
        input::placeholder,textarea::placeholder{color:#4a5080;}
      `}</style>

      <div style={{padding:"16px 20px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <ProximLogo size={20}/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {checkedIn && (
            <div style={{display:"flex",alignItems:"center",gap:6,background:C.greenGlow,border:`1px solid ${C.green}44`,borderRadius:20,padding:"5px 10px",fontSize:10,color:C.green,fontFamily:"'Syne Mono',monospace"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:C.green}}/>LIVE
            </div>
          )}
          {!auth.user
            ? <button onClick={onLinkedIn} style={{background:C.linkedIn,border:"none",borderRadius:20,padding:"7px 13px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit"}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                Sign in
              </button>
            : <div onClick={()=>setScreen?.("profile")} style={{cursor:"pointer",border:`2px solid ${C.accent}`,borderRadius:"50%"}}><Avatar name={auth.user.name} photo={auth.user.photo} size={32}/></div>
          }
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>{children}</div>

      {setScreen && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",borderTop:`1px solid ${C.border}`,background:C.surface,flexShrink:0}}>
          {[["events","🌍","Discover"],["myevents","📅","My Events"],["radar","📡","Radar"],["people","👥","People"],["profile","👤","Profile"]].map(([id,icon,label])=>(
            <button key={id} onClick={()=>setScreen(id)} style={{background:"none",border:"none",padding:"12px 0 8px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <span style={{fontSize:18}}>{icon}</span>
              <span style={{fontSize:9,fontWeight:600,color:screen===id?C.accent:C.muted,fontFamily:"'DM Sans',sans-serif"}}>{label}</span>
              {screen===id&&<div style={{width:18,height:2,background:C.accent,borderRadius:99}}/>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
