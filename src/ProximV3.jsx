import { useState, useEffect, useCallback, useRef } from "react";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:"#07080f", surface:"#0e0f1c", card:"#13152a", border:"#1e2040",
  accent:"#4f6ef7", accentGlow:"#4f6ef722", accentSoft:"#4f6ef711",
  green:"#00d48a", greenGlow:"#00d48a18", gold:"#f5c842", goldGlow:"#f5c84218",
  red:"#ff4c6a", orange:"#ff6b35", text:"#eef0ff", sub:"#8890b8",
  muted:"#4a5080", linkedIn:"#0A66C2",
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const SECTORS = ["All Sectors","Finance","Technology","AI & ML","Energy","Healthcare","Real Estate","Policy & Gov","VC & PE"];
const REGIONS  = ["All Regions","Abu Dhabi","Dubai","Riyadh","London","Singapore","New York","Berlin","Lisbon"];
const SKILL_FILTERS   = ["All","FinTech","AI/ML","Venture Capital","E-Commerce","Investment","Policy"];
const SEEKING_FILTERS = ["All","Investors","Talent","Partners","Enterprise clients","Founders"];

const MOCK_EVENTS = [
  {id:1,name:"Middle East Economy Summit 2026",date:"May 21–23, 2026",city:"Abu Dhabi",country:"UAE",venue:"ADGM Square, Al Maryah Island",sector:"Finance",tags:["ADGM","Macro","GCC","Trade"],organizer:"ADGM",attendees:340,rsvps:87,image:"🏛️",description:"The region's premier economic forum, gathering ministers, central bankers, and global investors to shape the future of Gulf and MENA economies.",featured:true},
  {id:2,name:"GITEX AI & Web3 Summit",date:"Oct 13–17, 2026",city:"Dubai",country:"UAE",venue:"Dubai World Trade Centre",sector:"Technology",tags:["AI","Web3","Blockchain","Startups"],organizer:"GITEX",attendees:1200,rsvps:312,image:"⚡",description:"The world's largest technology event in the Middle East, spotlighting AI, cloud, and next-gen infrastructure.",featured:true},
  {id:3,name:"Future Investment Initiative",date:"Oct 28–30, 2026",city:"Riyadh",country:"Saudi Arabia",venue:"King Abdulaziz Int'l Conference Centre",sector:"VC & PE",tags:["FII","Vision2030","Investment","Sovereign Wealth"],organizer:"FII Institute",attendees:600,rsvps:145,image:"💎",description:"Davos of the Desert. Top-tier investors and heads of state discuss global capital allocation.",featured:false},
  {id:4,name:"Web Summit 2026",date:"Nov 4–7, 2026",city:"Lisbon",country:"Portugal",venue:"Altice Arena, Parque das Nações",sector:"Technology",tags:["Startups","VC","SaaS","Deep Tech"],organizer:"Web Summit",attendees:890,rsvps:201,image:"🌐",description:"Europe's largest tech conference. Thousands of startups, investors, and press from 160+ countries.",featured:false},
  {id:5,name:"Global Health Forum 2026",date:"Dec 2–4, 2026",city:"Abu Dhabi",country:"UAE",venue:"Louvre Abu Dhabi District",sector:"Healthcare",tags:["MedTech","Biotech","WHO","Policy"],organizer:"ADGM",attendees:210,rsvps:56,image:"🧬",description:"Convening global health leaders, biotech founders, and policy makers.",featured:false},
];

const ATTENDEES = [
  {id:1,name:"Sara Al Hashemi",role:"Deputy Director General",company:"ADGM",sector:"Finance",skills:["Regulatory Frameworks","Financial Policy","GCC Markets"],seeking:"Partners",avatar:"SH",angle:40,distBase:18,bio:"Leading financial regulation at Abu Dhabi Global Market. Oxford Economics. Ex-UAE Central Bank.",connections:4200,rsvpEvents:[1,5]},
  {id:2,name:"Khalid Al Rumaihi",role:"Chairman",company:"Bahrain Economic Dev. Board",sector:"Finance",skills:["FDI","Sovereign Strategy","Policy"],seeking:"Investors",avatar:"KR",angle:115,distBase:34,bio:"Steering Bahrain's investment attraction strategy. WEF Young Global Leader.",connections:8100,rsvpEvents:[1,3]},
  {id:3,name:"Lena Müller",role:"Managing Director",company:"BlackRock EMEA",sector:"VC & PE",skills:["Asset Management","ESG","Institutional Capital"],seeking:"Partners",avatar:"LM",angle:200,distBase:52,bio:"Running EMEA institutional coverage for BlackRock. €40B AUM oversight.",connections:6300,rsvpEvents:[1,3,4]},
  {id:4,name:"James Okafor",role:"Founder & CEO",company:"NovaTech AI",sector:"AI & ML",skills:["LLMs","Enterprise AI","Fundraising"],seeking:"Investors",avatar:"JO",angle:290,distBase:28,bio:"Building AI infrastructure for MENA enterprises. YC W23. $12M raised.",connections:2900,rsvpEvents:[1,2]},
  {id:5,name:"Priya Nair",role:"Partner",company:"Sequoia Capital",sector:"VC & PE",skills:["Deep Tech","Due Diligence","Portfolio"],seeking:"Founders",avatar:"PN",angle:160,distBase:62,bio:"Lead investor in 30+ companies. MIT CS. Focused on AI and climate tech.",connections:11200,rsvpEvents:[2,4]},
  {id:6,name:"Ahmed Bin Sulayem",role:"Executive Chairman",company:"DMCC",sector:"Finance",skills:["Free Zones","Commodities","Trade"],seeking:"Partners",avatar:"AB",angle:330,distBase:44,bio:"Building the world's most interconnected free zone. DMCC hosts 22,000+ companies.",connections:15600,rsvpEvents:[1,2,3]},
];

// ─── REAL LINKEDIN OAUTH HOOK ─────────────────────────────────────────────────
// Connects to server.js (default port 3001).
// Falls back to simulation if the server is unreachable (for prototype viewing).
const API = import.meta.env.VITE_API_URL || "http://localhost:3001";
const API_ORIGIN = (() => { try { return new URL(API, window.location.href).origin; } catch { return null; } })();

function useLinkedInAuth() {
  const [user, setUser]           = useState(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [authError, setAuthError] = useState(null);
  const [serverLive, setServerLive] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/auth/me`, { credentials:"include" });
      const data = await res.json();
      if (data.authenticated) { setUser(data.user); setImportDone(true); }
      else setUser(null);
    } catch { setUser(null); }
    finally  { setImporting(false); }
  }, []);

  // Check server health + existing session on mount
  useEffect(() => {
    fetch(`${API}/health`, { signal: AbortSignal.timeout(1500) })
      .then(res => { if (!res.ok) throw new Error("unhealthy"); setServerLive(true); checkAuth(); })
      .catch(() => setServerLive(false));
  }, [checkAuth]);

  // Listen for popup postMessage. The OAuth callback page is served by the
  // backend, so its origin is the API origin — not window.location.origin.
  useEffect(() => {
    const handler = e => {
      if (e.origin !== window.location.origin && e.origin !== API_ORIGIN) return;
      if (e.data?.type === "PROXIM_LINKEDIN_SUCCESS") { setProgress(100); setTimeout(checkAuth, 400); }
      if (e.data?.type === "PROXIM_LINKEDIN_ERROR")   { setImporting(false); setAuthError("LinkedIn login failed. Try again."); }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [checkAuth]);

  const simulateImport = useCallback(() => {
    setImporting(true); setProgress(0);
    let p = 0;
    const iv = setInterval(() => {
      p += Math.random()*14+6; setProgress(Math.min(p,100));
      if (p >= 100) {
        clearInterval(iv);
        setTimeout(() => {
          setUser({ name:"Your Name", firstName:"Your", lastName:"Name", email:"you@company.com",
            photo:null, headline:"CEO · Your Company", linkedInConnected:true,
            skills:["Strategy","Fundraising","MENA Markets","Product"],
            connections:3400, importedAt:new Date().toISOString(), isDemo:true });
          setImporting(false); setImportDone(true);
        }, 400);
      }
    }, 250);
  }, []);

  const loginWithLinkedIn = useCallback(async () => {
    setAuthError(null);

    // ── REAL FLOW (server running) ──────────────────────────────────────────
    if (serverLive) {
      setImporting(true); setProgress(0);
      let p = 0;
      const iv = setInterval(() => { p += Math.random()*8+3; setProgress(Math.min(p,85)); if(p>=85) clearInterval(iv); }, 280);
      try {
        const res = await fetch(`${API}/auth/linkedin`, { credentials:"include" });
        if (!res.ok) throw new Error("auth start failed");
        const { authUrl } = await res.json();
        const popup = window.open(authUrl,"linkedin-oauth","width=600,height=700,scrollbars=yes,top=100,left=200");
        const check = setInterval(() => { if(popup?.closed){ clearInterval(check); clearInterval(iv); setProgress(100); setTimeout(checkAuth,500); } },500);
      } catch {
        clearInterval(iv); setImporting(false);
        setAuthError("Server unreachable. Running in demo mode.");
        simulateImport();
      }
      return;
    }

    // ── DEMO FALLBACK (no server) ───────────────────────────────────────────
    simulateImport();
  }, [serverLive, checkAuth, simulateImport]);

  const logout = useCallback(async () => {
    if (serverLive) await fetch(`${API}/auth/logout`,{method:"POST",credentials:"include"}).catch(()=>{});
    setUser(null); setImportDone(false); setProgress(0); setAuthError(null);
  }, [serverLive]);

  return { user, importing, importDone, progress, authError, serverLive, loginWithLinkedIn, logout };
}

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

// ─── LINKEDIN MODAL ───────────────────────────────────────────────────────────
function LinkedInModal({onClose, auth}) {
  const {user,importing,importDone,progress,authError,serverLive,loginWithLinkedIn} = auth;
  const steps = ["Connecting to LinkedIn OAuth...","Fetching profile...","Importing work history...","Pulling skills & endorsements...","Syncing upcoming events...","Building PROXIM profile..."];
  const stepIdx = Math.min(Math.floor((progress/100)*steps.length), steps.length-1);

  return (
    <div style={{position:"fixed",inset:0,background:"#000b",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={!importing?onClose:undefined}>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:24,padding:28,width:"100%",maxWidth:400}} onClick={e=>e.stopPropagation()}>

        {/* Server status pill */}
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10,fontFamily:"'Syne Mono',monospace",color:serverLive?C.green:C.muted}}>
            <div style={{width:5,height:5,borderRadius:"50%",background:serverLive?C.green:C.muted}}/>
            {serverLive?"SERVER LIVE":"DEMO MODE"}
          </div>
        </div>

        {!importing && !importDone && <>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
            <div style={{width:46,height:46,borderRadius:12,background:C.linkedIn,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:20,color:"#fff"}}>in</div>
            <div>
              <div style={{fontWeight:800,fontSize:17}}>Import LinkedIn Profile</div>
              <div style={{color:C.sub,fontSize:13}}>Skip manual setup instantly</div>
            </div>
          </div>
          <div style={{background:C.card,borderRadius:12,padding:16,marginBottom:18,fontSize:13,color:C.sub,lineHeight:1.65}}>
            PROXIM imports your <span style={{color:C.text}}>name, photo, current role, skills, and upcoming events</span> — your profile is ready in seconds.
          </div>
          {[["👤","Name, photo & headline"],["🏢","Company & work history"],["💡","Skills & endorsements"],["📅","Upcoming event RSVPs"],["🔒","Read-only · Never posts · GDPR"]].map(([ic,tx])=>(
            <div key={tx} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,fontSize:13,color:C.sub}}><span>{ic}</span>{tx}</div>
          ))}
          {authError && <div style={{background:`${C.red}18`,border:`1px solid ${C.red}44`,borderRadius:10,padding:"10px 14px",fontSize:13,color:C.red,margin:"14px 0"}}>{authError}</div>}
          {!serverLive && (
            <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:10,padding:"10px 14px",fontSize:12,color:C.orange,marginBottom:14}}>
              ⚠️ Backend server not detected on :3001 — will run in demo mode. Start server.js for real LinkedIn login.
            </div>
          )}
          <button onClick={loginWithLinkedIn} style={{width:"100%",background:C.linkedIn,border:"none",borderRadius:14,padding:15,fontSize:15,fontWeight:700,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginTop:8,fontFamily:"inherit"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            {serverLive ? "Continue with LinkedIn" : "Continue (Demo Mode)"}
          </button>
          <button onClick={onClose} style={{width:"100%",background:"none",border:"none",color:C.muted,cursor:"pointer",marginTop:10,fontSize:13,padding:"8px 0",fontFamily:"inherit"}}>Skip for now</button>
        </>}

        {importing && <>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:36,marginBottom:12}}>🔗</div>
            <div style={{fontWeight:800,fontSize:17,marginBottom:6}}>{serverLive?"Connecting to LinkedIn":"Building demo profile"}</div>
            <div style={{color:C.sub,fontSize:13}}>{steps[stepIdx]}</div>
          </div>
          <div style={{background:C.card,borderRadius:99,height:8,overflow:"hidden",marginBottom:8}}>
            <div style={{height:"100%",background:`linear-gradient(90deg,${C.linkedIn},${C.accent})`,width:`${progress}%`,borderRadius:99,transition:"width 0.3s ease"}}/>
          </div>
          <div style={{textAlign:"center",fontSize:12,color:C.muted}}>{Math.round(progress)}%</div>
        </>}

        {importDone && !importing && <>
          <div style={{textAlign:"center",padding:"8px 0 20px"}}>
            <div style={{fontSize:48,marginBottom:12}}>✅</div>
            <div style={{fontWeight:800,fontSize:18,marginBottom:8}}>
              {user?.isDemo ? "Demo Profile Ready" : "LinkedIn Connected!"}
            </div>
            <div style={{color:C.sub,fontSize:14,lineHeight:1.6}}>
              {user?.isDemo ? "Running in demo mode. Start server.js for real LinkedIn data." : "Your profile has been imported from LinkedIn."}
            </div>
          </div>
          {user && (
            <div style={{background:C.card,borderRadius:14,padding:16,marginBottom:20,display:"flex",alignItems:"center",gap:14}}>
              {user.photo
                ? <img src={user.photo} alt={user.name} style={{width:52,height:52,borderRadius:"50%",border:`2px solid ${C.accent}`}}/>
                : <div style={{width:52,height:52,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,flexShrink:0}}>{user.firstName?.[0]}{user.lastName?.[0]}</div>
              }
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{user.name}</div>
                <div style={{color:C.sub,fontSize:13}}>{user.email}</div>
                {user.headline && <div style={{color:C.accent,fontSize:13,marginTop:2}}>{user.headline}</div>}
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:20}}>
            {[["Profile","Imported ✓"],["Email","Verified ✓"],["Photo",user?.photo?"Imported ✓":"None"]].map(([k,v])=>(
              <div key={k} style={{background:C.card,borderRadius:12,padding:12,textAlign:"center"}}>
                <div style={{fontSize:10,color:C.muted,letterSpacing:1}}>{k.toUpperCase()}</div>
                <div style={{fontSize:12,color:C.green,fontWeight:600,marginTop:4}}>{v}</div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{width:"100%",background:`linear-gradient(135deg,${C.accent},#7c5fff)`,border:"none",borderRadius:12,padding:14,fontSize:15,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>
            Go to PROXIM →
          </button>
        </>}
      </div>
    </div>
  );
}

// ─── NAVIGATION SCREEN ────────────────────────────────────────────────────────
function NavigationScreen({target,onBack}) {
  const [dist,setDist] = useState(target.distBase);
  const initial = useRef(target.distBase);
  useEffect(()=>{
    const iv = setInterval(()=>setDist(d=>{if(d<=1)return 0;return Math.max(0,d-0.8-Math.random()*0.4);}),400);
    return ()=>clearInterval(iv);
  },[]);
  const meters=Math.round(dist), pct=1-dist/initial.current, arrowAngle=target.angle-90;
  return (
    <div style={{display:"flex",flexDirection:"column",padding:"20px 20px 0",minHeight:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${C.border}`,color:C.text,borderRadius:10,padding:"8px 14px",cursor:"pointer",fontSize:13}}>← Back</button>
        <div style={{fontFamily:"'Syne Mono',monospace",fontSize:10,color:C.muted,letterSpacing:2}}>PROXIM NAVIGATION</div>
      </div>
      <div style={{background:C.card,borderRadius:16,padding:18,marginBottom:20,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:50,height:50,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,flexShrink:0}}>{target.avatar}</div>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:15}}>{target.name}</div>
          <div style={{color:C.sub,fontSize:13}}>{target.role} · {target.company}</div>
        </div>
        <div style={{background:C.accentGlow,border:`1px solid ${C.accent}`,borderRadius:20,padding:"4px 10px",fontSize:11,color:C.accent,fontFamily:"'Syne Mono',monospace"}}>EN ROUTE</div>
      </div>
      {/* Compass */}
      <div style={{position:"relative",width:240,height:240,margin:"0 auto 24px"}}>
        <svg width={240} height={240} style={{position:"absolute"}}>
          <defs><radialGradient id="cg"><stop offset="0%" stopColor={C.surface}/><stop offset="100%" stopColor={C.bg}/></radialGradient></defs>
          <circle cx={120} cy={120} r={118} fill="url(#cg)" stroke={C.border} strokeWidth={1.5}/>
          {[0,45,90,135,180,225,270,315].map(deg=>{const r2=deg%90===0?96:104;const rad=(deg-90)*Math.PI/180;return <line key={deg} x1={120+113*Math.cos(rad)} y1={120+113*Math.sin(rad)} x2={120+r2*Math.cos(rad)} y2={120+r2*Math.sin(rad)} stroke={C.border} strokeWidth={deg%90===0?2:1}/>;  })}
          {["N","E","S","W"].map((d,i)=>{const rad=(i*90-90)*Math.PI/180;return <text key={d} x={120+82*Math.cos(rad)} y={120+82*Math.sin(rad)+4} textAnchor="middle" fontSize={13} fill={d==="N"?C.green:C.muted} fontWeight="700">{d}</text>;})}
        </svg>
        {/* Needle: drawn in the outer ring so it never covers the readout */}
        <div style={{position:"absolute",inset:0,transform:`rotate(${arrowAngle}deg)`,transformOrigin:"50% 50%",transition:"transform 0.5s ease"}}>
          <svg width={240} height={240}>
            <polygon points="120,26 135,86 120,74 105,86" fill={meters===0?C.green:C.accent}/>
            <polygon points="120,214 135,154 120,166 105,154" fill={C.border}/>
          </svg>
        </div>
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",textAlign:"center"}}>
          <div style={{fontFamily:"'Syne Mono',monospace",fontSize:30,fontWeight:700,color:meters===0?C.green:C.text,lineHeight:1}}>{meters===0?"👋":`${meters}m`}</div>
          <div style={{fontSize:10,color:C.muted,marginTop:2}}>{meters===0?"ARRIVED!":"away"}</div>
        </div>
      </div>
      <div style={{background:C.card,borderRadius:14,padding:16,border:`1px solid ${C.border}`,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.muted,marginBottom:10}}><span>You</span><span>{target.name.split(" ")[0]}</span></div>
        <div style={{background:C.border,borderRadius:99,height:6,overflow:"hidden"}}>
          <div style={{background:`linear-gradient(90deg,${C.green},${C.accent})`,height:"100%",width:`${pct*100}%`,borderRadius:99,transition:"width 0.4s ease"}}/>
        </div>
        <div style={{textAlign:"center",marginTop:12,fontSize:13,color:meters<5?C.green:C.sub}}>
          {meters===0?"You've arrived — say hi! 🤝":meters<10?"Almost there, look around!":"Keep walking in the arrow direction"}
        </div>
      </div>
      <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.orange}}>
        📡 {target.name.split(" ")[0]} has been notified you're on your way
      </div>
    </div>
  );
}

// ─── RADAR ────────────────────────────────────────────────────────────────────
function Radar({attendees,onSelect,highlighted}) {
  const S=280,C2=S/2,maxR=C2-28;
  return (
    <div style={{display:"flex",justifyContent:"center"}}>
      <svg width={S} height={S}>
        <defs>
          <radialGradient id="rg"><stop offset="0%" stopColor="#4f6ef722"/><stop offset="100%" stopColor={C.bg} stopOpacity="0"/></radialGradient>
          <style>{`@keyframes sweep{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes rp{0%{r:14;opacity:.7}100%{r:28;opacity:0}} .sw{transform-origin:${C2}px ${C2}px;animation:sweep 4s linear infinite} .rp{animation:rp 1.5s ease-out infinite}`}</style>
        </defs>
        <circle cx={C2} cy={C2} r={C2-2} fill={C.surface} stroke={C.border} strokeWidth={1}/>
        <circle cx={C2} cy={C2} r={C2-2} fill="url(#rg)"/>
        {[.33,.66,1].map((r,i)=><circle key={i} cx={C2} cy={C2} r={(C2-28)*r} fill="none" stroke={C.border} strokeWidth={1} strokeDasharray="4 8" opacity={.5}/>)}
        <line x1={C2} y1={10} x2={C2} y2={S-10} stroke={C.border} strokeWidth={1} opacity={.3}/>
        <line x1={10} y1={C2} x2={S-10} y2={C2} stroke={C.border} strokeWidth={1} opacity={.3}/>
        <line className="sw" x1={C2} y1={C2} x2={S-14} y2={C2} stroke={C.accent} strokeWidth={2} opacity={.5}/>
        {["N","S","W","E"].map((d,i)=>{const pos=[[C2,14],[C2,S-6],[12,C2+4],[S-8,C2+4]][i];return <text key={d} x={pos[0]} y={pos[1]} textAnchor="middle" fontSize={9} fill={d==="N"?C.green:C.muted} fontWeight="700">{d}</text>;})}
        {attendees.map(a=>{
          const rad=a.angle*Math.PI/180;
          const r=Math.min((a.distBase/80)*maxR,maxR);
          const x=C2+r*Math.cos(rad),y=C2+r*Math.sin(rad);
          const hi=highlighted?.id===a.id;
          return (
            <g key={a.id} onClick={()=>onSelect(a)} style={{cursor:"pointer"}}>
              {hi&&<circle className="rp" cx={x} cy={y} r={14} fill={C.accentGlow}/>}
              <circle cx={x} cy={y} r={15} fill={hi?C.accent:C.card} stroke={hi?C.accent:C.border} strokeWidth={2}/>
              <text x={x} y={y+4} textAnchor="middle" fontSize={8} fill={C.text} fontWeight="700">{a.avatar}</text>
            </g>
          );
        })}
        <circle cx={C2} cy={C2} r={11} fill={C.green}/>
        <text x={C2} y={C2+4} textAnchor="middle" fontSize={7} fill="#000" fontWeight="900">YOU</text>
      </svg>
    </div>
  );
}

// ─── PERSON SHEET ─────────────────────────────────────────────────────────────
function PersonSheet({person,onClose,onNavigate}) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000a",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.surface,borderRadius:"22px 22px 0 0",padding:24,width:"100%",maxWidth:480,border:`1px solid ${C.border}`,paddingBottom:36}} onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:C.border,borderRadius:99,margin:"0 auto 20px"}}/>
        <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:18}}>
          <div style={{width:60,height:60,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:18,flexShrink:0}}>{person.avatar}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:18}}>{person.name}</div>
            <div style={{color:C.sub,fontSize:13}}>{person.role}</div>
            <div style={{color:C.accent,fontSize:13,fontWeight:600}}>{person.company}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontFamily:"'Syne Mono',monospace",fontSize:22,fontWeight:700,color:C.green}}>{person.distBase}m</div>
            <div style={{fontSize:10,color:C.muted}}>away now</div>
          </div>
        </div>
        <div style={{background:C.card,borderRadius:12,padding:14,marginBottom:16,fontSize:14,color:C.sub,lineHeight:1.65}}>{person.bio}</div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:8,fontFamily:"'Syne Mono',monospace"}}>SKILLS</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>{person.skills.map(s=><Tag key={s} label={s}/>)}</div>
        </div>
        <div style={{marginBottom:20}}>
          <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:6,fontFamily:"'Syne Mono',monospace"}}>SEEKING</div>
          <div style={{fontSize:14,color:C.text}}>{person.seeking}</div>
          {person.connections&&<div style={{fontSize:12,color:C.muted,marginTop:4}}>LinkedIn: {person.connections.toLocaleString()} connections</div>}
        </div>
        <button onClick={()=>onNavigate(person)} style={{width:"100%",background:`linear-gradient(135deg,${C.accent},#7c5fff)`,border:"none",borderRadius:14,padding:16,fontSize:16,fontWeight:700,color:"#fff",cursor:"pointer"}}>
          🧭 Navigate to {person.name.split(" ")[0]}
        </button>
      </div>
    </div>
  );
}

// ─── EVENT CARD ───────────────────────────────────────────────────────────────
function EventCard({event,onSelect,rsvpd,onRsvp}) {
  return (
    <div onClick={()=>onSelect(event)} style={{background:C.card,border:`1px solid ${event.featured?C.accent+"55":C.border}`,borderRadius:18,padding:18,marginBottom:14,cursor:"pointer",position:"relative",overflow:"hidden"}}>
      {event.featured&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${C.accent},#a78bfa)`}}/>}
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <div style={{width:50,height:50,borderRadius:14,background:C.surface,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>{event.image}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
            {event.featured&&<Tag label="FEATURED" color={C.gold} bg={C.goldGlow}/>}
            <Tag label={event.sector}/>
          </div>
          <div style={{fontWeight:800,fontSize:15,marginBottom:3,lineHeight:1.3}}>{event.name}</div>
          <div style={{color:C.sub,fontSize:12,marginBottom:6}}>📅 {event.date} · 📍 {event.city}, {event.country}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{event.tags.slice(0,3).map(t=><Tag key={t} label={`#${t}`} color={C.sub} bg="transparent"/>)}</div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:12,color:C.muted}}><span style={{color:C.text,fontWeight:700}}>{event.rsvps}</span> attending · <span style={{color:C.text,fontWeight:700}}>{event.attendees}</span> expected</div>
        <button onClick={e=>{e.stopPropagation();onRsvp(event.id);}} style={{borderRadius:10,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${rsvpd?C.green:"transparent"}`,background:rsvpd?C.greenGlow:`linear-gradient(135deg,${C.accent},#7c5fff)`,color:rsvpd?C.green:"#fff",transition:"all .2s",fontFamily:"inherit"}}>
          {rsvpd?"✓ Attending":"RSVP"}
        </button>
      </div>
    </div>
  );
}

// ─── EVENT DETAIL ─────────────────────────────────────────────────────────────
function EventDetail({event,rsvpd,onRsvp,onBack,onCheckIn}) {
  const [tab,setTab] = useState("about");
  const going = ATTENDEES.filter(a=>a.rsvpEvents.includes(event.id));
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
            <button onClick={onCheckIn} style={{flex:1,borderRadius:12,padding:13,fontSize:13,fontWeight:700,cursor:"pointer",border:`1px solid ${C.green}`,background:C.greenGlow,color:C.green,fontFamily:"inherit"}}>📡 Check In</button>
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:16}}>
          {["about","attendees"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"10px 0",borderRadius:10,border:"none",cursor:"pointer",background:tab===t?C.accent:C.card,color:tab===t?"#fff":C.sub,fontWeight:600,fontSize:13,fontFamily:"inherit"}}>
              {t==="about"?"About":`Attendees (${going.length})`}
            </button>
          ))}
        </div>
        {tab==="about"&&(
          <div style={{background:C.card,borderRadius:14,padding:18,border:`1px solid ${C.border}`,fontSize:14,color:C.sub,lineHeight:1.7,marginBottom:20}}>
            {event.description}
            <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${C.border}`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {[["Organizer",event.organizer],["Sector",event.sector],["Expected",`${event.attendees} pax`],["RSVPs",`${event.rsvps} confirmed`]].map(([k,v])=>(
                <div key={k}><div style={{fontSize:10,color:C.muted,letterSpacing:1}}>{k.toUpperCase()}</div><div style={{color:C.text,fontWeight:600,marginTop:2}}>{v}</div></div>
              ))}
            </div>
          </div>
        )}
        {tab==="attendees"&&(
          <div style={{marginBottom:20}}>
            {going.map(p=>(
              <div key={p.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:14,marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{p.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
                  <div style={{color:C.sub,fontSize:12}}>{p.role} · {p.company}</div>
                  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>{p.skills.slice(0,2).map(s=><Tag key={s} label={s} color={C.sub} bg="transparent"/>)}</div>
                </div>
                <div style={{fontSize:12,color:C.accent,fontWeight:600}}>{(p.connections/1000).toFixed(1)}k</div>
              </div>
            ))}
            {going.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:C.muted,fontSize:13}}>No attendees have shared their profile for this event yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ProximV3() {
  const auth = useLinkedInAuth();
  const [screen,setScreen]           = useState("events");
  const [selectedEvent,setSelectedEvent] = useState(null);
  const [checkedIn,setCheckedIn]     = useState(null);
  const [rsvps,setRsvps]             = useState(new Set([1]));
  const [showLinkedIn,setShowLinkedIn] = useState(false);
  const [selectedPerson,setSelectedPerson] = useState(null);
  const [navTarget,setNavTarget]     = useState(null);
  const [sectorFilter,setSectorFilter] = useState("All");
  const [seekingFilter,setSeekingFilter] = useState("All");
  const [searchQuery,setSearchQuery] = useState("");
  const [regionFilter,setRegionFilter] = useState("All Regions");
  const [sectorEvFilter,setSectorEvFilter] = useState("All Sectors");
  const [aiEvents,setAiEvents]       = useState([]);
  const [aiLoading,setAiLoading]     = useState(false);
  const [aiError,setAiError]         = useState("");
  const [aiSuggestion,setAiSuggestion] = useState("");
  const [aiSugLoading,setAiSugLoading] = useState(false);

  const handleRsvp = id => setRsvps(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});

  const filteredAttendees = ATTENDEES.filter(a=>{
    const sOk=sectorFilter==="All"||a.sector===sectorFilter||a.skills.some(s=>s.toLowerCase().includes(sectorFilter.toLowerCase()));
    const qOk=seekingFilter==="All"||a.seeking===seekingFilter;
    return sOk&&qOk;
  });

  const filteredEvents = [...MOCK_EVENTS,...aiEvents].filter(ev=>{
    const q=searchQuery.toLowerCase();
    return (!q||ev.name.toLowerCase().includes(q)||ev.tags.some(t=>t.toLowerCase().includes(q))||ev.city.toLowerCase().includes(q))
      &&(sectorEvFilter==="All Sectors"||ev.sector===sectorEvFilter)
      &&(regionFilter==="All Regions"||ev.city===regionFilter||ev.country===regionFilter);
  });

  // AI calls are proxied through server.js so the Anthropic API key never
  // reaches the browser. Both endpoints require ANTHROPIC_API_KEY on the server.
  const handleAIEvents = async () => {
    setAiError("");
    if (!auth.serverLive) { setAiError("AI search needs the PROXIM server. Run `npm run server` and reload."); return; }
    setAiLoading(true);
    try {
      const res = await fetch(`${API}/api/ai/events`,{
        method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include",
        body:JSON.stringify({sector:sectorEvFilter,region:regionFilter,query:searchQuery}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"AI request failed");
      const existing = new Set([...MOCK_EVENTS,...aiEvents].map(e=>e.id));
      let nextId = 1000;
      const incoming = (data.events||[]).map(ev=>{
        while (existing.has(nextId)) nextId++;
        existing.add(nextId);
        return {...ev,id:nextId++,aiSourced:true};
      });
      if (incoming.length===0) setAiError("The model returned no events. Try different filters.");
      setAiEvents(prev=>[...prev,...incoming]);
    } catch(e){ setAiError(e.message==="Failed to fetch" ? "Could not reach the PROXIM server." : e.message); }
    setAiLoading(false);
  };

  const handleAISuggest = async () => {
    setAiSuggestion("");
    if (!auth.serverLive) { setAiSuggestion("AI suggestions need the PROXIM server. Run `npm run server` and reload."); return; }
    setAiSugLoading(true);
    try {
      const res = await fetch(`${API}/api/ai/suggest`,{
        method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include",
        body:JSON.stringify({
          event: checkedIn ? {name:checkedIn.name,venue:checkedIn.venue,sector:checkedIn.sector} : null,
          people: filteredAttendees.map(a=>({name:a.name,role:a.role,company:a.company,sector:a.sector,skills:a.skills,seeking:a.seeking,distance:a.distBase+"m"})),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"AI request failed");
      setAiSuggestion(data.suggestion||"Couldn't load suggestion.");
    } catch(e){ setAiSuggestion(e.message==="Failed to fetch" ? "Could not reach the PROXIM server." : `AI unavailable: ${e.message}`); }
    setAiSugLoading(false);
  };

  if(navTarget) return (
    <Shell auth={auth} onLinkedIn={()=>setShowLinkedIn(true)} checkedIn={checkedIn}>
      {showLinkedIn&&<LinkedInModal onClose={()=>setShowLinkedIn(false)} auth={auth}/>}
      <div style={{overflowY:"auto",flex:1}}><NavigationScreen target={navTarget} onBack={()=>setNavTarget(null)}/></div>
    </Shell>
  );

  if(selectedEvent) return (
    <Shell auth={auth} onLinkedIn={()=>setShowLinkedIn(true)} checkedIn={checkedIn}>
      {showLinkedIn&&<LinkedInModal onClose={()=>setShowLinkedIn(false)} auth={auth}/>}
      <EventDetail event={selectedEvent} rsvpd={rsvps.has(selectedEvent.id)} onRsvp={handleRsvp} onBack={()=>setSelectedEvent(null)} onCheckIn={()=>{setCheckedIn(selectedEvent);setSelectedEvent(null);setScreen("radar");}}/>
    </Shell>
  );

  return (
    <Shell auth={auth} onLinkedIn={()=>setShowLinkedIn(true)} checkedIn={checkedIn} screen={screen} setScreen={setScreen}>
      {showLinkedIn&&<LinkedInModal onClose={()=>setShowLinkedIn(false)} auth={auth}/>}
      {selectedPerson&&<PersonSheet person={selectedPerson} onClose={()=>setSelectedPerson(null)} onNavigate={p=>{setSelectedPerson(null);setNavTarget(p);}}/>}

      <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>

        {screen==="events"&&<div style={{paddingBottom:20}}>
          <div style={{marginBottom:14}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",color:C.muted}}>🔍</span>
              <input value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search events, cities, topics..." style={{width:"100%",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"13px 14px 13px 40px",fontSize:14,color:C.text,outline:"none",fontFamily:"inherit"}}/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:14,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
            <select value={sectorEvFilter} onChange={e=>setSectorEvFilter(e.target.value)} style={{background:sectorEvFilter!=="All Sectors"?C.accentGlow:C.card,border:`1px solid ${sectorEvFilter!=="All Sectors"?C.accent:C.border}`,color:sectorEvFilter!=="All Sectors"?C.accent:C.sub,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:600,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
              {SECTORS.map(s=><option key={s}>{s}</option>)}
            </select>
            <select value={regionFilter} onChange={e=>setRegionFilter(e.target.value)} style={{background:regionFilter!=="All Regions"?C.accentGlow:C.card,border:`1px solid ${regionFilter!=="All Regions"?C.accent:C.border}`,color:regionFilter!=="All Regions"?C.accent:C.sub,borderRadius:10,padding:"8px 12px",fontSize:12,fontWeight:600,cursor:"pointer",outline:"none",fontFamily:"inherit"}}>
              {REGIONS.map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={handleAIEvents} disabled={aiLoading} style={{width:"100%",marginBottom:14,background:aiLoading?C.card:`linear-gradient(135deg,${C.accent}cc,#7c5fff)`,border:`1px solid ${aiLoading?C.border:C.accent+"44"}`,borderRadius:12,padding:"12px",fontSize:13,fontWeight:700,color:aiLoading?C.muted:"#fff",cursor:aiLoading?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"inherit"}}>
            {aiLoading?"⏳ Searching events...":"✨ AI: Find more events matching filters"}
          </button>
          {aiError&&<div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:"11px 14px",fontSize:12,color:C.orange,marginBottom:14,lineHeight:1.55}}>{aiError}</div>}
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{filteredEvents.length} events{aiEvents.length>0&&<span style={{color:C.accent}}> · {aiEvents.length} AI-sourced</span>}</div>
          {filteredEvents.map(ev=><EventCard key={ev.id} event={ev} onSelect={setSelectedEvent} rsvpd={rsvps.has(ev.id)} onRsvp={handleRsvp}/>)}
          {filteredEvents.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:12}}>🔍</div>No events match these filters.</div>}
        </div>}

        {screen==="radar"&&<div style={{paddingBottom:20}}>
          {checkedIn?<>
            <div style={{background:C.greenGlow,border:`1px solid ${C.green}44`,borderRadius:16,padding:14,marginBottom:16}}>
              <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:1.5}}>📡 LIVE · CHECKED IN</div>
              <div style={{fontWeight:800,fontSize:16,marginTop:2}}>{checkedIn.name}</div>
              <div style={{color:C.sub,fontSize:12}}>{checkedIn.venue}</div>
            </div>
            <Radar attendees={filteredAttendees} onSelect={setSelectedPerson} highlighted={selectedPerson}/>
            <div style={{display:"flex",gap:8,margin:"14px 0",overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
              {SKILL_FILTERS.map(f=>(
                <button key={f} onClick={()=>setSectorFilter(f)} style={{borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",border:`1px solid ${sectorFilter===f?C.accent:C.border}`,background:sectorFilter===f?C.accentGlow:"transparent",color:sectorFilter===f?C.accent:C.sub,fontFamily:"inherit"}}>{f}</button>
              ))}
            </div>
            <button onClick={handleAISuggest} disabled={aiSugLoading} style={{width:"100%",background:aiSugLoading?C.card:`linear-gradient(135deg,${C.orange}cc,${C.red}cc)`,border:`1px solid ${aiSugLoading?C.border:C.orange+"44"}`,borderRadius:12,padding:"13px",fontSize:13,fontWeight:700,color:aiSugLoading?C.muted:"#fff",cursor:aiSugLoading?"not-allowed":"pointer",marginBottom:12,fontFamily:"inherit"}}>
              {aiSugLoading?"🤖 Analysing room...":"✨ AI: Who should I meet right now?"}
            </button>
            {aiSuggestion&&<div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:12,padding:16,fontSize:14,color:C.text,lineHeight:1.65,marginBottom:14,whiteSpace:"pre-wrap"}}>{aiSuggestion}</div>}
            <div style={{fontSize:12,color:C.muted,textAlign:"center",marginBottom:14}}>Tap any dot on the radar to view profile and navigate</div>
            {filteredAttendees.map(p=>(
              <div key={p.id} onClick={()=>setSelectedPerson(p)} style={{background:C.card,border:`1px solid ${selectedPerson?.id===p.id?C.accent:C.border}`,borderRadius:14,padding:14,marginBottom:10,cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:42,height:42,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{p.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14}}>{p.name}</div>
                  <div style={{color:C.sub,fontSize:12}}>{p.role} · {p.company}</div>
                </div>
                <div style={{fontFamily:"'Syne Mono',monospace",fontSize:16,fontWeight:700,color:C.green}}>{p.distBase}m</div>
              </div>
            ))}
          </>:<div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
            <div style={{fontSize:36,marginBottom:12}}>📡</div>
            <div style={{fontSize:15,marginBottom:6}}>Not checked in yet</div>
            <div style={{fontSize:13}}>Open an event and tap Check In to go live</div>
          </div>}
        </div>}

        {screen==="people"&&<div style={{paddingBottom:20}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:8,fontFamily:"'Syne Mono',monospace"}}>FILTER BY SECTOR</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:14}}>
              {SKILL_FILTERS.map(f=>(
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
          <div style={{fontSize:12,color:C.muted,marginBottom:12}}>{filteredAttendees.length} people match</div>
          {filteredAttendees.map(p=>(
            <div key={p.id} onClick={()=>setSelectedPerson(p)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:16,marginBottom:12,cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:12}}>
                <div style={{width:46,height:46,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,flexShrink:0}}>{p.avatar}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15}}>{p.name}</div>
                  <div style={{color:C.sub,fontSize:13}}>{p.role} · {p.company}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Syne Mono',monospace",fontSize:18,fontWeight:700,color:C.green}}>{p.distBase}m</div>
                  <div style={{fontSize:10,color:C.muted}}>away</div>
                </div>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{p.skills.map(s=><Tag key={s} label={s}/>)}</div>
              <div style={{fontSize:12,color:C.muted}}>Seeking: <span style={{color:C.text}}>{p.seeking}</span></div>
            </div>
          ))}
          {filteredAttendees.length===0&&<div style={{textAlign:"center",padding:"50px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:12}}>👥</div>Nobody matches these filters.</div>}
        </div>}

        {screen==="myevents"&&<div style={{paddingBottom:20}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:800,marginBottom:4}}>My Events</div>
            <div style={{color:C.sub,fontSize:14}}>{rsvps.size} RSVPs · {checkedIn?"1 active":"no active"} check-in</div>
          </div>
          {checkedIn&&(
            <div style={{background:C.greenGlow,border:`1px solid ${C.green}55`,borderRadius:16,padding:18,marginBottom:16}}>
              <div style={{fontSize:10,color:C.green,fontWeight:700,letterSpacing:1.5,marginBottom:6}}>📡 CHECKED IN NOW</div>
              <div style={{fontWeight:800,fontSize:16}}>{checkedIn.name}</div>
              <div style={{color:C.sub,fontSize:13,marginBottom:12}}>{checkedIn.venue}</div>
              <button onClick={()=>setScreen("radar")} style={{background:C.green,border:"none",borderRadius:10,padding:"10px 20px",fontSize:13,fontWeight:700,color:"#000",cursor:"pointer",fontFamily:"inherit"}}>View Live Radar →</button>
            </div>
          )}
          {[...MOCK_EVENTS,...aiEvents].filter(ev=>rsvps.has(ev.id)).map(ev=>(
            <div key={ev.id} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:18,marginBottom:12}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{fontSize:28}}>{ev.image}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:3}}>{ev.name}</div>
                  <div style={{color:C.sub,fontSize:12,marginBottom:8}}>📅 {ev.date} · 📍 {ev.city}</div>
                  <div style={{fontSize:12,color:C.green,fontWeight:600}}>✓ Attending · {ATTENDEES.filter(a=>a.rsvpEvents.includes(ev.id)).length} connections going</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:14}}>
                <button onClick={()=>setSelectedEvent(ev)} style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:600,color:C.sub,cursor:"pointer",fontFamily:"inherit"}}>View Attendees</button>
                <button onClick={()=>{setCheckedIn(ev);setScreen("radar");}} style={{flex:1,background:`linear-gradient(135deg,${C.accent},#7c5fff)`,border:"none",borderRadius:10,padding:"9px 0",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>📡 Check In</button>
              </div>
            </div>
          ))}
          {rsvps.size===0&&<div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}><div style={{fontSize:32,marginBottom:12}}>📅</div>No RSVPs yet. Browse events and hit RSVP!</div>}
        </div>}

        {screen==="profile"&&<div style={{paddingBottom:20}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:20,padding:24,marginBottom:16,textAlign:"center"}}>
            {auth.user?.photo
              ?<img src={auth.user.photo} alt={auth.user.name} style={{width:72,height:72,borderRadius:"50%",border:`2px solid ${C.accent}`,marginBottom:14}}/>
              :<div style={{width:72,height:72,borderRadius:"50%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:24,margin:"0 auto 14px"}}>
                {auth.user?`${auth.user.firstName?.[0]??""}${auth.user.lastName?.[0]??""}`:"👤"}
              </div>
            }
            {auth.user?<>
              <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>{auth.user.name}</div>
              <div style={{color:C.sub,fontSize:14,marginBottom:4}}>{auth.user.headline}</div>
              <div style={{color:C.sub,fontSize:13,marginBottom:4}}>{auth.user.email}</div>
              {auth.user.isDemo&&<div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:10,padding:"6px 12px",fontSize:11,color:C.orange,display:"inline-block",marginBottom:12}}>Demo mode — start server.js for real data</div>}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:16}}>
                {auth.user.skills?.map(s=><Tag key={s} label={s}/>)}
              </div>
              <button onClick={auth.logout} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:12,padding:"10px 24px",fontSize:13,color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>Disconnect LinkedIn</button>
            </>:<>
              <div style={{fontWeight:800,fontSize:20,marginBottom:4}}>Your Profile</div>
              <div style={{color:C.sub,fontSize:14,marginBottom:20}}>Import from LinkedIn to get started instantly</div>
              <button onClick={()=>setShowLinkedIn(true)} style={{background:C.linkedIn,border:"none",borderRadius:12,padding:"13px 24px",fontSize:14,fontWeight:700,color:"#fff",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8,fontFamily:"inherit"}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                Connect LinkedIn
              </button>
            </>}
          </div>
          {auth.user&&!auth.user.isDemo&&(
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:18}}>
              <div style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginBottom:12,fontFamily:"'Syne Mono',monospace"}}>LINKEDIN SYNC STATUS</div>
              {[["Name",auth.user.name?"Imported":"Not shared"],["Email",auth.user.email?"Verified":"Not shared"],["Photo",auth.user.photo?"Imported":"Not shared"],["Locale",auth.user.locale||"Not shared"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${C.border}`,fontSize:14}}>
                  <span style={{color:C.text}}>{k}</span>
                  <span style={{color:v.startsWith("Not")?C.muted:C.green,fontWeight:600}}>{v.startsWith("Not")?v:`✓ ${v}`}</span>
                </div>
              ))}
              <div style={{marginTop:14,fontSize:12,color:C.muted,lineHeight:1.6}}>
                Sign In with LinkedIn returns name, photo, email and locale only. Work history, skills and endorsements need additional LinkedIn API products.{" "}
                <span style={{color:C.accent}}>linkedin.com/developers</span>
              </div>
            </div>
          )}
          {!auth.serverLive&&(
            <div style={{background:`${C.orange}18`,border:`1px solid ${C.orange}44`,borderRadius:14,padding:16,marginTop:14,fontSize:13,color:C.orange,lineHeight:1.6}}>
              ⚠️ <strong>To enable real LinkedIn login:</strong> run <code style={{background:"#0003",padding:"1px 6px",borderRadius:4}}>npm run server</code> in your terminal, then reload. The app auto-detects it.
            </div>
          )}
        </div>}

      </div>
    </Shell>
  );
}

// ─── SHELL ────────────────────────────────────────────────────────────────────
function Shell({children,auth,onLinkedIn,checkedIn,screen,setScreen}) {
  return (
    <div style={{background:C.bg,color:C.text,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column"}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        select option{background:#13152a;color:#eef0ff;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#2a2d55;border-radius:2px;}
        input::placeholder{color:#4a5080;}
      `}</style>

      {/* Header */}
      <div style={{padding:"16px 20px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <ProximLogo size={20}/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {checkedIn&&(
            <div style={{display:"flex",alignItems:"center",gap:6,background:C.greenGlow,border:`1px solid ${C.green}44`,borderRadius:20,padding:"5px 10px",fontSize:10,color:C.green,fontFamily:"'Syne Mono',monospace"}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:C.green}}/>LIVE
            </div>
          )}
          {!auth.user
            ?<button onClick={onLinkedIn} style={{background:C.linkedIn,border:"none",borderRadius:20,padding:"7px 13px",fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontFamily:"inherit"}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                Import
              </button>
            :<div onClick={()=>setScreen?.("profile")} style={{width:36,height:36,borderRadius:"50%",overflow:"hidden",cursor:"pointer",border:`2px solid ${C.accent}`,flexShrink:0}}>
              {auth.user.photo
                ?<img src={auth.user.photo} alt={auth.user.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                :<div style={{width:"100%",height:"100%",background:`linear-gradient(135deg,${C.accent},#a78bfa)`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13}}>{auth.user.firstName?.[0]}{auth.user.lastName?.[0]}</div>
              }
            </div>
          }
        </div>
      </div>

      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>{children}</div>

      {setScreen&&(
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
